"""Offline World Bank parser, matching, source failure and job lifecycle checks."""
import copy,datetime as dt,hashlib,http.client,importlib.util,io,json,sys,threading,time,unittest
from unittest.mock import patch,Mock
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from screening_worldbank import WorldBankChecker,SourceFailure,parse_records,PAGE,FEED,NOTES
from screening_research import ResearchService,build_payload
from screening_official import initial_checks
from screening_report import build_pdf
from pypdf import PdfReader

def row(**changes):
    return dict(SUPP_NAME='Synthetic Débarment Example Ltd',SUPP_ID=42,SUPP_TYPE_CODE='F',SUPP_ELIG_STAT='DEBARRED',COUNTRY_NAME='France',DEBAR_FROM_DATE='2020-01-01',DEBAR_TO_DATE='2999-12-31',INELIGIBLY_STATUS='Ongoing',ADD_SUPP_INFO='*10',DEBAR_REASON='Controlled affiliate',LAST_REFRESH_DATE=dt.datetime.now(dt.timezone.utc).isoformat(),CRPD_STAT='CLEARED',**changes)
def payload(record=None):return {'response':{'ZPROCSUPP':[record or row()]}}
def checker_for(data):return WorldBankChecker(transport=lambda e:(data,'fixture-hash'))
def official(q,e,p):return [{**c,'status':'completed','matchCount':0,'candidates':[]} for c in initial_checks()]
def pdf_text(report):return '\n'.join(p.extract_text() for p in PdfReader(io.BytesIO(build_pdf(report))).pages)

class Response:
    def __init__(self,body,declared=None,status=200,read=None):
        self.body=io.BytesIO(body);self.declared=declared;self.status=status;self.read=read
    def getheader(self,name):return self.declared if name=='Content-Length' else None
    def read1(self,size):return self.read() if self.read else self.body.read(size)

def connection(response):
    client=Mock();client.getresponse.return_value=response;return client

def public_page():
    return ('var prodtabApi = "'+FEED+'"; var propApiKey = "public-test-configuration";').encode()

