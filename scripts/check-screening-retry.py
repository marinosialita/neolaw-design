#!/usr/bin/env python3
"""Bounded offline retry tests. No external requests, credentials or live server."""
import copy
import sys
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from screening_research import ResearchService, ResearchError
from screening_official import OfficialChecker, initial_checks

OLD='a'*32
QUERY={'name':'Example Person','type':'person','country':'Cyprus','dob':''}
class NeverAI:
 def research(self,*a,**kw):raise AssertionError('AI must not be used by retry')
class NeverPaid:
 def check(self,*a,**kw):raise AssertionError('Paid provider must not be used by retry')
 def status(self):return {'configured':True}
class Checker:
 def __init__(self):self.calls=[];self.entered=None;self.release=None;self.fail=False;self.invalid=False
 def __call__(self,q,event,publish,source_ids=None):
  self.calls.append((copy.deepcopy(q),set(source_ids)))
  if self.entered:self.entered.set();self.release.wait(2)
  if self.fail:raise ValueError('private upstream secret')
  result=[{**c,'status':'completed','matchCount':None if self.invalid else 1,'checkedAt':'2026-10-13T20:00:00Z','candidates':[{'record':{'id':c['id']+'-one','name':'Example Person'}}]} for c in initial_checks() if c['id'] in source_ids]
  for c in result:publish(c)
  return result

def snapshot():
 return {'id':OLD,'status':'partial','query':copy.deepcopy(QUERY),'startedAt':'2026-10-12T12:00:00Z','completedAt':'2026-10-12T12:00:10Z','mode':'search','model':None,'phases':[],
 'officialChecks':[{**c,'status':'failed' if c['id']=='cy' else 'completed','matchCount':None if c['id']=='cy' else 0,'checkedAt':'2026-10-12T12:00:02Z','retrievedAt':'2026-10-12T11:00:00Z','downloads':[{'sha256':'test-hash','url':'https://example.org/list'}],**({'error':'Portal timed out'} if c['id']=='cy' else {})} for c in initial_checks()],
 'opensanctions':{'status':'completed','checkedAt':'2026-10-12T12:00:03Z','possibleMatches':0,'candidates':[]},'worldbank':{'status':'completed','totalResults':0,'candidates':[]},'gleif':{'status':'not_applicable'}}

