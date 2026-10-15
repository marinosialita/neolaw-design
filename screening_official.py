"""Actual official checks, before AI research. Fixed public endpoints only.

EU/OFAC/UN/UK: publisher files searched by the same engine as the interface.
Cyprus: session-bound public search form, with its normal CSRF protection.
No model URLs, credentials, matter notes or files are accepted by this module.
"""
from __future__ import annotations
import concurrent.futures
import copy
import datetime as dt
import hashlib
import http.cookiejar
import importlib.util
import json
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from types import SimpleNamespace
from screening_tls import verified_context, source_error
from screening_extra_sources import SOURCES as EXTRA_SOURCES

ROOT=Path(__file__).resolve().parent
PORTALS=(
    ('eu','European Union','https://www.sanctionsmap.eu/#/main'),
    ('ofac','United States · OFAC','https://sanctionssearch.ofac.treas.gov/'),
    ('un','United Nations','https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list'),
    ('uk','United Kingdom','https://search-uk-sanctions-list.service.gov.uk/'),
    ('cy','Cyprus · Stratlink','https://stratlink.meci.gov.cy/sanction'),
)
PORTALS = (*PORTALS, ('bis', 'BIS · US export controls', 'https://www.trade.gov/consolidated-screening-list'))

PORTALS = (*PORTALS, *((i,n,u) for i,(n,u) in EXTRA_SOURCES.items()))

def portals_for(job):
    """Historic receipts keep the scope actually requested by their version."""
    ids = {c.get('id') for c in job.get('officialChecks', [])}
    if job.get('schemaVersion', 0) >= 6 or ids.intersection(EXTRA_SOURCES): return PORTALS
    if job.get('schemaVersion', 0) >= 5 or 'bis' in ids: return PORTALS[:6]
    return PORTALS[:5]


FRESH_SECONDS=3600

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')

def fresh(stamp,max_age=FRESH_SECONDS):
    try:
        age=(dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))).total_seconds()
        return 0 <= age <= max_age
    except (ValueError,TypeError,AttributeError):
        return False

def initial_checks():
    return [dict(id=i,name=n,url=u,status='pending',method='live_portal' if i=='cy' else 'official_dataset',candidates=[]) for i,n,u in PORTALS]

def compact(value):
    return re.sub(r'\s+',' ',str(value)).strip()

