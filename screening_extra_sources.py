"""Public AU/CA/CH list parsers. No credentials, search requests or AI inference."""
from __future__ import annotations
import datetime as dt
import hashlib
import io
import itertools
import re
import zipfile

URLS = {
    'au': 'https://www.dfat.gov.au/sites/default/files/Australian_Sanctions_Consolidated_List.xlsx',
    'ca': 'https://www.international.gc.ca/world-monde/assets/office_docs/international_relations-relations_internationales/sanctions/sema-lmes.xml',
    'ch': 'https://www.sesam.search.admin.ch/sesam-search-web/pages/downloadXmlGesamtliste.xhtml?action=downloadXmlGesamtlisteAction&lang=de',
}
SOURCES = {
    'au': ('Australia · DFAT', 'https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list'),
    'ca': ('Canada · Autonomous sanctions', 'https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx?lang=eng'),
    'ch': ('Switzerland · SECO', 'https://www.seco.admin.ch/de/suche-nach-sanktionsadressaten'),
}
DETAILS = {
    'au': 'Australian Consolidated List: UN and Australian autonomous designations, including the measures recorded by DFAT. Aliases are grouped under the primary reference. Does not cover all restrictions under other Australian laws.',
    'ca': 'Canadian autonomous sanctions under SEMA and JVCFOA. Does not cover every Canadian UN or terrorism list. The publisher describes this administrative list as potentially behind the regulations; verify the current legal instrument. Regime names are not nationality evidence. A list-wide publication date is not supplied in the XML.',
    'ch': 'SECO whole-list XML, excluding targets whose latest effective listing event is solely a delisting. Same-date listing/delisting records remain flagged for status review, not as active designations. Original identities and spelling variants are retained. Direct listings only; ownership and control are not established. The publisher’s file date is recorded separately from retrieval.',
}

