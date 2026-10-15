"""Compact OpenSanctions entity facts and field-level source lineage.

The matching endpoint ranks candidates.  The entity endpoint supplies the full
profile, while the statements endpoint is the authoritative lineage for each
property.  This module keeps those concepts separate so a source count can
never be mistaken for corroboration or a confirmed identity.
"""
import re


FIELD_LABELS = {
    'topics': 'Topics',
    'name': 'Names',
    'alias': 'Aliases',
    'weakAlias': 'Weak aliases',
    'previousName': 'Previous names',
    'title': 'Title',
    'firstName': 'First name',
    'middleName': 'Middle name',
    'fatherName': 'Patronymic / father name',
    'lastName': 'Last name',
    'birthDate': 'Date of birth',
    'birthPlace': 'Place of birth',
    'birthCountry': 'Country of birth',
    'gender': 'Gender',
    'citizenship': 'Citizenship',
    'nationality': 'Nationality',
    'country': 'Country',
    'passportNumber': 'Passport number',
    'idNumber': 'National identifier',
    'taxNumber': 'Tax number',
    'uniqueEntityId': 'Unique entity ID',
    'registrationNumber': 'Registration number',
    'leiCode': 'LEI',
    'classification': 'Classification',
    'position': 'Positions / roles',
    'political': 'Political association',
    'education': 'Education',
    'religion': 'Religion',
    'ethnicity': 'Ethnicity',
    'address': 'Addresses',
    'website': 'Websites',
    'email': 'Email addresses',
    'phone': 'Phone numbers',
    'notes': 'Descriptions',
    'summary': 'Summary',
    'programId': 'Programs',
    'sourceUrl': 'Source links',
    'wikidataId': 'Wikidata ID',
    'wikipediaUrl': 'Wikipedia articles',
}

FIELD_ORDER = tuple(FIELD_LABELS)
FIELD_RANK = {key: index for index, key in enumerate(FIELD_ORDER)}
EXCLUDED = {
    # Technical/search metadata is retained elsewhere in the receipt.  Nested
    # graph properties are rendered by the relationship reader.
    'indexText', 'createdAt', 'modifiedAt', 'retrievedAt',
}


def _strings(value, limit=100, width=4000):
    if not isinstance(value, list):
        return []
    output = []
    for item in value:
        if len(output) >= limit:
            break
        if not isinstance(item, str):
            continue
        item = item.strip()
        if item and item not in output:
            output.append(item[:width])
    return output


def _label(key):
    if key in FIELD_LABELS:
        return FIELD_LABELS[key]
    words = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', ' ', key).replace('_', ' ').strip()
    return words[:1].upper() + words[1:] if words else key


def _dataset_url(dataset):
    if not isinstance(dataset, str) or not re.fullmatch(r'[a-z0-9_:-]{1,160}', dataset):
        return ''
    return 'https://www.opensanctions.org/datasets/' + dataset + '/'


