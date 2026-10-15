#!/usr/bin/env python3
"""Offline adapter and pipeline checks; live source tests are separate."""
import copy
import importlib.util
import json
import sys
import threading
import tempfile
import hashlib
import http.client
import ssl
import urllib.error
from types import SimpleNamespace
import time
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from screening_official import CyprusPage, cy_parse, cy_read, check_cyprus, initial_checks, OfficialChecker, fresh, research_evidence
from screening_research import ResearchService, DEFAULT_MODEL, OFFICIAL_DOMAINS
spec=importlib.util.spec_from_file_location('research_tests',ROOT/'scripts/check-screening-research.py')
fixtures=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixtures)
QUERY={'name':'Example Name','type':'person','country':'Cyprus','dob':'1980-01-01'}

def page(rows,name='Example Name'):
    return (f'<form name="sanction_screening_tool" method="post" action="/sanction"><input name="sanction_screening_tool[name]" value="{name}"><input name="sanction_screening_tool[_token]" value="fixture-csrf"></form><table class="table_basic">'+rows+'</table>').encode()
ROW='<tr><td>Name: 90%</td><td><i title="Individual"></i></td><td>EU.123<div>List date: 12.10.2026</div></td><td><ul><li>Example Name</li><li>Example Alias</li></ul></td><td>EU list Birth date: 1970-01-01 Program: EXAMPLE</td><td><a href="https://eur-lex.europa.eu/example">Source</a></td></tr>'

