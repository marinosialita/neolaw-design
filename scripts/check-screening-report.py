#!/usr/bin/env python3
"""PDF evidence regression checks. Rendering is verified separately in the browser."""
import datetime as dt
import io
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pypdf import PdfReader
from screening_report import build_pdf, ReportExportError, record_review_progress

def text(report):
    return '\n'.join(p.extract_text() for p in PdfReader(io.BytesIO(build_pdf(report))).pages)

class ReportTests(unittest.TestCase):
    def test_company_cover_retains_reference_and_scope_without_a_metadata_only_page(self):
        report=self.supplemental_fixture('completed')
        report['query']={'name':'Synthetic company layout fixture','type':'entity','country':'China'}
        report['previousReportId']='earlier-company-review'
        report['research'].update(mode='deep',status='completed',phases=[{'id':pid,'title':title,'status':'completed','summary':{'finding':'A matching-name company candidate appears in public-source records, but the supplied subject has no corporate registration identifier for comparison. Identity and ultimate ownership remain unresolved.'}} for pid,title in [('identity','Identity & official records'),('media','Adverse media & current developments'),('ownership','Ownership & public roles')]])
        report['matches']=[{'record':{'id':'fixture-one','sourceId':'eu','name':'Candidate company','type':'entity'},'score':90}]
        report['totalMatches']=100
        report['research']['officialChecks'][0].update(matchCount=100,candidates=report['matches'])
        pdf=PdfReader(io.BytesIO(build_pdf(report)))
        cover=pdf.pages[0].extract_text()
        for phrase in ('Recorded identity review','Identity and ultimate ownership remain unresolved.','OpenSanctions','World Bank / Procurement','GLEIF / Company identity','Next steps','not sanctions clearance','Report reference: compact-fixture','Previous check: earlier-company-review','Prepared'):
            self.assertIn(phrase,cover)
        self.assertIn('01 / Official checks',pdf.pages[1].extract_text())

    def test_explicit_empty_receipts_replace_superseded_report_totals(self):
        report=self.supplemental_fixture('completed')
        report['matches']=[{'record':{'id':'old','sourceId':'eu','name':'Superseded candidate'}}]
        report['totalMatches']=100
        result=text(report)
        self.assertIn('0 possible entries',result)
        self.assertNotIn('100 unresolved',result)
        self.assertNotIn('Superseded candidate',result)

    def test_recorded_review_counts_source_ids_and_keeps_open_followups(self):
        matches=[{'record':{'id':'one'}},{'record':{'id':'one'}},{'record':{}}]
        procurement={'status':'completed','totalResults':1,'candidates':[{'record':{'id':'wb:one'}}]}
        provider={'status':'completed','atLimit':True,'candidates':[{'id':'one'},{'id':'two'}]}
        decisions={'one':{'status':'confirmed'},'wb:one':{'status':'investigate'},'opensanctions:one':{'status':'dismissed'},'orphan':{'status':'dismissed'}}
        progress=record_review_progress(matches,procurement,provider,decisions,8)
        self.assertEqual(progress,dict(unreviewed=2,investigate=1,confirmed=1,dismissed=1,total=5,open=3,limited=True,unreviewable=1))
        self.assertEqual(record_review_progress([],{'status':'failed','candidates':procurement['candidates']},{'status':'cancelled','candidates':provider['candidates']},decisions,0)['total'],0)

    def test_all_identity_decisions_never_mean_client_approval(self):
        report={'query':{'name':'Review queue fixture'},'requiresOfficial':True,'research':{'mode':'search','officialChecks':self.completed_checks(),'worldbank':{'status':'completed','totalResults':1,'candidates':[{'record':{'id':'wb:one','name':'Candidate'}}]},'opensanctions':{'status':'completed','possibleMatches':1,'candidates':[{'id':'one','name':'Candidate','score':1}]}},'decisions':{'wb:one':{'status':'confirmed','note':'Fixture identifiers'},'opensanctions:one':{'status':'dismissed','note':'Fixture difference'}}}
        result=text(report)
        self.assertIn('0 of 2 source records still open',result)
        self.assertIn('1 same identity; 1 different identity',result)
        self.assertIn('Recorded decisions only, not client approval',result)
        self.assertIn('Possible matches require review',result)

    def supplemental_fixture(self, state='cancelled'):
        timestamp='2026-10-13T00:15:00Z'
        result={'status':state,'checkedAt':timestamp,'publishedAt':timestamp,'retrievedAt':timestamp,'candidates':[],'totalResults':0,'returnedCandidates':0,'recordCount':1517,'sha256':'saved-source-hash'}
        if state!='completed':result['error']='Check stopped before completion.'
        return {'id':'compact-fixture','query':{'name':'Supplementary layout fixture','type':'entity'},'requiresOfficial':True,'research':{'schemaVersion':7,'mode':'search','officialChecks':[dict(id=i,status=state,matchCount=0) for i in ('eu','ofac','un','uk','cy','bis','au','ca','ch')],'worldbank':dict(result),'gleif':dict(result),'opensanctions':{**result,'possibleMatches':0}}}

    def test_stopped_checks_share_a_brief_page_without_losing_receipts(self):
        report=self.supplemental_fixture()
        pdf=PdfReader(io.BytesIO(build_pdf(report)))
        pages=[p.extract_text() for p in pdf.pages]
        grouped=[p for p in pages if 'Additional checks' in p]
        self.assertEqual(len(grouped),1)
        for title in ('World Bank / Procurement debarment','OpenSanctions / Additional provider','Company identity / GLEIF'):
            self.assertIn(title,grouped[0])
        self.assertIn('13 Oct 2026, 03:15',grouped[0])
        self.assertIn('saved-source-hash',grouped[0])
        self.assertEqual(grouped[0].count('Check stopped before completion.'),3)
        self.assertIn('Checks incomplete',pages[0])
        self.assertNotIn('No name matches','\n'.join(pages))
        self.assertLessEqual(len(pages),3)

    def test_empty_completed_supplemental_checks_retain_scope_and_links(self):
        report=self.supplemental_fixture('completed')
        report['research']['gleif']['queryUrl']='https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=fixture'
        pdf=PdfReader(io.BytesIO(build_pdf(report)))
        value='\n'.join(p.extract_text() for p in pdf.pages)
        for expected in ('No name matches in World Bank Table 1','No LEI records returned','Table 2 other sanctions','not establish procurement eligibility','not a finding that the company does not exist'):
            self.assertIn(expected,value)
        self.assertNotIn('CANDIDATE / SOURCE',value)
        links=[a.get_object().get('/A',{}).get('/URI') for p in pdf.pages for a in p.get('/Annots',[])]
        self.assertIn(report['research']['gleif']['queryUrl'],links)

    def test_long_supplemental_errors_are_retained_without_overflow(self):
        report=self.supplemental_fixture('failed')
        report['research']['worldbank']['error']=' '.join('Publisher diagnostic '+str(i) for i in range(180))
        value=text(report)
        self.assertIn('Publisher diagnostic 179',value)
        self.assertIn('Company identity / GLEIF',value)
        self.assertNotIn('No name matches',value)

    def test_full_evidence_keeps_separate_supplemental_receipts(self):
        report=self.supplemental_fixture()
        report['reportDetail']='full'
        pdf=PdfReader(io.BytesIO(build_pdf(report)))
        pages=[p.extract_text() for p in pdf.pages]
        receipt_pages=[next(i for i,p in enumerate(pages) if title in p) for title in ('World Bank / Procurement debarment','OpenSanctions / Additional provider','Company identity / GLEIF')]
        self.assertEqual(len(set(receipt_pages)),3)
        self.assertNotIn('Additional checks','\n'.join(pages))

    def test_rerun_reference_survives_pdf_without_inheriting_prior_decisions(self):
        result=text({'id':'new-check','previousReportId':'earlier-check','query':{'name':'Rerun fixture'},'decisions':{}})
        self.assertIn('Previous check: earlier-check',result)
        self.assertIn('Report reference: new-check',result)

    def test_supplemental_identity_decisions_in_brief_and_full_without_review_log(self):
        report={'query':{'name':'Supplemental fixture'},'research':{'mode':'search','worldbank':{'status':'completed','totalResults':1,'candidates':[{'record':{'id':'wb:one','sourceId':'wb','name':'Procurement fixture'}}]},'opensanctions':{'status':'completed','candidates':[{'id':'one','name':'Provider fixture','score':1}]}},'decisions':{'wb:one':{'status':'investigate','note':'Check procurement conditions','reviewer':'Reviewer A'},'opensanctions:one':{'status':'dismissed','note':'Different provider identifier','reviewer':'Reviewer B'}}}
        for detail in ('brief','full'):
            result=text({**report,'reportDetail':detail})
            for expected in ('Check procurement conditions','Different provider identifier','Reviewer A','Reviewer B','Needs further review','Different identity'):
                self.assertIn(expected,result)
            self.assertIn('restrictions and client acceptance require separate review',result)

    def test_future_and_stale_sources_do_not_count_as_current_coverage(self):
        report={'query':{'name':'PDF coverage fixture'},'sourceSnapshots':[
            {'id':'eu','status':'available','retrievedAt':'2999-01-01T00:00:00Z'},
            {'id':'ofac','status':'available','retrievedAt':'2000-01-01T00:00:00Z'},
            {'id':'un','status':'available','retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat()},
            {'id':'uk','status':'available','retrievedAt':'invalid'}]}
        result=text(report)
        self.assertIn('1 of 4 datasets searched',result)
        for label in ('Invalid snapshot date','Stale snapshot','Retrieval date missing','Checks incomplete'):self.assertIn(label,result)
    def test_failed_check_with_unknown_count_downloads_without_false_negative(self):
        result=text({'query':{'name':'PDF failed-source fixture'},'research':{'status':'partial','officialChecks':[{'id':'ofac','status':'failed','matchCount':None,'error':'Official feed timed out'}]}})
        self.assertIn('0 of 5 official checks completed',result);self.assertIn('Official feed timed out',result)
        self.assertNotIn('No name matches',result)
    def test_empty_official_checks_are_incomplete_not_five_negatives(self):
        result=text({'query':{'name':'PDF pending fixture'},'research':{'status':'running','officialChecks':[]}})
        self.assertIn('0 of 5 official checks completed',result);self.assertIn('Checks incomplete',result)

    def test_revalidated_unchanged_file_counts_as_recent_coverage(self):
        sources=[{'id':i,'status':'available','retrievedAt':'2000-01-01T00:00:00Z','verifiedAt':dt.datetime.now(dt.timezone.utc).isoformat()} for i in ('eu','ofac','un','uk')]
        self.assertIn('4 of 4 datasets searched',text({'query':{'name':'Revalidated file fixture'},'sourceSnapshots':sources}))
    def test_provider_explanations_preserved_in_full_pdf(self):
        candidate={'name':'Provider fixture','score':.8,'explanations':[{'feature':'dob_year_disjoint','score':1,'detail':'Birth years: 1980 vs 1965'}]}
        report={'query':{'name':'Provider fixture'},'research':{'mode':'search','opensanctions':{'status':'completed','candidates':[candidate]}}}
        report['reportDetail']='full'
        result='\n'.join(p.extract_text() for p in PdfReader(io.BytesIO(build_pdf(report))).pages)
        self.assertIn('Birth years: 1980 vs 1965',result)
        self.assertIn('not confirmed identity or risk',result)
    def test_provider_profile_field_lineage_uses_human_source_title_in_full_pdf(self):
        profile={'status':'completed','fieldCount':1,'sourceCount':1,'statementCount':2,'fields':[{'key':'country','label':'Country','values':['Russia'],'sourceCount':1,'statementCount':2,'sources':[{'dataset':'eu_fsf','title':'EU Financial Sanctions Files (FSF)','publisher':'European Commission','official':True,'url':'https://www.opensanctions.org/datasets/eu_fsf/'}]}]}
        candidate={'id':'Q1','name':'Provider fixture','score':.8,'profile':profile}
        report={'query':{'name':'Provider fixture'},'reportDetail':'full','research':{'mode':'search','opensanctions':{'status':'completed','profileStatus':'completed','candidates':[candidate]}}}
        result='\n'.join(p.extract_text() for p in PdfReader(io.BytesIO(build_pdf(report))).pages)
        for value in ('Complete provider profile','Country','Russia','EU Financial Sanctions Files','official publisher'):self.assertIn(value,result)
    def test_pdf_restores_all_returned_records_beyond_the_old_display_cap(self):
        matches=[{'record':{'id':'cy:'+str(i),'name':'Synthetic record '+str(i),'sourceId':'cy','type':'person'},'score':80} for i in range(125)]
        report={'query':{'name':'Synthetic report stress test'},'matches':matches[:100],'reportDetail':'full','research':{'mode':'search','officialChecks':[{'id':'cy','status':'completed','matchCount':125,'candidates':matches}]}}
        result=text(report)
        self.assertIn('Synthetic record 124',result)
        self.assertNotIn('100 of 125',result)
    def test_oversized_pdf_fails_explicitly_without_silent_truncation(self):
        with self.assertRaisesRegex(ReportExportError,'Download evidence data'):
            build_pdf({'query':{'name':'Oversized fixture'},'matches':[{'record':{'name':'Record'}}]*1001})
    def test_decision_history_preserves_previous_reason_and_reviewer_in_full_export(self):
        log=[{'recordId':'fixture','recordName':'Synthetic audit fixture','status':'dismissed','note':'Earlier registration differs','reviewer':'First test reviewer','at':'2026-10-12T09:00:00Z'}, {'recordId':'fixture','recordName':'Synthetic audit fixture','status':'investigate','note':'Reopened for current registry extract','reviewer':'Second test reviewer','at':'2026-10-12T10:00:00Z'}]
        report={'query':{'name':'Synthetic review fixture'},'reviewLog':log,'reportDetail':'full'}
        result=text(report)
        for value in ('Earlier registration differs','First test reviewer','Reopened for current registry extract','Second test reviewer','not an authenticated audit log'):self.assertIn(value,result)
        report['reportDetail']='brief';self.assertIn('2 saved revisions',text(report));self.assertIn('Every saved revision',text(report))
        with self.assertRaisesRegex(ReportExportError,'1,000-event'):text({'reviewLog':log*501})
    def completed_checks(self):
        return [dict(id=i,status='completed',matchCount=0) for i in ('eu','ofac','un','uk','cy')]
    def test_official_receipts_are_linked_and_retained_in_full_pdf(self):
        checks=self.completed_checks();checks[0].update(detail='Detailed source coverage fixture',verifiedAt='2026-10-12T09:00:00Z',downloads=[{'url':'https://example.org/list.xml','retrievedAt':'2026-10-12T08:00:00Z','sha256':'fixture-hash-123'}])
        checks[-1]['responseSha256']='cy-response-hash-456'
        report={'query':{'name':'Receipt fixture'},'requiresOfficial':True,'research':{'mode':'search','officialChecks':checks}}
        brief=text(report);self.assertIn('Full source scope',brief)
        full=text({**report,'reportDetail':'full'});self.assertIn('fixture-hash-123',full);self.assertIn('cy-response-hash-456',full);self.assertIn('Detailed source coverage fixture',full)
        pdf=PdfReader(io.BytesIO(build_pdf(report)))
        links=[a.get_object().get('/A',{}).get('/URI') for p in pdf.pages for a in p.get('/Annots',[])]
        self.assertIn('https://sanctionssearch.ofac.treas.gov/',links)
    def test_missing_phase_receipts_override_completed_status(self):
        result=text({'query':{'name':'Missing phase fixture'},'research':{'status':'completed','mode':'deep','phases':[],'officialChecks':self.completed_checks()}})
        self.assertIn('Checks incomplete',result);self.assertIn('Complete the missing or unfinished research',result)
    def test_running_provider_is_incomplete(self):
        for state in ('pending','running','failed','cancelled','interrupted'):
            result=text({'query':{'name':'Provider fixture'},'research':{'status':'completed','mode':'search','opensanctions':{'status':state},'officialChecks':self.completed_checks()}})
            self.assertIn('Checks incomplete',result)
    def test_failed_or_invalid_counts_never_inflate_cover(self):
        for count in (999,-10,True,None):
            checks=self.completed_checks();checks[0].update(status='failed',matchCount=count)
            result=text({'query':{'name':'Failed count fixture'},'research':{'mode':'search','officialChecks':checks}})
            self.assertIn('0 possible entries',result);self.assertNotIn('999 possible',result)

if __name__=='__main__':unittest.main(verbosity=2)
