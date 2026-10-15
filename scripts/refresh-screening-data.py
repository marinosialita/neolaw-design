#!/usr/bin/env python3
"""Build NeoLaw's local sanctions snapshot from official public downloads.

No search queries or client identifiers are sent to providers. This imports lists.
Run manually: python3 scripts/refresh-screening-data.py
Use --cache-dir /path --reuse-cache only to reparse previously downloaded snapshots.
An unavailable source is explicit and contributes no records. The output is atomic.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import http.client
import copy
import io
import json
import os
import sys
from pathlib import Path
import re
import tempfile
import time
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from screening_tls import verified_context, source_diagnostic, SourceRefreshCancelled, SourceStorageError
from screening_extra_sources import URLS as EXTRA_URLS, SOURCES as EXTRA_SOURCES, DETAILS as EXTRA_DETAILS, parsers as extra_parsers
URLS = {
    'bis': 'https://data.trade.gov/downloadable_consolidated_screening_list/v1/consolidated.json',
    'un': 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
    'uk': 'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml',
    'ofac-sdn': 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN_XML.ZIP',
    'ofac-nonsdn': 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/CONSOLIDATED.ZIP',
}
SOURCES = {
    'bis': ('BIS · US export controls', 'https://www.trade.gov/consolidated-screening-list'),
    'eu': ('European Union', 'https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/overview-sanctions-and-related-resources_en'),
    'ofac': ('OFAC · United States', 'https://ofac.treasury.gov/sanctions-list-service'),
    'un': ('United Nations', 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list'),
    'uk': ('United Kingdom', 'https://www.gov.uk/government/publications/the-uk-sanctions-list'),
}

URLS.update(EXTRA_URLS)
SOURCES.update(EXTRA_SOURCES)

def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

def clean(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()

def text(el, path, default=''):
    return clean(el.findtext(path, default))

def unique(values):
    return list(dict.fromkeys(clean(v) for v in values if clean(v) and clean(v).lower() not in ('na', 'n/a', 'unknown', '00')))

def values(el, path):
    return unique(n.text for n in el.findall(path))

def join_parts(el, paths, sep=' '):
    return sep.join(unique(text(el, p) for p in paths))

def parse_xml(data):
    if b'<!DOCTYPE' in data[:4096].upper() or b'<!ENTITY' in data[:4096].upper():
        raise ValueError('DTD/entity declarations are not accepted')
    root = ET.fromstring(data)
    for el in root.iter():
        el.tag = el.tag.split('}')[-1]
    if root.tag.lower() == 'html':
        raise ValueError('Source returned HTML instead of an XML list')
    return root

def record(source, identifier, name, kind):
    return dict(id=f'{source}:{identifier}', sourceId=source, name=clean(name), type=kind,
                aliases=[], countries=[], datesOfBirth=[], identifiers=[], programs=[],
                reasons='', listedAt='', updatedAt='', addresses=[], sourceUrl=SOURCES[source][1])

def date_uk(s):
    try:
        return dt.datetime.strptime(s, '%d/%m/%Y').date().isoformat()
    except ValueError:
        return s

BIS_LISTS = {
    'Denied Persons List (DPL) - Bureau of Industry and Security': 'Denied Persons List',
    'Entity List (EL) - Bureau of Industry and Security': 'Entity List',
    'Military End User (MEU) List - Bureau of Industry and Security': 'Military End User List',
    'Unverified List (UVL) - Bureau of Industry and Security': 'Unverified List',
}

def parse_bis(data):
    value = json.loads(data)
    rows = value.get('results')
    if not isinstance(rows, list) or type(value.get('total')) is not int or value.get('offset') != 0 or len(rows) != value['total']:
        raise ValueError('BIS consolidated download is truncated or incomplete')
    sources = value.get('sources_used', [])
    if not isinstance(sources, list) or not set(BIS_LISTS) <= {s.get('source') for s in sources if isinstance(s, dict)}:
        raise ValueError('BIS download does not confirm all four export-control lists')
    records, ids = [], set()
    dates = {s.get('source'): clean(s.get('source_last_updated')) for s in sources if isinstance(s, dict)}
    for row in rows:
        if not isinstance(row, dict): raise ValueError('Unreadable CSL record')
        source = row.get('source')
        if source not in BIS_LISTS: continue
        identifier, name = row.get('id'), row.get('name')
        if not isinstance(identifier, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,180}', identifier) or not isinstance(name, str) or not name.strip() or identifier in ids:
            raise ValueError('BIS record missing or duplicate identity')
        ids.add(identifier)
        # CSL does not classify all BIS entries as people or companies. Preserve
        # that uncertainty and include unclassified records in both type searches.
        r = record('bis', identifier, name, 'other')
        r['typeUnspecified'] = True
        r['aliases'] = unique(row.get('alt_names') or [])
        addresses = row.get('addresses') or []
        if not isinstance(addresses, list): raise ValueError('Unreadable BIS address')
        r['addresses'] = unique(', '.join(clean(a.get(k)) for k in ('address','city','state','postal_code','country') if clean(a.get(k))) for a in addresses)
        r['countries'] = unique([row.get('country')] + [a.get('country') for a in addresses])
        r['programs'] = ['BIS ' + BIS_LISTS[source] + ' · export controls']
        r['restrictions'] = clean(row.get('license_requirement'))
        r['licensePolicy'] = clean(row.get('license_policy'))
        r['federalRegisterNotice'] = clean(row.get('federal_register_notice'))
        r['listedAt'], r['endedAt'], r['updatedAt'] = clean(row.get('start_date')), clean(row.get('end_date')), dates.get(source,'')
        r['reasons'] = clean(row.get('remarks'))
        r['sourceUrl'] = clean(row.get('source_list_url')) or SOURCES['bis'][1]
        r['legalSources'] = unique([row.get('source_list_url'), row.get('source_information_url')])
        records.append(r)
    if not records: raise ValueError('BIS returned no records')
    return records, max(dates.get(k, '') for k in BIS_LISTS)

def parse_un(data):
    root = parse_xml(data)
    if root.tag != 'CONSOLIDATED_LIST':
        raise ValueError('Unexpected UN format')
    records = []
    for tag, kind, prefix in [('INDIVIDUAL', 'person', 'INDIVIDUAL'), ('ENTITY', 'entity', 'ENTITY')]:
        for node in root.findall(f'.//{tag}'):
            name = join_parts(node, ['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME'])
            r = record('un', text(node, 'DATAID'), name, kind)
            r['aliases'] = unique(values(node, f'{prefix}_ALIAS/ALIAS_NAME') + [text(node, 'NAME_ORIGINAL_SCRIPT')])
            r['weakAliases'] = unique(text(a, 'ALIAS_NAME') for a in node.findall(f'{prefix}_ALIAS') if text(a, 'QUALITY').lower() == 'low')
            r['countries'] = unique(values(node, 'NATIONALITY/VALUE') + values(node, f'{prefix}_ADDRESS/COUNTRY'))
            r['datesOfBirth'] = unique(join_parts(d, ['DATE', 'YEAR', 'FROM_YEAR', 'TO_YEAR', 'NOTE'], '; ') for d in node.findall('INDIVIDUAL_DATE_OF_BIRTH'))
            r['identifiers'] = unique([text(node, 'REFERENCE_NUMBER')] + [join_parts(d, ['TYPE_OF_DOCUMENT', 'NUMBER', 'ISSUING_COUNTRY'], ': ') for d in node.findall('INDIVIDUAL_DOCUMENT')])
            r['passportNumbers'] = unique(text(d,'NUMBER') for d in node.findall('INDIVIDUAL_DOCUMENT') if 'passport' in text(d,'TYPE_OF_DOCUMENT').lower())
            r['programs'] = unique([text(node, 'UN_LIST_TYPE')])
            r['reasons'] = text(node, 'COMMENTS1')
            r['listedAt'] = text(node, 'LISTED_ON')
            r['updatedAt'] = max(values(node, 'LAST_DAY_UPDATED/VALUE'), default='')
            r['addresses'] = unique(join_parts(a, ['STREET', 'CITY', 'STATE_PROVINCE', 'ZIP_CODE', 'COUNTRY', 'NOTE'], ', ') for a in node.findall(f'{prefix}_ADDRESS'))
            records.append(r)
    return records, root.get('dateGenerated', '')

def parse_uk(data):
    root = parse_xml(data)
    if root.tag != 'Designations':
        raise ValueError('Unexpected UK format')
    records = []
    for node in root.findall('Designation'):
        name_paths = [f'Name{i}' for i in range(1, 7)]
        names = [n for n in node.findall('Names/Name') if join_parts(n, name_paths)]
        primary = next((n for n in names if text(n, 'NameType').lower() == 'primary name'), names[0] if names else None)
        if primary is None:
            raise ValueError('UK record missing a primary name')
        r = record('uk', text(node, 'UniqueID'), join_parts(primary, name_paths), {'Individual':'person', 'Entity':'entity', 'Ship':'vessel'}.get(text(node, 'IndividualEntityShip'), 'other'))
        r['aliases'] = unique([join_parts(n, name_paths) for n in names if n is not primary] + values(node, 'NonLatinNames/NonLatinName/NameNonLatinScript'))
        r['countries'] = unique(values(node, 'Addresses/Address/AddressCountry') + values(node, './/Nationalities/Nationality') + values(node, './/CurrentBelievedFlagOfShips/CurrentBelievedFlagOfShip'))
        r['datesOfBirth'] = unique(date_uk(v) for v in values(node, './/DOBs/DOB'))
        r['identifiers'] = unique([text(node, 'UniqueID'), text(node, 'UNReferenceNumber')] + values(node, './/PassportNumber') + values(node, './/NationalIdentifierNumber') + values(node, './/IMONumber') + values(node, './/RegistrationNumber'))
        r['passportNumbers'] = values(node, './/PassportNumber')
        r['registrationNumbers'] = values(node, './/RegistrationNumber')
        r['programs'] = unique([text(node, 'RegimeName')])
        r['restrictions'] = text(node, 'SanctionsImposed').replace('|', ' · ')
        r['reasons'] = join_parts(node, ['UKStatementofReasons', 'OtherInformation'], '\n\n')
        r['listedAt'] = date_uk(text(node, 'DateDesignated'))
        r['updatedAt'] = date_uk(text(node, 'LastUpdated'))
        r['addresses'] = unique(join_parts(a, [f'AddressLine{i}' for i in range(1,7)] + ['AddressPostalCode', 'AddressCountry'], ', ') for a in node.findall('Addresses/Address'))
        records.append(r)
    return records, date_uk(text(root, 'DateGenerated'))

def parse_ofac(data, subtype):
    root = parse_xml(data)
    if root.tag != 'sdnList':
        raise ValueError('Unexpected OFAC format')
    records = []
    for node in root.findall('sdnEntry'):
        r = record('ofac', f'{subtype}:{text(node, "uid")}', join_parts(node, ['firstName', 'lastName']), {'Individual':'person', 'Entity':'entity', 'Vessel':'vessel'}.get(text(node, 'sdnType'), 'other'))
        r['aliases'] = unique(join_parts(a, ['firstName','lastName']) for a in node.findall('akaList/aka'))
        r['weakAliases'] = unique(join_parts(a, ['firstName','lastName']) for a in node.findall('akaList/aka') if text(a, 'category').lower() == 'weak')
        r['countries'] = unique(values(node, 'nationalityList/nationality/country') + values(node, 'citizenshipList/citizenship/country') + values(node, 'addressList/address/country') + values(node, 'vesselInfo/vesselFlag'))
        r['datesOfBirth'] = values(node, 'dateOfBirthList/dateOfBirthItem/dateOfBirth')
        r['identifiers'] = unique([f'OFAC UID {text(node, "uid")}'] + [join_parts(d, ['idType','idNumber','idCountry'], ': ') for d in node.findall('idList/id')])
        r['passportNumbers'] = unique(text(d,'idNumber') for d in node.findall('idList/id') if 'passport' in text(d,'idType').lower())
        r['registrationNumbers'] = unique(text(d,'idNumber') for d in node.findall('idList/id') if re.search(r'(company|business|commercial) registration',text(d,'idType'),re.I))
        r['programs'] = [f'OFAC {"SDN" if subtype == "sdn" else "non-SDN"}'] + values(node, 'programList/program')
        r['reasons'] = text(node, 'remarks')
        r['addresses'] = unique(join_parts(a, ['address1','address2','address3','city','stateOrProvince','postalCode','country'], ', ') for a in node.findall('addressList/address'))
        r['sourceUrl'] = f'https://sanctionssearch.ofac.treas.gov/Details.aspx?id={text(node, "uid")}'
        records.append(r)
    expected = text(root, 'publshInformation/Record_Count')
    if expected and len(records) != int(expected):
        raise ValueError(f'OFAC count mismatch: expected {expected}, parsed {len(records)}')
    published = text(root, 'publshInformation/Publish_Date')
    try:
        published = dt.datetime.strptime(published, '%m/%d/%Y').date().isoformat()
    except ValueError:
        pass
    return records, published

def parse_eu(data):
    root = parse_xml(data)
    if root.tag != 'export':
        raise ValueError('Unexpected EU format')
    records = []
    for node in root.findall('sanctionEntity'):
        names = node.findall('nameAlias')
        name = names[0].get('wholeName', '') if names else ''
        subject = node.find('subjectType')
        r = record('eu', node.get('logicalId', ''), name, 'person' if subject is not None and subject.get('code') == 'person' else 'entity')
        r['aliases'] = unique(n.get('wholeName') for n in names[1:])
        r['weakAliases'] = unique(n.get('wholeName') for n in names if n.get('strong') == 'false')
        r['countries'] = unique(n.get('countryDescription') or n.get('countryIso2Code') for n in node.findall('citizenship') + node.findall('address'))
        r['datesOfBirth'] = unique(n.get('birthdate') or n.get('year') or n.get('yearRangeFrom') for n in node.findall('birthdate'))
        r['identifiers'] = unique([node.get('euReferenceNumber'), node.get('unitedNationId')] + [': '.join(unique([n.get('identificationTypeDescription'), n.get('number'), n.get('countryDescription')])) for n in node.findall('identification')])
        r['passportNumbers'] = unique(n.get('number') for n in node.findall('identification') if 'passport' in (n.get('identificationTypeDescription') or '').lower())
        r['registrationNumbers'] = unique(n.get('number') for n in node.findall('identification') if re.search(r'(company|business|commercial) registration',n.get('identificationTypeDescription') or '',re.I))
        r['programs'] = unique((n.get('programme') or '') + ' · ' + (n.get('numberTitle') or '') for n in node.findall('regulation'))
        r['reasons'] = '\n\n'.join(unique([node.get('designationDetails')] + values(node, 'remark')))
        # The feed's regulation dates are not necessarily the original designation
        # date. Keep them labelled separately instead of inventing a listedAt date.
        r['legalActDates'] = unique(n.get('publicationDate') for n in node.findall('regulation'))
        r['addresses'] = unique(', '.join(unique(n.get(k) for k in ['street','city','region','zipCode','countryDescription','place'])) for n in node.findall('address'))
        r['legalSources'] = unique(values(node, 'regulation/publicationUrl'))
        records.append(r)
    return records, root.get('generationDate', '')

def download(url, args=None, validators=None):
    # A truncated or stalled transport is never parsed or cached. Retry once,
    # keeping the original wall-clock budget and cancellation signal. TLS errors
    # and publisher/schema errors are not retried or replaced with stale data.
    deadline=time.monotonic()+getattr(args,'download_seconds',480)
    for attempt in (1,2):
        if getattr(args,'event',None) is not None and args.event.is_set():
            raise SourceRefreshCancelled()
        remaining=deadline-time.monotonic()
        if remaining<=0:raise ValueError('Source exceeded download size/time budget')
        options=copy.copy(args) if args is not None else argparse.Namespace()
        options.download_seconds=remaining
        try:
            content,receipt=_download_once(url,options,validators)
            return content,{**receipt,'downloadAttempts':attempt}
        except (http.client.IncompleteRead, TimeoutError, urllib.error.URLError) as exc:
            # URLError also includes certificate/HTTP/DNS failures. Only an
            # actual socket timeout is retryable here, never an access failure.
            if isinstance(exc,urllib.error.URLError) and not isinstance(exc.reason,TimeoutError):raise
            remaining=deadline-time.monotonic()
            if attempt==2 or remaining<=1:raise
            if getattr(args,'event',None) is not None:
                if args.event.wait(1):raise SourceRefreshCancelled()
            else:time.sleep(1)

def _download_once(url, args=None, validators=None):
    # Use urllib's ordinary download headers for XLSX. DFAT's workbook request
    # was verified with these headers; the XML-oriented Accept request timed out.
    headers = {} if url.lower().endswith('.xlsx') else {'User-Agent':'NeoLaw-Internal-Source-Importer/1.0', 'Accept':'application/xml,text/xml,*/*'}
    request = urllib.request.Request(url, headers={**headers, **(validators or {})})
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=25, context=verified_context()) as response:
        parts, size = [], 0
        while True:
            # read1 returns buffered/one socket read instead of waiting to fill
            # a megabyte. This keeps the wall-clock budget effective on a feed
            # that trickles bytes without ever triggering a socket timeout.
            if getattr(args,'event',None) is not None and args.event.is_set():
                raise SourceRefreshCancelled()
            block = response.read1(64 * 1024)
            if not block:
                break
            parts.append(block); size += len(block)
            if size > 150 * 1024 * 1024:
                raise ValueError('Official download exceeded the 150 MB size limit.')
            if time.monotonic() - started > getattr(args,'download_seconds',480):
                raise ValueError('Official download exceeded its time limit before the complete file arrived.')
        length=response.headers.get('Content-Length')
        if length and length.isdigit() and size!=int(length):
            raise http.client.IncompleteRead(b'',max(0,int(length)-size))
        content = b''.join(parts)
        receipt={'url':url,'retrievedAt':utc_now(),'verifiedAt':utc_now(),'lastModified':response.headers.get('Last-Modified',''),'etag':response.headers.get('ETag',''),'bytes':size}
        if content.startswith(b'PK\x03\x04') and not url.lower().endswith('.xlsx'):
            receipt['archiveSha256']=hashlib.sha256(content).hexdigest()
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                expected='consolidated.xml' if url.endswith('CONSOLIDATED.ZIP') else 'sdn.xml'
                members=[m for m in archive.infolist() if m.filename.lower()==expected]
                if len(members)!=1 or members[0].file_size>150*1024*1024:
                    raise ValueError('Unexpected OFAC archive contents')
                content=archive.read(members[0])
            receipt['uncompressedBytes']=len(content)
        receipt['sha256']=hashlib.sha256(content).hexdigest()
        return content, receipt

def fetch(key, url, args):
    xml_path, meta_path = args.cache_dir / f'{key}.xml', args.cache_dir / f'{key}.json'
    cached=None
    try:
        content,metadata=xml_path.read_bytes(),json.loads(meta_path.read_text())
        if isinstance(metadata,dict) and metadata.get('url')==url and metadata.get('sha256')==hashlib.sha256(content).hexdigest():
            cached=(content,metadata)
    except (OSError,ValueError):
        pass  # A damaged cache must not prevent a fresh official download.
    if args.reuse_cache and xml_path.exists() and meta_path.exists():
        if not cached: raise ValueError('Cache provenance/hash does not match; refresh the source')
        return cached
    validators={}
    if cached:
        if cached[1].get('etag'): validators['If-None-Match']=cached[1]['etag']
        elif cached[1].get('lastModified'): validators['If-Modified-Since']=cached[1]['lastModified']
    try:
        content, metadata = download(url,args,validators)
    except urllib.error.HTTPError as exc:
        if exc.code!=304 or not cached: raise
        content,metadata=cached
        metadata={**metadata,'verifiedAt':utc_now()}
    (extra_parsers(globals())[key](content) if key in EXTRA_SOURCES else parse_bis(content) if key == 'bis' else parse_xml(content))
    try:
        args.cache_dir.mkdir(parents=True, exist_ok=True)
        xml_path.write_bytes(content)
        meta_path.write_text(json.dumps(metadata, indent=2))
    except OSError as exc:
        raise SourceStorageError('Public source cache could not be saved') from exc
    return content, metadata

def source_bundle(source, args):
    source_name, page = SOURCES[source]
    meta = dict(id=source, name=source_name, status='unavailable', retrievedAt='', publishedAt='', recordCount=0, url=page, downloadUrl='', error='')
    records, downloads, published_dates = [], [], []
    stage = 'download'
    try:
        if source == 'eu':
            # Discover the anonymous URL from the publisher's public RSS. No
            # third-party token or authenticated browser session is used.
            rss, _ = download('https://webgate.ec.europa.eu/fsd/fsf/public/rss',args)
            items = parse_xml(rss).findall('./channel/item')
            url = next(text(item,'link') for item in items if text(item,'title') == 'XML (Based on XSD) - v1.1')
            if not url.startswith('https://webgate.ec.europa.eu/fsd/fsf/public/files/'):
                raise ValueError('Unexpected EU download host/path')
            pairs = [('eu', url)]
        elif source == 'ofac':
            pairs = [(k, URLS[k]) for k in ['ofac-sdn','ofac-nonsdn']]
        else:
            pairs = [(source, URLS[source])]
        meta['downloadUrl'] = pairs[0][1]
        for key, url in pairs:
            data, receipt = fetch(key, url, args)
            stage = 'parser'
            parsed, published = parse_ofac(data, key.replace('ofac-','')) if source == 'ofac' else {'un':parse_un,'uk':parse_uk,'eu':parse_eu,'bis':parse_bis,**extra_parsers(globals())}[source](data)
            if not parsed or any(not r['name'] or r['id'].endswith(':') for r in parsed):
                raise ValueError('Source had no records or missing identifiers/names')
            records.extend(parsed); downloads.append(receipt); published_dates.append(published)
            stage = 'download'
        meta.update(status='available', retrievedAt=min(d['retrievedAt'] for d in downloads), verifiedAt=min(d.get('verifiedAt',d['retrievedAt']) for d in downloads), publishedAt=max(published_dates), recordCount=len(records), downloads=downloads, publishedDates=published_dates)
        if source in EXTRA_DETAILS: meta['detail'] = EXTRA_DETAILS[source]
        if source == 'bis': meta['detail'] = 'BIS Entity, Denied Persons, Unverified and Military End User lists via the official CSL download. Treasury and State lists excluded. Historical end dates are retained; check the current Federal Register entry and applicable export requirements.'
        print(f'{source}: {len(records):,} records · source date {meta["publishedAt"]}', flush=True)
        return meta, records
    except Exception as e:
        # OFAC is all-or-nothing so a failed SDN import cannot look like a full
        # US check just because the much smaller non-SDN list succeeded.
        meta['failure'] = source_diagnostic(e, stage)
        meta['error'] = meta['failure']['message']
        meta['attemptedAt'] = utc_now()
        print(f'{source}: unavailable ({meta["failure"]["category"]})', flush=True)
        return meta, []

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/screening-sources.json')
    parser.add_argument('--cache-dir', type=Path, default=Path(tempfile.gettempdir()) / 'neolaw-official-screening-cache')
    parser.add_argument('--reuse-cache', action='store_true')
    args = parser.parse_args()
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:
        results = list(pool.map(lambda source: source_bundle(source,args), SOURCES))
    sources = [r[0] for r in results]
    records = [r for result in results for r in result[1]]
    ids = [r['id'] for r in records]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate source identifiers')
    payload = dict(schemaVersion=1, generatedAt=utc_now(), sources=sources, records=records)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.output.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(',',':')) + '\n', encoding='utf-8')
    os.replace(tmp,args.output)
    print(f'Saved {len(records):,} source records · {args.output.stat().st_size:,} bytes · {sum(s["status"] == "available" for s in sources)}/{len(SOURCES)} sources', flush=True)

if __name__ == '__main__':
    main()