class RetryTests(unittest.TestCase):
 def service(self,checker=None,**kw):
  s=ResearchService(provider=NeverAI(),env={},official_checker=checker or Checker(),**kw);s.opensanctions=NeverPaid();return s
 def test_saved_retry_preserves_every_successful_receipt_and_query(self):
  s=self.service();old=snapshot();before=copy.deepcopy(old)
  j=s.get(s.retry({'research':old,'sourceIds':['cy']},background=False)['id'])
  self.assertEqual(old,before);self.assertNotEqual(j['id'],old['id']);self.assertEqual(j['retryOf'],old['id'])
  self.assertEqual(j['query'],old['query']);self.assertEqual(j['evidenceOrigin'],'saved_report');self.assertEqual(j['status'],'completed')
  for a,b in zip(j['officialChecks'],old['officialChecks']):
   if a['id']!='cy':self.assertEqual(a,b)
  for field in ('opensanctions','worldbank','gleif','phases'):self.assertEqual(j[field],old[field])
  self.assertEqual(s.official_checker.calls,[(old['query'],{'cy'})]);self.assertEqual(j['retryHistory'][0]['previousChecks'][0]['error'],'Portal timed out')
 def test_in_memory_original_remains_immutable_and_overrides_snapshot(self):
  s=self.service();old=snapshot();s._jobs[OLD]=copy.deepcopy(old);s._age[OLD]=s._clock();s._cancel[OLD]=threading.Event()
  forged=copy.deepcopy(old);forged['query']['name']='Different Subject'
  j=s.get(s.retry({'research':forged,'sourceIds':['cy']},background=False)['id'])
  self.assertEqual(j['query'],old['query']);self.assertEqual(j['evidenceOrigin'],'server_snapshot');self.assertEqual(s.get(OLD),old)
 def test_only_worldbank_selected_does_not_call_official_or_paid(self):
  calls=[];s=self.service(worldbank_checker=lambda q,e:(calls.append(q) or {'status':'completed','totalResults':0,'candidates':[]}))
  old=snapshot();old['worldbank']={'status':'failed','error':'Unavailable'}
  j=s.get(s.retry({'research':old,'sourceIds':['worldbank']},background=False)['id'])
  self.assertEqual(len(calls),1);self.assertFalse(s.official_checker.calls);self.assertEqual(j['officialChecks'],old['officialChecks']);self.assertEqual(j['status'],'partial')
 def test_company_retry_preserves_official_and_ai(self):
  calls=[];s=self.service(gleif_checker=lambda q,e:(calls.append(q) or {'status':'completed','totalResults':0,'candidates':[]}))
  old=snapshot();old['query']['type']='entity';old['gleif']={'status':'failed'}
  j=s.get(s.retry({'research':old,'sourceIds':['gleif']},background=False)['id'])
  self.assertEqual(len(calls),1);self.assertFalse(s.official_checker.calls);self.assertEqual(j['gleif']['status'],'completed')
 def test_deep_findings_retained_but_flagged_for_reassessment(self):
  s=self.service();old=snapshot();old.update(mode='deep',model='gpt-6-luna',phases=[{'id':'identity','status':'completed','text':'Earlier finding','citations':[],'sources':[]}])
  j=s.get(s.retry({'research':old,'sourceIds':['cy']},background=False)['id'])
  self.assertEqual(j['phases'],old['phases']);self.assertEqual(j['status'],'partial');self.assertTrue(j['researchNeedsRefresh']);self.assertIn('not been reassessed',j['error'])
 def test_invalid_and_paid_or_successful_selections_rejected(self):
  for sources in ([],['opensanctions'],['identity'],['eu'],['cy','cy'],['gleif'],['bogus'],['cy',None]):
   with self.subTest(sources=sources),self.assertRaises(ResearchError):self.service().retry({'research':snapshot(),'sourceIds':sources},background=False)
 def test_running_and_malformed_envelopes_rejected(self):
  for mutate in (lambda j:j.update(status='running'),lambda j:j.update(id='../invalid'),lambda j:j.update(query={'name':'a'}),lambda j:j.update(phases=[{'id':'bad'}]),lambda j:j['officialChecks'].append(j['officialChecks'][0]),lambda j:j['officialChecks'][0].update(matchCount=None),lambda j:j.update(opensanctions=[])):
   j=snapshot();mutate(j)
   with self.assertRaises(ResearchError):self.service().retry({'research':j,'sourceIds':['cy']},background=False)
 def test_source_failure_keeps_eight_successes_and_never_clear(self):
  checker=Checker();checker.fail=True;s=self.service(checker);old=snapshot();j=s.get(s.retry({'research':old,'sourceIds':['cy']},background=False)['id'])
  self.assertEqual(j['status'],'partial');self.assertEqual(sum(c['status']=='completed' for c in j['officialChecks']),8)
  self.assertNotIn('private upstream',str(j));self.assertEqual(next(c for c in j['officialChecks'] if c['id']=='cy')['status'],'failed')
 def test_invalid_completed_result_never_negative(self):
  checker=Checker();checker.invalid=True;s=self.service(checker);j=s.get(s.retry({'research':snapshot(),'sourceIds':['cy']},background=False)['id'])
  self.assertEqual(j['status'],'partial');self.assertEqual(next(c for c in j['officialChecks'] if c['id']=='cy')['status'],'failed')
 def test_cancellation_retains_evidence_and_refuses_overlap_until_worker_finishes(self):
  checker=Checker();checker.entered=threading.Event();checker.release=threading.Event();s=self.service(checker);old=snapshot()
  ref=s.retry({'research':old,'sourceIds':['cy']})['id'];self.assertTrue(checker.entered.wait(2));j=s.cancel(ref)
  self.assertEqual(j['status'],'cancelled');self.assertEqual(j['opensanctions'],old['opensanctions'])
  for a,b in zip(j['officialChecks'],old['officialChecks']):
   if a['id']!='cy':self.assertEqual(a,b)
  with self.assertRaises(ResearchError):s.retry({'research':old,'sourceIds':['cy']})
  checker.release.set()
  for _ in range(100):
   if not s._worker_active:break
   time.sleep(.005)
  self.assertIsNone(s._worker_active);j=s.get(ref);self.assertEqual(j['status'],'cancelled');self.assertEqual(next(c for c in j['officialChecks'] if c['id']=='cy')['status'],'cancelled')
 def test_openai_disconnect_does_not_cancel_public_retry(self):
  checker=Checker();checker.entered=threading.Event();checker.release=threading.Event();s=self.service(checker);old=snapshot();old['mode']='deep'
  ref=s.retry({'research':old,'sourceIds':['cy']})['id'];self.assertTrue(checker.entered.wait(2));s.disconnect();self.assertFalse(s._cancel[ref].is_set());checker.release.set()
 def test_cancel_does_not_rewrite_previous_unselected_incomplete_evidence(self):
  old=snapshot();old.update(retryOf=OLD,retrySources=['cy'],status='running',officialStatus='running',phases=[{'id':'identity','status':'pending'}]);old['opensanctions']={'status':'pending'};old['worldbank']={'status':'pending'};old['officialChecks'][4]['status']='running'
  before=copy.deepcopy(old);ResearchService._mark_cancelled(old)
  for field in ('phases','worldbank','opensanctions'):self.assertEqual(old[field],before[field])
 def test_official_checker_selection_never_fetches_other_lists(self):
  checker=object.__new__(OfficialChecker);seen=[]
  checker.dataset=lambda source,event:(seen.append(source) or ({'status':'available','recordCount':1},[]))
  checker.matcher=lambda *a:{'totalMatches':0,'matches':[]}
  with patch('screening_official.check_cyprus',side_effect=AssertionError('Unselected Cyprus must not run')):
   result=checker(QUERY,threading.Event(),lambda c:None,source_ids={'un'})
  self.assertEqual(seen,['un']);self.assertEqual([c['id'] for c in result],['un']);self.assertEqual(result[0]['status'],'completed')
 def test_incomplete_source_payload_is_not_success(self):
  s=self.service(worldbank_checker=lambda *a:{'status':'completed','totalResults':5,'candidates':[]});old=snapshot();old['worldbank']={'status':'failed'}
  j=s.get(s.retry({'research':old,'sourceIds':['worldbank']},background=False)['id']);self.assertEqual(j['worldbank']['status'],'failed')

if __name__=='__main__':unittest.main(verbosity=2)
