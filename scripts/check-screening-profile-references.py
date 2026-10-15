#!/usr/bin/env python3
"""Candidate reference parsing only; no provider keys or network requests."""
import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from screening_opensanctions import parse_match

def candidate(properties):
    data={'responses':{'subject':{'query':{},'results':[{'id':'source-fixture','schema':'Person','caption':'Source fixture','score':.8,'properties':properties}]}}}
    return parse_match(data)['candidates'][0]

class ProfileReferences(unittest.TestCase):
    def test_documented_links_are_preserved_without_guessing(self):
        c=candidate({'wikidataId':['Q7747','Q7747'],'wikipediaUrl':['https://en.wikipedia.org/wiki/Fixture'],'sourceUrl':['https://publisher.example/profile']})
        self.assertEqual(c['wikidataIds'],['Q7747'])
        self.assertEqual(c['wikipediaUrls'],['https://en.wikipedia.org/wiki/Fixture'])
        self.assertEqual(c['sourceUrls'],['https://publisher.example/profile'])
        self.assertNotIn('image',c)
    def test_invalid_references_are_dropped(self):
        c=candidate({'wikidataId':['Q0','Q1&search=subject',1,None],'wikipediaUrl':['https://wikipedia.org.evil.example/name','http://en.wikipedia.org/wiki/name','https://a@en.wikipedia.org/wiki/name'],'sourceUrl':['javascript:alert(1)','https://user:pass@example.org/a','https://example.org:invalid/a','https://example.org\n/a']})
        self.assertEqual(c['wikidataIds'],[]);self.assertEqual(c['wikipediaUrls'],[]);self.assertEqual(c['sourceUrls'],[])
    def test_absent_profile_fields_remain_absent(self):
        c=candidate({});self.assertEqual(c['wikidataIds'],[]);self.assertEqual(c['wikipediaUrls'],[])

if __name__=='__main__':unittest.main(verbosity=2)
