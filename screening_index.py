"""Prepared public official lists. Refreshes never run in a subject search.

An expired/missing snapshot is an incomplete check, never a negative result.
Only public lists are persisted; queries, identifiers and provider keys are not.
"""
import atexit
import datetime as dt
import time
import concurrent.futures
import hashlib
import json
import os
import select
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path
from types import SimpleNamespace
from screening_official import OfficialChecker, ROOT, PORTALS, fresh, now
from screening_tls import source_diagnostic, safe_source_diagnostic, SourceRefreshCancelled

# OFAC publishes compressed full lists and may stream a replacement slowly.
# This budget belongs to the background download, not to a client name search.
# Keep the one-hour evidence freshness limit unchanged.
REFRESH_DOWNLOAD_SECONDS = {'ofac': 480}
REFRESH_BEFORE_SECONDS = 2700
RETRY_BASE_SECONDS = 30
RETRY_MAX_SECONDS = 300
RECENT_EVENTS_PER_SOURCE = 8
MANUAL_REFRESH_COOLDOWN = 60


def later(seconds):
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=seconds)).isoformat(timespec='seconds').replace('+00:00', 'Z')


def safe_stamp(value):
    try:
        stamp = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if stamp.tzinfo is None: return None
        return stamp.astimezone(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    except (ValueError, AttributeError, TypeError):
        return None


class RefreshFailure(ValueError):
    def __init__(self, diagnosis):
        self.diagnosis = safe_source_diagnostic(diagnosis) or source_diagnostic(RuntimeError())
        super().__init__(self.diagnosis['message'])


class LocalMatcher:
    def __init__(self):
        self.lock=threading.Lock();self.process=None;self.versions={}
        atexit.register(self.close)

    def close(self):
        if self.process:
            self.process.terminate()
            try:self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:self.process.kill();self.process.wait()
            for pipe in (self.process.stdin,self.process.stdout):pipe.close()
            self.process=None
        self.versions={}

    def _request(self,value):
        if not self.process or self.process.poll() is not None:
            self.close()
            node=shutil.which('node')
            if not node:raise ValueError('The local name-matching runtime is unavailable')
            self.process=subprocess.Popen([node,str(ROOT/'scripts/screening-index-worker.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        self.process.stdin.write((json.dumps(value,ensure_ascii=False)+'\n').encode());self.process.stdin.flush()
        if not select.select([self.process.stdout],[],[],15)[0]:
            self.close();raise ValueError('The prepared index reached its time limit')
        value=json.loads(self.process.stdout.readline())
        if value.get('error'):raise ValueError(value['error'])
        return value

    def _load(self,meta,records):
        version=(meta.get('verifiedAt'),meta.get('retrievedAt'),meta.get('recordCount'),tuple(d.get('sha256') for d in meta.get('downloads',[])))
        if not self.process or self.process.poll() is not None or self.versions.get(meta['id'])!=version:
            self._request({'op':'load','meta':meta,'records':records});self.versions[meta['id']]=version

    def prepare(self,meta,records):
        with self.lock:self._load(meta,records)

    def __call__(self,meta,records,query):
        with self.lock:
            self._load(meta,records)
            return self._request({'op':'search','source':meta['id'],'query':query})


class PreparedOfficialChecker(OfficialChecker):
    def __init__(self,storage=None,start_background=True):
        super().__init__()
        self.storage=Path(storage or ROOT/'work/official-index')
        self.matcher=LocalMatcher();self.refreshing=set();self.failures={};self.stop=threading.Event()
        self.wake=threading.Event();self.pending_sources=set();self.forced=set()
        self.next_attempt={};self.manual_attempt={};self.health={};self.unready_sources=set()
        self.diagnostic_lock=threading.Lock();self.diagnostic_persistence_error=None
        self.source_ids=[i for i,_,_ in PORTALS if i!='cy']
        # Retain older bundled metadata for source dates and audit visibility.
        # dataset() still refuses to use it as current screening evidence.
        try:
            bundle=json.loads((ROOT/'data/screening-sources.json').read_text())
            for meta in bundle['sources']:
                if meta['id'] in self.source_ids and meta.get('status')=='available' and meta['id'] not in self.cache:
                    self.cache[meta['id']]=(meta,[r for r in bundle['records'] if r['sourceId']==meta['id']])
        except (OSError,ValueError,KeyError,TypeError):pass
        # A validated, atomic per-source file survives normal server restarts.
        for source in self.source_ids:
            try:
                payload=json.loads((self.storage/(source+'.json')).read_text())
                raw=payload['data']; encoded=json.dumps(raw,ensure_ascii=False,separators=(',',':')).encode()
                meta,records=raw['meta'],raw['records']
                if hashlib.sha256(encoded).hexdigest()!=payload['sha256'] or meta['id']!=source or meta['status']!='available' or meta['recordCount']!=len(records) or not records:continue
                if any(r.get('sourceId')!=source or not r.get('id') or not r.get('name') for r in records):continue
                previous=self.cache.get(source)
                if not previous or str(meta.get('verifiedAt') or meta.get('retrievedAt'))>str(previous[0].get('verifiedAt') or previous[0].get('retrievedAt')):self.cache[source]=(meta,records)
            except (OSError,ValueError,KeyError,TypeError):pass
        self._restore_diagnostics()
        for meta,records in self.cache.values():
            if fresh(meta.get('verifiedAt') or meta.get('retrievedAt')):
                try:self.matcher.prepare(meta,records)
                except Exception as exc:
                    self.unready_sources.add(meta['id'])
                    self.failures[meta['id']]={'attemptedAt':now(),'error':source_diagnostic(exc,'local_index')['message'],**source_diagnostic(exc,'local_index')}
        self.background=None
        atexit.register(self.close)
        if start_background:self.start_refreshing()

    def start_refreshing(self):
        with self.lock:
            if self.stop.is_set() or (self.background and self.background.is_alive()):return
            self.background=threading.Thread(target=self._maintain,daemon=True,name='official-index-refresh')
            self.background.start()

    def close(self, wait_seconds=2):
        """Stop queued refreshes and signal in-flight downloads without a long wait.

        An already blocked HTTPS read may take its ordinary socket timeout to
        return. No source will be published after observing the stop signal.
        """
        self.stop.set();self.wake.set()
        background=self.background
        if background and background is not threading.current_thread():background.join(timeout=wait_seconds)

    def _restore_diagnostics(self):
        try:
            value=json.loads((self.storage/'refresh-diagnostics.json').read_text())
            for source, health in value.get('sources',{}).items():
                if source not in self.source_ids or not isinstance(health,dict):continue
                events=[]
                for event in health.get('recentEvents',[])[-RECENT_EVENTS_PER_SOURCE:]:
                    if not isinstance(event,dict) or event.get('outcome') not in ('succeeded','failed','cancelled'):continue
                    stamp=safe_stamp(event.get('attemptedAt'));finished=safe_stamp(event.get('finishedAt'))
                    duration=event.get('durationMs')
                    if not stamp or not finished or type(duration) not in (int,float) or not 0<=duration<=3600000:continue
                    clean={'attemptedAt':stamp,'finishedAt':finished,'durationMs':int(duration),'outcome':event['outcome']}
                    if event['outcome']!='succeeded':
                        diagnosis=safe_source_diagnostic(event.get('diagnostic'))
                        if not diagnosis:continue
                        clean['diagnostic']=diagnosis
                    events.append(clean)
                failures=health.get('consecutiveFailures',0)
                self.health[source]={'lastSuccessAt':safe_stamp(health.get('lastSuccessAt')),
                    'lastAttemptAt':events[-1]['attemptedAt'] if events else None,
                    'lastDurationMs':events[-1]['durationMs'] if events else None,
                    'consecutiveFailures':min(100000,failures) if type(failures) is int and failures>=0 else 0,
                    'recentEvents':events}
                if events and events[-1]['outcome']=='failed':
                    diagnosis=events[-1]['diagnostic']
                    self.failures[source]={'attemptedAt':events[-1]['attemptedAt'],
                        'error':diagnosis['message']+' The last valid snapshot is retained; expired data is not a completed check.',
                        **diagnosis,'durationMs':events[-1]['durationMs']}
        except (OSError,ValueError,TypeError,AttributeError):pass

    def _persist_diagnostics(self):
        # This file contains no records, search queries, URLs or exception text.
        # Serialize writers so an older snapshot cannot overwrite a newer event.
        with self.diagnostic_lock:
            with self.lock:
                payload=json.dumps({'schemaVersion':1,'sources':self.health},separators=(',',':'))
            try:
                self.storage.mkdir(parents=True,exist_ok=True)
                path=self.storage/'refresh-diagnostics.json';temporary=path.with_suffix('.tmp')
                temporary.write_text(payload);os.replace(temporary,path)
                with self.lock:self.diagnostic_persistence_error=None
            except OSError as exc:
                with self.lock:self.diagnostic_persistence_error=source_diagnostic(exc,'local_storage')

    def _persist(self,meta,records):
        data={'meta':meta,'records':records};encoded=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode()
        payload=json.dumps({'sha256':hashlib.sha256(encoded).hexdigest(),'data':data},ensure_ascii=False,separators=(',',':'))
        self.storage.mkdir(parents=True,exist_ok=True)
        path=self.storage/(meta['id']+'.json');temporary=path.with_suffix('.tmp')
        temporary.write_text(payload);os.replace(temporary,path)

    def _due(self,source):
        # Caller holds self.lock. Subject searches never enter this path.
        if source in self.refreshing or source in self.pending_sources:return False
        if source in self.forced:return True
        if time.monotonic()<self.next_attempt.get(source,0):return False
        cached=self.cache.get(source)
        return source in self.failures or not cached or not fresh(cached[0].get('verifiedAt') or cached[0].get('retrievedAt'),REFRESH_BEFORE_SECONDS)

    def request_refresh(self,source_ids=None):
        """Coalesced explicit refresh of fixed public lists; never a subject query."""
        sources=self.source_ids if source_ids is None else source_ids
        if not isinstance(sources,(list,tuple)) or any(not isinstance(s,str) or s not in self.source_ids for s in sources):
            raise ValueError('Select known official dataset sources only.')
        accepted,active,limited=[],[],[]
        with self.lock:
            if self.stop.is_set():return {'accepted':False,'sourceIds':[],'alreadyRefreshing':[],'rateLimited':[],'stopped':True}
            clock=time.monotonic()
            for source in dict.fromkeys(sources):
                if source in self.refreshing or source in self.pending_sources or source in self.forced:active.append(source)
                elif source in self.manual_attempt and clock-self.manual_attempt[source]<MANUAL_REFRESH_COOLDOWN:limited.append(source)
                else:
                    self.manual_attempt[source]=clock;self.forced.add(source);accepted.append(source)
        self.start_refreshing();self.wake.set()
        return {'accepted':bool(accepted),'sourceIds':accepted,'alreadyRefreshing':active,'rateLimited':limited,'retryAfterSeconds':MANUAL_REFRESH_COOLDOWN if limited else 0}

    def refresh(self,source):
        if source not in self.source_ids:raise ValueError('Unknown official dataset source.')
        with self.lock:
            if self.stop.is_set() or source in self.refreshing:return
            self.refreshing.add(source);self.forced.discard(source)
        started=time.monotonic();attempted=now();stage='download';diagnosis=None
        try:
            args=SimpleNamespace(cache_dir=Path(tempfile.gettempdir())/'neolaw-official-screening-cache',reuse_cache=False,event=self.stop,download_seconds=REFRESH_DOWNLOAD_SECONDS.get(source,60))
            meta,records=self.importer.source_bundle(source,args)
            if self.stop.is_set():raise SourceRefreshCancelled()
            if meta.get('status')!='available':
                diagnosis=safe_source_diagnostic(meta.get('failure'))
                # Compatibility for older importers and offline fixtures. Only
                # the classifier sees the prose; receipts never copy it.
                if not diagnosis:diagnosis=source_diagnostic(ValueError(meta.get('error') or ''),'parser')
                raise RefreshFailure(diagnosis)
            stage='parser'
            if not fresh(meta.get('verifiedAt') or meta.get('retrievedAt')):raise ValueError('The publisher refresh did not produce a current valid snapshot.')
            if meta.get('id')!=source or not records or meta.get('recordCount')!=len(records) or any(r.get('sourceId')!=source or not r.get('id') or not r.get('name') for r in records):
                raise ValueError('The publisher refresh did not produce a valid snapshot.')
            # Prepare before publishing. Searches continue to use the prior version.
            stage='local_index';self.matcher.prepare(meta,records)
            if self.stop.is_set():raise SourceRefreshCancelled()
            stage='local_storage';self._persist(meta,records)
            if self.stop.is_set():raise SourceRefreshCancelled()
            with self.lock:self.cache[source]=(meta,records);self.failures.pop(source,None);self.unready_sources.discard(source)
        except Exception as exc:
            diagnosis=exc.diagnosis if isinstance(exc,RefreshFailure) else source_diagnostic(exc,stage)
        finally:
            duration=max(0,int((time.monotonic()-started)*1000));finished=now()
            outcome='cancelled' if diagnosis and diagnosis['category']=='cancelled' else 'failed' if diagnosis else 'succeeded'
            event={'attemptedAt':attempted,'finishedAt':finished,'durationMs':duration,'outcome':outcome}
            if diagnosis:event['diagnostic']=diagnosis
            with self.lock:
                health=self.health.setdefault(source,{'lastSuccessAt':None,'consecutiveFailures':0,'recentEvents':[]})
                health.update(lastAttemptAt=attempted,lastDurationMs=duration)
                health['recentEvents']=(health['recentEvents']+[event])[-RECENT_EVENTS_PER_SOURCE:]
                if outcome=='succeeded':
                    health['lastSuccessAt']=finished;health['consecutiveFailures']=0;self.next_attempt.pop(source,None)
                elif outcome=='failed':
                    health['consecutiveFailures']=min(100000,health['consecutiveFailures']+1)
                    delay=min(RETRY_MAX_SECONDS,RETRY_BASE_SECONDS*2**min(4,health['consecutiveFailures']-1)) if diagnosis['retryable'] else RETRY_MAX_SECONDS
                    self.next_attempt[source]=time.monotonic()+delay
                    self.failures[source]={'attemptedAt':attempted,'error':diagnosis['message']+' The last valid snapshot is retained; expired data is not a completed check.',**diagnosis,'durationMs':duration,'nextRetryAt':later(delay)}
                self.refreshing.discard(source)
            self._persist_diagnostics();self.wake.set()

    def _maintain(self):
        # Keep one shared, bounded pool. A slow OFAC download must not delay the
        # retry schedule of other sources that have already finished.
        pool=concurrent.futures.ThreadPoolExecutor(max_workers=3,thread_name_prefix='list-refresh')
        futures={}
        try:
            while not self.stop.is_set():
                with self.lock:
                    for source in list(futures):
                        if futures[source].done():
                            futures.pop(source);self.pending_sources.discard(source)
                    due=[source for source in self.source_ids if self._due(source)]
                    for source in due:
                        self.pending_sources.add(source);self.forced.discard(source)
                        futures[source]=pool.submit(self.refresh,source)
                self.wake.wait(5);self.wake.clear()
        finally:
            for future in futures.values():future.cancel()
            pool.shutdown(wait=False,cancel_futures=True)
            with self.lock:self.pending_sources.clear();self.forced.clear()

    def dataset(self,source,event):
        with self.lock:
            cached=self.cache.get(source)
            if source not in self.unready_sources and cached and fresh(cached[0].get('verifiedAt') or cached[0].get('retrievedAt')):
                meta,records=cached
                return {**meta,'detail':(meta.get('detail','')+' Prepared local index; publisher verification is no more than one hour old. Refresh runs separately from this search.').strip()},records
            meta=cached[0] if cached else {'id':source}
            failure=self.failures.get(source,{}).get('error')
            return {**meta,'status':'unavailable','error':failure or 'Prepared list is expired or not ready. Background refresh is in progress or needs attention; run again after it finishes. No current negative result is available.'},[]

    def status(self):
        with self.lock:
            sources=[]
            for source,name,url in PORTALS:
                if source=='cy':continue
                meta=self.cache.get(source,({'id':source,'name':name,'url':url,'status':'unavailable','recordCount':0},[]))[0]
                ready=source not in self.unready_sources and meta.get('status')=='available' and fresh(meta.get('verifiedAt') or meta.get('retrievedAt'))
                health=self.health.get(source,{})
                next_refresh=self.failures.get(source,{}).get('nextRetryAt')
                if not next_refresh and ready:
                    stamp=safe_stamp(meta.get('verifiedAt') or meta.get('retrievedAt'))
                    if stamp:next_refresh=(dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))+dt.timedelta(seconds=REFRESH_BEFORE_SECONDS)).isoformat(timespec='seconds').replace('+00:00','Z')
                public_health={'lastSuccessAt':health.get('lastSuccessAt') or safe_stamp(meta.get('verifiedAt') or meta.get('retrievedAt')),
                    'lastAttemptAt':health.get('lastAttemptAt'),'lastDurationMs':health.get('lastDurationMs'),
                    'consecutiveFailures':health.get('consecutiveFailures',0),'nextRefreshAt':next_refresh,
                    'recentEvents':[{**event,**({'diagnostic':dict(event['diagnostic'])} if 'diagnostic' in event else {})} for event in health.get('recentEvents',[])]}
                sources.append({**meta,'status':'available' if ready else 'unavailable','indexReady':ready,'refreshing':source in self.refreshing or source in self.pending_sources or source in self.forced,'refreshFailure':dict(self.failures[source]) if source in self.failures else None,'refreshHealth':public_health,**({} if ready else {'error':'Prepared list needs refresh; coverage is incomplete.'})})
            return {'schemaVersion':1,'records':[],'sources':sources,'preparedIndex':{'ready':sum(s['indexReady'] for s in sources),'total':len(sources),'maxAgeSeconds':3600,'refreshIntervalSeconds':300,'retryBaseSeconds':RETRY_BASE_SECONDS,'retryMaxSeconds':RETRY_MAX_SECONDS,'evaluatedAt':now(),'diagnosticPersistenceError':self.diagnostic_persistence_error}}
