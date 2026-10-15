"""Synthetic repeat-review/retry report regressions; no provider or network requests."""
import copy
import base64
import io
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pypdf import PdfReader
from PIL import Image
from screening_report import build_pdf, ReportExportError

def fixture():
    item=lambda identifier,name,source:dict(id=identifier,name=name,sourceId=source,source=source.upper())
    return {'id':'synthetic-followup-review','query':{'name':'SYNTHETIC FOLLOW-UP EXAMPLE','type':'person','country':'Cyprus'},'createdAt':'2026-10-13T12:00:00Z','requiresOfficial':True,'sourceSnapshots':[],'matches':[],'decisions':{},'totalMatches':0,'notes':'Layout and behaviour test only. This is not a real screening result.', 'previousReportId':'synthetic-earlier-review',
      'comparison':{'schemaVersion':1,'previousReportId':'synthetic-earlier-review','previousAt':'2026-10-12T07:00:00Z','status':'compared','note':'Compare these two saved retrievals; identities remain unresolved.','added':[item('synthetic-new-001','Synthetic New Record','eu')],'changed':[item('synthetic-changed-002','Synthetic Changed Record','uk')],'notReturned':[item('synthetic-absent-003','Synthetic Earlier Record','un')],'newlyAvailable':[item('synthetic-available-004','Synthetic Available Record','cy')],'gaps':[{'sourceId':'cy','label':'Cyprus Stratlink','note':'No completed earlier check to compare.'}]},
      'research':{'schemaVersion':7,'id':'synthetic-retry-job','mode':'deep','status':'partial','model':'gpt-6-luna','query':{'name':'SYNTHETIC FOLLOW-UP EXAMPLE','type':'person'},'startedAt':'2026-10-13T12:00:00Z','completedAt':'2026-10-13T12:01:00Z','originalStartedAt':'2026-10-12T08:00:00Z','researchNeedsRefresh':True,
        'officialChecks':[{'id':i,'name':i.upper(),'status':'completed','matchCount':0,'candidates':[],'checkedAt':'2026-10-13T12:01:00Z'} for i in ('eu','ofac','un','uk','cy','bis','au','ca','ch')],
        'worldbank':{'status':'completed','totalResults':0,'candidates':[]},'gleif':{'status':'not_applicable'},'opensanctions':{'status':'not_configured'},
        'phases':[{'id':i,'title':title,'status':'completed','startedAt':'2026-10-12T08:00:00Z','completedAt':'2026-10-12T08:02:00Z','summary':{'finding':'Synthetic candidate evidence requires identifier review. No client identity is established.','nextStep':'Verify a reliable identifier.'},'text':'Synthetic test narrative. Identity remains unresolved.','sources':[],'citations':[]} for i,title in [('identity','Identity & official records'),('media','Media review'),('ownership','Ownership & public roles')]],
        'retryHistory':[{'id':'synthetic-retry-job','previousJobId':'synthetic-original-job','startedAt':'2026-10-13T12:00:00Z','completedAt':'2026-10-13T12:01:00Z','status':'completed','sourceIds':['cy','worldbank'],'previousChecks':[{'sourceId':'cy','status':'failed','error':'Synthetic portal timeout.','checkedAt':'2026-10-12T08:00:00Z'},{'sourceId':'worldbank','status':'interrupted','error':'Synthetic request interrupted.','checkedAt':'2026-10-12T08:01:00Z'}]}]}}

def rich_fixture():
    report=fixture()
    report['matches']=[{'score':1,'nameMatched':report['query']['name'],'record':{'id':f'synthetic-{i}','name':report['query']['name'],'sourceId':'eu','datesOfBirth':['1952-10-07'],'countries':['Russia'],'aliases':[]}} for i in range(10)]
    report['totalMatches']=10
    report['research']['officialChecks'][0].update(matchCount=10,candidates=copy.deepcopy(report['matches']))
    findings=[
        'Multiple official-list candidates match the supplied name, but identity remains unresolved because the subject’s full date of birth was not supplied.',
        'Court records report an outstanding warrant alleging serious offences and a separate non-cooperation finding; the subject-to-candidate identity link is unresolved.',
        'A company-register disqualification entry appears under the supplied name, but identity was not compared and no corporate affiliation was established.'
    ]
    for phase,finding in zip(report['research']['phases'],findings):
        phase['summary'].update(finding=finding,nextStep='Compare the supplied subject against authoritative records and reliable identifying details before attributing any finding.')
    report['research']['opensanctions']={'status':'completed','possibleMatches':6,'candidates':[{'id':f'fixture-{i}','name':report['query']['name'],'schema':'Person','score':1,'wikidataIds':['Q42']} for i in range(6)]}
    photo=io.BytesIO();Image.new('RGB',(120,160),'#86c4cd').save(photo,format='JPEG')
    report['reportPortrait']={'status':'available','candidateId':'opensanctions:fixture-0','candidateName':report['query']['name'],'wikidataId':'Q42','sourceUrl':'https://commons.wikimedia.org/wiki/File:Fixture.jpg','artist':'Synthetic QA credit','license':'CC BY 4.0','imageData':'data:image/jpeg;base64,'+base64.b64encode(photo.getvalue()).decode()}
    return report

