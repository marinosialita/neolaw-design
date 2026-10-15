"""Public GLEIF company identity lookup. No key, no sanctions verdict, no UBO inference."""
import datetime as dt
import hashlib
import http.client
import json
import re
import threading
import time
import urllib.parse
from screening_tls import verified_context

LIMIT = 50
MAX_BYTES = 3_000_000
SCOPE = 'Company identity records for entities with an LEI. No result does not establish that a company is unregistered or clear. Parent links concern accounting consolidation, not a complete beneficial-ownership search.'

def stamp(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
def clean(value, limit=1000): return value[:limit].strip() if isinstance(value,str) else ''
def valid_lei(value):
    if not re.fullmatch(r'[A-Z0-9]{18}[0-9]{2}', value): return False
    return int(''.join(str(ord(c)-55) if c.isalpha() else c for c in value)) % 97 == 1

def name_terms(name):
    # GLEIF treats commas as OR separators, so never pass a pasted legal name
    # straight to a filter. Search all recorded names, then compare locally.
    words = re.sub(r'[^\w\s]', ' ', name, flags=re.UNICODE).split()
    suffixes = {'co','company','ltd','limited','inc','incorporated','llc','plc','corp','corporation','gmbh','sarl','sa'}
    while len(words)>1 and words[-1].lower() in suffixes: words.pop()
    return ' '.join(words)

def parse_records(value, query, url):
    rows = value.get('data') if isinstance(value,dict) else None
    pagination = value.get('meta',{}).get('pagination',{}) if isinstance(value,dict) else {}
    total = pagination.get('total')
    if not isinstance(rows,list) or type(total) is not int or total<0 or len(rows)>LIMIT or total<len(rows) or (total>0 and not rows):
        raise ValueError('Incomplete GLEIF response')
    candidates=[]
    for row in rows:
        attr=row.get('attributes',{}); entity=attr.get('entity',{}); registration=attr.get('registration',{})
        lei=attr.get('lei'); name=entity.get('legalName',{}).get('name')
        if row.get('type')!='lei-records' or not isinstance(lei,str) or not valid_lei(lei) or not isinstance(name,str) or not name.strip():
            raise ValueError('Unreadable GLEIF identity record')
        address=entity.get('legalAddress') or {}
        aliases=[clean(v.get('name')) for v in (entity.get('otherNames') or [])+(entity.get('transliteratedOtherNames') or []) if isinstance(v,dict)]
        reg=clean(entity.get('registeredAs')); jurisdiction=clean(entity.get('jurisdiction'))
        record={'id':'gleif:'+lei,'sourceId':'gleif','type':'entity','name':name[:500],'aliases':list(dict.fromkeys(aliases)),
          'countries':list(dict.fromkeys(v for v in [jurisdiction,clean(address.get('country'))] if v)),
          'lei':lei,'registrationNumber':reg,'registrationAuthority':clean((entity.get('registeredAt') or {}).get('id')),
          'identifiers':['LEI '+lei]+(['Registration '+reg] if reg else []),'datesOfBirth':[],
          'addresses':[', '.join(v for v in [*(address.get('addressLines') or []),address.get('city'),address.get('region'),address.get('postalCode'),address.get('country')] if isinstance(v,str) and v)],
          'entityStatus':clean(entity.get('status')),'leiStatus':clean(registration.get('status')),
          'updatedAt':clean(registration.get('lastUpdateDate')),'nextRenewal':clean(registration.get('nextRenewalDate')),
          'sourceUrl':'https://search.gleif.org/#/record/'+lei,'apiUrl':'https://api.gleif.org/api/v1/lei-records/'+lei,
          'programs':[],'parentLinks':[]}
        for kind in ('direct-parent','ultimate-parent'):
            links=(row.get('relationships',{}).get(kind) or {}).get('links',{})
            for relation,link in links.items():
                # Preserve only GLEIF's record-scoped references. Do not fetch
                # arbitrary returned links or infer that an exception means no owner.
                if isinstance(link,str) and link.startswith(record['apiUrl']+'/'):
                    record['parentLinks'].append({'kind':kind,'relation':relation,'url':link})
        candidates.append({'record':record,'nameMatched':name,'matchKind':'GLEIF name search','signals':[]})
    return {'status':'completed','checkedAt':stamp(),'publishedAt':value.get('meta',{}).get('goldenCopy',{}).get('publishDate'),
      'queryUrl':url,'totalResults':total,'returnedCandidates':len(candidates),'limit':LIMIT,'atLimit':total>len(candidates),
      'candidates':candidates,'detail':SCOPE,'lookup': 'LEI' if query.get('lei') else 'Registration number' if query.get('registrationNumber') else 'Recorded names',
      'lookupText':query.get('lei') or query.get('registrationNumber') or name_terms(query['name'])}

class GleifChecker:
    def __init__(self, transport=None): self.transport=transport or self._request
    @staticmethod
    def _request(path,event):
        connection=http.client.HTTPSConnection('api.gleif.org',timeout=15,context=verified_context())
        try:
            connection.request('GET',path,headers={'Accept':'application/vnd.api+json','User-Agent':'NeoLaw-Company-Identity/1.0'})
            response=connection.getresponse()
            if response.status!=200: raise ValueError('GLEIF unavailable')
            chunks=[];size=0;start=time.monotonic()
            while True:
                if event.is_set(): raise ValueError('Lookup cancelled')
                block=response.read1(65536)
                if not block: break
                chunks.append(block);size+=len(block)
                if size>MAX_BYTES or time.monotonic()-start>35: raise ValueError('GLEIF response limit')
            raw=b''.join(chunks)
            return json.loads(raw),hashlib.sha256(raw).hexdigest()
        finally: connection.close()
    def __call__(self,query,event):
        if query.get('type')!='entity': return {'status':'not_applicable','detail':'Choose Company to include a GLEIF identity lookup.'}
        if event.is_set(): return {'status':'cancelled'}
        field,value=('lei',query['lei']) if query.get('lei') else ('entity.registeredAs',query['registrationNumber']) if query.get('registrationNumber') else ('entity.names',name_terms(query['name']))
        path='/api/v1/lei-records?'+urllib.parse.urlencode({f'filter[{field}]':value,'page[size]':LIMIT})
        try:
            data,digest=self.transport(path,event)
            if event.is_set(): return {'status':'cancelled'}
            result=parse_records(data,query,'https://api.gleif.org'+path);result['sha256']=digest
            return result
        except Exception:
            return {'status':'cancelled' if event.is_set() else 'failed','checkedAt':stamp(),'error':'GLEIF could not return a complete, readable company lookup. Company identity remains unverified. Retry this source.','detail':SCOPE}
