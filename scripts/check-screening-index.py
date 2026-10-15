"""Bounded offline tests for prepared matching, freshness and progressive results."""
import copy,json,sys,tempfile,threading,time,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from screening_index import PreparedOfficialChecker,LocalMatcher
from screening_official import now,initial_checks,match_records
from screening_research import ResearchService
QUERY={'name':'Example Person','type':'person','country':'','dob':''}
META={'id':'un','name':'United Nations','status':'available','recordCount':2,'retrievedAt':now(),'verifiedAt':now()}
ROWS=[{'id':'un:1','sourceId':'un','name':'Example Person','type':'person','aliases':['Person Alias'],'countries':['Cyprus'],'datesOfBirth':['1980-01-01'],'passportNumbers':['AB123456']}, {'id':'un:2','sourceId':'un','name':'Example Parson','type':'person','aliases':[],'countries':['Russia'],'datesOfBirth':['1970-01-01']}]
class PreparedTests(unittest.TestCase):
 def setUp(self):
  self.dir=tempfile.TemporaryDirectory();self.checker=PreparedOfficialChecker(self.dir.name,start_background=False);self.checker.cache={};self.addCleanup(self.dir.cleanup);self.addCleanup(self.checker.matcher.close)
 def test_warm_index_preserves_matching_aliases_ambiguity_identifiers_and_negative(self):
  matcher=self.checker.matcher
  for name in ['Example Person','Person Alias','Person Example','Example Persno','Unrelated Zyxwv']:
   query={**QUERY,'name':name,'dob':'1980-01-01','passportNumber':'AB123456'}
   self.assertEqual(matcher(META,ROWS,query),match_records(META,ROWS,query))
  self.assertEqual(matcher(META,ROWS,{**QUERY,'name':'Unrelated Zyxwv'})['totalMatches'],0)
 def test_search_never_downloads_expired_or_missing_lists(self):
  self.checker.cache['un']=({**META,'verifiedAt':'2000-01-01T00:00:00Z'},ROWS)
  with patch.object(self.checker.importer,'source_bundle',side_effect=AssertionError('Search must not fetch')):
   meta,rows=self.checker.dataset('un',threading.Event());self.assertEqual(meta['status'],'unavailable');self.assertEqual(rows,[])
   self.assertEqual(self.checker.dataset('uk',threading.Event())[0]['status'],'unavailable')
 def test_failed_refresh_retains_valid_snapshot_without_advancing_date(self):
  self.checker.cache['un']=(copy.deepcopy(META),ROWS)
  with patch.object(self.checker.importer,'source_bundle',return_value=({'status':'unavailable'},[])):self.checker.refresh('un')
  self.assertEqual(self.checker.cache['un'][0],META);self.assertIn('un',self.checker.failures)
  self.assertEqual(self.checker.dataset('un',threading.Event())[0]['status'],'available')
 def test_ofac_background_gets_slow_download_budget_without_changing_search_freshness(self):
  old={**META,'id':'ofac','verifiedAt':'2000-01-01T00:00:00Z'}
  self.checker.cache['ofac']=(old,ROWS)
  def failed(source,args):
   self.assertEqual(source,'ofac');self.assertEqual(args.download_seconds,480);self.assertIs(args.event,self.checker.stop)
   return {'status':'unavailable','error':'Official download exceeded its time limit before the complete file arrived.'},[]
  with patch.object(self.checker.importer,'source_bundle',side_effect=failed):self.checker.refresh('ofac')
  self.assertEqual(self.checker.cache['ofac'][0],old)
  meta,rows=self.checker.dataset('ofac',threading.Event());self.assertEqual(meta['status'],'unavailable');self.assertEqual(rows,[])
  self.assertIn('time limit',meta['error']);self.assertIn('expired data is not a completed check',meta['error'])
  self.assertFalse(next(s for s in self.checker.status()['sources'] if s['id']=='ofac')['indexReady'])
 def test_successful_refresh_survives_restart_and_changed_data_replaces_index(self):
  with patch.object(self.checker.importer,'source_bundle',return_value=(META,ROWS)):self.checker.refresh('un')
  restored=PreparedOfficialChecker(self.dir.name,start_background=False);self.addCleanup(restored.matcher.close)
  self.assertEqual(restored.matcher(*restored.cache['un'],QUERY)['totalMatches'],2)
  newer={**META,'recordCount':1};rows=[{**ROWS[0],'name':'Changed Record','aliases':[]}]
  with patch.object(self.checker.importer,'source_bundle',return_value=(newer,rows)):self.checker.refresh('un')
  self.assertEqual(self.checker.matcher(*self.checker.cache['un'],QUERY)['totalMatches'],0)
  self.assertNotIn('Example Person',str(self.checker.status()))
 def test_modified_persisted_file_is_rejected(self):
  self.checker._persist(META,ROWS);path=Path(self.dir.name)/'un.json';d=json.loads(path.read_text());d['data']['records'][0]['name']='Tampered';path.write_text(json.dumps(d))
  with patch('screening_index.OfficialChecker.__init__',lambda s:setattr(s,'cache',{}) or setattr(s,'lock',threading.Lock())):
   restored=PreparedOfficialChecker(self.dir.name,start_background=False)
  self.addCleanup(restored.matcher.close);self.assertFalse(any(r['name']=='Tampered' for r in restored.cache.get('un',({},[]))[1]))
 def test_provider_results_arrive_while_official_source_is_blocked_and_cancel_retains_them(self):
  entered=threading.Event();release=threading.Event();provider_called=threading.Event()
  def official(query,event,publish):
   checks=initial_checks();checks[0].update(status='completed',matchCount=1,candidates=[{'record':ROWS[0]}]);publish(checks[0]);entered.set();release.wait(2);return checks
  s=ResearchService(env={},official_checker=official,worldbank_checker=lambda *a:{'status':'completed','totalResults':0,'candidates':[]})
  s.opensanctions.status=lambda:{'configured':True}
  def provider(*a):provider_called.set();return {'status':'completed','candidates':[{'id':'fixture','name':'Example Person'}]}
  s.opensanctions.check=provider
  job_id=s.start({'query':QUERY,'mode':'search'})['id']
  try:
   self.assertTrue(entered.wait(1));self.assertTrue(provider_called.wait(.2));job=s.get(job_id)
   self.assertEqual(job['status'],'running');self.assertEqual(job['opensanctions']['status'],'completed');self.assertEqual(job['officialChecks'][0]['matchCount'],1)
   s.cancel(job_id);self.assertEqual(s.get(job_id)['opensanctions']['status'],'completed');self.assertEqual(s.get(job_id)['officialChecks'][1]['status'],'cancelled')
  finally:release.set()
if __name__=='__main__':unittest.main(verbosity=2)
