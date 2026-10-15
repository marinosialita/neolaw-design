#!/usr/bin/env python3
"""Export comparison regressions. Synthetic records; no provider requests."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from screening_comparison import comparison


class ComparisonTests(unittest.TestCase):
    def test_person_query_keeps_personal_identifiers_for_a_company_candidate(self):
        query = {'name': 'Synthetic subject', 'type': 'person', 'dob': '1980-01-01', 'passportNumber': 'SYN123'}
        _, rows, next_steps = comparison({'record': {'name': query['name'], 'type': 'entity'}}, query)
        by_label = {row[0]: row[1:] for row in rows}
        self.assertEqual(by_label['Entity type'], ['Person', 'Company'])
        self.assertEqual(by_label['Date of birth'][0], query['dob'])
        self.assertEqual(by_label['Passport number'][0], query['passportNumber'])
        self.assertIn('different entity type', next_steps[0])

    def test_company_query_keeps_registration_for_a_person_candidate(self):
        query = {'name': 'Synthetic subject', 'type': 'entity', 'registrationNumber': 'SYN456'}
        _, rows, next_steps = comparison({'record': {'name': query['name'], 'type': 'person'}}, query)
        by_label = {row[0]: row[1:] for row in rows}
        self.assertEqual(by_label['Entity type'], ['Company', 'Person'])
        self.assertEqual(by_label['Registration number'][0], query['registrationNumber'])
        self.assertIn('different entity type', next_steps[0])

    def test_unknown_source_type_is_not_invented_as_a_conflict(self):
        _, rows, next_steps = comparison({'record': {'name': 'Synthetic subject', 'type': 'other', 'typeUnspecified': True}}, {'name': 'Synthetic subject', 'type': 'person'})
        self.assertNotIn('Entity type', [row[0] for row in rows])
        self.assertNotIn('different entity type', ' '.join(next_steps))

    def test_other_calendar_requires_conversion_in_export_guidance(self):
        _, rows, next_steps = comparison({'record': {'name': 'Synthetic subject', 'type': 'person', 'datesOfBirth': ['2000 (partial/other calendar)']}}, {'name': 'Synthetic subject', 'type': 'person', 'dob': '2000-01-01'})
        self.assertIn('2000 (partial/other calendar)', next(row[2] for row in rows if row[0] == 'Date of birth'))
        self.assertIn('calendar conversion', ' '.join(next_steps))


if __name__ == '__main__':
    unittest.main(verbosity=2)