def parsers(api):
    """Reuse the importer's validation and normalized record helpers."""
    clean, text, unique, record, parse_xml = (api[k] for k in ('clean','text','unique','record','parse_xml'))
    def date(value):
        return value.date().isoformat() if isinstance(value, dt.datetime) else str(value or '').strip()

    def au(data):
        import openpyxl
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if sum(x.file_size for x in archive.infolist()) > 150*1024*1024:
                raise ValueError('Australian workbook exceeded the expanded size limit')
        book = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        try:
            if len(book.worksheets) != 1: raise ValueError('Unexpected Australian workbook layout')
            sheet = book.worksheets[0]
            iterator = sheet.values
            headers = next(iterator)
            required = ('Reference','Name of Individual or Entity','Type','Name Type','Alias Strength','Date of Birth','Citizenship','Address','Additional Information','Listing Information','IMO Number','Committees','Control Date','Instrument of Designation','Targeted Financial Sanction','Travel Ban','Arms Embargo','Maritime Restriction')
            if any(k not in headers for k in required): raise ValueError('Australian list columns changed')
            rows, refs, primary = [], set(), {}
            for values in iterator:
                if not any(v is not None for v in values): continue
                row = dict(zip(headers, values)); ref = clean(row['Reference'])
                if not re.fullmatch(r'\d+[a-z]*', ref) or ref in refs or not clean(row['Name of Individual or Entity']):
                    raise ValueError('Australian list has missing or duplicate references')
                refs.add(ref); rows.append(row)
                if row['Name Type'] == 'Primary Name':
                    if not ref.isdigit() or ref in primary: raise ValueError('Invalid Australian primary reference')
                    kind = {'Individual':'person','Entity':'entity','Vessel':'vessel'}.get(row['Type'])
                    if not kind: raise ValueError('Unknown Australian subject type')
                    r = record('au', ref, row['Name of Individual or Entity'], kind)
                    r['countries'] = unique([row['Citizenship']])
                    r['datesOfBirth'] = unique([date(row['Date of Birth'])]) if kind == 'person' else []
                    r['identifiers'] = unique(['DFAT reference '+ref, 'IMO '+str(row['IMO Number']) if row['IMO Number'] else ''])
                    r['addresses'] = unique([row['Address']])
                    r['programs'] = unique([row['Committees'],row['Instrument of Designation']])
                    measures = ['Targeted Financial Sanction','Travel Ban','Arms Embargo','Maritime Restriction']
                    if any(type(row[k]) is not bool for k in measures): raise ValueError('Unknown Australian measure flag')
                    r['restrictions'] = ' · '.join(k for k in measures if row[k])
                    r['reasons'] = '\n\n'.join(unique([row['Additional Information'],row['Listing Information']]))
                    r['updatedAt'] = date(row['Control Date'])
                    primary[ref] = r
                elif row['Name Type'] not in ('Alias','Original Script'): raise ValueError('Unknown Australian name type')
            for row in rows:
                if row['Name Type'] == 'Primary Name': continue
                ref = re.match(r'\d+', clean(row['Reference']))[0]
                if ref not in primary: raise ValueError('Australian alias has no primary record')
                r = primary[ref]; name = clean(row['Name of Individual or Entity'])
                r['aliases'].append(name)
                if row['Alias Strength'] == 'Weak': r.setdefault('weakAliases',[]).append(name)
            stamp = re.search(r'(\d{1,2})_(\d{1,2})_(\d{4})$', sheet.title)
            published = dt.date(int(stamp[3]),int(stamp[2]),int(stamp[1])).isoformat() if stamp else ''
            for r in primary.values(): r['aliases'] = unique(r['aliases'])
            return list(primary.values()), published
        finally: book.close()

    def ca(data):
        root = parse_xml(data)
        if root.tag != 'data-set' or any(n.tag != 'record' for n in root): raise ValueError('Unexpected Canadian list format')
        result, ids = [], set()
        for node in root:
            regime, schedule, item = (text(node,k) for k in ('Country-Pays','Schedule-Annexe','Item-NumeroDarticle'))
            company, imo = text(node,'EntityOrShip-EntiteOuNavire'), text(node,'ShipIMONumber-NumeroOMIDuNavire')
            name = company or ' '.join(unique([text(node,'GivenName-Prenom'),text(node,'LastName-NomDeFamille')]))
            if not regime or not item or not name: raise ValueError('Canadian record missing identifying fields')
            key = '|'.join([regime,schedule,item])
            if key in ids: raise ValueError('Duplicate Canadian legal reference')
            ids.add(key)
            r = record('ca',hashlib.sha256(key.encode()).hexdigest()[:24],name,'vessel' if imo else 'entity' if company else 'person')
            # Country-Pays names the regulation, NOT citizenship/address.
            r['programs'] = [regime]
            r['identifiers'] = unique([f'Canadian regulation: {regime}; schedule {schedule or "not supplied"}; item {item}', 'IMO '+imo if imo else ''])
            aliases = text(node,'Aliases-Alias')
            r['aliases'] = unique(re.split(r';\s*|\s+\|\s+',aliases))
            r['datesOfBirth'] = unique([text(node,'DateOfBirthOrShipBuildDate-DateDeNaissanceOuDateDeConstructionDuNavire')]) if r['type']=='person' else []
            r['listedAt'] = text(node,'DateOfListing-DateDinscription')
            r['reasons'] = text(node,'TitleOrShipType-TitreOuTypeDeNavire')
            r['restrictions'] = 'Verify the current measures in the applicable Canadian regulation.'
            result.append(r)
        return result, ''

    def ch(data):
        root = parse_xml(data)
        if root.tag != 'swiss-sanctions-list' or root.get('list-type') != 'whole-list': raise ValueError('SECO did not return its whole list')
        sets, places = {}, {}
        for p in root.findall('sanctions-program'):
            name = text(p,"program-name[@lang='eng']")
            for s in p.findall("sanctions-set[@lang='eng']"):
                sets[s.get('ssid')] = (name,clean(s.text))
        for p in root.findall('place'):
            places[p.get('ssid')] = (text(p,'country'), ', '.join(unique(' '.join(c.itertext()) for c in p)))
        result, ids = [], set(); today = dt.datetime.now(dt.timezone.utc).date().isoformat()
        for node in root.findall('target'):
            identifier = node.get('ssid')
            if not identifier or identifier in ids: raise ValueError('Missing/duplicate Swiss target reference')
            ids.add(identifier)
            events = []
            for m in node.findall('modification'):
                kind, effective = m.get('modification-type'), m.get('effective-date','')
                if kind not in ('listed','amended','de-listed'): raise ValueError('Unknown Swiss listing event')
                if kind in ('listed','de-listed'):
                    if not effective and kind!='listed': raise ValueError('Undated Swiss delisting')
                    if effective: dt.date.fromisoformat(effective)
                    if not effective or effective <= today: events.append((effective,kind))
            if not events: raise ValueError('Swiss target has no effective listing event')
            last = max(d for d,k in events)
            states = {k for d,k in events if d==last}
            uncertain = len(states)!=1
            if states == {'de-listed'}: continue
            bodies = [(tag,node.find(tag)) for tag in ('individual','entity','object') if node.find(tag) is not None]
            if len(bodies)!=1: raise ValueError('Unknown Swiss target structure')
            tag, body = bodies[0]; kind = 'person' if tag=='individual' else 'entity' if tag=='entity' else 'vessel' if body.get('object-type')=='vessel' else 'other'
            identities = sorted(body.findall('identity'),key=lambda x:x.get('main')!='true')
            names, weak = [], []
            for identity in identities:
                for name in sorted(identity.findall('name'),key=lambda x:x.get('name-type')!='primary-name'):
                    parts = sorted(name.findall('name-part'),key=lambda x:int(x.get('order','0')))
                    variants = [unique([text(p,'value')]+[v.text for v in p.findall('spelling-variant')]) for p in parts]
                    if not variants or any(not v for v in variants): raise ValueError('Swiss name has missing parts')
                    count=1
                    for v in variants: count*=len(v)
                    if count>5000: raise ValueError('Swiss name variants exceed the validated parsing limit')
                    combinations = [' '.join(v) for v in itertools.product(*variants)]
                    names.extend(combinations)
                    if name.get('quality')=='poor': weak.extend(combinations)
            if not names: raise ValueError('Swiss target has no name')
            r=record('ch',identifier,names[0],kind);r['aliases']=unique(names[1:]);r['weakAliases']=unique(weak)
            if uncertain:
                r['listingStatus']='Unresolved listing status'
                r['listingStatusNote']=f'The publisher records both listing and delisting effective {last}. This historical record is retained for review; active designation is not established. Check the current Swiss ordinance and original entry.'
            r['identifiers']=['SECO SSID '+identifier]
            for identity in identities:
                r['countries'] += [text(n,'country') for n in identity.findall('nationality')]
                for a in identity.findall('address'):
                    country,place = places.get(a.get('place-id'),('',''))
                    r['countries'].append(country);r['addresses'].append(', '.join(unique([' '.join(a.itertext()),place])))
                for d in identity.findall('day-month-year'):
                    if kind!='person': continue
                    y,m,day = d.get('year',''),d.get('month'),d.get('day')
                    if y:
                        r['datesOfBirth'].append(dt.date(int(y),int(m),int(day)).isoformat() if m and day and d.get('calendar','Gregorian')=='Gregorian' else y+' (partial/other calendar)' if d.get('calendar','Gregorian')!='Gregorian' else y)
                for d in identity.findall('identification-document'):
                    r['identifiers'].append(': '.join(unique([d.get('document-type'),text(d,'number'),text(d,'issuer')])))
                    if 'passport' in (d.get('document-type') or '').lower():r.setdefault('passportNumbers',[]).append(text(d,'number'))
            keys = re.split(r'\s+',text(node,'sanctions-set-id'))
            if any(k not in sets for k in keys): raise ValueError('Swiss target references an unknown sanctions set')
            r['programs']=unique(sets[k][0] for k in keys);r['restrictions']=' · '.join(unique(sets[k][1] for k in keys))
            r['reasons']='\n\n'.join(unique(' '.join(n.itertext()) for n in list(body) if n.tag in ('justification','other-information')))
            r['listedAt']=last;r['updatedAt']=max((m.get('effective-date','') for m in node.findall('modification') if m.get('effective-date','')<=today),default='')
            for k in ('countries','addresses','datesOfBirth','identifiers'):r[k]=unique(r[k])
            result.append(r)
        return result, root.get('date','')
    return {'au':au,'ca':ca,'ch':ch}
