"""Official parser contracts and delisting safeguards. No network or paid APIs."""
import io,importlib.util,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from screening_official import portals_for,initial_checks
spec=importlib.util.spec_from_file_location('imp',Path(__file__).with_name('refresh-screening-data.py'));imp=importlib.util.module_from_spec(spec);spec.loader.exec_module(imp)
parsers=imp.extra_parsers(vars(imp))
def swiss(events,ssid='1',names=None):
 return f'''<swiss-sanctions-list list-type="whole-list" date="2026-10-01"><sanctions-program><program-name lang="eng">Test ordinance</program-name><sanctions-set ssid="10" lang="eng">Financial sanctions</sanctions-set></sanctions-program><target ssid="{ssid}"><sanctions-set-id>10</sanctions-set-id><individual><identity main="true">{names or '<name name-type="primary-name"><name-part order="1"><value>Example Person</value></name-part></name>'}<nationality><country>France</country></nationality></identity></individual>{''.join('<modification modification-type="'+kind+'"'+(' effective-date="'+date+'"' if date else '')+'/>' for kind,date in events)}</target></swiss-sanctions-list>'''.encode()
class OfficialSources(unittest.TestCase):
 def test_historic_scopes_remain_five_six_and_nine(self):
  self.assertEqual([len(portals_for({'schemaVersion':v})) for v in (4,5,6)],[5,6,9]);self.assertEqual(len(initial_checks()),9)
 def test_canadian_regime_is_not_nationality_and_legal_id_is_stable(self):
  data=b'<data-set><record><Country-Pays>Russia / Russie</Country-Pays><GivenName-Prenom>Jane</GivenName-Prenom><LastName-NomDeFamille>Example</LastName-NomDeFamille><Schedule-Annexe>1</Schedule-Annexe><Item-NumeroDarticle>25</Item-NumeroDarticle><DateOfListing-DateDinscription>2024-01-01</DateOfListing-DateDinscription></record></data-set>'
  rs,p=parsers['ca'](data);self.assertEqual(rs[0]['countries'],[]);self.assertEqual(rs[0]['programs'],['Russia / Russie']);self.assertEqual(p,'');self.assertEqual(rs[0]['name'],'Jane Example')
  self.assertEqual(rs[0]['id'],parsers['ca'](data.replace(b'Jane',b'Janet'))[0][0]['id'])
  with self.assertRaises(ValueError):parsers['ca'](data.replace(b'<Item-NumeroDarticle>25</Item-NumeroDarticle>',b''))
 def test_canadian_ship_build_date_is_not_birth_date(self):
  rs,_=parsers['ca'](b'<data-set><record><Country-Pays>Russia</Country-Pays><EntityOrShip-EntiteOuNavire>Example ship</EntityOrShip-EntiteOuNavire><ShipIMONumber-NumeroOMIDuNavire>1234567</ShipIMONumber-NumeroOMIDuNavire><Item-NumeroDarticle>1</Item-NumeroDarticle><DateOfBirthOrShipBuildDate-DateDeNaissanceOuDateDeConstructionDuNavire>1990</DateOfBirthOrShipBuildDate-DateDeNaissanceOuDateDeConstructionDuNavire></record></data-set>');self.assertEqual(rs[0]['type'],'vessel');self.assertEqual(rs[0]['datesOfBirth'],[])
 def test_delisting_uses_effective_dates_not_first_xml_event(self):
  rs,_=parsers['ch'](swiss([('amended','2025-06-03'),('de-listed','2025-06-20'),('listed','')]));self.assertEqual(rs,[])
 def test_relisting_and_future_delisting(self):
  for events in ([('listed','2025-02-01'),('de-listed','2024-02-01')],[('de-listed','2099-01-01'),('listed','2020-01-01')]):
   rs,_=parsers['ch'](swiss(events));self.assertEqual(len(rs),1);self.assertNotIn('listingStatus',rs[0])
 def test_same_day_listing_delisting_is_unresolved_not_active(self):
  rs,_=parsers['ch'](swiss([('de-listed','2025-06-03'),('listed','2025-06-03')]));self.assertEqual(len(rs),1);self.assertIn('Unresolved',rs[0]['listingStatus']);self.assertIn('active designation is not established',rs[0]['listingStatusNote'])
 def test_swiss_variants_and_weak_aliases_are_retained(self):
  name='<name name-type="primary-name" quality="poor"><name-part order="1"><value>Petrov</value><spelling-variant>Petroff</spelling-variant></name-part><name-part order="2"><value>Ivan</value><spelling-variant>Iwan</spelling-variant></name-part></name>'
  rs,_=parsers['ch'](swiss([('listed','2020-01-01')],names=name));self.assertEqual(set(rs[0]['aliases']),{'Petroff Ivan','Petrov Iwan','Petroff Iwan'});self.assertIn('Petroff Iwan',rs[0]['weakAliases'])
 def test_swiss_delta_unknown_and_undated_delisting_fail(self):
  for data in (swiss([('listed','2020-01-01')]).replace(b'whole-list',b'delta'),swiss([('de-listed','')]),swiss([('mystery','2020-01-01')])):
   with self.assertRaises(ValueError):parsers['ch'](data)
 def test_australian_aliases_collapse_to_primary_and_measure_flags_preserved(self):
  import openpyxl
  w=openpyxl.Workbook();s=w.active;s.title='Consolidated List - 7_10_2026';headers=['Reference','Name of Individual or Entity','Type','Name Type','Alias Strength','Date of Birth','Citizenship','Address','Additional Information','Listing Information','IMO Number','Committees','Control Date','Instrument of Designation','Targeted Financial Sanction','Travel Ban','Arms Embargo','Maritime Restriction'];s.append(headers)
  for ref,name,kind,strength in [(10,'Jane Example','Primary Name',None),('10a','Janet Example','Alias','Weak')]:s.append([ref,name,'Individual',kind,strength,'1980-01-01','France','','','','','Example regime','','Example instrument',True,False,False,False])
  b=io.BytesIO();w.save(b);rs,p=parsers['au'](b.getvalue());self.assertEqual(len(rs),1);self.assertEqual(rs[0]['aliases'],['Janet Example']);self.assertEqual(rs[0]['weakAliases'],['Janet Example']);self.assertEqual(rs[0]['restrictions'],'Targeted Financial Sanction');self.assertEqual(p,'2026-10-07')
  s.cell(3,1,'99a');b=io.BytesIO();w.save(b)
  with self.assertRaises(ValueError):parsers['au'](b.getvalue())
if __name__=='__main__':unittest.main(verbosity=2)