class WorldBankTests(unittest.TestCase):
    def test_valid_json_with_short_http_body_is_failed_and_never_cached(self):
        raw=json.dumps(payload()).encode();page=public_page()
        clients=[connection(Response(page,str(len(page))))]+[connection(Response(raw,str(len(raw)+50))) for _ in range(2)]
        event=threading.Event();event.wait=Mock(return_value=False)
        with patch('screening_worldbank.http.client.HTTPSConnection',side_effect=clients) as connect:
            c=WorldBankChecker();out=c({'name':row()['SUPP_NAME']},event)
        self.assertEqual(connect.call_count,3);self.assertEqual(out['errorCode'],'truncated_response');self.assertEqual(out['status'],'failed')
        self.assertNotIn('totalResults',out);self.assertNotIn('sha256',out);self.assertIsNone(c._cache)
        self.assertTrue(all(client.close.called for client in clients))
    def test_retry_discards_partial_body_and_hashes_only_complete_bytes(self):
        raw=json.dumps(payload()).encode();page=public_page()
        clients=[connection(Response(page,str(len(page)))),connection(Response(raw[:40],str(len(raw)))),connection(Response(raw,str(len(raw))))]
        event=threading.Event();event.wait=Mock(return_value=False)
        with patch('screening_worldbank.http.client.HTTPSConnection',side_effect=clients):
            out=WorldBankChecker()({'name':row()['SUPP_NAME']},event)
        self.assertEqual(out['status'],'completed');self.assertEqual(out['totalResults'],1);self.assertEqual(out['sha256'],hashlib.sha256(raw).hexdigest())
        self.assertTrue(all(client.close.called for client in clients))
    def test_cancel_during_response_closes_connection_and_never_retries(self):
        event=threading.Event()
        def stopped():event.set();raise http.client.IncompleteRead(b'partial',20)
        client=connection(Response(b'',read=stopped))
        with patch('screening_worldbank.http.client.HTTPSConnection',return_value=client) as connect:
            out=WorldBankChecker()({'name':'Test'},event)
        self.assertEqual(out['status'],'cancelled');self.assertNotIn('totalResults',out);self.assertEqual(connect.call_count,1);client.close.assert_called_once()
    def test_cancelled_transport_does_not_populate_cache(self):
        def stopped(event):event.set();return payload(),'hash'
        checker=WorldBankChecker(transport=stopped);out=checker({'name':'Test'},threading.Event())
        self.assertEqual(out['status'],'cancelled');self.assertIsNone(checker._cache)
    def test_redirect_is_not_followed_or_retried_and_errors_exclude_credentials(self):
        client=connection(Response(b'',status=302))
        with patch('screening_worldbank.http.client.HTTPSConnection',return_value=client) as connect:
            out=WorldBankChecker()({'name':'Test'},threading.Event())
        self.assertEqual(connect.call_count,1);self.assertEqual(out['errorCode'],'source_unavailable');self.assertNotIn('public-test-configuration',json.dumps(out));client.close.assert_called_once()
    def test_only_publisher_urls_may_receive_requests(self):
        with patch('screening_worldbank.http.client.HTTPSConnection') as connect:
            with self.assertRaises(SourceFailure):WorldBankChecker._get('https://unexpected.example/feed',threading.Event(),{'apikey':'fixture'})
        connect.assert_not_called()
    def test_declared_and_streamed_size_limits_and_invalid_lengths_fail(self):
        for body,declared in [(b'12345','5'),(b'12345',None),(b'1','-1'),(b'1','1, 1')]:
            client=connection(Response(body,declared))
            with patch('screening_worldbank.http.client.HTTPSConnection',return_value=client):
                with self.assertRaises(SourceFailure):WorldBankChecker._get(PAGE,threading.Event(),limit=4)
            client.close.assert_called_once()
    def test_missing_length_allows_complete_body_but_does_not_skip_json_validation(self):
        client=connection(Response(b'complete'))
        with patch('screening_worldbank.http.client.HTTPSConnection',return_value=client):
            self.assertEqual(WorldBankChecker._get(PAGE,threading.Event()),b'complete')
        page=public_page();clients=[connection(Response(page)),connection(Response(b'{bad json'))]
        with patch('screening_worldbank.http.client.HTTPSConnection',side_effect=clients) as connect:
            out=WorldBankChecker()({'name':'Test'},threading.Event())
        self.assertEqual(out['errorCode'],'source_changed');self.assertEqual(connect.call_count,2);self.assertNotIn('totalResults',out)
    def test_page_and_feed_share_budget_and_expired_budget_never_starts_request(self):
        with patch.object(WorldBankChecker,'_get',side_effect=[public_page(),json.dumps(payload()).encode()]) as get:
            WorldBankChecker()._fetch(threading.Event())
        self.assertEqual(get.call_args_list[0].kwargs['deadline'],get.call_args_list[1].kwargs['deadline'])
        with patch('screening_worldbank.http.client.HTTPSConnection') as connect:
            with self.assertRaises(TimeoutError):WorldBankChecker._get(PAGE,threading.Event(),deadline=time.monotonic()-1)
        connect.assert_not_called()
    def test_retry_does_not_reset_the_original_deadline(self):
        event=threading.Event();event.wait=Mock(return_value=False)
        deadline=time.monotonic()+30
        with patch.object(WorldBankChecker,'_get_once',side_effect=[http.client.IncompleteRead(b'',10),b'full']) as get:
            self.assertEqual(WorldBankChecker._get(PAGE,event,deadline=deadline),b'full')
        self.assertEqual([call.args[-1] for call in get.call_args_list],[deadline,deadline])
        with patch.object(WorldBankChecker,'_get_once',side_effect=http.client.IncompleteRead(b'',10)) as get:
            with self.assertRaises(http.client.IncompleteRead):WorldBankChecker._get(PAGE,event,deadline=time.monotonic()+0.5)
        self.assertEqual(get.call_count,1)
    def test_failure_reasons_are_actionable_and_do_not_expose_raw_exceptions(self):
        for exc,code in [(TimeoutError('secret query'),'source_timeout'),(OSError('secret key'),'source_unavailable'),(ValueError('secret data'),'source_changed')]:
            def failure(event):raise exc
            out=WorldBankChecker(transport=failure)({'name':'Test'},threading.Event())
            self.assertEqual(out['errorCode'],code);self.assertNotIn('secret',json.dumps(out));self.assertIn('no negative result',out['error'])
            self.assertNotIn('totalResults',out)
    def test_parser_retains_public_qualifiers_but_not_internal_clearance_fields(self):
        records,_=parse_records(payload());r=records[0]
        self.assertEqual(r['notesReference'],'*10');self.assertEqual(r['ineligibilityPeriod'],'Ongoing');self.assertEqual(r['sourceUrl'],PAGE)
        self.assertNotIn('CLEARED',json.dumps(r));self.assertIn('Controlled affiliate',r['reasons']);self.assertEqual(r['notesUrl'],NOTES)
    def test_completed_and_negative_matching_are_distinct(self):
        c=checker_for(payload());positive=c({'name':'Synthetic Debarment Example Ltd','type':'entity'},threading.Event())
        self.assertEqual(positive['status'],'completed');self.assertEqual(positive['totalResults'],1)
        self.assertEqual(c({'name':'ZZQX unrelated 9876','type':'entity'},threading.Event())['totalResults'],0)
    def test_end_date_does_not_silently_delist_and_unknown_type_is_retained(self):
        r=row();r.update(DEBAR_TO_DATE='2021-01-01',INELIGIBLY_STATUS=None,SUPP_TYPE_CODE='U')
        c=checker_for(payload(r));out=c({'name':r['SUPP_NAME'],'type':'person'},threading.Event())
        self.assertEqual(out['totalResults'],1);self.assertIn('Release may depend',out['candidates'][0]['record']['listingStatusNote'])
    def test_cross_debarment_and_person_type(self):
        r=row();r.update(SUPP_TYPE_CODE='I',SUPP_ELIG_STAT='X-DEBARRED',INELIGIBLY_STATUS='Permanent')
        parsed,_=parse_records(payload(r));self.assertEqual(parsed[0]['type'],'person');self.assertEqual(parsed[0]['debarmentStatus'],'Cross-debarred')
    def test_malformed_schema_and_unknown_status_fail_without_zero(self):
        examples=[{}, {'response':{'ZPROCSUPP':[]}},payload({**row(),'SUPP_ELIG_STAT':'UNKNOWN'}),payload({**row(),'DEBAR_FROM_DATE':'invalid'})]
        for value in examples:
            out=checker_for(value)({'name':'Synthetic Example','type':'all'},threading.Event())
            self.assertEqual(out['status'],'failed');self.assertNotIn('totalResults',out)
    def test_duplicate_records_fail_instead_of_inflating_counts(self):
        r=row();data={'response':{'ZPROCSUPP':[r,r]}}
        self.assertEqual(checker_for(data)({'name':r['SUPP_NAME']},threading.Event())['status'],'failed')
    def test_stale_and_future_publisher_data_fail_then_can_refresh(self):
        for days in (-2,2):
            r=row();r['LAST_REFRESH_DATE']=(dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=days)).isoformat()
            c=checker_for(payload(r));out=c({'name':'Synthetic Example'},threading.Event());self.assertEqual(out['status'],'failed');self.assertIsNone(c._cache)
    def test_cache_avoids_repeat_download_but_refreshes_after_three_hours(self):
        calls=[];clock=[0]
        c=WorldBankChecker(transport=lambda e:(calls.append(1) or payload(),'hash'),clock=lambda:clock[0])
        for _ in range(2):c({'name':'Synthetic Example'},threading.Event())
        self.assertEqual(len(calls),1);clock[0]=10801;c({'name':'Synthetic Example'},threading.Event());self.assertEqual(len(calls),2)
    def test_failure_and_cancel_are_not_negative_results(self):
        def failure(event):raise TimeoutError('fixture')
        c=WorldBankChecker(transport=failure);self.assertEqual(c({'name':'Test'},threading.Event())['status'],'failed')
        e=threading.Event();e.set();self.assertEqual(c({'name':'Test'},e)['status'],'cancelled')
    def test_job_partial_when_procurement_fails_and_completed_when_it_succeeds(self):
        for wb,status in [({'status':'failed','error':'Fixture'},'partial'),({'status':'completed','totalResults':0,'candidates':[]},'completed')]:
            s=ResearchService(env={},official_checker=official,worldbank_checker=lambda *a:wb)
            job=s.get(s.start({'mode':'search','query':{'name':'Synthetic Example','type':'person'}},background=False)['id'])
            self.assertEqual(job['status'],status);self.assertEqual(job['worldbank']['status'],wb['status']);self.assertEqual(job['phases'],[])
    def test_cancel_during_procurement_stays_cancelled(self):
        entered=threading.Event();release=threading.Event()
        def lookup(q,e):entered.set();release.wait(2);return {'status':'completed','totalResults':1,'candidates':[]}
        s=ResearchService(env={},official_checker=official,worldbank_checker=lookup)
        jid=s.start({'mode':'search','query':{'name':'Synthetic Example','type':'person'}})['id'];self.assertTrue(entered.wait(2));s.cancel(jid);release.set()
        self.assertEqual(s.get(jid)['worldbank']['status'],'cancelled');self.assertEqual(s.get(jid)['status'],'cancelled')
    def test_public_lookups_publish_before_slow_official_source(self):
        entered=threading.Event();release=threading.Event();wb_done=threading.Event();gleif_done=threading.Event()
        def delayed(q,e,p):entered.set();release.wait(2);return official(q,e,p)
        def wb(q,e):wb_done.set();return {'status':'completed','totalResults':0,'candidates':[]}
        def company(q,e):gleif_done.set();return {'status':'completed','totalResults':0,'candidates':[]}
        s=ResearchService(env={},official_checker=delayed,worldbank_checker=wb,gleif_checker=company)
        jid=s.start({'mode':'search','query':{'name':'Synthetic Example','type':'entity'}})['id']
        try:
            self.assertTrue(entered.wait(2));self.assertTrue(wb_done.wait(2));self.assertTrue(gleif_done.wait(2))
            live=s.get(jid);self.assertEqual(live['worldbank']['status'],'completed');self.assertEqual(live['gleif']['status'],'completed');self.assertEqual(live['status'],'running')
            s.cancel(jid);self.assertEqual(s.get(jid)['status'],'cancelled');self.assertEqual(s.get(jid)['worldbank']['status'],'completed')
        finally:release.set()
    def test_incomplete_match_evidence_makes_job_partial(self):
        s=ResearchService(env={},official_checker=official,worldbank_checker=lambda *a:{'status':'completed','totalResults':1,'candidates':[]})
        job=s.get(s.start({'mode':'search','query':{'name':'Synthetic Example','type':'person'}},background=False)['id'])
        self.assertEqual(job['status'],'partial');self.assertEqual(job['worldbank']['status'],'failed')
    def test_missing_evidence_and_pdf_selection_are_explicit(self):
        q={'name':'Synthetic Debarment Example Ltd','type':'entity'};r=checker_for(payload())(q,threading.Event())
        r['candidates']=[copy.deepcopy(r['candidates'][0]) for _ in range(7)];r['totalResults']=7
        for i,m in enumerate(r['candidates']):m['record']['name']=f'Procurement candidate {i}'
        report={'query':q,'research':{'mode':'search','schemaVersion':7,'worldbank':r,'officialChecks':official(None,None,None)}}
        brief=pdf_text(report);self.assertIn('first 3 of 7',brief);self.assertNotIn('Procurement candidate 6',brief)
        full=pdf_text({**report,'reportDetail':'full'});self.assertIn('Procurement candidate 6',full)
        for wb in (None,{'status':'completed','totalResults':1,'candidates':[]}):
            bad=pdf_text({**report,'research':{**report['research'],'worldbank':wb}})
            self.assertIn('Checks incomplete',bad);self.assertNotIn('0 possible Table 1',bad)
    def test_prompt_and_pdf_keep_procurement_separate(self):
        q={'name':'Synthetic Debarment Example Ltd','type':'entity'};r=checker_for(payload())(q,threading.Event())
        p=build_payload(q,'identity',[],'gpt-6-luna',procurement_check=r)
        self.assertIn('"procurement"',p['input']);self.assertIn('Table 1',p['input']);self.assertNotIn('CLEARED',p['input'])
        result=pdf_text({'query':q,'research':{'mode':'search','worldbank':r}})
        for value in ('World Bank / Procurement','*10','Controlled affiliate','Ongoing','Table 2'):self.assertIn(value,result)
        failed=pdf_text({'query':q,'research':{'mode':'search','worldbank':{'status':'failed'},'officialChecks':official(None,None,None)}})
        self.assertIn('Checks incomplete',failed);self.assertIn('No negative result',failed)

if __name__=='__main__':unittest.main(verbosity=2)
