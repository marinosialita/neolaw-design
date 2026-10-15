#!/usr/bin/env python3
"""Synthetic comparison-profile PDF checks; no network or provider calls."""
import copy
import io
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pypdf import PdfReader
from screening_report import build_pdf, passport_coverage, profile_overview

STAMP='2026-10-13T07:00:00Z'
IDS=('eu','ofac','un','uk','cy','bis','au','ca','ch')
def fixture(company=False, full=False):
    name='Synthetic Company Limited' if company else 'Synthetic Example Person'
    query={'name':name,'type':'entity' if company else 'person','country':'Cyprus'}
    query.update({'registrationNumber':'HE 001122','lei':'12345678901234567890'} if company else {'dob':'1980-01-01','passportNumber':'AA 001122'})
    records=[]
    for source in (('bis','eu') if company else ('eu','ofac')):
        record={'id':source+':synthetic','sourceId':source,'name':name if source in ('eu','bis') else 'Synthetic Different Person','type':query['type'],'countries':['CY'],'aliases':[],'sourceUrl':'https://example.org/'+source+'/synthetic','programs':['Export control'] if source=='bis' else ['Synthetic list classification'], 'reasons':'Synthetic evidence for layout verification only. This is not a real listing.'}
        if company:record.update(registrationNumbers=['HE001122' if source=='bis' else 'HE998877'],lei=query['lei'])
        else:record.update(datesOfBirth=['1980-01-01' if source=='eu' else '1990-01-01'],passportNumbers=['AA001122' if source=='eu' else 'ZZ998877'])
        records.append({'record':record,'score':100 if source in ('eu','bis') else 70,'matchKind':'Exact name' if source in ('eu','bis') else 'Similar name'})
    checks=[]
    for source in IDS:
        candidates=[m for m in records if m['record']['sourceId']==source]
        check={'id':source,'status':'completed','matchCount':len(candidates),'candidates':candidates,'checkedAt':STAMP,'retrievedAt':STAMP,'detail':'Synthetic source receipt; no real provider request was made.','downloads':[{'url':'https://example.org/'+source+'/synthetic-list','retrievedAt':STAMP,'sha256':'synthetic-source-hash-'+source}]}
        if source=='eu' and not company:check['identifierChecks']={'passportNumber':{'status':'compared','recordsWithIdentifier':10,'exactMatches':1}}
        checks.append(check)
    report={'id':'synthetic-company-profile' if company else 'synthetic-person-profile','createdAt':STAMP,'requiresOfficial':True,'query':query,'reportDetail':'full' if full else 'brief','matches':records,'totalMatches':len(records),'decisions':{records[1]['record']['id']:{'status':'investigate','note':'Different published identifier. Obtain corroborating records.','reviewer':'Synthetic QA reviewer','at':STAMP}},'research':{'schemaVersion':7,'mode':'search','status':'completed','officialChecks':checks,'worldbank':{'status':'completed','totalResults':0,'candidates':[],'checkedAt':STAMP,'retrievedAt':STAMP,'recordCount':12,'detail':'Synthetic Table 1 fixture.'},'opensanctions':{'status':'not_configured'},'gleif':{'status':'not_applicable'}}}
    if company:
        gleif_record={'id':'gleif:synthetic','sourceId':'gleif','type':'entity','name':name,'countries':['CY'],'registrationNumber':'HE001122','lei':query['lei'],'leiStatus':'ISSUED','entityStatus':'ACTIVE','sourceUrl':'https://example.org/lei/synthetic','registrationAuthority':'Synthetic registry authority','addresses':['Synthetic Street 10, Nicosia'],'updatedAt':STAMP}
        report['research']['gleif']={'status':'completed','totalResults':1,'returnedCandidates':1,'checkedAt':STAMP,'publishedAt':STAMP,'lookup':'registration','lookupText':'HE001122','candidates':[{'record':gleif_record}],'queryUrl':'https://example.org/lei/lookup','sha256':'synthetic-gleif-hash'}
    return report