class CyprusPage(HTMLParser):
    """Parse only the known form and its result table; never interpret page code."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.form=False; self.fields={}; self.valid_form=False; self.table=False
        self.rows=[]; self.row=None; self.cell=None; self.all_text=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='form':
            self.form=a.get('name')=='sanction_screening_tool'
            if self.form:
                self.valid_form=a.get('action') in ('/sanction',PORTALS[4][2]) and a.get('method','').lower()=='post'
        if self.form and tag=='input' and a.get('name','').startswith('sanction_screening_tool['):
            self.fields[a['name']]=a.get('value','')
        if tag=='table' and 'table_basic' in a.get('class','').split(): self.table=True
        if self.table and tag=='tr': self.row=[]
        if self.row is not None and tag=='td': self.cell={'text':[],'links':[],'aliases':[],'kind':''}
        if self.cell is not None:
            if tag=='a': self.cell['links'].append(a.get('href',''))
            if tag=='i': self.cell['kind']=a.get('title','')
            if tag=='li': self.cell['aliases'].append([])
    def handle_data(self,data):
        self.all_text.append(data)
        if self.cell is not None:
            self.cell['text'].append(data)
            if self.cell['aliases']: self.cell['aliases'][-1].append(data)
    def handle_endtag(self,tag):
        if tag=='form': self.form=False
        if tag=='td' and self.cell is not None:
            self.cell['text']=compact(' '.join(self.cell['text']))
            self.cell['aliases']=[compact(' '.join(v)) for v in self.cell['aliases']]
            self.row.append(self.cell); self.cell=None
        if tag=='tr' and self.row is not None:
            if self.row: self.rows.append(self.row)
            self.row=None
        if tag=='table': self.table=False

class CyprusRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        target=urllib.parse.urlsplit(newurl)
        if target.scheme!='https' or target.hostname!='stratlink.meci.gov.cy':
            raise ValueError('Unexpected Cyprus portal redirect')
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def cy_read(opener,request,event=None):
    started=time.monotonic()
    if event is not None and event.is_set(): raise ValueError('Check stopped')
    with opener.open(request,timeout=25) as response:
        parts=[];size=0
        while True:
            if event is not None and event.is_set(): raise ValueError('Check stopped')
            if time.monotonic()-started >= 45: raise ValueError('Cyprus search exceeded its time limit')
            block=response.read1(64*1024)
            if not block: break
            parts.append(block);size+=len(block)
            if size>4_000_000: raise ValueError('Cyprus response exceeded the reading limit')
    return b''.join(parts)

def cy_parse(data,query):
    p=CyprusPage();p.feed(data.decode('utf-8'))
    if not p.valid_form or p.fields.get('sanction_screening_tool[name]')!=query['name']:
        raise ValueError('Cyprus did not return the submitted search')
    # A missing result table, login page or validation error cannot become zero matches.
    summaries=[]
    for row in p.rows:
        if len(row)==6: continue
        if len(row)!=1: raise ValueError('Cyprus result format changed')
        match=re.fullmatch(r'(\d+) results? found\.?',row[0]['text'],re.I)
        if match: summaries.append(int(match[1]))
        elif row[0]['text']=='No results found.': summaries.append(0)
        else: raise ValueError('Cyprus did not return a verifiable result count')
    if len(summaries)!=1: raise ValueError('Cyprus returned missing or conflicting result counts')
    total=summaries[0];rows=[r for r in p.rows if len(r)==6]
    if total!=len(rows): raise ValueError('Cyprus results were incomplete or paginated')
    candidates=[]
    for row in rows:
        aliases=[v for v in row[3]['aliases'] if v]
        reference=row[2]['text'].split('List date:')[0].strip()
        score=re.search(r'Name:\s*(\d+)%',row[0]['text'])
        if not aliases or not score or not 0<=int(score[1])<=100: raise ValueError('Cyprus result format changed')
        details=row[4]['text'];dates=[]
        links=[v for v in row[5]['links'] if urllib.parse.urlsplit(v).scheme=='https' and not urllib.parse.urlsplit(v).username]
        # Stratlink's BIS Entity List rows legitimately have no source ID or type
        # icon. Accept this observed format only with its list label and BIS link.
        bis_list='Entity List' if 'Entity List (EL)' in row[5]['text'] else 'Unverified List' if 'Unverified List (UVL)' in row[5]['text'] else ''
        bis=bool(bis_list) and any(urllib.parse.urlsplit(v).hostname in ('bis.gov','www.bis.gov') for v in links) and details.startswith('US list')
        if not reference and not bis: raise ValueError('Cyprus result has no verifiable record reference or list provenance')
        local_id=hashlib.sha256(json.dumps([aliases,details,links],ensure_ascii=False).encode()).hexdigest()[:24]
        # Only explicitly labelled birth dates may be used as identity evidence.
        # Other dates remain in the original source description.
        for value in re.findall(r'\bBirth date:\s*(\d{4}-\d{2}-\d{2})(?=\s|[;,]|$)',details,re.I):
            try: dt.date.fromisoformat(value)
            except ValueError: continue
            if value not in dates: dates.append(value)
        country=re.search(r'\bCountry:\s*([A-Z]{2})(?=\s|$)',details)
        record=dict(id='cy:'+reference if reference else 'cy:local:'+local_id,sourceId='cy',name=aliases[0],aliases=aliases[1:],
                    type={'Individual':'person','Legal entity':'entity'}.get(row[1]['kind'],'other'),
                    identifiers=[reference] if reference else [],datesOfBirth=dates,countries=[country[1]] if country else [],
                    programs=[f'US BIS {bis_list} · export controls'] if bis else [],reasons=details,
                    sourceUrl=PORTALS[4][2],legalSources=links,localReference=not bool(reference))
        candidates.append(dict(record=record,score=int(score[1]),nameMatched=aliases[0],matchKind='Cyprus portal name match',signals=['Portal score is name similarity, not identity confirmation.']))
    return dict(status='completed',matchCount=total,candidates=candidates,checkedAt=now(),
                responseSha256=hashlib.sha256(data).hexdigest(),minimumNameScore=80,
                detail='Live Cyprus portal search at 80% name similarity. Results include sanctions and export-control lists and may include affiliates. Records overlap other sources; portal list freshness is not supplied.')

def check_cyprus(query,event):
    opener=urllib.request.build_opener(urllib.request.HTTPSHandler(context=verified_context()),CyprusRedirect(),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    p=CyprusPage();p.feed(cy_read(opener,PORTALS[4][2],event).decode('utf-8'))
    token=p.fields.get('sanction_screening_tool[_token]')
    if not p.valid_form or not token: raise ValueError('Cyprus search form is unavailable')
    if event.is_set(): raise ValueError('Check stopped')
    # Name only: country/date disagreements must not silently exclude a candidate.
    fields={f'sanction_screening_tool[{k}]':v for k,v in dict(name=query['name'],type='',address='',country='',email='',phone='',fax='',web='',minPercentage='80',_token=token).items()}
    fields['submit-filter']='Search'
    request=urllib.request.Request(PORTALS[4][2],urllib.parse.urlencode(fields).encode(),{'Content-Type':'application/x-www-form-urlencoded'})
    return cy_parse(cy_read(opener,request,event),query)

def match_records(meta,records,query):
    node=shutil.which('node')
    if not node: raise ValueError('The local name-matching runtime is unavailable')
    value={'bundle':{'sources':[meta],'records':records},'query':query}
    result=subprocess.run([node,str(ROOT/'scripts/screen-official-records.mjs')],input=json.dumps(value),text=True,capture_output=True,timeout=35,check=True,cwd=ROOT)
    return json.loads(result.stdout)

class OfficialChecker:
    def __init__(self):
        spec=importlib.util.spec_from_file_location('neolaw_source_importer',ROOT/'scripts/refresh-screening-data.py')
        self.importer=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.importer)
        self.cache={};self.lock=threading.Lock()
        try:
            bundle=json.loads((ROOT/'data/screening-sources.json').read_text())
            for meta in bundle['sources']:
                if meta.get('status')=='available' and fresh(meta.get('verifiedAt') or meta.get('retrievedAt')):
                    self.cache[meta['id']]=(meta,[r for r in bundle['records'] if r['sourceId']==meta['id']])
        except (OSError,ValueError,KeyError): pass
    def dataset(self,source,event):
        with self.lock:
            cached=self.cache.get(source)
            if cached and fresh(cached[0].get('verifiedAt') or cached[0].get('retrievedAt')): return copy.deepcopy(cached)
        args=SimpleNamespace(cache_dir=Path(tempfile.gettempdir())/'neolaw-official-screening-cache',reuse_cache=False,event=event,download_seconds=480)
        result=self.importer.source_bundle(source,args)
        if result[0]['status']=='available':
            with self.lock: self.cache[source]=copy.deepcopy(result)
        return result
    def __call__(self,query,event,publish,source_ids=None):
        selected=set(source_ids) if source_ids is not None else None
        if selected is not None and not selected.issubset({i for i,_,_ in PORTALS}):
            raise ValueError("Unknown official source")
        checks=[c for c in initial_checks() if selected is None or c["id"] in selected]
        if not checks:return []
        def run(check):
            if event.is_set(): return {**check,'status':'cancelled'}
            publish({**check,'status':'running','startedAt':now()})
            try:
                if check['id']=='cy': result=check_cyprus(query,event)
                else:
                    meta,records=self.dataset(check['id'],event)
                    if meta.get('status')!='available': raise ValueError(meta.get('error') or 'Official list unavailable')
                    if event.is_set(): return {**check,'status':'cancelled'}
                    matched=getattr(self,'matcher',match_records)(meta,records,query)
                    result=dict(status='completed',checkedAt=now(),matchCount=matched['totalMatches'],candidates=matched['matches'][:25],
                                retrievedAt=meta.get('retrievedAt'),verifiedAt=meta.get('verifiedAt'),publishedAt=meta.get('publishedAt'),recordCount=meta['recordCount'],
                                downloads=meta.get('downloads',[]),detail=meta.get('detail') or 'Publisher dataset searched locally, including aliases. Download reused for up to one hour; retrieval time is recorded. This is not a submission to the portal form.')
                if query.get('passportNumber') or query.get('registrationNumber'):
                    result['identifierChecks']=({field:{'status':'not_supported','method':'name_only'} for field in ('passportNumber','registrationNumber') if query.get(field)} if check['id']=='cy' else matched.get('identifierChecks',{}))
                return {**check,**result}
            except Exception as exc:
                # Do not forward network exceptions (which may contain session tokens).
                reason=str(exc) if isinstance(exc,ValueError) else 'The official source could not be reached or read.'
                return {**check,'status':'cancelled' if event.is_set() else 'failed','checkedAt':now(),'error':reason[:350]}
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(PORTALS),thread_name_prefix='official-source') as pool:
            futures={pool.submit(run,c):c['id'] for c in checks}
            for future in concurrent.futures.as_completed(futures):
                check=future.result();checks[next(i for i,c in enumerate(checks) if c['id']==check['id'])]=check
                publish(check)
        return checks

def research_evidence(checks):
    """Bounded primary evidence for Luna; entire saved receipts remain in the report."""
    result=[]
    for check in checks:
        value={k:v for k,v in check.items() if k!='candidates'}
        value['candidates']=[]
        for match in check.get('candidates',[])[:12]:
            record=match.get('record',{})
            value['candidates'].append({'recordId':record.get('id'),'name':record.get('name'),
                'aliases':record.get('aliases',[])[:8],'birthDates':record.get('datesOfBirth',[]),
                'countries':record.get('countries',[]),'programmes':record.get('programs',[]),
                'sourceUrl':record.get('sourceUrl'),'legalSources':record.get('legalSources',[])[:3],
                'sourceInformation':record.get('reasons','')[:1800],
                'listingStatus':record.get('listingStatus',''), 'listingStatusNote':record.get('listingStatusNote',''),
                'recordedEndDate':record.get('endedAt',''), 'restrictions':record.get('restrictions','')[:1800],
                'nameSimilarity':match.get('score'),'identitySignals':match.get('signals',[])})
        value['includedCandidates']=len(value['candidates'])
        result.append(value)
    return result
