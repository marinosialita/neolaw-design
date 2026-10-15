"""Offline relationship contract and failure tests. No external requests."""
import copy
import io
import json
import sys
import threading
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from screening_opensanctions import OpenSanctionsService,ProviderError,parse_match
from screening_provider_profile import entity_profile
from screening_relationships import entity_details,validated_affiliations,research_provider
from screening_research import build_payload,identity_evidence,DEFAULT_MODEL,ResearchService
from screening_report import build_pdf
from screening_affiliation_dates import affiliation_date, UNKNOWN
from pypdf import PdfReader

URL='https://registry.example/company/123'
def entity():
    return {'id':'person-1','schema':'Person','properties':{'name':['Example Person'], 'passportNumber':['SECRET-PASSPORT'],
        'directorshipDirector':[{'id':'edge-1','schema':'Directorship','datasets':['example'], 'properties':{
            'director':['person-1'],'organization':[{'id':'company-1','schema':'Company','caption':'Example Ltd','properties':{'name':['Example Ltd'],'registrationNumber':['HE123'],'country':['cy'],'topics':['sanction'],
             'ownershipAsset':[{'id':'edge-2','schema':'Ownership','properties':{'owner':['unrelated-1'],'asset':['company-1'],'percentage':['75']}}]}}],
            'startDate':['2024-01-01'],'sourceUrl':[URL]}}]}}
def affiliation():return {'person':'Example Person','organization':'Example Ltd','role':'Director','registrationNumber':'HE123','sourceUrls':[URL],'whyRelevant':'A namesake is listed as director.','nextStep':'Obtain the official filing.'}