def pdf_pages(report):return [p.extract_text() for p in PdfReader(io.BytesIO(build_pdf(report))).pages]
class ProfileReportTests(unittest.TestCase):
    def test_passport_without_recorded_comparison_changes_cover_and_next_action(self):
        report=fixture();report['matches']=[];report['totalMatches']=0
        for check in report['research']['officialChecks']:
            check.update(matchCount=0,candidates=[]);check.pop('identifierChecks',None)
        cover=' '.join(pdf_pages(report)[0].split())
        for phrase in ('Checks incomplete','Passport comparison incomplete','Complete a supported passport-number check','name-only results cannot answer it'):self.assertIn(phrase,cover)
        self.assertNotIn('Official checks completed',cover)
    def test_only_completed_provider_acceptance_or_official_comparison_satisfies_passport_request(self):
        q={'passportNumber':'AA 001-122'}
        provider={'status':'completed','parsedQuery':{'properties':{'passportNumber':['AA001122']}}}
        self.assertFalse(passport_coverage(q,[],provider)['incomplete'])
        for status in ('running','failed','cancelled','interrupted'):
            self.assertTrue(passport_coverage(q,[],{**provider,'status':status})['incomplete'])
        self.assertTrue(passport_coverage(q,[],{'status':'completed','parsedQuery':{'properties':{'passportNumber':['AA0011220']}}})['incomplete'])
        self.assertFalse(passport_coverage(q,[{'status':'completed','identifierChecks':{'passportNumber':{'status':'compared'}}}],{})['incomplete'])
        self.assertTrue(passport_coverage(q,[{'status':'failed','identifierChecks':{'passportNumber':{'status':'compared'}}}],{})['incomplete'])
    def test_missing_and_conflicting_published_identifiers_remain_distinct(self):
        report=fixture();matches=report['matches'];matches[0]['record']['passportNumbers']=[]
        overview=profile_overview(matches,{}, {}, {},report['query'],report['decisions'])
        self.assertIn('Passport: not supplied by source',overview['rows'][0]['identifiers'])
        self.assertIn('Passport: ZZ998877 (differs / review)',overview['rows'][1]['identifiers'])
        self.assertEqual(overview['rows'][1]['review'],'Further review')
        self.assertEqual(overview['rows'][1]['nameState'],'Name needs comparison')
    def test_overview_selection_is_explicit_and_full_evidence_keeps_other_records(self):
        report=fixture(full=True);extra=copy.deepcopy(report['matches'][0]);extra['record'].update(id='eu:extra',name='Synthetic extra source record')
        report['matches'].append(extra);report['totalMatches']=3
        report['research']['officialChecks'][0]['candidates'].append(extra);report['research']['officialChecks'][0]['matchCount']=2
        pages=pdf_pages(report);content='\n'.join(pages)
        self.assertIn('Overview: 2 of 3 retrieved candidate records',content)
        self.assertIn('One candidate per returned source',content)
        self.assertIn('not a single confirmed profile',content)
        self.assertIn('Synthetic extra source record',content)
        self.assertIn('Review labels are recorded reviewer decisions',content)
    def test_company_numbers_leis_and_jurisdiction_are_present_without_ubo_claim(self):
        report=fixture(company=True)
        content='\n'.join(pdf_pages(report))
        self.assertNotIn('Company identity lookup incomplete',content)
        for phrase in ('Company no.: HE001122 (agrees)','Company no.: HE998877 (differs / review)','LEI: 12345678901234567890 (agrees)','Jurisdiction: CY','Company reference','Reference only','complete beneficial ownership'):
            self.assertIn(phrase,content)
    def test_provider_classification_and_scope_survive_the_overview(self):
        q={'name':'Synthetic Person','type':'person','dob':'1980-01-01'}
        provider={'status':'completed','candidates':[{'id':'p1','name':q['name'],'schema':'Person','topics':['role.pep'],'birthDates':['1980-01-01'],'countries':['CY']}]}
        overview=profile_overview([],{},provider,{},q,{'opensanctions:p1':{'status':'dismissed'}})
        self.assertEqual(overview['rows'][0]['review'],'Different identity')
        self.assertIn('Politically exposed person',overview['rows'][0]['category'])
        self.assertNotIn('wrongdoing',overview['rows'][0]['category'])
    def test_unspecified_provider_types_are_not_relabelled_as_people(self):
        query={'name':'Synthetic company','type':'entity','registrationNumber':'SYNTHETIC'}
        for schema in ('LegalEntity','Organization','Unknown'):
            with self.subTest(schema=schema):
                provider={'status':'completed','candidates':[{'id':'synthetic','name':query['name'],'schema':schema}]}
                overview=profile_overview([],{},provider,{},query,{})
                self.assertNotIn('Entity type: Person',overview['rows'][0]['identifiers'])
                self.assertNotIn('Entity type:',overview['rows'][0]['identifiers'])
    def test_many_identifiers_are_explicitly_abbreviated_only_in_overview(self):
        report=fixture();report['matches'][0]['record']['passportNumbers']=['AA001122','BB002233','CC003344']
        overview=profile_overview(report['matches'],{}, {}, {},report['query'],{})
        self.assertIn('(+1 more; see evidence)',overview['rows'][0]['identifiers'])
        report['reportDetail']='full'
        content='\n'.join(pdf_pages(report));self.assertIn('CC003344',content)
    def test_untrusted_names_and_long_fields_render_as_text(self):
        report=fixture();report['matches'][0]['record']['name']='<script>synthetic</script> & Company'
        report['query']['name']='<script>synthetic</script> & Company'
        content='\n'.join(pdf_pages(report));self.assertIn('<script>synthetic</script>',content)
    def test_mixed_receipts_preserve_legacy_evidence_and_replace_only_refreshed_sources(self):
        report=fixture(full=True)
        checks={check['id']:check for check in report['research']['officialChecks']}
        report['matches'][0]['record']['name']='LegacyRetainedSynthetic'
        checks['eu'].pop('candidates')
        report['decisions']['eu:synthetic']={'status':'investigate','note':'Retained legacy review reason','reviewer':'Synthetic reviewer','at':STAMP}
        report['matches'][1]['record']['name']='SupersededSynthetic'
        refreshed=copy.deepcopy(report['matches'][1])
        refreshed['record'].update(id='ofac:refreshed',name='RefreshedSynthetic')
        checks['ofac']['candidates']=[refreshed]
        for source,name in [('uk','ExplicitEmptyStale'),('un','FailedLegacyStale'),('ch','LegacyZeroStale')]:
            stale=copy.deepcopy(report['matches'][0])
            stale['record'].update(id=source+':stale',sourceId=source,name=name)
            report['matches'].append(stale)
        checks['un'].pop('candidates');checks['un'].update(status='failed',matchCount=1)
        checks['ch'].pop('candidates')
        before=copy.deepcopy(report)
        content=' '.join('\n'.join(pdf_pages(report)).split())
        self.assertIn('LegacyRetainedSynthetic',content)
        self.assertIn('RefreshedSynthetic',content)
        self.assertIn('Retained legacy review reason',content)
        self.assertIn('Overview: 2 of 2 retrieved candidate records',content)
        self.assertNotIn('0 of 1 entries',content,'Retained legacy candidates are available, not truncated')
        for name in ('SupersededSynthetic','ExplicitEmptyStale','FailedLegacyStale','LegacyZeroStale'):
            self.assertNotIn(name,content)
        self.assertIn('Checks incomplete',content)
        self.assertEqual(report,before,'Export must not rewrite evidence or review decisions')

    def test_person_query_keeps_passport_and_dob_when_source_returns_a_company(self):
        report=fixture(full=True)
        candidate=report['matches'][0]['record']
        candidate.update(type='entity',datesOfBirth=[],passportNumbers=[],registrationNumbers=['SYNTHETIC-COMPANY-ID'])
        overview=profile_overview(report['matches'],{}, {}, {},report['query'],report['decisions'])
        identifiers=overview['rows'][0]['identifiers']
        self.assertIn('Entity type: Company (differs / review)',identifiers)
        self.assertIn('DOB: not supplied by source',identifiers)
        self.assertIn('Passport: not supplied by source',identifiers)
        self.assertNotIn('Company no.',identifiers)
        content=' '.join('\n'.join(pdf_pages(report)).split())
        self.assertIn('Entity type: Company (differs / review)',content)
        self.assertIn('Resolve the different entity type before linking this record to the client.',content)
        self.assertIn('Passport number AA 001122 Not supplied by source',content)
        self.assertIn('Date of birth 1980-01-01 Not supplied by source',content)

if __name__=='__main__':
    if '--write-proofs' in sys.argv:
        sys.argv.remove('--write-proofs')
        target=Path(__file__).resolve().parents[1]/'work/profile-workspace/pdf-proof'
        target.mkdir(parents=True,exist_ok=True)
        for name,report in [('person-brief',fixture()),('company-full',fixture(company=True,full=True))]:
            path=target/(name+'.pdf');path.write_bytes(build_pdf(report));print('Synthetic proof:',path)
    unittest.main(verbosity=2)
