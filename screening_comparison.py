"""Readable, deterministic match explanations for exported evidence."""
import re
import unicodedata

def words(value):
    value=unicodedata.normalize('NFKD',str(value or '')).casefold()
    return ' '.join(re.sub(r'[^\w\s]',' ',''.join(c for c in value if not unicodedata.combining(c))).split())
def values(value): return value if isinstance(value,list) else [value] if value else []
def identifier_values(record,field):
    typed=record.get('passportNumbers') if field=='passportNumber' else record.get('registrationNumbers') or record.get('registrationNumber')
    if typed is not None:return values(typed)
    pattern=r'^passport(?: number| no\.?)?\s*:\s*([^:]+)(?::|$)' if field=='passportNumber' else r'^(?:company|business|commercial) registration(?: number| no\.?)?\s*:\s*([^:]+)(?::|$)'
    return [m[1].strip() for v in record.get('identifiers',[]) if isinstance(v,str) and (m:=re.match(pattern,v,re.I)) and re.fullmatch(r'[\w -]+',m[1].strip())]

def comparison(match,query):
    record=match.get('record',{});name=match.get('nameMatched') or record.get('name','')
    exact=next((n for n in [record.get('name',''),*record.get('aliases',[])] if words(n)==words(query.get('name'))),None)
    why=f'The recorded name or alias matches the supplied name after normalising spelling and punctuation: {exact}.' if exact else f"{match.get('matchKind') or 'Provider candidate'}: {name}. The returned name needs comparison."
    if record.get('sourceId')=='gleif' and query.get('lei'): why='Returned by an exact LEI lookup. Compare the legal name and registration details before linking it to the client.'
    if record.get('sourceId')=='gleif' and query.get('registrationNumber') and not query.get('lei'): why='Returned by a registration-number lookup. Verify the jurisdiction because numbers may repeat between registries.'
    if match.get('identifierMatch'):why='A published '+('passport number' if match['identifierMatch']=='passportNumber' else 'company registration number')+' matches after ignoring spaces and hyphens. Compare name, issuer or jurisdiction and other identifiers; this alone does not confirm identity.'
    rows=[['Name',query.get('name'),name],['Country / jurisdiction',query.get('country'),record.get('countries')]]
    types={'person':'Person','entity':'Company','vessel':'Vessel'}
    type_conflict=(query.get('type') in types and record.get('type') in types
                   and not record.get('typeUnspecified') and query['type']!=record['type'])
    if type_conflict:rows.append(['Entity type',types[query['type']],types[record['type']]])
    company=query.get('type')=='entity' or query.get('type')!='person' and record.get('type')=='entity'
    if company: rows += [['Registration number',query.get('registrationNumber'),identifier_values(record,'registrationNumber')],['LEI',query.get('lei'),record.get('lei')]]
    else:
        rows += [['Date of birth',query.get('dob'),record.get('datesOfBirth')]]
        if query.get('passportNumber'):rows += [['Passport number',query['passportNumber'],identifier_values(record,'passportNumber')]]
    rows=[[label, supplied or 'Not supplied', ' · '.join(str(v) for v in values(found)) or 'Not supplied by source'] for label,supplied,found in rows]
    next_steps=['Compare the legal name, registration number and jurisdiction against a current registry extract.' if company else 'Compare the full date of birth and a reliable identity document. A name or country alone is insufficient.', 'Resolve every different or missing identifier before recording an identity decision.']
    if type_conflict:next_steps.insert(0,'Resolve the different entity type before linking this record to the client.')
    if not company and query.get('dob') and any(re.search(r'\bother calendar\b',str(v),re.I) for v in values(record.get('datesOfBirth'))):
        next_steps.append('A recorded date uses another calendar. Verify a reliable calendar conversion before comparing that birth date.')
    if record.get('sourceId')=='bis' or any(re.search(r'BIS|export control',v,re.I) for v in record.get('programs',[])):
        next_steps.append('Verify the current BIS entry, Federal Register notice and export/licence restrictions. This listing is not automatically an asset freeze.')
    elif record.get('sourceId')=='wb': next_steps.append('Read the World Bank notes and decision. Verify procurement eligibility, release conditions and controlled affiliates separately from sanctions.')
    elif record.get('sourceId')=='gleif': next_steps.append('GLEIF covers entities with LEIs. It does not establish sanctions clearance or complete beneficial ownership.')
    else: next_steps.append('Verify the current source entry and applicable programme restrictions.')
    if record.get('listingStatusNote'): next_steps.insert(0,record['listingStatusNote'])
    if record.get('endedAt') and record.get('sourceId')!='wb': next_steps.insert(0,'The source records an end date of '+record['endedAt']+'. Verify whether any restriction remains in force.')
    return why,rows,next_steps
