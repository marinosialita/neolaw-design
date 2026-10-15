"""World Bank Table 1 procurement debarment. Separate from asset-freeze sanctions."""
import copy
import datetime as dt
import hashlib
import http.client
import json
import re
import threading
import time
from urllib.parse import urlsplit
from screening_tls import verified_context
from screening_official import match_records

PAGE='https://documents.worldbank.org/en/projects-operations/procurement/debarred-firms'
FEED='https://apigwext.worldbank.org/dvsvc/v1.0/json/APPLICATION/ADOBE_EXPRNCE_MGR/FIRM/SANCTIONED_FIRM'
NOTES='https://thedocs.worldbank.org/en/doc/387181466627871302-0290022021/original/WorldBankNotesonDebarredFirmsandIndividuals.pdf'
SCOPE='World Bank Table 1: debarred and cross-debarred firms and individuals. Procurement eligibility restrictions, not an asset-freeze list. Table 2 other sanctions and a complete search of controlled affiliates are not covered. A name match requires identity review; no match is not clearance.'
class SourceFailure(ValueError):
    def __init__(self,code):
        self.code=code
        super().__init__(code)

FAILURES={
    'truncated_response':'The World Bank download ended before all declared bytes arrived. Retry this source; no negative result is inferred.',
    'source_timeout':'The World Bank source did not respond within the download time limit. Retry this source; no negative result is inferred.',
    'source_unavailable':'The World Bank source is unavailable. Retry this source; no negative result is inferred.',
    'source_changed':'The World Bank source format could not be verified. The connector needs review; no negative result is inferred.',
    'stale_source':'The World Bank publisher refresh is stale or invalid. Retry with a current list; no negative result is inferred.',
    'invalid_match':'The World Bank match evidence is incomplete. The connector needs review; no negative result is inferred.',
}

