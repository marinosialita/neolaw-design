import sys,json,threading,unittest,importlib.util,io
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from screening_research import validate_query,build_payload,ResearchError,DEFAULT_MODEL
from screening_opensanctions import OpenSanctionsService
from screening_official import OfficialChecker
from screening_report import build_pdf
from pypdf import PdfReader

class IdentifierTests(unittest.TestCase):
 def test_company_number_validation_preserves_registry_formats(self):
  for invalid in ('---','...',' / ','( )','HE123,HE456'):
   with self.subTest(value=invalid),self.assertRaises(ResearchError):validate_query({'name':'Example Company','type':'entity','registrationNumber':invalid})
  for valid in ('HE 001234','HRB 12/2024','123.456.789','甲123','1',''):
   with self.subTest(value=valid):self.assertEqual(validate_query({'name':'Example Company','type':'entity','registrationNumber':valid})['registrationNumber'],valid)
 def test_passport_validation_and_type_separation(self):
  q=validate_query({'name':'Example Person','type':'all','passportNumber':' AB 001122 '});self.assertEqual(q['passportNumber'],'AB 001122');self.assertEqual(q['type'],'person')
  company=validate_query({'name':'Example Company','type':'entity','passportNumber':'AB 001122','dob':'1970-04-08','registrationNumber':'HE 12345'})
  self.assertNotIn('passportNumber',company);self.assertEqual(company['dob'],'');self.assertEqual(company['registrationNumber'],'HE 12345')
  for invalid in ('AB,CD','A'*65,'AB\n123','<ABC>','A',123):
   with self.assertRaises(ResearchError):validate_query({'name':'Example Person','passportNumber':invalid})
 def test_supplied_passport_does_not_reach_any_openai_phase(self):
  q={'name':'Example Person','type':'person','passportNumber':'AB 001122','dob':'1970-04-08'}
  for phase in ('identity','media','ownership'):
   payload=build_payload(q,phase,[{'id':'identity','status':'completed','text':'Untrusted prior passport AB-001122'}],DEFAULT_MODEL)
   self.assertNotIn('AB 001122',json.dumps(payload));self.assertNotIn('AB-001122',json.dumps(payload));self.assertNotIn('passportNumber',payload['input']);self.assertIn('1970-04-08',payload['input'])
 def test_provider_uses_documented_person_passport_and_preserves_result_fields(self):
  seen=[]
  def transport(key,payload):
   seen.append(payload);return {'responses':{'subject':{'query':payload['queries']['subject'],'results':[{'id':'synthetic','score':.9,'schema':'Person','caption':'Example Person','properties':{'passportNumber':['AB001122']}}]}}}
  result=OpenSanctionsService('mock-key',transport).check({'name':'Example Person','type':'person','passportNumber':'AB 001122'},threading.Event())
  self.assertEqual(seen[0]['queries']['subject']['properties']['passportNumber'],['AB 001122']);self.assertEqual(result['parsedQuery']['properties']['passportNumber'],['AB 001122']);self.assertEqual(result['candidates'][0]['passportNumbers'],['AB001122'])
 def test_official_parsers_keep_typed_passports_separate_from_national_ids(self):
  parser=OfficialChecker().importer
  uk=b'<Designations><Designation><UniqueID>fixture</UniqueID><Names><Name><Name6>Example Person</Name6></Name></Names><IndividualEntityShip>Individual</IndividualEntityShip><PassportNumber>AB001122</PassportNumber><NationalIdentifierNumber>XX999</NationalIdentifierNumber></Designation></Designations>'
  records,_=parser.parse_uk(uk);self.assertEqual(records[0]['passportNumbers'],['AB001122'])
  un=b'<CONSOLIDATED_LIST><INDIVIDUAL><DATAID>fixture</DATAID><FIRST_NAME>Example Person</FIRST_NAME><INDIVIDUAL_DOCUMENT><TYPE_OF_DOCUMENT>Passport</TYPE_OF_DOCUMENT><NUMBER>AB001122</NUMBER></INDIVIDUAL_DOCUMENT><INDIVIDUAL_DOCUMENT><TYPE_OF_DOCUMENT>National ID</TYPE_OF_DOCUMENT><NUMBER>XX999</NUMBER></INDIVIDUAL_DOCUMENT></INDIVIDUAL></CONSOLIDATED_LIST>'
  records,_=parser.parse_un(un);self.assertEqual(records[0]['passportNumbers'],['AB001122'])
  eu=b'<export><sanctionEntity logicalId="fixture"><subjectType code="person"/><nameAlias wholeName="Example Person"/><identification identificationTypeDescription="Passport" number="AB001122"/><identification identificationTypeDescription="National ID" number="XX999"/></sanctionEntity></export>'
  records,_=parser.parse_eu(eu);self.assertEqual(records[0]['passportNumbers'],['AB001122'])
  ofac=b'<sdnList><sdnEntry><uid>fixture</uid><lastName>Example Person</lastName><sdnType>Individual</sdnType><idList><id><idType>Passport</idType><idNumber>AB001122</idNumber></id><id><idType>National ID</idType><idNumber>XX999</idNumber></id></idList></sdnEntry></sdnList>'
  records,_=parser.parse_ofac(ofac,'sdn');self.assertEqual(records[0]['passportNumbers'],['AB001122'])
 def test_pdf_retains_supplied_and_returned_identifiers_and_the_limit(self):
  fixture={'id':'synthetic-passport','query':{'name':'Example Individual','type':'person','passportNumber':'AB 001122'},'matches':[{'identifierMatch':'passportNumber','matchKind':'Exact passport number','record':{'id':'eu:fixture','sourceId':'eu','name':'Other Name','type':'person','passportNumbers':['AB001122']}}],'research':{'mode':'search','officialChecks':[{'id':'eu','status':'completed','matchCount':1,'identifierChecks':{'passportNumber':{'status':'compared','exactMatches':1}}}]}}
  fixture['requiresOfficial']=True;fixture['createdAt']='2026-10-13T06:00:00Z'
  fixture['matches'][0]['score']=0
  fixture['research']['schemaVersion']=7
  fixture['research']['officialChecks'][0]['candidates']=fixture['matches']
  fixture['research']['officialChecks'] += [{'id':i,'status':'completed','matchCount':0,'candidates':[]} for i in ('ofac','un','uk','cy','bis','au','ca','ch')]
  pdf=build_pdf(fixture);text='\n'.join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)
  for phrase in ('AB 001122','AB001122','Passport comparison','document authenticity','Passport number'):self.assertIn(phrase,text)
  (ROOT/'work/passport-fields/identifier-fixture.pdf').write_bytes(pdf)
  company={'query':{'name':'Example Company','type':'entity','registrationNumber':'HE 001122'}}
  self.assertIn('Company no. HE 001122','\n'.join(p.extract_text() for p in PdfReader(io.BytesIO(build_pdf(company))).pages))

if __name__=='__main__':unittest.main(verbosity=2)