class CyprusTests(unittest.TestCase):
    def test_bis_rows_without_official_ids_remain_distinct_and_are_not_sanctions_labels(self):
        row='<tr><td>Name: 100%</td><td></td><td></td><td><ul><li>Huawei Technologies Co., Ltd.</li></ul></td><td>US list Country: CN Address: {}</td><td><a href="https://www.bis.gov/licensing/guidance-on-end-user-and-end-use-controls-and-us-person-controls">Entity List (EL) - Bureau of Industry and Security</a></td></tr>'
        raw=page(row.format('Shenzhen')+row.format('Shanghai')+'<tr><td>2 results found.</td></tr>')
        result=cy_parse(raw,QUERY);a,b=[c['record'] for c in result['candidates']]
        self.assertEqual(result['matchCount'],2);self.assertNotEqual(a['id'],b['id']);self.assertTrue(a['localReference'])
        self.assertEqual(a['identifiers'],[]);self.assertEqual(a['countries'],['CN']);self.assertIn('export controls',a['programs'][0])
        self.assertEqual(cy_parse(raw,QUERY)['candidates'][0]['record']['id'],a['id'])
        with self.assertRaises(ValueError):cy_parse(raw.replace(b'www.bis.gov',b'example.test'),QUERY)
    def test_all_rows_validated_and_preserved_beyond_first_25(self):
        rows=''.join(ROW.replace('EU.123',f'EU.{i}') for i in range(30))
        self.assertEqual(len(cy_parse(page(rows+'<tr><td>30 results found.</td></tr>'),QUERY)['candidates']),30)
        with self.assertRaises(ValueError):cy_parse(page(rows+ROW.replace('90%','unknown')+'<tr><td>31 results found.</td></tr>'),QUERY)
    def test_match_preserves_identifiers_and_differing_birth_date(self):
        r=cy_parse(page(ROW+'<tr><td>1 result found.</td></tr>'),QUERY)
        self.assertEqual(r['matchCount'],1);self.assertEqual(r['status'],'completed')
        m=r['candidates'][0];self.assertEqual(m['record']['datesOfBirth'],['1970-01-01'])
        self.assertEqual(m['record']['aliases'],['Example Alias']);self.assertEqual(m['score'],90)
        self.assertEqual(len(r['responseSha256']),64)
    def test_only_explicit_valid_birth_dates_are_identity_evidence(self):
        for value,expected in [('Designation date: 2022-02-25',[]),('Birth date: 2022-02-31',[]),('Birth date: 1970-01-01 Updated: 2026-10-12',['1970-01-01'])]:
            r=cy_parse(page(ROW.replace('Birth date: 1970-01-01',value)+'<tr><td>1 result found.</td></tr>'),QUERY)
            self.assertEqual(r['candidates'][0]['record']['datesOfBirth'],expected)
            self.assertIn(value,r['candidates'][0]['record']['reasons'])
    def test_conflicting_summary_rows_and_impossible_score_are_rejected(self):
        for rows in (ROW+'<tr><td>1 result found.</td></tr><tr><td>No results found.</td></tr>',ROW+'<tr><td>1 result found.</td></tr><tr><td>2 results found.</td></tr>',ROW.replace('90%','190%')+'<tr><td>1 result found.</td></tr>'):
            with self.assertRaises(ValueError): cy_parse(page(rows),QUERY)
    def test_portal_read_has_a_wall_clock_limit_and_observes_cancellation(self):
        from unittest.mock import MagicMock
        response=MagicMock();response.__enter__.return_value=response;response.read1.return_value=b'x'
        opener=MagicMock();opener.open.return_value=response
        with patch('screening_official.time.monotonic',side_effect=[0,1,46]),self.assertRaisesRegex(ValueError,'time limit'):
            cy_read(opener,'https://stratlink.meci.gov.cy/sanction')
        self.assertEqual(response.read1.call_count,1)
        event=threading.Event()
        def read(_): event.set();return b'x'
        response.read1.side_effect=read
        with self.assertRaisesRegex(ValueError,'stopped'): cy_read(opener,'https://stratlink.meci.gov.cy/sanction',event)
    def test_zero_requires_explicit_result_row_and_echoed_query(self):
        r=cy_parse(page('<tr><td>No results found.</td></tr>'),QUERY)
        self.assertEqual(r['matchCount'],0);self.assertEqual(r['candidates'],[])
    def test_empty_blocked_validation_or_wrong_subject_is_never_zero(self):
        for raw in (b'<h1>Access denied</h1>',page(''),page('<tr><td>Invalid search</td></tr>'),page('<tr><td>No results found.</td></tr>','Another Name')):
            with self.subTest(raw=raw),self.assertRaises(ValueError):cy_parse(raw,QUERY)
    def test_pagination_and_format_changes_fail_closed(self):
        for rows in (ROW+'<tr><td>2 results found.</td></tr>',ROW.replace('90%','unknown')+'<tr><td>1 result found.</td></tr>',ROW+'<tr><td>No results found.</td></tr>'):
            with self.assertRaises(ValueError):cy_parse(page(rows),QUERY)
    def test_normal_csrf_request_sends_name_only_and_no_country_filter(self):
        with patch('screening_official.cy_read',side_effect=[page(''),page('<tr><td>No results found.</td></tr>')]) as read:
            check_cyprus(QUERY,threading.Event())
            from urllib.parse import parse_qs
            sent=parse_qs(read.call_args_list[1].args[1].data.decode(),keep_blank_values=True)
            self.assertEqual(sent['sanction_screening_tool[_token]'],['fixture-csrf'])
            self.assertEqual(sent['sanction_screening_tool[name]'],[QUERY['name']])
            self.assertEqual(sent['sanction_screening_tool[country]'],[''])
            self.assertNotIn(QUERY['dob'],str(sent));self.assertNotIn(QUERY['country'],str(sent))
    def test_cancellation_before_post_sends_no_subject(self):
        event=threading.Event();event.set()
        with patch('screening_official.cy_read',return_value=page('')) as read:
            with self.assertRaises(ValueError):check_cyprus(QUERY,event)
            self.assertEqual(read.call_count,1)

