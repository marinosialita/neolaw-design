"""Bounded relationship evidence. A sourced relationship never confirms identity."""
import hashlib
import json
import re
from urllib.parse import urlsplit

RELATIONS = {
    'Ownership': ('owner', 'asset', 'Ownership'),
    'Directorship': ('director', 'organization', 'Director'),
    'Membership': ('member', 'organization', 'Member'),
    'Employment': ('employee', 'employer', 'Employment'),
    'Family': ('person', 'relative', 'Family relationship'),
    'Associate': ('person', 'associate', 'Association'),
    'Representation': ('agent', 'client', 'Representation'),
}

def strings(value, limit=20):
    return [v[:1000] for v in value[:limit] if isinstance(v, str)] if isinstance(value, list) else []

def entity_details(data, requested_id, checked_at):
    from screening_opensanctions import ProviderError, public_source_urls
    if not isinstance(data, dict) or not isinstance(data.get('properties'), dict) or not isinstance(data.get('id'),str) or not re.fullmatch(r'[A-Za-z0-9._:-]{1,180}',data['id']):
        raise ProviderError('The provider relationship record could not be read.')
    if requested_id != data['id'] and requested_id not in strings(data.get('referents'), 100):
        raise ProviderError('The provider returned a different entity. Relationships were withheld.')
    records, seen, truncated = [], set(), False
    subjects = {requested_id, data['id'], *strings(data.get('referents'), 100)}
    def endpoint(value):
        if isinstance(value, str): return {'id': value, 'name': value}
        if not isinstance(value, dict): return {}
        p=value.get('properties', {})
        return {'id': str(value.get('id',''))[:180], 'name': str(value.get('caption') or next(iter(strings(p.get('name'))), '') or value.get('id',''))[:240],
                'schema': str(value.get('schema',''))[:80], 'registrationNumbers': strings(p.get('registrationNumber')),
                'countries': strings(p.get('country')), 'topics': strings(p.get('topics'))}
    def walk(node, depth=0):
        nonlocal truncated
        if not isinstance(node, dict): return
        if depth>4 or len(seen)>=250:
            truncated=True; return
        ident=node.get('id'); schema=node.get('schema'); props=node.get('properties')
        if not isinstance(props, dict): return
        if ident and ident in seen: return
        if ident: seen.add(ident)
        if schema in RELATIONS:
            left,right,label=RELATIONS[schema]
            ends=[endpoint(v) for v in (props.get(left) or [])[:10]]+[endpoint(v) for v in (props.get(right) or [])[:10]]
            # Only direct edges touching this candidate; never inherit nested risks.
            if any(v.get('id') in subjects for v in ends):
                others=[v for v in ends if v.get('id') not in subjects and v.get('name')]
                if others:
                    records.append({'id': str(ident or '')[:180], 'kind': label,
                        'from': [endpoint(v) for v in (props.get(left) or [])[:10]],
                        'to': [endpoint(v) for v in (props.get(right) or [])[:10]],
                        'related': others, 'role': strings(props.get('role')),
                        'percentage': strings(props.get('percentage')), 'startDate': strings(props.get('startDate')),
                        'endDate': strings(props.get('endDate')), 'sourceUrls': public_source_urls(props.get('sourceUrl')),
                        'datasets': strings(node.get('datasets')), 'identityStatus': 'unresolved'})
        for values in props.values():
            if isinstance(values,list):
                for value in values[:100]:
                    if isinstance(value,dict): walk(value,depth+1)
                if len(values)>100: truncated=True
    walk(data)
    return {'status':'partial' if truncated or len(records)>40 else 'completed', 'checkedAt':checked_at,
            'entityId':data['id'], 'url':'https://www.opensanctions.org/entities/'+data['id']+'/',
            'sha256':hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),
            'records':records[:40], 'truncated':truncated or len(records)>40,
            'detail':'Direct relationships supplied by OpenSanctions, not a complete registry or ownership search. Candidate identity remains unresolved.'}

def research_provider(result):
    """Explicit allowlist: passports and arbitrary nested provider fields stay out."""
    result=result or {}
    fields=('id','name','url','schema','topics','categories','positions','datasets','aliases','birthDates','countries','sourceUrls')
    return {**{k:result[k] for k in ('status','checkedAt','error','atLimit','relationshipStatus') if k in result},
            'candidates':[{**{k:c[k] for k in fields if k in c},
                           'relationships':c.get('relationships',{'status':'not_requested'})}
                          for c in result.get('candidates',[])[:10]]}

def validated_affiliations(value, citations):
    from screening_research import canonical_url, safe_url, _clean_text
    cited={canonical_url(c['url']) for c in citations}
    records=[]
    for row in value[:12] if isinstance(value,list) else []:
        if not isinstance(row,dict): continue
        urls=[safe_url(u) for u in row.get('sourceUrls',[]) if safe_url(u) and canonical_url(u) in cited] if isinstance(row.get('sourceUrls'),list) else []
        if not urls or not row.get('person') or not row.get('organization') or not row.get('role'): continue
        fields={k:_clean_text(row.get(k),n) for k,n in [('person',240),('organization',240),('role',160),('jurisdiction',100),('registrationNumber',100),('asOf',100),('whyRelevant',500),('nextStep',400)]}
        # Source type is deliberately modest: directory data is not an official check.
        fields.update(sourceUrls=list(dict.fromkeys(urls))[:4],identityStatus='unresolved',
                      evidenceType='Cited public-web affiliation', riskStatus='Not established by this relationship')
        records.append(fields)
    return records
