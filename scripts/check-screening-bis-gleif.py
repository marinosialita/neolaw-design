"""BIS, GLEIF and receipt integrity. Synthetic providers; no paid/live calls."""
import copy,importlib.util,io,json,sys,threading,time,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from screening_gleif import GleifChecker,parse_records,name_terms,valid_lei
from screening_research import ResearchService,validate_query,ResearchError
from screening_official import initial_checks,portals_for
from screening_report import build_pdf
from pypdf import PdfReader
spec=importlib.util.spec_from_file_location('importer',Path(__file__).with_name('refresh-screening-data.py'));imp=importlib.util.module_from_spec(spec);spec.loader.exec_module(imp)
LEI='300300G4NLFHF8PDPY52'
def result(total=1):
 return {'meta':{'pagination':{'total':total},'goldenCopy':{'publishDate':'2026-10-12T08:00:00Z'}},'data':[] if total==0 else [{'id':LEI,'type':'lei-records','attributes':{'lei':LEI,'entity':{'legalName':{'name':'Test Company'},'jurisdiction':'CN','registeredAs':'company-123','registeredAt':{'id':'RA-test'},'status':'ACTIVE','legalAddress':{'country':'CN'},'otherNames':[{'name':'Test Co'}]},'registration':{'status':'LAPSED'}},'relationships':{'direct-parent':{'links':{'reporting-exception':f'https://api.gleif.org/api/v1/lei-records/{LEI}/direct-parent-reporting-exception','related':'https://untrusted.test/private'}}}}]}
