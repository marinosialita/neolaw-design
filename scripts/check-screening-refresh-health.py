"""Offline fault injection for source receipts, independent recovery and shutdown."""
import copy
import errno
import json
import socket
import ssl
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import screening_index as index
from screening_official import now, OfficialChecker
from screening_tls import source_diagnostic, safe_source_diagnostic, SourceRefreshCancelled

SECRET='DO-NOT-RETAIN-secret-or-subject'
def valid(source='un'):
    return ({'id':source,'name':'Fixture publisher','status':'available','recordCount':1,'retrievedAt':now(),'verifiedAt':now()},
            [{'id':source+':1','sourceId':source,'name':'Fixture Person','type':'person'}])
def failed(exc):
    return ({'status':'unavailable','failure':source_diagnostic(exc),'error':SECRET},[])
def wait_for(predicate,seconds=1):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        if predicate():return True
        time.sleep(.005)
    return bool(predicate())

class DiagnosticTests(unittest.TestCase):
    def test_nested_dns_timeout_tls_http_network_are_distinguishable_and_safe(self):
        examples=[
            (urllib.error.URLError(socket.gaierror(-2,SECRET)),'dns',True),
            (urllib.error.URLError(TimeoutError(SECRET)),'timeout',True),
            (urllib.error.URLError(ssl.SSLCertVerificationError(SECRET)),'tls',False),
            (urllib.error.HTTPError('https://example.test/?key='+SECRET,503,SECRET,{},None),'http',True),
            (urllib.error.HTTPError('https://example.test/?key='+SECRET,403,SECRET,{},None),'http',False),
            (urllib.error.URLError(ConnectionResetError(errno.ECONNRESET,SECRET)),'network',True),
            (ValueError(SECRET),'parser',False),
            (RuntimeError(SECRET),'unknown',False),
            (SourceRefreshCancelled(),'cancelled',False),
        ]
        for exc,category,retryable in examples:
            with self.subTest(category=category):
                result=source_diagnostic(exc)
                self.assertEqual(result['category'],category);self.assertEqual(result['retryable'],retryable)
                self.assertNotIn(SECRET,json.dumps(result));self.assertNotIn('https:',json.dumps(result))
        for stage in ('local_index','local_storage'):
            self.assertEqual(source_diagnostic(OSError(SECRET),stage)['category'],stage)
    def test_persisted_diagnostic_text_and_retry_flag_cannot_override_allowlist(self):
        d=safe_source_diagnostic({'category':'tls','message':SECRET,'retryable':True,'httpStatus':200,'errno':999999,'url':SECRET})
        self.assertEqual(set(d),{'category','message','retryable'});self.assertFalse(d['retryable']);self.assertNotIn(SECRET,str(d))
        self.assertIsNone(safe_source_diagnostic({'category':SECRET}))
    def test_importer_preserves_cause_without_printing_payload(self):
        importer=OfficialChecker().importer
        with patch.object(importer,'fetch',side_effect=urllib.error.URLError(socket.gaierror(-2,SECRET))),patch('builtins.print') as log:
            meta,records=importer.source_bundle('un',SimpleNamespace())
        self.assertEqual(records,[]);self.assertEqual(meta['failure']['category'],'dns')
        self.assertNotIn(SECRET,str(meta));self.assertNotIn(SECRET,str(log.call_args))
    def test_importer_distinguishes_parser_and_local_cache_failure(self):
        importer=OfficialChecker().importer
        with patch.object(importer,'fetch',return_value=(b'<invalid',{})),patch('builtins.print'):
            meta,records=importer.source_bundle('un',SimpleNamespace())
        self.assertEqual(meta['failure']['category'],'parser');self.assertEqual(records,[])
        with tempfile.TemporaryDirectory() as directory,patch.object(importer,'download',return_value=(b'<root/>',{})),patch.object(Path,'write_bytes',side_effect=PermissionError(errno.EACCES,SECRET)),patch('builtins.print'):
            meta,records=importer.source_bundle('un',SimpleNamespace(cache_dir=Path(directory),reuse_cache=False))
        self.assertEqual(meta['failure']['category'],'local_storage');self.assertNotIn(SECRET,str(meta))

class HealthTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
        self.checkers=[];self.addCleanup(self.cleanup)
        self.checker=self.make_checker()
    def cleanup(self):
        for checker in self.checkers:checker.close();checker.matcher.close()
    def make_checker(self):
        def init(checker):
            checker.cache={};checker.lock=threading.Lock();checker.importer=SimpleNamespace(source_bundle=Mock(return_value=valid()))
        with patch.object(index.OfficialChecker,'__init__',init),patch.object(index,'ROOT',Path(self.directory.name)/'missing'),patch.object(index,'LocalMatcher') as matcher:
            matcher.return_value=Mock()
            checker=index.PreparedOfficialChecker(self.directory.name,start_background=False)
        self.checkers.append(checker);return checker
    def source(self,source='un'):
        return next(s for s in self.checker.status()['sources'] if s['id']==source)
    def test_startup_local_index_failure_is_incomplete_until_recovery(self):
        self.checker._persist(*valid())
        def init(checker):
            checker.cache={};checker.lock=threading.Lock();checker.importer=SimpleNamespace(source_bundle=Mock(return_value=valid()))
        with patch.object(index.OfficialChecker,'__init__',init),patch.object(index,'ROOT',Path(self.directory.name)/'missing'),patch.object(index,'LocalMatcher') as matcher:
            matcher.return_value=Mock();matcher.return_value.prepare.side_effect=RuntimeError(SECRET)
            checker=index.PreparedOfficialChecker(self.directory.name,start_background=False)
        self.checkers.append(checker)
        source=next(s for s in checker.status()['sources'] if s['id']=='un')
        self.assertFalse(source['indexReady']);self.assertEqual(source['refreshFailure']['category'],'local_index')
        self.assertEqual(checker.dataset('un',threading.Event())[1],[])
        checker.matcher.prepare.side_effect=None;checker.refresh('un')
        self.assertTrue(next(s for s in checker.status()['sources'] if s['id']=='un')['indexReady'])
    def test_restored_receipts_drop_unknown_fields_and_do_not_trust_message_text(self):
        event={'attemptedAt':now(),'finishedAt':now(),'durationMs':3,'outcome':'failed',
               'query':SECRET,'diagnostic':{'category':'tls','message':SECRET,'retryable':True,'apiKey':SECRET}}
        (Path(self.directory.name)/'refresh-diagnostics.json').write_text(json.dumps({'sources':{'un':{'lastSuccessAt':SECRET,'consecutiveFailures':1,'recentEvents':[event]},SECRET:{'recentEvents':[event]}}}))
        restored=self.make_checker()
        self.assertNotIn(SECRET,json.dumps(restored.health));self.assertNotIn(SECRET,json.dumps(restored.status()))
        self.assertFalse(restored.failures['un']['retryable'])

    def test_success_and_failure_receipts_survive_restart_without_query_data(self):
        self.checker.refresh('un')
        self.checker.importer.source_bundle.return_value=failed(urllib.error.URLError(socket.gaierror(-2,SECRET)))
        self.checker.refresh('un')
        health=self.source()['refreshHealth'];failure=self.source()['refreshFailure']
        self.assertIsNotNone(health['lastSuccessAt']);self.assertEqual(health['consecutiveFailures'],1)
        self.assertEqual(failure['category'],'dns');self.assertGreaterEqual(failure['durationMs'],0)
        self.assertEqual([e['outcome'] for e in health['recentEvents']],['succeeded','failed'])
        self.assertTrue(self.source()['indexReady']) # Prior verified evidence is still within 1h.
        self.assertNotIn(SECRET,(Path(self.directory.name)/'refresh-diagnostics.json').read_text())
        restored=self.make_checker()
        self.assertEqual(restored.health['un']['recentEvents'],health['recentEvents'])
        self.assertEqual(restored.failures['un']['category'],'dns')
        self.assertEqual(restored.cache['un'][0]['verifiedAt'],self.checker.cache['un'][0]['verifiedAt'])
    def test_expired_snapshot_remains_incomplete_through_failure_then_recovers(self):
        meta,rows=valid();meta['verifiedAt']='2000-01-01T00:00:00Z'
        self.checker.cache['un']=(copy.deepcopy(meta),rows)
        self.checker.importer.source_bundle.return_value=failed(TimeoutError(SECRET));self.checker.refresh('un')
        self.assertFalse(self.source()['indexReady']);self.assertEqual(self.checker.cache['un'][0],meta)
        public,records=self.checker.dataset('un',threading.Event())
        self.assertEqual(public['status'],'unavailable');self.assertEqual(records,[])
        self.assertIn('expired data is not a completed check',public['error'])
        self.checker.importer.source_bundle.return_value=valid();self.checker.refresh('un')
        self.assertTrue(self.source()['indexReady']);self.assertIsNone(self.source()['refreshFailure'])
        self.assertEqual(self.source()['refreshHealth']['consecutiveFailures'],0)
    def test_failure_events_and_backoff_are_bounded(self):
        self.checker.importer.source_bundle.return_value=failed(TimeoutError(SECRET))
        delays=[]
        for _ in range(12):
            before=time.monotonic();self.checker.refresh('un');delays.append(round(self.checker.next_attempt['un']-before))
        self.assertEqual(delays[:5],[30,60,120,240,300]);self.assertEqual(delays[5:],[300]*7)
        self.assertEqual(len(self.source()['refreshHealth']['recentEvents']),8)
        with self.checker.lock:self.assertFalse(self.checker._due('un'))
        self.checker.importer.source_bundle.return_value=failed(ssl.SSLCertVerificationError(SECRET));self.checker.refresh('un')
        self.assertFalse(self.source()['refreshFailure']['retryable'])
        self.assertAlmostEqual(self.checker.next_attempt['un']-time.monotonic(),300,delta=1)
    def test_invalid_snapshot_and_matcher_or_disk_failure_never_replace_evidence(self):
        original=valid();self.checker.cache['un']=copy.deepcopy(original)
        bad_meta,bad_rows=valid();bad_meta['recordCount']=20
        self.checker.importer.source_bundle.return_value=(bad_meta,bad_rows);self.checker.refresh('un')
        self.assertEqual(self.source()['refreshFailure']['category'],'parser');self.assertEqual(self.checker.cache['un'],original)
        self.checker.importer.source_bundle.return_value=valid();self.checker.matcher.prepare.side_effect=RuntimeError(SECRET)
        self.checker.refresh('un');self.assertEqual(self.source()['refreshFailure']['category'],'local_index')
        self.checker.matcher.prepare.side_effect=None
        with patch.object(self.checker,'_persist',side_effect=PermissionError(errno.EACCES,SECRET)):self.checker.refresh('un')
        self.assertEqual(self.source()['refreshFailure']['category'],'local_storage');self.assertEqual(self.checker.cache['un'],original)
        self.assertNotIn(SECRET,json.dumps(self.source()))
    def test_cancel_after_download_publishes_nothing_and_does_not_inflate_failure_count(self):
        def download(*args):self.checker.stop.set();return valid()
        self.checker.importer.source_bundle.side_effect=download;self.checker.refresh('un')
        self.assertNotIn('un',self.checker.cache);self.checker.matcher.prepare.assert_not_called()
        self.assertEqual(self.source()['refreshHealth']['recentEvents'][-1]['outcome'],'cancelled')
        self.assertEqual(self.source()['refreshHealth']['consecutiveFailures'],0)
        self.assertFalse((Path(self.directory.name)/'un.json').exists())
    def test_manual_refresh_coalesces_and_rate_limits_and_only_accepts_fixed_sources(self):
        with patch.object(self.checker,'start_refreshing'):
            self.assertEqual(self.checker.request_refresh(['un','un'])['sourceIds'],['un'])
            self.assertEqual(self.checker.request_refresh(['un'])['alreadyRefreshing'],['un'])
            self.checker.refresh('un')
            self.assertEqual(self.checker.request_refresh(['un'])['rateLimited'],['un'])
            for invalid in (['cy'],['https://example.test'],SECRET,[SECRET],{'un':1}):
                with self.assertRaises(ValueError):self.checker.request_refresh(invalid)
        self.checker.close();self.assertTrue(self.checker.request_refresh(['un'])['stopped'])
    def test_slow_source_does_not_hold_back_other_sources_recovery(self):
        self.checker.source_ids=['ofac','un'];blocked=threading.Event();release=threading.Event();count=0
        def download(source,args):
            nonlocal count
            if source=='ofac':blocked.set();release.wait(2);return valid(source)
            count+=1
            return failed(TimeoutError(SECRET)) if count==1 else valid(source)
        self.checker.importer.source_bundle.side_effect=download;self.checker.start_refreshing()
        try:
            self.assertTrue(blocked.wait(1));self.assertTrue(wait_for(lambda:'un' in self.checker.failures))
            with self.checker.lock:self.checker.next_attempt['un']=0
            self.checker.wake.set()
            self.assertTrue(wait_for(lambda:self.source()['indexReady']))
            self.assertFalse(release.is_set());self.assertEqual(count,2)
        finally:release.set();self.checker.close()
    def test_shutdown_stops_queued_work_and_cancelled_downloads(self):
        self.checker.source_ids=['eu','ofac','un','uk'];entered=threading.Event();calls=[]
        def download(source,args):
            calls.append(source)
            if len(calls)==3:entered.set()
            args.event.wait(2)
            raise SourceRefreshCancelled()
        self.checker.importer.source_bundle.side_effect=download;self.checker.start_refreshing()
        self.assertTrue(entered.wait(1));self.checker.close()
        self.assertTrue(wait_for(lambda:not self.checker.refreshing))
        self.assertEqual(len(calls),3);self.assertNotIn('uk',calls);self.assertEqual(self.checker.cache,{})
        self.assertFalse(self.checker.background.is_alive())
    def test_status_is_a_copy_and_diagnostics_write_failure_does_not_fail_valid_list(self):
        with patch.object(Path,'write_text',side_effect=lambda *a,**k: (_ for _ in ()).throw(OSError(SECRET))) as write:
            with patch.object(self.checker,'_persist'):self.checker.refresh('un')
        self.assertTrue(self.source()['indexReady'])
        self.assertEqual(self.checker.status()['preparedIndex']['diagnosticPersistenceError']['category'],'local_storage')
        self.checker.importer.source_bundle.return_value=failed(TimeoutError(SECRET));self.checker.refresh('un')
        public=self.source();public['refreshHealth']['recentEvents'][-1]['diagnostic']['message']=SECRET
        self.assertNotIn(SECRET,json.dumps(self.checker.health))

if __name__=='__main__':unittest.main(verbosity=2)