class RelationshipsTests(unittest.TestCase):
    def test_match_keeps_complete_scalar_profile_instead_of_dropping_fields(self):
        data={'responses':{'subject':{'status':200,'query':{'schema':'Person','properties':{'name':['Example Person']}},'results':[{'id':'person-1','caption':'Example Person','schema':'Person','score':1,'datasets':['example'],'properties':{'name':['Example Person'],'birthDate':['1970-01-01'],'birthPlace':['Nicosia'],'taxNumber':['TAX-1'],'notes':['Recorded description'],'topics':['role.pep']}}]}}}
        candidate=parse_match(data)['candidates'][0]
        facts={field['key']:field['values'] for field in candidate['profile']['fields']}
        self.assertEqual(facts['birthPlace'],['Nicosia']);self.assertEqual(facts['taxNumber'],['TAX-1']);self.assertEqual(facts['notes'],['Recorded description'])
        self.assertEqual(candidate['profile']['status'],'summary')
    def test_statement_lineage_counts_sources_per_field_without_claiming_corroboration(self):
        value={'id':'person-1','schema':'Person','properties':{'country':['cy'],'birthDate':['1970-01-01'],'notes':['Description']}}
        rows=[{'id':'a','entity_id':'source-a','canonical_id':'person-1','prop':'country','prop_type':'country','schema':'Person','value':'cy','original_value':'Cyprus','dataset':'source_one','first_seen':'2025-01-01T00:00:00Z','last_seen':'2026-01-01T00:00:00Z'},
              {'id':'b','entity_id':'source-b','canonical_id':'person-1','prop':'country','prop_type':'country','schema':'Person','value':'cy','dataset':'source_two','first_seen':'2025-02-01T00:00:00Z','last_seen':'2026-02-01T00:00:00Z'},
              {'id':'c','entity_id':'source-c','canonical_id':'other-person','prop':'country','prop_type':'country','schema':'Person','value':'ru','dataset':'wrong_entity','first_seen':'2025-01-01T00:00:00Z','last_seen':'2026-01-01T00:00:00Z'}]
        profile=entity_profile(value,{'total':{'value':3},'limit':5000,'offset':0,'results':rows},'now',{'source_one':{'title':'Official source one','publisher':'Publisher One','official':True}})
        country=next(field for field in profile['fields'] if field['key']=='country')
        self.assertEqual(country['sourceCount'],2);self.assertEqual(country['statementCount'],2)
        self.assertEqual({source['dataset'] for source in country['sources']},{'source_one','source_two'})
        self.assertEqual(next(source for source in country['sources'] if source['dataset']=='source_one')['title'],'Official source one')
        self.assertTrue(next(source for source in country['sources'] if source['dataset']=='source_one')['official'])
        self.assertEqual(profile['status'],'completed');self.assertNotIn('corrobor',json.dumps(profile).lower())
    def test_enrichment_combines_profile_lineage_and_direct_relationships(self):
        rows={'total':{'value':1},'limit':5000,'offset':0,'results':[{'id':'a','entity_id':'source-a','canonical_id':'person-1','prop':'name','prop_type':'name','schema':'Person','value':'Example Person','dataset':'example','first_seen':'2025-01-01T00:00:00Z','last_seen':'2026-01-01T00:00:00Z'}]}
        service=OpenSanctionsService('fixture-only',entity_transport=lambda *x:entity(),statement_transport=lambda *x:rows,catalog_transport=lambda:{'datasets':[{'name':'example','title':'Example source','publisher':{'name':'Example publisher','official':True}}]})
        result=service.enrich({'status':'completed','candidates':[{'id':'person-1','name':'Example Person'}]},threading.Event())
        self.assertEqual(result['profileStatus'],'completed');self.assertEqual(result['relationshipStatus'],'completed')
        self.assertEqual(result['candidates'][0]['profile']['fields'][0]['sourceCount'],1)
        self.assertEqual(result['candidates'][0]['profile']['fields'][0]['sources'][0]['title'],'Example source')
    def test_date_requires_agreement_with_its_cited_passage(self):
        a={**affiliation(),'asOf':'Directory updated 2026-09-02'}
        text='Example Ltd updated 2 September 2026 [1]\nOther company changed 13 December 2025 [2]'
        phase={'text':text,'citations':[{'url':URL,'start':text.index('[1]')}]}
        self.assertEqual(affiliation_date(a,phase),a['asOf'])
        a['asOf']='Last change 2025-12-13'
        self.assertEqual(affiliation_date(a,phase),UNKNOWN)
        self.assertEqual(affiliation_date(a,{}),UNKNOWN)
    def test_direct_edges_only_and_no_risk_or_passport_inheritance(self):
        d=entity_details(entity(),'person-1','now')
        self.assertEqual(len(d['records']),1)
        r=d['records'][0];self.assertEqual(r['kind'],'Director');self.assertEqual(r['related'][0]['registrationNumbers'],['HE123'])
        self.assertEqual(r['identityStatus'],'unresolved');self.assertNotIn('SECRET-PASSPORT',json.dumps(d))
        self.assertNotIn('edge-2',json.dumps(d));self.assertEqual(len(d['sha256']),64)
    def test_different_identity_and_invalid_id_fail(self):
        for ident in ['other-id','https://evil.example']:
            value=entity();value['id']=ident
            with self.assertRaises(ProviderError):entity_details(value,'person-1','now')
    def test_known_redirect_referent_is_accepted(self):
        value=entity();value['id']='canonical';value['referents']=['person-1']
        self.assertEqual(len(entity_details(value,'person-1','now')['records']),1)
    def test_failed_enrichment_retains_matching_records(self):
        def fail(*args):raise ProviderError('Relationship access unavailable')
        service=OpenSanctionsService('fixture-only',entity_transport=fail)
        result=service.enrich({'status':'completed','candidates':[{'id':'person-1','name':'Example Person'}]},threading.Event())
        self.assertEqual(result['status'],'completed');self.assertEqual(result['relationshipStatus'],'partial')
        self.assertEqual(result['candidates'][0]['relationships']['status'],'failed')
    def test_cancel_does_not_start_requests(self):
        calls=[];event=threading.Event();event.set()
        result=OpenSanctionsService('fixture-only',entity_transport=lambda *x:calls.append(x)).enrich({'status':'completed','candidates':[{'id':'person-1'}]},event)
        self.assertEqual(result['relationshipStatus'],'cancelled');self.assertEqual(calls,[])
    def test_cancel_during_enrichment_preserves_completed_match(self):
        job={'mode':'deep','status':'running','phases':[],'opensanctions':{'status':'completed','relationshipStatus':'running','candidates':[{'id':'p1'}]}}
        ResearchService._mark_cancelled(job)
        self.assertEqual(job['opensanctions']['status'],'completed')
        self.assertEqual(job['opensanctions']['relationshipStatus'],'cancelled')
        self.assertEqual(job['opensanctions']['candidates'][0]['id'],'p1')
    def test_empty_provider_result_is_not_complete_registry_search(self):
        result=OpenSanctionsService('fixture-only').enrich({'status':'completed','candidates':[]},threading.Event())
        self.assertEqual(result['relationshipCoverage']['requested'],0)
    def test_payload_receives_provider_leads_without_passports(self):
        d=entity_details(entity(),'person-1','now')
        provider={'status':'completed','candidates':[{'id':'person-1','name':'Example Person','passportNumbers':['SECRET-PASSPORT'],'relationships':d}]}
        p=build_payload({'name':'Example Person','type':'person','passportNumber':'SECRET-PASSPORT'},'media',[],DEFAULT_MODEL,provider_check=provider)
        self.assertIn('Example Ltd',p['input']);self.assertIn('providerCandidates',p['input']);self.assertNotIn('SECRET-PASSPORT',p['input'])
        discovery=build_payload({'name':'Example Person','type':'person','country':'Russia'},'ownership',[],DEFAULT_MODEL,provider_check=provider)
        self.assertIn('without the supplied date of birth/country',discovery['instructions']);self.assertNotIn('Example Ltd',discovery['input']);self.assertIn('site:cyprusregistry.com',discovery['input']);self.assertNotIn('Olga',p['instructions']);self.assertNotIn('IVI',p['instructions'])
        self.assertEqual(p['model'],'gpt-6-luna');self.assertNotIn('filters',p['tools'][0])
    def test_affiliation_requires_inline_citation(self):
        self.assertEqual(validated_affiliations([affiliation()],[]),[])
        result=validated_affiliations([affiliation()],[{'url':URL}])
        self.assertEqual(result[0]['identityStatus'],'unresolved');self.assertEqual(result[0]['riskStatus'],'Not established by this relationship')
    def test_affiliation_rejects_unsafe_source_and_missing_role(self):
        value=affiliation();value['sourceUrls']=['javascript:alert(1)']
        self.assertEqual(validated_affiliations([value],[{'url':'javascript:alert(1)'}]),[])
        value=affiliation();value.pop('role');self.assertEqual(validated_affiliations([value],[{'url':URL}]),[])
    def test_structured_affiliation_survives_identity_parsing(self):
        prose='Evidence [1]';data={'status':'unresolved','candidate':'Example Person','reason':'Namesake','affiliations':[affiliation()]}
        parsed={'text':prose+'\n<identity_evidence>'+json.dumps(data)+'</identity_evidence>','status':'completed','warnings':[],'citations':[{'url':URL,'start':9,'end':12}]}
        parsed=identity_evidence(parsed,{'name':'Example Person'},[])
        self.assertEqual(parsed['affiliations'][0]['organization'],'Example Ltd');self.assertNotIn('identity_evidence',parsed['text'])
    def test_report_preserves_affiliations_and_failure_gaps(self):
        a=validated_affiliations([affiliation()],[{'url':URL}])[0]
        a['asOf']='Uncorroborated change 2025-12-13'
        report={'query':{'name':'Example Person','type':'person'},'matches':[], 'research':{'mode':'deep','status':'partial','phases':[{'id':'ownership','title':'Ownership','status':'completed','affiliations':[a],'citations':[{'url':URL,'title':'Registry lead'}]}], 'opensanctions':{'status':'completed','candidates':[{'id':'person-1','name':'Example Person','score':1,'relationships':{'status':'failed','error':'Relationship access unavailable','records':[]}}]}}}
        raw=build_pdf(report);txt='\n'.join(p.extract_text() for p in PdfReader(io.BytesIO(raw)).pages)
        self.assertIn('Example Ltd',txt);self.assertIn('HE123',txt);self.assertIn('Identity unconfirmed',txt);self.assertIn('Relationship access unavailable',txt)
        self.assertEqual(txt.count('Company affiliations & relationships'),1)
        self.assertNotIn('2025-12-13',txt);self.assertIn(UNKNOWN,txt)
        from screening_chat import build_chat
        report['id']='relationship-test'
        payload,_=build_chat({'report':report,'question':'What dates are known?'})
        self.assertNotIn('2025-12-13',json.dumps(payload));self.assertIn(UNKNOWN,json.dumps(payload))

if __name__=='__main__':unittest.main()
