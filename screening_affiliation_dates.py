"""Conservative presentation gate for AI-extracted affiliation dates.

Agreement with a cited passage is required, but is not source verification.
Original research remains in the evidence export for audit.
"""
import re

MONTHS = 'january february march april may june july august september october november december'.split()
UNKNOWN = 'Source date not established in the cited passage'

def date_tokens(text):
    text=str(text or '').lower(); result=set()
    for y,m,d in re.findall(r'\b(\d{4})-(\d{2})-(\d{2})\b',text):result.add(f'{y}-{m}-{d}')
    months='|'.join(MONTHS)
    for d,m,y in re.findall(r'\b(\d{1,2}) ('+months+r') (\d{4})\b',text):result.add(f'{y}-{MONTHS.index(m)+1:02}-{int(d):02}')
    for m,d,y in re.findall(r'\b('+months+r') (\d{1,2}),? (\d{4})\b',text):result.add(f'{y}-{MONTHS.index(m)+1:02}-{int(d):02}')
    return result

def affiliation_date(row, phase):
    from screening_research import canonical_url
    dates=date_tokens(row.get('asOf')); text=phase.get('text') or ''
    urls={canonical_url(u) for u in row.get('sourceUrls',[]) if isinstance(u,str)}
    for citation in phase.get('citations',[]):
        if canonical_url(citation.get('url','')) not in urls:continue
        pos=citation.get('start')
        if not isinstance(pos,int) or not 0<=pos<len(text):continue
        start=text.rfind('\n',0,pos)+1; end=text.find('\n',pos)
        passage=text[start:end if end>=0 else len(text)]
        if dates and dates<=date_tokens(passage):return str(row['asOf'])
    return UNKNOWN

def dated_affiliations(phase):
    return [{**a,'asOf':affiliation_date(a,phase)} for a in phase.get('affiliations',[])]