class PipelineTests(unittest.TestCase):
    def make(self,checker,provider=None):
        return ResearchService(worldbank_checker=lambda *a:{'status':'completed','totalResults':0,'candidates':[]}, provider=provider or fixtures.FakeProvider(),env={'OPENAI_API_KEY':fixtures.FIXTURE_KEY},official_checker=checker)
    def test_all_five_results_arrive_before_any_ai_and_first_search_is_official_only(self):
        provider=fixtures.FakeProvider()
        def checker(query,event,publish):
            self.assertEqual(provider.calls,[])
            return fixtures.completed_official(query,event,publish)
        s=self.make(checker,provider);job=s.get(s.start({'query':QUERY},background=False)['id'])
        self.assertEqual(job['officialStatus'],'completed');self.assertEqual(job['status'],'completed')
        self.assertEqual(len(provider.calls),3)
        first=provider.calls[0][1]
        self.assertEqual(first['tools'][0]['filters']['allowed_domains'],OFFICIAL_DOMAINS)
        self.assertEqual(first['model'],DEFAULT_MODEL)
        self.assertNotIn('filters',provider.calls[1][1]['tools'][0])
        self.assertEqual(first['input'].count('"matchCount": 0'),9)
        self.assertTrue(all(c['status']=='completed' for c in job['requestedPortals']))
    def test_one_failed_source_keeps_overall_partial_even_when_ai_completes(self):
        def checker(query,event,publish):
            checks=fixtures.completed_official(query,event,publish)
            checks[1].update(status='failed',error='Timeout',matchCount=None);publish(checks[1]);return checks
        s=self.make(checker);job=s.get(s.start({'query':QUERY},background=False)['id'])
        self.assertEqual(job['status'],'partial');self.assertEqual(job['completedPhases'],3)
        self.assertEqual(job['officialStatus'],'partial');self.assertEqual(job['officialChecks'][1]['error'],'Timeout')
    def test_stop_during_official_checks_keeps_completed_results_and_never_calls_ai(self):
        entered,release=threading.Event(),threading.Event();provider=fixtures.FakeProvider()
        def checker(query,event,publish):
            checks=initial_checks();checks[0].update(status='completed',matchCount=2);publish(checks[0]);entered.set();release.wait(2)
            for c in checks[1:]:c.update(status='completed',matchCount=0);publish(c)
            return checks
        s=self.make(checker,provider);job_id=s.start({'query':QUERY})['id'];self.assertTrue(entered.wait(1))
        s.cancel(job_id);release.set()
        deadline=time.monotonic()+2
        while s.status()['activeJobId'] and time.monotonic()<deadline:time.sleep(.01)
        job=s.get(job_id);self.assertEqual(provider.calls,[]);self.assertEqual(job['status'],'cancelled')
        self.assertEqual(job['officialChecks'][0]['matchCount'],2)
        self.assertTrue(all(c['status']=='cancelled' for c in job['officialChecks'][1:]))
    def test_unexpected_checker_failure_preserves_finished_checks_and_syncs_portals(self):
        def checker(query,event,publish):
            check=initial_checks()[0];check.update(status='completed',matchCount=0);publish(check)
            raise RuntimeError('fixture')
        service=self.make(checker);job=service.get(service.start({'query':QUERY},background=False)['id'])
        self.assertEqual(job['status'],'partial')
        self.assertEqual([c['status'] for c in job['requestedPortals']],['completed']+['failed']*8)
    def test_adapter_failure_does_not_skip_other_sources(self):
        checker=OfficialChecker()
        def dataset(source,event):
            return ({'id':source,'status':'unavailable','error':'Feed failed'},[]) if source=='ofac' else ({'id':source,'status':'available','recordCount':1},[{}])
        checker.dataset=dataset
        with patch('screening_official.match_records',return_value={'totalMatches':0,'matches':[]}),patch('screening_official.check_cyprus',return_value={'status':'completed','matchCount':0,'candidates':[]}):
            results=checker(QUERY,threading.Event(),lambda _:None)
        self.assertEqual([c['status'] for c in results],['completed','failed']+['completed']*7)
    def test_model_receives_bounded_public_evidence_not_private_fields(self):
        checks=initial_checks();checks[0]['candidates']=[{'record':{'id':'eu:1','name':'Example','identifiers':['not-needed-document-number'],'reasons':'A'*3000},'score':99}]*30
        value=research_evidence(checks)
        self.assertEqual(len(value[0]['candidates']),12)
        self.assertNotIn('not-needed-document-number',json.dumps(value))
        self.assertLessEqual(len(value[0]['candidates'][0]['sourceInformation']),1800)
    def test_bad_or_future_freshness_is_not_accepted(self):
        for value in ('','bad',None,'2999-01-01T00:00:00Z','2000-01-01T00:00:00Z'):self.assertFalse(fresh(value))

