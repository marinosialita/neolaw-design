"""Synthetic photo-export checks: no provider or image-source requests."""
import base64
import copy
import io
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image
from pypdf import PdfReader
from screening_report import build_pdf
from screening_report_portrait import report_portrait

def fixture():
    image=io.BytesIO(); Image.new('RGB',(120,160),'#86c4cd').save(image,format='JPEG')
    photo={'status':'available','candidateId':'opensanctions:fixture','candidateName':'Untrusted name',
           'wikidataId':'Q42','sourceUrl':'https://commons.wikimedia.org/wiki/File:Fixture.jpg',
           'artist':'Synthetic QA credit','license':'CC BY 4.0','imageData':'data:image/jpeg;base64,'+base64.b64encode(image.getvalue()).decode()}
    return {'id':'synthetic-photo-export','query':{'name':'Synthetic Person','type':'person'},'createdAt':'2026-10-13T07:00:00Z',
            'matches':[],'decisions':{},'research':{'mode':'search','opensanctions':{'status':'completed','possibleMatches':1,
            'candidates':[{'id':'fixture','name':'Synthetic Person','schema':'Person','score':1,'wikidataIds':['Q42']}] }},'reportPortrait':photo}

class PhotoTests(unittest.TestCase):
    def test_brief_and_full_embed_photo_with_credit_and_no_identity_claim(self):
        for detail in ('brief','full'):
            report=fixture();report['reportDetail']=detail;before=copy.deepcopy(report)
            pdf=PdfReader(io.BytesIO(build_pdf(report))); cover=pdf.pages[0]
            self.assertEqual(len(cover.images),1)
            for text in ('Source candidate photo','Identity not verified','Synthetic QA credit','CC BY 4.0'):
                self.assertIn(text,cover.extract_text())
            self.assertTrue(any('commons.wikimedia.org/wiki/File:Fixture.jpg' in str(a.get_object()) for a in cover.get('/Annots',[])))
            self.assertEqual(report,before)
            self.assertEqual(report_portrait(report)['candidateName'],'Synthetic Person')
    def test_mismatched_candidate_qid_dismissed_or_incomplete_provider_omits_image(self):
        for mutation in ('candidate','qid','dismissed','failed','company','limited'):
            report=fixture()
            if mutation=='candidate':report['reportPortrait']['candidateId']='opensanctions:other'
            if mutation=='qid':report['reportPortrait']['wikidataId']='Q99'
            if mutation=='dismissed':report['decisions']['opensanctions:fixture']={'status':'dismissed'}
            if mutation=='failed':report['research']['opensanctions']['status']='failed'
            if mutation=='company':report['query']['type']='entity'
            if mutation=='limited':report['research']['opensanctions']['atLimit']=True
            self.assertIsNone(report_portrait(report),mutation)
    def test_unsafe_or_corrupt_images_are_omitted_without_failing_pdf(self):
        for data in ('data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,not-base64!', 'data:image/jpeg;base64,'+'A'*800_000):
            report=fixture();report['reportPortrait']['imageData']=data
            self.assertIsNone(report_portrait(report))
            cover=PdfReader(io.BytesIO(build_pdf(report))).pages[0]
            self.assertEqual(len(cover.images),0);self.assertIn('photo unavailable',cover.extract_text())
    def test_oversized_dimensions_and_untrusted_source_url_are_rejected(self):
        report=fixture();image=io.BytesIO();Image.new('RGB',(1500,1500)).save(image,format='JPEG')
        report['reportPortrait']['imageData']='data:image/jpeg;base64,'+base64.b64encode(image.getvalue()).decode()
        self.assertIsNone(report_portrait(report))
        report=fixture();report['reportPortrait']['sourceUrl']='https://commons.wikimedia.org.evil.example/wiki/File:Fixture.jpg'
        self.assertIsNone(report_portrait(report))
    def test_reports_without_photo_still_export_without_photo_warning(self):
        report=fixture();report.pop('reportPortrait')
        cover=PdfReader(io.BytesIO(build_pdf(report))).pages[0]
        self.assertEqual(len(cover.images),0);self.assertNotIn('photo unavailable',cover.extract_text())

if __name__=='__main__':unittest.main()