def _lineage(statements, entity_id, catalog=None):
    """Return compact per-property lineage; never infer a missing source."""
    if not isinstance(statements, dict) or not isinstance(statements.get('results'), list):
        return {}, {'valid': False, 'total': 0, 'returned': 0, 'truncated': False}
    results = statements['results']
    total_spec = statements.get('total')
    total = total_spec.get('value') if isinstance(total_spec, dict) else total_spec
    if type(total) is not int or total < 0:
        total = len(results)
    grouped = {}
    for row in results:
        if not isinstance(row, dict) or row.get('canonical_id') != entity_id:
            continue
        prop, dataset = row.get('prop'), row.get('dataset')
        if not isinstance(prop, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,119}', prop):
            continue
        if not isinstance(dataset, str) or not re.fullmatch(r'[a-z0-9_:-]{1,160}', dataset):
            continue
        value = row.get('original_value') or row.get('value')
        if not isinstance(value, str) or not value.strip():
            value = ''
        item = grouped.setdefault(prop, {'statementCount': 0, 'datasets': {}})
        item['statementCount'] += 1
        catalog_item = catalog.get(dataset, {}) if isinstance(catalog, dict) else {}
        source = item['datasets'].setdefault(dataset, {
            'dataset': dataset,
            'title': str(catalog_item.get('title', ''))[:300],
            'publisher': str(catalog_item.get('publisher', ''))[:300],
            'official': catalog_item.get('official') if type(catalog_item.get('official')) is bool else None,
            'url': _dataset_url(dataset),
            'statementCount': 0,
            'values': [],
            'firstSeen': '',
            'lastSeen': '',
        })
        source['statementCount'] += 1
        if value and value[:600] not in source['values'] and len(source['values']) < 8:
            source['values'].append(value[:600])
        first_seen, last_seen = row.get('first_seen'), row.get('last_seen')
        if isinstance(first_seen, str) and (not source['firstSeen'] or first_seen < source['firstSeen']):
            source['firstSeen'] = first_seen[:40]
        if isinstance(last_seen, str) and last_seen > source['lastSeen']:
            source['lastSeen'] = last_seen[:40]
    return grouped, {'valid': True, 'total': total, 'returned': len(results), 'truncated': total > len(results)}


def entity_profile(entity, statements=None, checked_at='', catalog=None):
    """Build a bounded profile without discarding meaningful scalar properties."""
    if not isinstance(entity, dict) or not isinstance(entity.get('properties'), dict):
        raise ValueError('The provider entity profile could not be read.')
    entity_id = entity.get('id')
    if not isinstance(entity_id, str) or not re.fullmatch(r'[A-Za-z0-9._:-]{1,180}', entity_id):
        raise ValueError('The provider entity profile has an invalid reference.')
    lineage, coverage = _lineage(statements, entity_id, catalog)
    properties = entity['properties']
    keys = []
    for key, value in properties.items():
        if key in EXCLUDED or not isinstance(key, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,119}', key):
            continue
        if _strings(value):
            keys.append(key)
    keys.sort(key=lambda key: (FIELD_RANK.get(key, len(FIELD_RANK)), _label(key).casefold()))
    fields = []
    remaining_characters = 500_000
    for key in keys[:80]:
        raw = properties.get(key)
        all_values = _strings(raw, limit=200, width=4000)
        values = []
        for value in all_values:
            if remaining_characters <= 0:
                break
            value = value[:remaining_characters]
            if not value:
                break
            values.append(value);remaining_characters -= len(value)
        total_values = len([value for value in raw if isinstance(value,str) and value.strip()]) if isinstance(raw,list) else 0
        evidence = lineage.get(key, {})
        sources = sorted(evidence.get('datasets', {}).values(), key=lambda item: (-item['statementCount'], item['dataset']))
        fields.append({
            'key': key,
            'label': _label(key),
            'values': values,
            'valueCount': total_values,
            'valuesTruncated': len(values) < total_values,
            'statementCount': int(evidence.get('statementCount', 0)),
            'sourceCount': len(sources),
            'sources': sources[:40],
            'sourcesTruncated': len(sources) > 40,
        })
    all_datasets = sorted({source['dataset'] for field in fields for source in field['sources']})
    truncated = coverage['truncated'] or len(keys) > 80 or any(field['sourcesTruncated'] or field['valuesTruncated'] for field in fields)
    status = 'completed' if coverage['valid'] and not truncated else 'partial' if coverage['valid'] else 'summary'
    return {
        'status': status,
        'checkedAt': checked_at,
        'entityId': entity_id,
        'schema': str(entity.get('schema', ''))[:80],
        'fieldCount': len(fields),
        'statementCount': coverage['total'] if coverage['valid'] else 0,
        'returnedStatements': coverage['returned'],
        'sourceCount': len(all_datasets),
        'datasets': all_datasets,
        'fields': fields,
        'truncated': truncated,
        'detail': ('Complete field-level lineage was retrieved.' if status == 'completed'
                   else 'Some field-level lineage was truncated.' if coverage['valid']
                   else 'Profile facts were returned, but field-level source lineage was not retrieved.'),
    }