def checks(q,e,p):return [dict(c,status='completed',matchCount=0) for c in initial_checks()]
class IntegrationTests(unittest.TestCase):
 def test_bis_scope_complete_download_and_historical_details(self):
  sources=list(imp.BIS_LISTS);data={'offset':0,'total':5,'sources_used':[{'source':v,'source_last_updated':'2026-01-01'} for v in sources],'results':[{'source':s,'id':str(i),'name':'Example '+str(i),'end_date':'2000-01-01','license_requirement':'Licence required','federal_register_notice':'84 FR 22963'} for i,s in enumerate(sources)]+[{'source':'Treasury','id':'t','name':'Must be excluded'}]}
  records,_=imp.parse_bis(json.dumps(data));self.assertEqual(len(records),4);self.assertTrue(all(r['typeUnspecified'] for r in records));self.assertEqual(records[0]['endedAt'],'2000-01-01');self.assertEqual(records[1]['restrictions'],'Licence required')
  for change in ({'total':6},{'offset':1},{'sources_used':[]}):
   with self.assertRaises(ValueError):imp.parse_bis(json.dumps({**data,**change}))
  bad=copy.deepcopy(data);bad['results'][1]['id']='0'
  with self.assertRaises(ValueError):imp.parse_bis(json.dumps(bad))
 def test_lei_validation_and_query_minimization(self):
  self.assertTrue(valid_lei(LEI));self.assertFalse(valid_lei(LEI[:-1]+'3'))
  q=validate_query({'name':'Company','type':'entity','lei':LEI.lower(),'registrationNumber':'ABC','notes':'private'})
  self.assertEqual(q['lei'],LEI);self.assertNotIn('notes',q)
  for value in ({'lei':'INVALID'},{'registrationNumber':'one,two'}):
   with self.assertRaises(ResearchError):validate_query({'name':'Company','type':'entity',**value})
 def test_names_cannot_expand_into_comma_or_queries(self):
  self.assertEqual(name_terms('Huawei Technologies Co., Ltd.'),'Huawei Technologies');self.assertNotIn(',',name_terms('Name, Inc.'))
 def test_exact_id_query_and_distinct_statuses(self):
  paths=[];checker=GleifChecker(lambda path,event:(paths.append(path) or result(),'digest'))
  r=checker({'name':'Different company name','type':'entity','lei':LEI},threading.Event());self.assertEqual(r['status'],'completed');self.assertIn('filter%5Blei%5D=',paths[0]);rec=r['candidates'][0]['record'];self.assertEqual(rec['leiStatus'],'LAPSED');self.assertEqual(rec['entityStatus'],'ACTIVE');self.assertEqual(len(rec['parentLinks']),1);self.assertEqual(rec['parentLinks'][0]['relation'],'reporting-exception')
 def test_empty_lookup_and_truncation_are_explicit(self):
  zero=parse_records(result(0),{'name':'Company'},'https://api.gleif.org/test');self.assertEqual(zero['totalResults'],0);self.assertIn('does not establish',zero['detail'])
  truncated=parse_records(result(60),{'name':'Company'},'https://api.gleif.org/test');self.assertTrue(truncated['atLimit']);self.assertEqual(truncated['returnedCandidates'],1)
  for v in ({}, {'data':[], 'meta':{'pagination':{'total':True}}},{'data':[], 'meta':{'pagination':{'total':10}}}):
   with self.assertRaises(ValueError):parse_records(v,{'name':'Company'},'')
 def test_person_and_cancellation_do_not_transmit_query(self):
  def forbidden(*args):raise AssertionError('No network expected')
  c=GleifChecker(forbidden);e=threading.Event();self.assertEqual(c({'type':'person'},e)['status'],'not_applicable');e.set();self.assertEqual(c({'type':'entity'},e)['status'],'cancelled')
 def test_provider_failure_is_incomplete_and_not_zero(self):
  c=GleifChecker(lambda *args: ({'error':'internal-secret'},''));r=c({'name':'Company','type':'entity'},threading.Event());self.assertEqual(r['status'],'failed');self.assertNotIn('totalResults',r);self.assertNotIn('internal-secret',str(r))
 def test_new_runs_have_nine_checks_old_receipts_keep_five(self):
  s=ResearchService(worldbank_checker=lambda *a:{'status':'completed','totalResults':0,'candidates':[]}, env={},official_checker=checks,gleif_checker=lambda *a: {'status':'completed','totalResults':0,'candidates':[]})
  j=s.get(s.start({'mode':'search','query':{'name':'Company','type':'entity'}},background=False)['id']);self.assertEqual(j['status'],'completed');self.assertEqual(len(portals_for(j)),9);self.assertEqual(len(portals_for({'officialChecks':checks(None,None,None)[:5]})),5);self.assertEqual(j['gleif']['status'],'completed')
 def test_failed_company_lookup_marks_job_and_pdf_incomplete(self):
  s=ResearchService(worldbank_checker=lambda *a:{'status':'completed','totalResults':0,'candidates':[]}, env={},official_checker=checks,gleif_checker=lambda *a:{'status':'failed','error':'Lookup unavailable'})
  j=s.get(s.start({'mode':'search','query':{'name':'Company','type':'entity'}},background=False)['id']);self.assertEqual(j['status'],'partial')
  txt=PdfReader(io.BytesIO(build_pdf({'query':j['query'],'research':j,'requiresOfficial':True}))).pages[0].extract_text();self.assertIn('Checks incomplete',txt);self.assertIn('9 of 9',txt)
 def test_stopping_company_lookup_cannot_be_resurrected(self):
  entered=threading.Event();release=threading.Event()
  def lookup(q,e):entered.set();release.wait(2);return {'status':'completed','totalResults':0}
  s=ResearchService(worldbank_checker=lambda *a:{'status':'completed','totalResults':0,'candidates':[]}, env={},official_checker=checks,gleif_checker=lookup);jid=s.start({'mode':'search','query':{'name':'Company','type':'entity'}})['id'];self.assertTrue(entered.wait(1));s.cancel(jid);release.set()
  for _ in range(100):
   if s.status()['activeJobId'] is None:break
   time.sleep(.01)
  j=s.get(jid);self.assertEqual(j['status'],'cancelled');self.assertEqual(j['gleif']['status'],'cancelled')
if __name__=='__main__':unittest.main(verbosity=2)