def pages(report):return [' '.join(page.extract_text().split()) for page in PdfReader(io.BytesIO(build_pdf(report))).pages]

class FollowupReports(unittest.TestCase):
    def test_long_brief_cover_and_photo_keep_next_steps_reference_and_followup_intact(self):
        report=rich_fixture()
        pdf=PdfReader(io.BytesIO(build_pdf(report)));result=[' '.join(page.extract_text().split()) for page in pdf.pages]
        self.assertEqual(len(pdf.pages[0].images),1)
        for text in ('Next steps','Reassess earlier web findings','This report supports a human review','Report reference: synthetic-followup-review','Previous check: synthetic-earlier-review','Identity not verified'):
            self.assertIn(text,result[0])
        self.assertIn('Changes & follow-up',result[1]);self.assertIn('01 / Official checks',result[2]);self.assertIn('CH No name matches',result[2])
        matches_page=next(page for page in result if '02 / Sanctions matches & review' in page)
        self.assertIn('01 SYNTHETIC FOLLOW-UP EXAMPLE',matches_page)
        for phase in report['research']['phases']:
            detail_page=next(page for page in result[1:] if phase['summary']['finding'] in page)
            self.assertIn('Next check: '+phase['summary']['nextStep'],detail_page)
    def test_brief_has_compact_counts_and_keeps_absence_separate_from_delisting(self):
        result=pages(fixture());cover=result[0];body='\n'.join(result)
        for text in ('Since the previous check','1 newly returned','1 details changed','1 not returned now','1 newly available evidence','Report reference: synthetic-followup-review'):
            self.assertIn(text,cover)
        for text in ('not confirmed new sanctions or delistings','missing now is not clearance','full evidence PDF','Earlier identity decisions are not automatically carried forward'):
            self.assertIn(text,body)
        self.assertNotIn('synthetic-changed-002',body)
    def test_full_evidence_keeps_every_record_source_and_reference(self):
        report=fixture();report['reportDetail']='full';body='\n'.join(pages(report))
        for text in ('Synthetic New Record','synthetic-new-001','Synthetic Changed Record','synthetic-changed-002','Synthetic Earlier Record','synthetic-absent-003','Synthetic Available Record','synthetic-available-004','No completed earlier check to compare.'):
            self.assertIn(text,body)
    def test_retry_receipts_keep_original_errors_and_explicit_research_date_scope(self):
        report=fixture();report['reportDetail']='full';body='\n'.join(pages(report))
        for text in ('synthetic-original-job','synthetic-retry-job','Synthetic portal timeout.','Synthetic request interrupted.','Original web research started 12 Oct 2026, 11:00','Latest source retry ended 13 Oct 2026, 15:01','AI and paid-provider checks were not rerun','Earlier web findings need reassessment'):
            self.assertIn(text,body)
        self.assertNotIn('Started 13 Oct 2026, 15:00 · Ended 13 Oct 2026, 15:01',body)
    def test_changed_query_cannot_be_presented_as_zero_changes(self):
        report=fixture();report['comparison'].update(status='different_subject_details',note='Search details changed. Review these checks separately.');body='\n'.join(pages(report))
        self.assertIn('Search details changed. Review these checks separately.',body);self.assertNotIn('1 newly returned',body)
    def test_export_does_not_mutate_evidence_or_retry_history(self):
        report=fixture();before=copy.deepcopy(report);build_pdf(report);self.assertEqual(report,before)
    def test_history_limits_refuse_silent_truncation(self):
        report=fixture();report['research']['retryHistory']*=51
        with self.assertRaisesRegex(ReportExportError,'retain every'):build_pdf(report)

if __name__=='__main__':
    if '--render-fixture' in sys.argv:
        folder=Path(__file__).resolve().parents[1]/'work'/'six-upgrades'/'report-render';folder.mkdir(parents=True,exist_ok=True);report=fixture();(folder/'fixture.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        for detail in ('brief','full'):(folder/f'followup-{detail}.pdf').write_bytes(build_pdf({**report,'reportDetail':detail}))
        (folder/'followup-photo-brief.pdf').write_bytes(build_pdf(rich_fixture()))
        print(folder)
    else:unittest.main(verbosity=2)