class CacheTests(unittest.TestCase):
    def test_slow_complete_download_exceeds_old_limit_but_fits_background_budget(self):
        from screening_index import REFRESH_DOWNLOAD_SECONDS
        importer=OfficialChecker().importer
        class Response:
            headers={'Content-Length':'7'}
            def __init__(self):self.sent=False
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read1(self,n):
                value=self.sent;self.sent=True;return b'' if value else b'<root/>'
        with patch.object(importer.urllib.request,'urlopen',return_value=Response()),patch.object(importer.time,'monotonic',side_effect=[0,65]):
            with self.assertRaisesRegex(ValueError,'time limit'):importer._download_once('https://example.test/feed',SimpleNamespace(download_seconds=60))
        with patch.object(importer.urllib.request,'urlopen',return_value=Response()),patch.object(importer.time,'monotonic',side_effect=[0,65]):
            content,receipt=importer._download_once('https://example.test/feed',SimpleNamespace(download_seconds=REFRESH_DOWNLOAD_SECONDS['ofac']))
            self.assertEqual(content,b'<root/>');self.assertEqual(receipt['sha256'],hashlib.sha256(content).hexdigest())

    def test_socket_timeout_retries_once_within_original_budget(self):
        importer=OfficialChecker().importer
        for error in (TimeoutError('timed out'),urllib.error.URLError(TimeoutError('timed out'))):
            with self.subTest(error=type(error)),patch.object(importer,'_download_once',side_effect=[error,(b'<root/>',{})]) as request,patch.object(importer.time,'sleep'):
                content,receipt=importer.download('https://example.test/feed',SimpleNamespace(download_seconds=480))
                self.assertEqual(content,b'<root/>');self.assertEqual(receipt['downloadAttempts'],2)
                self.assertLessEqual(request.call_args_list[1].args[1].download_seconds,request.call_args_list[0].args[1].download_seconds)
            with patch.object(importer,'_download_once',side_effect=error) as request,patch.object(importer.time,'sleep'):
                with self.assertRaises(type(error)):importer.download('https://example.test/feed',SimpleNamespace(download_seconds=480))
                self.assertEqual(request.call_count,2)

    def test_truncated_download_retries_once_with_shared_budget_and_valid_receipt(self):
        importer=OfficialChecker().importer
        args=SimpleNamespace(download_seconds=8)
        with patch.object(importer,'_download_once',side_effect=[http.client.IncompleteRead(b'partial',42),(b'<root/>',{'sha256':'valid'})]) as request, patch.object(importer.time,'sleep'):
            content,receipt=importer.download('https://example.test/feed',args)
        self.assertEqual(content,b'<root/>');self.assertEqual(receipt['downloadAttempts'],2)
        self.assertEqual(request.call_count,2);self.assertLessEqual(request.call_args_list[1].args[1].download_seconds,request.call_args_list[0].args[1].download_seconds)
        self.assertEqual(args.download_seconds,8)

    def test_retry_does_not_retry_tls_or_override_cancelled_or_exhausted_work(self):
        importer=OfficialChecker().importer
        for error in (ssl.SSLCertVerificationError('untrusted'),urllib.error.URLError(ssl.SSLCertVerificationError('untrusted')),urllib.error.HTTPError('https://example.test/feed',403,'Forbidden',{},None),ValueError('schema invalid')):
            with patch.object(importer,'_download_once',side_effect=error) as request:
                with self.assertRaises(type(error)):importer.download('https://example.test/feed')
                self.assertEqual(request.call_count,1)
        event=threading.Event()
        def stopped(*args):event.set();raise http.client.IncompleteRead(b'',10)
        with patch.object(importer,'_download_once',side_effect=stopped) as request:
            with self.assertRaisesRegex(ValueError,'stopped'):importer.download('https://example.test/feed',SimpleNamespace(event=event))
            self.assertEqual(request.call_count,1)
        with patch.object(importer,'_download_once',side_effect=http.client.IncompleteRead(b'',10)) as request, patch.object(importer.time,'monotonic',side_effect=[0,0,8]):
            with self.assertRaises(http.client.IncompleteRead):importer.download('https://example.test/feed',SimpleNamespace(download_seconds=8))
            self.assertEqual(request.call_count,1)

    def test_declared_response_length_cannot_accept_a_partial_body(self):
        importer=OfficialChecker().importer
        class Response:
            headers={'Content-Length':'99'}
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read1(self,n):
                value=getattr(self,'sent',False);self.sent=True
                return b'' if value else b'<root/>'
        with patch.object(importer.urllib.request,'urlopen',return_value=Response()):
            with self.assertRaises(http.client.IncompleteRead):importer._download_once('https://example.test/feed')

    def test_two_truncated_attempts_preserve_cache_and_fail(self):
        importer=OfficialChecker().importer
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);value=b'<root/>';url='https://example.test/feed'
            meta={'url':url,'sha256':hashlib.sha256(value).hexdigest(),'retrievedAt':'2026-10-11T00:00:00Z'}
            (root/'un.xml').write_bytes(value);(root/'un.json').write_text(json.dumps(meta))
            with patch.object(importer,'_download_once',side_effect=http.client.IncompleteRead(b'partial',10)) as request, patch.object(importer.time,'sleep'):
                with self.assertRaises(http.client.IncompleteRead):importer.fetch('un',url,SimpleNamespace(cache_dir=root,reuse_cache=False))
                self.assertEqual(request.call_count,2)
            self.assertEqual((root/'un.xml').read_bytes(),value);self.assertEqual(json.loads((root/'un.json').read_text()),meta)

    def test_corrupt_cache_recovers_by_downloading_without_false_validators(self):
        importer=OfficialChecker().importer
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'un.xml').write_text('<old/>');(root/'un.json').write_text('{broken')
            args=SimpleNamespace(cache_dir=root,reuse_cache=False)
            value=b'<CONSOLIDATED_LIST/>';meta={'url':'https://example.test/list','sha256':hashlib.sha256(value).hexdigest(),'retrievedAt':'2026-10-12T00:00:00Z'}
            with patch.object(importer,'download',return_value=(value,meta)) as download:
                self.assertEqual(importer.fetch('un',meta['url'],args),(value,meta))
                self.assertEqual(download.call_args.args[2],{})
            self.assertEqual((root/'un.xml').read_bytes(),value)
    def test_304_requires_intact_cache_and_preserves_original_retrieval_date(self):
        importer=OfficialChecker().importer
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);value=b'<CONSOLIDATED_LIST/>';url='https://example.test/list'
            meta={'url':url,'sha256':hashlib.sha256(value).hexdigest(),'retrievedAt':'2020-01-01T00:00:00Z','etag':'fixture'}
            (root/'un.xml').write_bytes(value);(root/'un.json').write_text(json.dumps(meta));args=SimpleNamespace(cache_dir=root,reuse_cache=False)
            with patch.object(importer,'download',side_effect=urllib.error.HTTPError(url,304,'Not modified',{},None)) as download:
                body,result=importer.fetch('un',url,args)
                self.assertEqual(body,value);self.assertEqual(result['retrievedAt'],meta['retrievedAt']);self.assertTrue(fresh(result['verifiedAt']))
                self.assertEqual(download.call_args.args[2],{'If-None-Match':'fixture'})
                (root/'un.xml').write_bytes(b'corrupt')
                with self.assertRaises(urllib.error.HTTPError): importer.fetch('un',url,args)
                self.assertEqual(download.call_args.args[2],{})

if __name__=='__main__': unittest.main(verbosity=2)