def stamp(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
def text(value,limit=8000):
    if value is None:return ''
    if not isinstance(value,str) or len(value)>limit:raise ValueError('Unreadable World Bank field')
    return value.strip()
def parse_records(data):
    rows=data.get('response',{}).get('ZPROCSUPP') if isinstance(data,dict) else None
    if not isinstance(rows,list) or not rows or len(rows)>20000:raise ValueError('Incomplete World Bank feed')
    records=[];seen=set();refresh=[]
    for row in rows:
        if not isinstance(row,dict):raise ValueError('Unreadable World Bank record')
        name=text(row.get('SUPP_NAME'));rid=row.get('SUPP_ID');status=row.get('SUPP_ELIG_STAT');kind=row.get('SUPP_TYPE_CODE')
        if not name or type(rid) is not int or rid<=0 or rid in seen or status not in ('DEBARRED','X-DEBARRED') or kind not in ('I','F','U','C'):raise ValueError('Unrecognised World Bank record')
        seen.add(rid)
        start=text(row.get('DEBAR_FROM_DATE'));end=text(row.get('DEBAR_TO_DATE'));period=text(row.get('INELIGIBLY_STATUS'))
        dt.date.fromisoformat(start);dt.date.fromisoformat(end)
        if start>end or period not in ('','Ongoing','Permanent'):raise ValueError('Unrecognised World Bank period')
        refreshed=text(row.get('LAST_REFRESH_DATE'));parsed=dt.datetime.fromisoformat(refreshed.replace('Z','+00:00'))
        if parsed.tzinfo is None:raise ValueError('Undated World Bank feed')
        refresh.append(parsed)
        qualifier=text(row.get('ADD_SUPP_INFO'));grounds=text(row.get('DEBAR_REASON'))
        records.append({'id':f'wb:{rid}','sourceId':'wb','type':'person' if kind=='I' else 'entity' if kind=='F' else 'unknown','typeUnspecified':kind in ('U','C'),
          'name':name,'aliases':[],'countries':[text(row.get('COUNTRY_NAME'))] if row.get('COUNTRY_NAME') else [],'datesOfBirth':[],'identifiers':[],
          'addresses':[', '.join(v for v in [text(row.get(k)) for k in ('SUPP_ADDR','SUPP_CITY','SUPP_PROV_NAME','SUPP_POST_CODE','COUNTRY_NAME')] if v)],
          'programs':['World Bank procurement debarment'],'debarmentStatus':'Cross-debarred' if status=='X-DEBARRED' else 'Debarred',
          'listedAt':start,'endedAt':end if not period else '', 'ineligibilityPeriod':period or end,'notesReference':qualifier,'reasons':grounds,
          'restrictions':'Ineligibility for World Bank-financed contracts. Verify the project scope, identity and conditions in the publisher notes.',
          'listingStatusNote':'Release may depend on compliance conditions; a displayed end date alone does not establish eligibility.',
          'sourceUrl':PAGE,'notesUrl':NOTES,'updatedAt':refreshed})
    return records,min(refresh).isoformat().replace('+00:00','Z')

class WorldBankChecker:
    def __init__(self,transport=None,matcher=None,clock=None):
        self.transport=transport or self._fetch;self.matcher=matcher or match_records;self.clock=clock or time.monotonic
        self._cache=None;self._lock=threading.Lock()
    @staticmethod
    def _get_once(url,event,headers,limit,deadline):
        if url not in (PAGE,FEED):raise SourceFailure('source_changed')
        if event.is_set():raise SourceFailure('source_unavailable')
        remaining=deadline-time.monotonic()
        if remaining<=0:raise TimeoutError('Download deadline reached')
        parts=urlsplit(url);connection=http.client.HTTPSConnection(parts.hostname,timeout=min(15,remaining),context=verified_context())
        try:
            connection.request('GET',parts.path,headers={'User-Agent':'NeoLaw-Procurement-Screening/1.0','Accept':'application/json,text/html','Accept-Encoding':'identity',**(headers or {})})
            response=connection.getresponse()
            if response.status!=200:raise SourceFailure('source_unavailable')
            declared=response.getheader('Content-Length')
            if declared is not None:
                if not re.fullmatch(r'[0-9]+',declared.strip()):raise SourceFailure('source_changed')
                declared=int(declared)
                if declared>limit:raise SourceFailure('source_changed')
            chunks=[];size=0
            while True:
                if event.is_set():raise SourceFailure('source_unavailable')
                remaining=deadline-time.monotonic()
                if remaining<=0:raise TimeoutError('Download deadline reached')
                if connection.sock:connection.sock.settimeout(min(15,remaining))
                chunk=response.read1(65536)
                if not chunk:break
                chunks.append(chunk);size+=len(chunk)
                if size>limit:raise SourceFailure('source_changed')
            if event.is_set():raise SourceFailure('source_unavailable')
            if time.monotonic()>deadline:raise TimeoutError('Download deadline reached')
            # HTTPResponse.read1 may return EOF without raising IncompleteRead.
            # A syntactically valid JSON prefix is still an incomplete download.
            if declared is not None and size!=declared:raise http.client.IncompleteRead(b'',max(0,declared-size))
            return b''.join(chunks)
        finally:connection.close()

    @classmethod
    def _get(cls,url,event,headers=None,limit=12000000,deadline=None):
        deadline=deadline if deadline is not None else time.monotonic()+30
        for attempt in range(2):
            try:return cls._get_once(url,event,headers,limit,deadline)
            except http.client.IncompleteRead:
                # One retry, sharing the original budget. Never retain partial bytes.
                if attempt or event.is_set() or time.monotonic()+1>=deadline:raise
                if event.wait(1):raise

    def _fetch(self,event):
        deadline=time.monotonic()+45
        page=self._get(PAGE,event,limit=3000000,deadline=deadline).decode('utf-8')
        endpoint=re.search(r'var\s+prodtabApi\s*=\s*"([^"]+)"',page)
        token=re.search(r'var\s+propApiKey\s*=\s*"([A-Za-z0-9_-]{10,100})"',page)
        if not endpoint or endpoint.group(1)!=FEED or not token:raise SourceFailure('source_changed')
        # This is the publisher's public-page client configuration, never a user key.
        # Do not persist it or follow redirects carrying it to another host.
        raw=self._get(FEED,event,{'apikey':token.group(1)},deadline=deadline)
        return json.loads(raw),hashlib.sha256(raw).hexdigest()
    def __call__(self,query,event):
        base={'source':'World Bank','url':PAGE,'detail':SCOPE,'checkedAt':stamp(),'method':'Official Table 1 feed + local name matching'}
        if event.is_set():return {**base,'status':'cancelled'}
        try:
            with self._lock:
                if not self._cache or self.clock()-self._cache['cachedAt']>=10800:
                    data,digest=self.transport(event)
                    if event.is_set():return {**base,'status':'cancelled'}
                    records,published=parse_records(data)
                    self._cache={'records':records,'publishedAt':published,'retrievedAt':stamp(),'sha256':digest,'cachedAt':self.clock()}
                cached=self._cache
                age=(dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(cached['publishedAt'].replace('Z','+00:00'))).total_seconds()
                if not -300<=age<=86400:
                    self._cache=None
                    raise SourceFailure('stale_source')
                if event.is_set():return {**base,'status':'cancelled'}
                found=self.matcher({'id':'wb','status':'available'},cached['records'],query)
            if event.is_set():return {**base,'status':'cancelled'}
            candidates=found['matches'];total=found['totalMatches']
            if type(total) is not int or total<0 or not isinstance(candidates,list) or total<len(candidates) or (total and not candidates):raise SourceFailure('invalid_match')
            return {**base,'status':'completed','totalResults':total,'returnedCandidates':len(candidates),'atLimit':total>len(candidates),'limit':100,'candidates':copy.deepcopy(candidates),
              **{k:cached[k] for k in ('publishedAt','retrievedAt','sha256')},'recordCount':len(cached['records']),'feedUrl':FEED,'notesUrl':NOTES}
        except Exception as exc:
            if event.is_set():return {**base,'status':'cancelled'}
            code=exc.code if isinstance(exc,SourceFailure) else 'truncated_response' if isinstance(exc,http.client.IncompleteRead) else 'source_timeout' if isinstance(exc,TimeoutError) else 'source_unavailable' if isinstance(exc,(OSError,http.client.HTTPException)) else 'source_changed'
            return {**base,'status':'failed','errorCode':code,'error':FAILURES[code]}
