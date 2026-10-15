"""Optional hosted matching provider. Credentials are memory-only, never in receipts."""
import datetime as dt
import http.client
import hashlib
import json
import math
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode, urlsplit
from screening_tls import verified_context
from screening_provider_profile import entity_profile

TOPICS={'sanction':'Sanctions','sanction.linked':'Sanctions-linked','role.pep':'Politically exposed person','role.rca':'Relative / close associate','debarment':'Debarment','crime':'Crime-related','wanted':'Wanted','export.control':'Export controlled','export.control.linked':'Export control-linked','export.risk':'Trade risk','invest.risk':'Investment risk','invest.ban':'Investment ban','sanction.control':'Sanctions ownership/control link','reg.action':'Regulatory action','reg.warn':'Regulatory warning','role.pep.frmr':'Former politically exposed person','corp.disqual':'Disqualified','poi':'Person of interest','role.pol':'Politician'}
def category_labels(candidate):
    return [TOPICS.get(t,t) for t in (candidate.get('topics') or candidate.get('categories') or [])]

class ProviderError(Exception): pass

def stamp(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
def texts(value): return [str(v)[:1000] for v in value[:40] if isinstance(v,str)] if isinstance(value,list) else []
def public_source_urls(value):
    """Keep links as references only: never fetch publisher URLs on the server."""
    result=[]
    for raw in texts(value):
        try:
            url=urlsplit(raw)
            if url.scheme!='https' or not url.hostname or url.username or url.password or url.port not in (None,443): continue
            if any(ord(char)<33 for char in raw): continue
            result.append(raw)
        except (TypeError,ValueError): continue
    return list(dict.fromkeys(result))
def matching_explanations(value):
    """Preserve provider feature evidence, without interpreting a feature as a verdict."""
    if not isinstance(value,dict): return []
    result=[]
    for feature,item in list(value.items())[:30]:
        if not isinstance(feature,str) or not re.fullmatch(r'[a-zA-Z0-9_]{1,100}',feature) or not isinstance(item,dict): continue
        score=item.get('score')
        if isinstance(score,bool) or not isinstance(score,(int,float)) or not math.isfinite(score): continue
        result.append({'feature':feature,'score':score,
          **{field:str(item[field])[:2000] if isinstance(item.get(field),str) else None for field in ('query','candidate','detail')}})
    return result

def parse_match(data):
    response=data.get('responses',{}).get('subject') if isinstance(data,dict) else None
    if not isinstance(response,dict) or response.get('error') or response.get('status',200)!=200 or not isinstance(response.get('results'),list) or not isinstance(response.get('query'),dict):
        raise ProviderError('OpenSanctions returned an incomplete response. This provider was not checked.')
    candidates=[]
    for item in response['results'][:10]:
        if not isinstance(item,dict) or not isinstance(item.get('id'),str) or not re.fullmatch(r'[A-Za-z0-9._:-]{1,180}',item['id']):
            raise ProviderError('OpenSanctions returned an unreadable candidate. Review is incomplete.')
        score=item.get('score')
        if isinstance(score,bool) or not isinstance(score,(int,float)) or not 0<=score<=1 or not isinstance(item.get('properties'),dict):
            raise ProviderError('OpenSanctions returned an unreadable candidate. Review is incomplete.')
        prop=item['properties'];topics=texts(prop.get('topics',item.get('topics',[])))
        profile=entity_profile({'id':item['id'],'schema':item.get('schema',''),'properties':prop})
        candidates.append({'id':item['id'],'name':str(item.get('caption') or item['id'])[:240],
          'url':'https://www.opensanctions.org/entities/'+item['id']+'/', 'score':score,
          'possibleMatch':score>=0.7,'schema':str(item.get('schema',''))[:80],
          'topics':topics,'categories':[TOPICS.get(t,t) for t in topics], 'datasets':texts(item.get('datasets')),
          'birthDates':texts(prop.get('birthDate')),'countries':texts(prop.get('country')),
          'passportNumbers':texts(prop.get('passportNumber')),'registrationNumbers':texts(prop.get('registrationNumber')),'lei':texts(prop.get('leiCode')),
          'aliases':list(dict.fromkeys(texts(prop.get('name'))+texts(prop.get('alias'))+texts(prop.get('previousName')))),
          'explanations':matching_explanations(item.get('explanations')),'positions':texts(prop.get('position')),
          'sourceUrls':public_source_urls(prop.get('sourceUrl')),
          'wikipediaUrls':[u for u in public_source_urls(prop.get('wikipediaUrl')) if re.fullmatch(r'[a-z][a-z0-9-]*\.wikipedia\.org',urlsplit(u).hostname or '')],
          'wikidataIds':list(dict.fromkeys(v for v in texts(prop.get('wikidataId')) if re.fullmatch(r'Q[1-9][0-9]{0,17}',v))),
          'profile':profile,
          'firstSeen':item.get('first_seen'),'lastSeen':item.get('last_seen'),'lastChange':item.get('last_change')})
    parsed=response['query']; parsed_props=parsed.get('properties',{})
    return {'status':'completed','checkedAt':stamp(),'dataset':'default','algorithm':'logic-v2','threshold':0.7,
            'sha256':hashlib.sha256(json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'hashFormat':'SHA-256 of canonical JSON response (sorted keys, UTF-8)',
            'parsedQuery':{'schema':str(parsed.get('schema',''))[:80], 'properties':{k:texts(v) for k,v in parsed_props.items() if k in ('name','alias','country','birthDate','passportNumber','registrationNumber','leiCode')}} if isinstance(parsed_props,dict) else {},
            'limit':10,'candidates':candidates,'possibleMatches':sum(c['possibleMatch'] for c in candidates),
            'returnedCandidates':len(candidates),'atLimit':len(candidates)==10,
            'detail':'Additional provider screening across the OpenSanctions default collection. Scores rank candidates, not risk or confirmed identity. Categories are provider tags. Dataset inclusion alone does not establish a current sanction.'}

class OpenSanctionsService:
    def __init__(self, key='', transport=None, entity_transport=None, statement_transport=None, catalog_transport=None):
        self._key=key;self._verified=False;self._lock=threading.RLock();self._transport=transport or self._request
        self._entity_transport=entity_transport or self._entity_request
        # A custom entity transport denotes an offline test fixture unless the
        # caller also supplies statement_transport. Never leak fixture keys to
        # the live API from a test double.
        self._statement_transport=(self._statement_request if entity_transport is None else None) if statement_transport is None else statement_transport
        self._catalog_transport=(self._catalog_request if entity_transport is None else None) if catalog_transport is None else catalog_transport
        self._catalog_cache=None
    def status(self):
        with self._lock: return {'configured':bool(self._key),'verified':self._verified,'provider':'OpenSanctions','dataset':'default'}
    def connect(self,value):
        key=value.get('apiKey','')
        if isinstance(key,str) and key.startswith('sk-'): raise ProviderError('This looks like an OpenAI key. Enter the API key issued by OpenSanctions.')
        if not isinstance(key,str) or not re.fullmatch(r'[A-Za-z0-9_-]{20,200}',key): raise ProviderError('Enter a valid OpenSanctions API key.')
        with self._lock: self._key=key;self._verified=False
        return self.status()
    def disconnect(self):
        with self._lock: self._key='';self._verified=False
        return self.status()
    @staticmethod
    def _request(key,payload):
        connection=http.client.HTTPSConnection('api.opensanctions.org',timeout=35,context=verified_context())
        try:
            connection.request('POST','/match/default?algorithm=logic-v2&threshold=0.7&limit=10',body=json.dumps(payload).encode(),headers={'Authorization':'ApiKey '+key,'Content-Type':'application/json','Accept':'application/json'})
            response=connection.getresponse();raw=response.read(2_000_001)
            if response.status in (401,403): raise ProviderError('OpenSanctions rejected the key. Reconnect this provider; its check is incomplete.')
            if response.status in (402,429): raise ProviderError('OpenSanctions credits or request limit prevented this check. Review your provider account.')
            if response.status!=200 or len(raw)>2_000_000: raise ProviderError('OpenSanctions could not complete this check. Retry it.')
            try:return json.loads(raw)
            except ValueError: raise ProviderError('OpenSanctions returned an unreadable response.') from None
        finally: connection.close()
    def check(self,query,event):
        with self._lock: key=self._key
        if event.is_set(): return {'status':'cancelled'}
        if not key:return {'status':'failed','error':'OpenSanctions was disconnected before this check could start.'}
        schema='Company' if query['type']=='entity' else 'Person' if query['type']=='person' or query.get('dob') or query.get('passportNumber') else 'LegalEntity'
        props={'name':[query['name']]}
        if query.get('country'):props['country']=[query['country']]
        if query.get('dob') and schema=='Person':props['birthDate']=[query['dob']]
        if schema=='Person' and query.get('passportNumber'):props['passportNumber']=[query['passportNumber']]
        if schema=='Company':
            if query.get('registrationNumber'):props['registrationNumber']=[query['registrationNumber']]
            if query.get('lei'):props['leiCode']=[query['lei']]
        try:
            result=parse_match(self._transport(key,{'queries':{'subject':{'schema':schema,'properties':props}}}))
            if event.is_set():return {'status':'cancelled'}
            with self._lock:
                if self._key==key:self._verified=True
            return result
        except ProviderError as exc:return {'status':'failed','checkedAt':stamp(),'error':str(exc)}
        except Exception:return {'status':'failed','checkedAt':stamp(),'error':'OpenSanctions could not be reached securely or read. This check is incomplete.'}

    @staticmethod
    def _entity_request(key, ident):
        if not re.fullmatch(r'[A-Za-z0-9._:-]{1,180}',ident): raise ProviderError('Invalid provider record reference.')
        path='/entities/'+ident+'?nested=true'
        for attempt in range(3):
            connection=http.client.HTTPSConnection('api.opensanctions.org',timeout=25,context=verified_context())
            try:
                connection.request('GET',path,headers={'Authorization':'ApiKey '+key,'Accept':'application/json'})
                response=connection.getresponse()
                if response.status==308:
                    location=response.getheader('Location','')
                    if location.startswith('https://api.opensanctions.org/'): location=location[len('https://api.opensanctions.org'):]
                    if not re.fullmatch(r'/entities/[A-Za-z0-9._:-]{1,180}(?:\?nested=(?:true|false))?',location): raise ProviderError('The provider moved this record to an unsupported location.')
                    path=location if '?' in location else location+'?nested=true'; continue
                if response.status in (401,403): raise ProviderError('OpenSanctions did not authorize relationship access. Matching results are retained.')
                if response.status in (402,429): raise ProviderError('OpenSanctions credits or request limits prevented relationship retrieval.')
                if response.status==404: raise ProviderError('This provider entity is no longer available. Recheck its current record.')
                raw=response.read(2_000_001)
                if response.status!=200 or len(raw)>2_000_000: raise ProviderError('Provider relationships could not be retrieved within the response limit.')
                try: return json.loads(raw)
                except ValueError: raise ProviderError('The provider relationship response could not be read.') from None
            finally: connection.close()
        raise ProviderError('The provider record could not be resolved after moving.')

    @staticmethod
    def _statement_request(key, ident):
        if not re.fullmatch(r'[A-Za-z0-9._:-]{1,180}',ident): raise ProviderError('Invalid provider record reference.')
        path='/statements?'+urlencode({'canonical_id':ident,'limit':5000})
        connection=http.client.HTTPSConnection('api.opensanctions.org',timeout=30,context=verified_context())
        try:
            connection.request('GET',path,headers={'Authorization':'ApiKey '+key,'Accept':'application/json'})
            response=connection.getresponse();raw=response.read(8_000_001)
            if response.status in (401,403): raise ProviderError('OpenSanctions did not authorize field-level source lineage. Profile facts are retained.')
            if response.status in (402,429): raise ProviderError('OpenSanctions request limits prevented field-level source lineage. Profile facts are retained.')
            if response.status!=200 or len(raw)>8_000_000: raise ProviderError('Field-level source lineage could not be retrieved within the response limit.')
            try:return json.loads(raw)
            except ValueError: raise ProviderError('The provider source-lineage response could not be read.') from None
        finally: connection.close()

    @staticmethod
    def _catalog_request():
        """Load public dataset labels once; never treat catalog metadata as evidence."""
        connection=http.client.HTTPSConnection('api.opensanctions.org',timeout=25,context=verified_context())
        try:
            connection.request('GET','/catalog',headers={'Accept':'application/json'})
            response=connection.getresponse();raw=response.read(3_000_001)
            if response.status!=200 or len(raw)>3_000_000: raise ProviderError('Provider source titles could not be retrieved.')
            try:return json.loads(raw)
            except ValueError: raise ProviderError('Provider source titles could not be read.') from None
        finally: connection.close()

    def _catalog(self):
        with self._lock:
            if self._catalog_cache is not None:return self._catalog_cache
        if not self._catalog_transport:return {}
        data=self._catalog_transport();items={}
        for row in data.get('datasets',[]) if isinstance(data,dict) else []:
            if not isinstance(row,dict):continue
            name=row.get('name');publisher=row.get('publisher')
            if not isinstance(name,str) or not re.fullmatch(r'[a-z0-9_:-]{1,160}',name):continue
            items[name]={'title':row.get('title','') if isinstance(row.get('title'),str) else '',
                         'publisher':publisher.get('name','') if isinstance(publisher,dict) and isinstance(publisher.get('name'),str) else '',
                         'official':publisher.get('official') if isinstance(publisher,dict) and type(publisher.get('official')) is bool else None}
        with self._lock:
            if self._catalog_cache is None:self._catalog_cache=items
            return self._catalog_cache

    def enrich(self,result,event):
        """Retrieve bounded full profiles for returned matches. No recursive requests."""
        from screening_relationships import entity_details
        with self._lock:key=self._key
        if result.get('status')!='completed': return result
        try:catalog=self._catalog()
        except Exception:catalog={}
        def load(candidate):
            if event.is_set(): return {'relationships':{'status':'cancelled','records':[]},'profile':candidate.get('profile',{'status':'cancelled','fields':[]})}
            if not key:return {'relationships':{'status':'failed','records':[],'error':'Connect OpenSanctions to retrieve relationships.'},'profile':candidate.get('profile',{'status':'failed','fields':[]})}
            try:
                checked_at=stamp();entity=self._entity_transport(key,candidate['id'])
                details=entity_details(entity,candidate['id'],checked_at)
                lineage_error='';statements=None
                if self._statement_transport:
                    try:statements=self._statement_transport(key,entity.get('id',candidate['id']))
                    except ProviderError as exc:lineage_error=str(exc)
                    except Exception:lineage_error='Field-level source lineage could not be reached securely or read.'
                profile=entity_profile(entity,statements,checked_at,catalog)
                if lineage_error: profile.update(status='partial',error=lineage_error,detail='Profile facts were retrieved, but their field-level source lineage is incomplete.')
                return {'relationships':details,'profile':profile} if not event.is_set() else {'relationships':{'status':'cancelled','records':[]},'profile':{'status':'cancelled','fields':[]}}
            except (ProviderError,ValueError) as exc:return {'relationships':{'status':'failed','records':[],'checkedAt':stamp(),'error':str(exc)},'profile':{**candidate.get('profile',{}),'status':'failed','error':str(exc)}}
            except Exception:return {'relationships':{'status':'failed','records':[],'checkedAt':stamp(),'error':'Provider relationships could not be reached securely or read.'},'profile':{**candidate.get('profile',{}),'status':'failed','error':'The complete provider profile could not be reached securely or read.'}}
        candidates=result.get('candidates',[])[:10]
        with ThreadPoolExecutor(max_workers=3) as pool:
            details=list(pool.map(load,candidates))
        updated=[{**c,'relationships':d['relationships'],'profile':d['profile']} for c,d in zip(candidates,details)]
        relationship_status='cancelled' if event.is_set() else 'completed' if all(d['relationships']['status']=='completed' for d in details) else 'partial'
        profile_status='cancelled' if event.is_set() else 'completed' if all(d['profile'].get('status')=='completed' for d in details) else 'partial'
        return {**result,'candidates':updated,'relationshipStatus':relationship_status,
                'profileStatus':profile_status,
                'relationshipCoverage':{'requested':len(candidates),'completed':sum(d['relationships']['status']=='completed' for d in details),
                                        'scope':'Direct provider relationships for returned candidates only; no recursive expansion.'},
                'profileCoverage':{'requested':len(candidates),'completed':sum(d['profile'].get('status')=='completed' for d in details),
                                   'scope':'Complete provider facts and field-level statement lineage for returned candidates.'}}
