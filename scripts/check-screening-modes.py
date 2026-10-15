#!/usr/bin/env python3
"""Offline workflow and provider-contract regression tests. No paid requests."""
import copy,json,sys,threading,unittest,ssl
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from screening_research import ResearchService,identity_evidence,build_payload
from screening_opensanctions import OpenSanctionsService,parse_match,ProviderError
from screening_tls import verified_context
class NoAI:
 def research(self,*a,**kw):raise AssertionError('Normal Search must never call AI')
def checks(query,event,publish):
 return [dict(id=i,status='completed',matchCount=0,candidates=[]) for i in ('eu','ofac','un','uk','cy','bis','au','ca','ch')]
class Modes(unittest.TestCase):
 def service(self,checker=checks):return ResearchService(worldbank_checker=lambda *a:{'status':'completed','totalResults':0,'candidates':[]}, provider=NoAI(),env={},official_checker=checker)
 def test_normal_search_runs_nine_without_key(self):
  s=self.service();j=s.get(s.start({'query':{'name':'Test Person','type':'person'},'mode':'search'},background=False)['id'])
  self.assertEqual(j['status'],'completed');self.assertEqual(len(j['officialChecks']),9);self.assertEqual(j['phases'],[]);self.assertIsNone(j['model'])
 def test_normal_search_enriches_paid_provider_profile_without_ai(self):
  class Provider:
   def __init__(self):self.enriched=False
   def status(self):return {'configured':True}
   def check(self,*args):return {'status':'completed','possibleMatches':1,'candidates':[{'id':'Q1','name':'Candidate'}]}
   def enrich(self,result,event):
    self.enriched=True
    return {**result,'relationshipStatus':'completed','profileStatus':'completed','candidates':[{**result['candidates'][0],'profile':{'status':'completed','fieldCount':1,'fields':[{'key':'title','label':'Title','values':['President'],'sources':[]}]}}]}
  s=self.service();provider=Provider();s.opensanctions=provider
  j=s.get(s.start({'query':{'name':'Test Person','type':'person'},'mode':'search'},background=False)['id'])
  self.assertTrue(provider.enriched);self.assertEqual(j['opensanctions']['profileStatus'],'completed')
  self.assertEqual(j['opensanctions']['candidates'][0]['profile']['fields'][0]['values'],['President'])
 def test_failed_official_source_never_becomes_negative(self):
  def failed(q,e,p):
   c=checks(q,e,p);c[0].update(status='failed',error='Secure connection failed',matchCount=None);return c
  s=self.service(failed);j=s.get(s.start({'query':{'name':'Test Person'},'mode':'search'},background=False)['id'])
  self.assertEqual(j['status'],'partial');self.assertEqual(j['officialChecks'][0]['status'],'failed')
 def test_normal_cancel_preserves_incomplete_sources(self):
  entered=threading.Event();release=threading.Event()
  def checker(q,e,p):entered.set();release.wait(2);return checks(q,e,p)
  s=self.service(checker);key=s.start({'query':{'name':'Test Person'},'mode':'search'})['id'];self.assertTrue(entered.wait(2));j=s.cancel(key);release.set()
  self.assertEqual(j['status'],'cancelled');self.assertTrue(all(c['status']=='cancelled' for c in j['officialChecks']))
 def test_media_ownership_have_no_domain_allowlist(self):
  for phase in ('media','ownership'):
   tool=build_payload({'name':'Example','type':'person','country':'','dob':''},phase,[],'gpt-6-luna')['tools'][0]
   self.assertNotIn('filters',tool);self.assertTrue(tool['external_web_access'])
 def test_native_trust_keeps_verification_required(self):
  c=verified_context();self.assertEqual(c.verify_mode,ssl.CERT_REQUIRED);self.assertTrue(c.check_hostname)
 def test_opensanctions_maps_types_and_never_sends_notes(self):
  captured=[]
  def transport(key,payload):captured.append(payload);return {'responses':{'subject':{'query':{},'results':[]}}}
  s=OpenSanctionsService(transport=transport);s.connect({'apiKey':'unit-test-secret-key-00000'})
  result=s.check({'name':'Company','type':'entity','country':'Cyprus','dob':'1980-01-01','notes':'private'},threading.Event())
  self.assertEqual(captured[0]['queries']['subject'],{'schema':'Company','properties':{'name':['Company'],'country':['Cyprus']}})
  self.assertEqual(result['status'],'completed');self.assertTrue(s.status()['verified']);self.assertNotIn('unit-test-secret',json.dumps(s.status()))
 def test_openai_key_cannot_be_connected_as_opensanctions(self):
  s=OpenSanctionsService()
  with self.assertRaisesRegex(ProviderError,"OpenAI key"):s.connect({"apiKey":"sk-unit-test-wrong-provider-key"})
  self.assertFalse(s.status()["configured"])
 def test_provider_company_identifiers_use_documented_properties(self):
  captured=[]
  def transport(key,payload):captured.append(payload);return {'responses':{'subject':{'status':200,'query':payload['queries']['subject'],'results':[]}}}
  s=OpenSanctionsService('unit-test-key-00000000',transport=transport)
  result=s.check({'name':'Company','type':'entity','lei':'300300G4NLFHF8PDPY52','registrationNumber':'ABC-123','notes':'private'},threading.Event())
  props=captured[0]['queries']['subject']['properties']
  self.assertEqual(props,{'name':['Company'],'leiCode':['300300G4NLFHF8PDPY52'],'registrationNumber':['ABC-123']})
  self.assertEqual(result['parsedQuery']['properties'],props);self.assertEqual(len(result['sha256']),64)
  self.assertNotIn('unit-test-key',json.dumps(result));self.assertNotIn('private',json.dumps(result))
 def test_provider_preserves_name_variants_lei_and_conflicting_match_signals(self):
  r=parse_match({'responses':{'subject':{'query':{},'results':[{'id':'Q1','caption':'Caption','score':.8,'properties':{'name':['Recorded name'],'alias':['Alias'],'previousName':['Previous'],'weakAlias':['Weak'], 'leiCode':['300300G4NLFHF8PDPY52']},'explanations':{'name_match':{'score':.9,'query':'Name','candidate':'Alias','detail':'Name comparison'},'dob_year_disjoint':{'score':1,'query':None,'candidate':None,'detail':'Birth years: 1980 vs 1965'},'broken':{'score':float('nan')}}}]}}})
  c=r['candidates'][0];self.assertEqual(c['lei'],['300300G4NLFHF8PDPY52']);self.assertEqual(c['aliases'],['Recorded name','Alias','Previous']);self.assertEqual(len(c['explanations']),2)
  self.assertEqual(c['explanations'][1]['detail'],'Birth years: 1980 vs 1965')
 def test_provider_query_failure_cannot_be_a_zero_match_success(self):
  with self.assertRaises(ProviderError):parse_match({'responses':{'subject':{'status':500,'query':{},'results':[]}}})
 def test_provider_failure_is_not_no_matches(self):
  s=OpenSanctionsService('unit-test-secret-key-00000',transport=lambda *a: {'error':'secret upstream response'})
  r=s.check({'name':'Example','type':'person'},threading.Event());self.assertEqual(r['status'],'failed');self.assertNotIn('possibleMatches',r);self.assertNotIn('upstream',r['error'])
 def test_provider_categories_are_not_sanctions_assumptions(self):
  r=parse_match({'responses':{'subject':{'query':{},'results':[{'id':'Q1','caption':'Name','score':.8,'properties':{'topics':['role.pep']},'datasets':['example']}]}}})
  self.assertEqual(r['candidates'][0]['categories'],['Politically exposed person']);self.assertEqual(r['possibleMatches'],1)
 def test_provider_invalid_scores_fail_instead_of_clear(self):
  for score in (-1,2,float('nan'),True):
   with self.assertRaises(ProviderError):parse_match({'responses':{'subject':{'query':{},'results':[{'id':'Q1','score':score,'properties':{}}]}}})
 def test_uncited_summary_withheld_and_subject_downgraded(self):
  for url,expected in [('https://example.org/not-cited',False),('https://example.org/cited',True)]:
   block={'status':'unresolved','candidate':'Name','reason':'DOB missing','summary':{'finding':'A candidate holds a role; identity unverified.','relevance':'subject','sourceUrls':[url]}}
   p={'text':'Cited finding.\n<identity_evidence>'+json.dumps(block)+'</identity_evidence>','citations':[{'url':'https://example.org/cited','start':0,'end':13}],'status':'completed','warnings':[]}
   result=identity_evidence(p,{'name':'Name'},[])
   self.assertEqual('summary' in result,expected)
   if expected:self.assertEqual(result['summary']['relevance'],'candidate')
if __name__=='__main__':unittest.main(verbosity=2)
