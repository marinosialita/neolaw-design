"""Local, in-memory PDF export. No network, external renderer or file persistence."""
from __future__ import annotations
import datetime as dt
import io
import json
import re
import shutil
import subprocess
import threading
import unicodedata
from pathlib import Path
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo
from screening_research import OFFICIAL_PORTALS, canonical_url, safe_url
from screening_official import portals_for
from screening_comparison import comparison, identifier_values, values, words
from screening_opensanctions import category_labels
from screening_affiliation_dates import dated_affiliations

_FONT_LOCK = threading.Lock()

class ReportExportError(ValueError): pass

def case_assessment_summary(report):
    """Use the same conservative saved-evidence assessment as the browser.

    This local subprocess never accesses a provider, model, key or browser. It
    avoids accepting an old client-calculated label after evidence has changed.
    """
    log=report.get('assessmentLog')
    if log is not None and (not isinstance(log,list) or len(log)>1000):
        raise ReportExportError('This outcome history exceeds the PDF limit or cannot be read. Download evidence data to retain every recorded outcome.')
    node=shutil.which('node')
    if not node:raise ReportExportError('The local review-summary runtime is unavailable. Download evidence data or use Print / Save as PDF.')
    raw=json.dumps(report,ensure_ascii=False)
    if len(raw.encode('utf-8'))>20_000_000:raise ReportExportError('This report exceeds the review-summary PDF limit. Download evidence data to retain every record.')
    try:
        result=subprocess.run([node,str(Path(__file__).resolve().parent/'scripts'/'screening-assessment-summary.mjs')],input=raw,text=True,capture_output=True,timeout=15,check=True,cwd=Path(__file__).resolve().parent)
        return json.loads(result.stdout)
    except (OSError,subprocess.SubprocessError,ValueError) as exc:
        raise ReportExportError('The saved case-review outcome could not be safely derived. Download evidence data to retain the original history.') from exc

def match_score_label(match):
    return (match.get('matchKind') or 'Identifier match')+' (identity unconfirmed)' if match.get('identifierMatch') else str(match.get('score',''))+'% name similarity (identity unconfirmed)'


def identifier_key(value):
    return re.sub(r'[\s-]', '', unicodedata.normalize('NFKC', str(value or ''))).upper()


def passport_coverage(query, official, provider):
    """Only completed, recorded comparisons satisfy this identifier request."""
    requested = query.get('passportNumber')
    checks = [c for c in official if c.get('status') == 'completed' and
              c.get('identifierChecks', {}).get('passportNumber', {}).get('status') == 'compared'] if requested else []
    accepted = bool(requested and provider.get('status') == 'completed' and any(
        identifier_key(v) == identifier_key(requested)
        for v in values(provider.get('parsedQuery', {}).get('properties', {}).get('passportNumber'))))
    return {'requested': bool(requested), 'checked': len(checks), 'providerAccepted': accepted,
            'incomplete': bool(requested and not checks and not accepted)}


def official_candidates(report, check):
    """Read one current receipt; absent legacy arrays may use retained records."""
    count = check.get('matchCount')
    if check.get('status') != 'completed' or type(count) is not int or count < 0:
        return []
    candidates = check.get('candidates')
    if 'candidates' not in check and count > 0:
        candidates = [m for m in report.get('matches', [])
                      if m.get('record', {}).get('sourceId') == check.get('id')]
    return [m for m in candidates if isinstance(m, dict) and isinstance(m.get('record'), dict)] if isinstance(candidates, list) else []


def profile_overview(matches, procurement, provider, gleif, query, decisions):
    """One saved candidate per source for orientation, never a merged identity.

    Full candidate evidence remains in its existing report sections. Limiting
    this overview does not change those sections, saved records or decisions.
    """
    records = [(m, m.get('record', {}).get('sourceId') or 'unspecified', m.get('record', {}).get('id')) for m in matches]
    if procurement.get('status') == 'completed':
        records += [(m, 'wb', m.get('record', {}).get('id')) for m in procurement.get('candidates', [])]
    if provider.get('status') == 'completed':
        for candidate in provider.get('candidates', []):
            record = {'name': candidate.get('name'), 'aliases': candidate.get('aliases', []),
                      'type': {'Company': 'entity', 'Person': 'person'}.get(candidate.get('schema'), 'other'),
                      'countries': candidate.get('countries', []), 'datesOfBirth': candidate.get('birthDates', []),
                      'passportNumbers': candidate.get('passportNumbers', []),
                      'registrationNumbers': candidate.get('registrationNumbers', []), 'lei': candidate.get('lei'),
                      'categories': category_labels(candidate), 'sourceUrl': candidate.get('url')}
            records.append(({'record': record}, 'opensanctions', 'opensanctions:' + candidate['id'] if candidate.get('id') else None))
    if gleif.get('status') == 'completed':
        records += [(m, 'gleif', None) for m in gleif.get('candidates', [])]
    names = {'eu':'European Union', 'ofac':'United States / OFAC', 'un':'United Nations', 'uk':'United Kingdom',
             'cy':'Cyprus / Stratlink', 'bis':'US / BIS', 'au':'Australia / DFAT', 'ca':'Canada',
             'ch':'Switzerland / SECO', 'wb':'World Bank', 'opensanctions':'OpenSanctions', 'gleif':'GLEIF'}
    def short(value):
        items = [str(v) for v in values(value) if v is not None and str(v)]
        return ' / '.join(items[:2]) + (f' (+{len(items)-2} more; see evidence)' if len(items)>2 else '')
    def field(label, supplied, published, normalise=identifier_key):
        published = [v for v in values(published) if v is not None and str(v)]
        if not published:return label + ': not supplied by source'
        state = 'input not supplied' if not supplied else 'agrees' if any(normalise(v)==normalise(supplied) for v in published) else 'differs / review'
        return f'{label}: {short(published)} ({state})'
    selected, seen = [], set()
    for match, source, review_id in records:
        if source in seen:continue
        seen.add(source)
        record = match.get('record', {})
        recorded_name = match.get('nameMatched') or record.get('name') or 'Name not supplied'
        name_agrees = bool(query.get('name') and any(words(n)==words(query['name']) for n in [record.get('name'), *record.get('aliases', [])] if n))
        name_state = 'Name / alias agrees' if name_agrees else 'Name needs comparison'
        company = query.get('type') == 'entity' or (query.get('type') != 'person' and record.get('type') == 'entity')
        lines = [field('Company no.', query.get('registrationNumber'), identifier_values(record, 'registrationNumber'))] if company else [field('DOB', query.get('dob'), record.get('datesOfBirth'), lambda v: str(v).strip())]
        if company and (query.get('lei') or record.get('lei')):lines.append(field('LEI', query.get('lei'), record.get('lei')))
        if not company and (query.get('passportNumber') or identifier_values(record, 'passportNumber')):lines.append(field('Passport', query.get('passportNumber'), identifier_values(record, 'passportNumber')))
        types = {'person': 'Person', 'entity': 'Company', 'vessel': 'Vessel'}
        if query.get('type') in types and record.get('type') in types and not record.get('typeUnspecified') and query['type'] != record['type']:
            lines.insert(0, f"Entity type: {types[record['type']]} (differs / review)")
        lines.append('Jurisdiction: ' + (short(record.get('countries')) or 'not supplied by source'))
        category = 'Procurement' if source == 'wb' else 'Company reference' if source == 'gleif' else short(record.get('categories')) if source == 'opensanctions' else 'Export control' if source == 'bis' or any(re.search(r'BIS|export control', str(v), re.I) for v in record.get('programs', [])) else 'Non-SDN list' if any(re.search(r'non-SDN|CMIC', str(v), re.I) for v in record.get('programs', [])) else 'Official list'
        label = 'Reference only' if source == 'gleif' else {'confirmed':'Same identity', 'dismissed':'Different identity', 'investigate':'Further review'}.get(decisions.get(review_id, {}).get('status'), 'Not reviewed')
        selected.append({'source': names.get(source, source.upper()), 'category': category or 'Provider candidate',
                         'name': recorded_name, 'nameState': name_state, 'identifiers': '\n'.join(lines),
                         'review': label, 'url': record.get('sourceUrl')})
    return {'rows': selected[:12], 'totalRecords': len(records), 'totalSources': len(seen), 'limit': 12}

def record_review_progress(matches, procurement, provider, decisions, total_matches):
    ids=[m.get('record',{}).get('id') for m in matches]
    limited=total_matches>len(matches)
    if procurement.get('status')=='completed':
        candidates=procurement.get('candidates',[])
        ids += [m.get('record',{}).get('id') for m in candidates]
        limited |= bool(procurement.get('atLimit')) or procurement.get('totalResults',0)>len(candidates)
    if provider.get('status')=='completed':
        ids += ['opensanctions:'+c['id'] if isinstance(c.get('id'),str) and c['id'] else None for c in provider.get('candidates',[])]
        limited |= bool(provider.get('atLimit'))
    # A missing ID remains open; duplicate source IDs share one review decision.
    missing=sum(not key for key in ids)
    counts={'unreviewed':missing,'investigate':0,'confirmed':0,'dismissed':0}
    for key in {key for key in ids if key}:
        status=decisions.get(key,{}).get('status')
        counts[status if status in ('investigate','confirmed','dismissed') else 'unreviewed']+=1
    total=sum(counts.values())
    return dict(counts,total=total,open=counts['unreviewed']+counts['investigate'],limited=limited,unreviewable=missing)


def report_identity(research):
    phases = research.get('phases', [])
    values = [p['identity'] for p in phases if isinstance(p.get('identity'), dict)]
    legacy = any(p.get('text') and not p.get('identity') for p in phases)
    conflicting = any(a.get('status') == 'conflicting' or a.get('conflicts') for a in values)
    candidates = {str(a.get('candidate', '')).strip().casefold() for a in values if a.get('candidate')}
    disagree = any(a.get('status') == 'corroborated' for a in values) and (len(candidates)>1 or any(a.get('status') != 'corroborated' for a in values))
    supported = bool(values) and not legacy and not disagree and len(values) == len(phases) and all(any(p.get('id')==pid and p.get('status')=='completed' for p in phases) for pid in ('identity','media','ownership')) and all(a.get('status') == 'corroborated' and any(v.get('field') == 'dob' and v.get('value') == research.get('query', {}).get('dob') and safe_url(v.get('url')) for v in a.get('anchors', [])) for a in values)
    if conflicting:
        return 'Conflicting identifiers', 'Do not attribute candidate findings to the client while identifying details conflict.'
    if disagree:
        return 'Identity assessments disagree', 'The sections do not establish one consistent identity. Resolve candidate differences before attributing findings.'
    if supported:
        return 'Candidate identifiers corroborated', 'Cited identifiers support this candidate. Human review is still required; this is not a confirmed client identity.'
    return 'Identity unresolved', ('This earlier dossier has no structured identity review. Confident wording in individual sections is unverified.' if legacy else 'Names and affiliations alone do not confirm identity. Corroborating identifiers remain necessary.')


def source_catalog(research):
    result = {}
    for phase in research.get('phases', []):
        for kind, sources in [('search', phase.get('sources', [])), ('cited', phase.get('citations', []))]:
            for source in sources:
                key = canonical_url(source.get('url'))
                if not key:
                    continue
                value = result.setdefault(key, {'url': source['url'], 'title': source.get('title') or key, 'cited': False, 'search': False, 'phases': []})
                value[kind] = True
                if kind == 'cited' and source.get('title'):
                    value['title'] = source['title']
                    value['url'] = source['url']
                title = phase.get('title', 'Research section')
                if title not in value['phases']:
                    value['phases'].append(title)
    from urllib.parse import urlsplit
    for source in result.values():
        parts=urlsplit(source['url']); title=source['title'].strip()
        if len(title)<4 or title in (parts.hostname,parts.hostname.removeprefix('www.')):
            source['title']=parts.hostname.removeprefix('www.')+' · '+('PDF document' if parts.path.lower().endswith('.pdf') else 'Source page')
    return list(result.values())


def build_pdf(report):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, CondPageBreak, KeepTogether, HRFlowable, Image
    from screening_report_portrait import report_portrait
    with _FONT_LOCK:
        if 'NeoBody' not in pdfmetrics.getRegisteredFontNames():
            font_pairs = [('/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'),
                          ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')]
            regular, bold = next(((a, b) for a, b in font_pairs if Path(a).exists() and Path(b).exists()), (None, None))
            if regular is None:
                raise RuntimeError('A Unicode font is required to export this report. Install DejaVu Sans or use Print / Save as PDF.')
            pdfmetrics.registerFont(TTFont('NeoBody', regular))
            pdfmetrics.registerFont(TTFont('NeoBold', bold))
            pdfmetrics.registerFontFamily('NeoBody', normal='NeoBody', bold='NeoBold', italic='NeoBody', boldItalic='NeoBold')
    ink, teal, cyan, paper, muted, amber = ['#173a40', '#2b6b74', '#86c4cd', '#eef2f2', '#61777b', '#89632e']
    styles = {
        'body': ParagraphStyle('body', fontName='NeoBody', fontSize=9, leading=14.5, textColor=ink, spaceAfter=8, splitLongWords=True),
        'small': ParagraphStyle('small', fontName='NeoBody', fontSize=7.5, leading=11.5, textColor=muted, spaceAfter=5),
        'label': ParagraphStyle('label', fontName='NeoBold', fontSize=8, leading=12, textColor=teal, spaceAfter=8),
        'title': ParagraphStyle('title', fontName='NeoBold', fontSize=23, leading=27, textColor=ink, spaceAfter=8),
        'coverLabel': ParagraphStyle('coverLabel', fontName='NeoBold', fontSize=9, leading=12, textColor=teal, spaceBefore=8, spaceAfter=4, keepWithNext=True),
        'coverLabelTight': ParagraphStyle('coverLabelTight', fontName='NeoBold', fontSize=9, leading=12, textColor=teal, spaceBefore=5, spaceAfter=3, keepWithNext=True),
        'coverBody': ParagraphStyle('coverBody', fontName='NeoBody', fontSize=8, leading=11, textColor=ink, spaceAfter=4),
        'h1': ParagraphStyle('h1', fontName='NeoBold', fontSize=19, leading=25, textColor=ink, spaceBefore=16, spaceAfter=13, keepWithNext=True),
        'h2': ParagraphStyle('h2', fontName='NeoBold', fontSize=12, leading=17, textColor=teal, spaceBefore=12, spaceAfter=8, keepWithNext=True),
        'callout': ParagraphStyle('callout', fontName='NeoBold', fontSize=16, leading=22, textColor=teal, spaceAfter=8),
    }
    def clean(value):
        if isinstance(value, (list, tuple)):
            value = ' · '.join(str(v) for v in value if v)
        value = str(value or '').replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', '-')
        return ''.join(c for c in value if c in '\n\t' or ord(c) >= 32)
    def para(value, style='body', markup=False):
        text = clean(value) if markup else escape(clean(value))
        selected_style=styles[style]
        if selected_style.fontName=='NeoBold' and any(ord(c)>127 and ord(c) not in pdfmetrics.getFont('NeoBold').face.charWidths for c in text):
            selected_style=ParagraphStyle('unicode-'+style,parent=selected_style,fontName='NeoBody')
        return Paragraph(text.replace('\n', '<br/>'), selected_style)
    def date(value):
        try:
            return dt.datetime.fromisoformat(str(value).replace('Z', '+00:00')).astimezone(ZoneInfo('Asia/Nicosia')).strftime('%d %b %Y, %H:%M')
        except (ValueError, TypeError):
            return 'Not recorded'
    def hyperlink(url, label, style='small'):
        url = safe_url(url)
        return para(f'<link href="{escape(url, {chr(34): "&quot;"})}" color="{teal}">{escape(clean(label))}</link>' if url else escape(clean(label)), style, True)
    def box(items, background=paper, compact=False):
        table = Table([[item] for item in items], colWidths=[475], hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(background)), ('BOX', (0, 0), (-1, -1), .5, colors.HexColor('#d7e5e6')), ('LEFTPADDING', (0, 0), (-1, -1), 15), ('RIGHTPADDING', (0, 0), (-1, -1), 15), ('TOPPADDING', (0, 0), (-1, -1), 10), ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
        if compact:table.setStyle(TableStyle([('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
        return table
    def table(rows, widths, header=True, compact=False):
        cells = [[value if isinstance(value, Paragraph) else para(value, 'label' if header and i == 0 else 'small') for value in row] for i, row in enumerate(rows)]
        tab = Table(cells, colWidths=widths, repeatRows=1 if header else 0, hAlign='LEFT')
        tab.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('BOTTOMPADDING', (0, 0), (-1, -1), 9), ('TOPPADDING', (0, 0), (-1, -1), 9), ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9), ('LINEBELOW', (0, 0), (-1, -1), .4, colors.HexColor('#dce6e7')), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(paper))]))
        if compact: tab.setStyle(TableStyle([('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6)]))
        return tab
    def match_brief(match, query):
        why, rows, next_steps = comparison(match, query)
        return [para('Why this appeared', 'coverLabel'), para(why), table([['DETAIL','YOU SUPPLIED','SOURCE RECORD']]+rows,[110,145,220],compact=True), para('What to check next','coverLabel')] + [para('• '+step,'small') for step in next_steps]
    def cover_item(label, value):
        return para('<b>'+escape(clean(label))+'</b> - '+escape(clean(value)), 'coverBody', True)
    full_evidence = report.get('reportDetail') == 'full'
    query = report.get('query', {})
    research = report.get('research') or {}
    case_review = case_assessment_summary(report)
    case_labels = {'open':'Review open','needs_information':'Needs information','escalated':'Escalated','review_recorded':'Review recorded'}
    repeat_review = report.get('comparison') if isinstance(report.get('comparison'), dict) else None
    retry_history = [item for item in research.get('retryHistory', []) if isinstance(item, dict)] if isinstance(research.get('retryHistory'), list) else []
    change_groups = [('added', 'Newly returned'), ('changed', 'Details changed'), ('notReturned', 'Not returned now'), ('newlyAvailable', 'Newly available evidence')]
    change_records = {key: [item for item in ((repeat_review or {}).get(key) or []) if isinstance(item, dict)] for key, _ in change_groups}
    if sum(len(items) for items in change_records.values()) > 4000 or len(retry_history) > 50:
        raise ReportExportError('This follow-up history exceeds the PDF limit. Download evidence data to retain every recorded change and retry.')
    comparison_gaps = [item for item in ((repeat_review or {}).get('gaps') or []) if isinstance(item, dict)]
    comparable = repeat_review and repeat_review.get('status') in ('compared', 'running')
    change_caution = 'Changes compare saved retrievals, not confirmed new sanctions or delistings. A record missing now is not clearance. Earlier identity decisions are not automatically carried forward.'
    deep = bool(research and research.get('mode') != 'search')
    provider = research.get('opensanctions') or {}
    matches = report.get('matches', [])
    checks = research.get('officialChecks')
    if isinstance(checks, list):
        returned = [m for check in checks for m in official_candidates(report, check)]
        positions = {m.get('record', {}).get('id'): i for i, m in enumerate(matches)}
        matches = sorted(returned, key=lambda m: positions.get(m['record'].get('id'), len(positions)))
    if len(matches)>1000:
        raise ReportExportError('This result exceeds the 1,000-record PDF limit. Download evidence data to retain every record, or refine the search. No records were silently removed.')
    review_log = report.get('reviewLog') or []
    if len(review_log)>1000:
        raise ReportExportError('This review exceeds the 1,000-event PDF limit. Download evidence data to retain every decision revision. No history was silently removed.')
    decisions = report.get('decisions', {})
    def candidate_review(record_id):
        d=decisions.get(record_id,{})
        label={'confirmed':'Same identity','dismissed':'Different identity','investigate':'Needs further review'}.get(d.get('status'),'Not reviewed')
        result=[para('Reviewer identity decision: '+label)]
        if d:
            result += [para(d.get('note') or 'No reason recorded.','small'),para('Recorded '+date(d.get('at'))+' · Reviewer (entered name): '+(d.get('reviewer') or 'Not recorded'),'small')]
        return result+[para('Identity assessment only; restrictions and client acceptance require separate review.','small')]
    # The same receipts that select current candidates also own their count.
    # A retained report-level total may describe a superseded retrieval.
    total = (sum(c['matchCount'] for c in checks
                 if c.get('status') == 'completed' and type(c.get('matchCount')) is int and c['matchCount'] >= 0)
             if isinstance(checks, list) else max(len(matches), int(report.get('totalMatches', len(matches)))))
    pending = max(0, total - sum(decisions.get(m.get('record', {}).get('id'), {}).get('status') in ('confirmed', 'dismissed') for m in matches))
    snapshots = {s['id']: s for s in report.get('sourceSnapshots', []) if s.get('id')}
    def state(s):
        if s.get('status') != 'available':
            return 'Not searched'
        try:
            retrieved = dt.datetime.fromisoformat(s.get('retrievedAt', '').replace('Z', '+00:00'))
            verified = dt.datetime.fromisoformat((s.get('verifiedAt') or s.get('retrievedAt','')).replace('Z', '+00:00'))
            if retrieved>verified:return 'Invalid snapshot date'
            age = dt.datetime.now(dt.timezone.utc) - verified
            return 'Snapshot searched' if 0 <= age.total_seconds() <= 172800 else 'Invalid snapshot date' if age.total_seconds() < 0 else 'Stale snapshot'
        except (ValueError, TypeError):
            return 'Retrieval date missing'
    available = sum(state(s) == 'Snapshot searched' for i, s in snapshots.items() if i in ('eu', 'ofac', 'un', 'uk'))
    gaps = [name for i, name, _ in OFFICIAL_PORTALS[:4] if state(snapshots.get(i, {})) != 'Snapshot searched']
    identity_label, identity_note = report_identity(research) if research else ('Not confirmed', 'Only name matching was performed. No deep research or client identity decision is implied.')
    official = research.get('officialChecks') if isinstance(research.get('officialChecks'),list) else []
    official = [{**dict(id=i,name=n,url=u),**next((c for c in official if c.get('id')==i),{})} for i,n,u in portals_for(research)] if isinstance(research.get('officialChecks'),list) else []
    official = [{**c,'status':'failed','error':'The source did not return a valid result count.'} if c.get('status')=='completed' and (type(c.get('matchCount')) is not int or c['matchCount']<0) else c for c in official]
    official_done = sum(c.get('status')=='completed' for c in official)
    official_entries = sum(c['matchCount'] for c in official if c.get('status') == 'completed' and type(c.get('matchCount')) is int and c['matchCount'] >= 0)
    official_total = len(official)
    missing_phases = [label for pid, label in [('identity','Identity'),('media','Media'),('ownership','Ownership')] if deep and not any(p.get('id') == pid and p.get('status') == 'completed' for p in research.get('phases', []))]
    provider_incomplete = bool(provider) and provider.get('status') not in ('completed', 'not_configured')
    procurement=research.get('worldbank') or ({'status':'failed','error':'No World Bank result was saved. The procurement check is incomplete.'} if research.get('schemaVersion',0)>=7 else {})
    if procurement.get('status')=='completed' and (type(procurement.get('totalResults')) is not int or procurement['totalResults']<0 or not isinstance(procurement.get('candidates'),list) or procurement['totalResults']<len(procurement['candidates']) or (procurement['totalResults'] and not procurement['candidates'])):
        procurement={**procurement,'status':'failed','error':'World Bank returned incomplete match evidence. Retry the procurement check.'}
    procurement_incomplete=bool(procurement) and procurement.get('status')!='completed'
    if len(procurement.get('candidates',[]))>1000:raise ReportExportError('This result exceeds the procurement PDF record limit. Download evidence data to retain every record.')
    gleif = research.get('gleif') or {}
    gleif_incomplete = bool(gleif) and gleif.get('status') not in ('completed','not_applicable')
    if official: gaps = [c['name'] for c in official if c.get('status')!='completed']
    passport = passport_coverage(query, official, provider)
    sources = source_catalog(research)
    cited = [s for s in sources if s['cited']]
    numbers = {canonical_url(s['url']): i + 1 for i, s in enumerate(cited)}
    statuses = {'completed': 'Completed', 'partial': 'Partial evidence', 'failed': 'Could not complete', 'cancelled': 'Stopped', 'interrupted': 'Interrupted', 'running': 'In progress', 'pending': 'Not started'}
    research_status = ('Incomplete: ' + ', '.join(missing_phases)) if missing_phases else statuses.get(research.get('status'), 'Not run') if deep else 'Not run'
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, leftMargin=60, rightMargin=60, topMargin=60, bottomMargin=54, title='NeoLaw | Screening & Due Diligence', author='NeoLaw', subject='Evidence-led screening review')
    story = [Spacer(1, 3), para('PRIVATE & CONFIDENTIAL  /  OFFICE REVIEW', 'label'), Spacer(1, 6), para('Screening & due diligence', 'title')]
    detail = [('Company' if query.get('type') == 'entity' else 'Person' if query.get('type') == 'person' else 'Name screening'), query.get('country'), f"Born {query['dob']}" if query.get('dob') else None]
    if query.get('passportNumber'):detail.append('Passport '+query['passportNumber'])
    if query.get('registrationNumber'):detail.append('Company no. '+query['registrationNumber'])
    subject = [para(query.get('name', 'Unnamed subject'), 'h2'), para(' · '.join(v for v in detail if v), 'small'), para(f"Checked {date(report.get('createdAt'))} · Cyprus time", 'small')]
    portrait = report_portrait(report)
    if portrait:
        scale = min(72 / portrait['width'], 82 / portrait['height'])
        picture = Image(io.BytesIO(portrait['bytes']), width=portrait['width'] * scale, height=portrait['height'] * scale)
        picture.hAlign = 'RIGHT'
        photo_subject = subject + [para('Source candidate photo · Identity not verified', 'small'), hyperlink(portrait['sourceUrl'], portrait['artist']+' · '+portrait['license']+' · Photo source & credit')]
        subject_table = Table([[photo_subject, picture]], colWidths=[391, 84], hAlign='LEFT')
        subject_table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
        story += [subject_table]
    else:
        story += subject
        if report.get('reportPortrait'):
            story += [para('Source candidate photo unavailable in this export.', 'small')]
    story += [Spacer(1, 10)]
    headline = 'Checks incomplete' if gaps or provider_incomplete or provider.get('relationshipStatus') in ('partial','failed','cancelled') or provider.get('profileStatus') in ('partial','failed','cancelled') or gleif_incomplete or procurement_incomplete or missing_phases or passport['incomplete'] else 'Possible matches require review' if pending or official_entries or provider.get('possibleMatches') else 'Procurement matches require review' if procurement.get('totalResults') else 'Official checks completed' if official else 'Snapshot search completed'
    check_summary = f'{official_done} of {official_total} official checks completed. {official_entries} possible entries (some may overlap).' if official else f'{total} possible sanctions matches. {available} of 4 datasets searched. Cyprus portal requires a manual check.'
    executive_box = box([para('EXECUTIVE REVIEW'+(' / '+case_review['label'].upper() if case_review.get('recorded') else ''), 'label'), para(headline, 'callout'), para(check_summary+'\nA missing source or absent name match is not clearance.','coverBody')],compact=True)
    executive_box.setStyle(TableStyle([('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),3)]))
    story += [executive_box, Spacer(1, 6)]
    if repeat_review:
        story += [para('Since the previous check', 'coverLabelTight'), para(' · '.join(f'{len(change_records[key])} {label.lower()}' for key, label in change_groups) if comparable else repeat_review.get('note') or 'The earlier check could not be compared.', 'coverBody')]
    if research.get('researchNeedsRefresh'):
        story += [para('Web findings need reassessment: source checks were retried after the original web research. Read Changes & follow-up before relying on the earlier narrative.', 'small')]
    story += [table([['SANCTIONS', 'IDENTITY', 'DEEP SEARCH'], [(f'{official_entries} possible official entries\n{official_done}/{official_total} checks completed' if official else f'{total} possible matches\n{pending} unresolved'), identity_label, f'{research_status}\n{len(cited)} cited sources']], [158, 158, 159],compact=True)]
    review=record_review_progress(matches,procurement,provider,decisions,total)
    if review['total']:
        story += [para('Recorded identity review','coverLabelTight'),para(f"{review['open']} of {review['total']} source records still open. {review['unreviewed']} not started; {review['investigate']} need further review; {review['confirmed']} same identity; {review['dismissed']} different identity.",'coverBody'),para('Recorded decisions only, not client approval. GLEIF and web findings are separate.'+(' More results may exist outside this retrieved set.' if review['limited'] else '')+(' Some records lack a reviewable ID; check the original source.' if review['unreviewable'] else ''),'small')]
    if deep:
        for phase in research.get('phases', [])[:3]:
            finding=(phase.get('summary') or {}).get('finding')
            if not finding: finding=(phase.get('identity') or {}).get('reason') or 'No validated executive finding was saved. Review the detailed evidence and limitations.'
            story += [para(phase.get('title','Research'),'coverLabelTight'),para(finding[:650],'coverBody')]
    if provider and provider.get('status')!='not_configured':
        story += [cover_item('OpenSanctions',f"{provider.get('possibleMatches',0)} possible provider matches. Categories and identities require review." if provider.get('status')=='completed' else provider.get('error') or 'This additional provider check did not complete.')]
    if procurement:
        story += [cover_item('World Bank / Procurement',f"{procurement.get('totalResults',0)} possible Table 1 {'match' if procurement.get('totalResults')==1 else 'matches'}. Procurement restrictions are separate from sanctions; confirm identity and release conditions." if procurement.get('status')=='completed' else 'Procurement check incomplete. No negative result is inferred.')]
    if gleif and gleif.get('status') != 'not_applicable':
        story += [cover_item('GLEIF / Company identity',f"{gleif.get('totalResults',0)} LEI records returned. Compare registration number and jurisdiction; no client identity is automatically confirmed." if gleif.get('status')=='completed' else 'Company lookup incomplete. Identity remains unverified.')]
    if query.get('passportNumber'):
        story += [cover_item('Passport comparison',('Passport comparison incomplete. ' if passport['incomplete'] else '')+f"{passport['checked']} official datasets recorded a passport-field comparison. "+('OpenSanctions accepted the passport number. ' if passport['providerAccepted'] else 'No completed OpenSanctions passport check recorded. ')+ 'Lists without passport details remain name-only checks. This does not verify document authenticity.')]
    steps = []
    if passport['incomplete']: steps.append('Complete a supported passport-number check. The supplied passport was not compared by a completed check; name-only results cannot answer it.')
    if pending and not official_entries: steps.append(f'Compare identifiers for the {pending} unresolved sanctions matches and record a reasoned decision.')
    if gaps: steps.append('Complete or refresh: ' + ', '.join(gaps) + '.')
    if official_entries: steps.append('Review the official entries below, compare identifying details and record a decision. Cyprus may repeat records from other lists.')
    if not official: steps.append('Record the direct check of Cyprus Stratlink and any other official portal not searched.')
    steps.append(identity_note)
    if procurement_incomplete: steps.append('Complete the World Bank procurement check.')
    elif procurement.get('totalResults'): steps.append('Compare World Bank candidates and check the applicable procurement conditions in the publisher notes.')
    if missing_phases: steps.append('Complete the missing or unfinished research: ' + ', '.join(missing_phases) + '.')
    if provider_incomplete: steps.append('Complete the unfinished OpenSanctions check.')
    if provider.get('relationshipStatus') in ('partial','failed','cancelled'): steps.append('Retry the incomplete provider relationship retrieval; matching results are retained.')
    if provider.get('profileStatus') in ('partial','failed','cancelled'): steps.append('Retry the incomplete provider profile or field-level source lineage retrieval; matching results are retained.')
    if gleif_incomplete: steps.append('Complete the GLEIF company identity lookup.')
    if research.get('researchNeedsRefresh'): steps.append('Reassess earlier web findings against the retried source evidence; the source retry did not rerun AI research.')
    next_steps = [para('Next steps', 'coverLabelTight')] + [para(f'{i + 1}. {step}','coverBody') for i, step in enumerate(steps)]
    next_steps += [Spacer(1, 3), para('This report supports a human review. It is not sanctions clearance, comprehensive PEP screening, a finding of wrongdoing or an automatic client-acceptance decision.', 'small'), para(f"Report reference: {report.get('id', 'Not recorded')}" + ("\nPrevious check: "+str(report['previousReportId']) if report.get('previousReportId') else '') + f"\nPrepared {date(dt.datetime.now(dt.timezone.utc).isoformat())} · Cyprus time", 'small')]
    story += [KeepTogether(next_steps), PageBreak()]
    if case_review.get('recorded'):
        current=case_review['recorded']
        story += [para('Case review outcome','h1'),box([para(case_review['label'],'callout'),para(case_review['note'])],compact=True),Spacer(1,12)]
        story += [para(('Previous recorded outcome: ' if case_review['stale'] else 'Recorded outcome: ')+case_labels[current['status']],'coverLabel'),
                  para('Reviewer (entered name): '+current['reviewer']+' · '+date(current['at']),'small'),
                  para('Previous reason and follow-up' if case_review['stale'] else 'Reason and follow-up','h2'),para(current['reason'])]
        if case_review.get('nextReviewDate'):
            next_date=dt.date.fromisoformat(case_review['nextReviewDate']).strftime('%d %b %Y')
            story += [para('Next review: '+next_date+(' · Overdue' if case_review.get('overdue') else ' · Due today' if case_review.get('due') else ''),'coverLabel'),
                      para('Local review date only; no automatic monitoring or notification is implied.','small')]
        if case_review['gaps']:
            story += [para('Outstanding items','h2')]+[para('• '+gap['text'],'small') for gap in case_review['gaps']]
        story += [para('Scope of this review','h2')]+[para('• '+note,'small') for note in case_review['scopeNotes']]
        story += [para(case_review['auditNote'],'small')]
        log=case_review['log']
        if full_evidence:
            story += [para('Outcome history','h2'),para(f'{len(log)} saved revision{"s" if len(log)!=1 else ""}. Earlier outcomes below are historical entries, not additional current conclusions.','small')]
            for index,event in enumerate(log,1):
                story += [para(str(index)+'. '+case_labels[event['status']],'coverLabel'),para(event['reviewer']+' · '+date(event['at']),'small'),para(event['reason'])]
                if event.get('nextReviewDate'):story += [para('Next review recorded: '+dt.date.fromisoformat(event['nextReviewDate']).strftime('%d %b %Y'),'small')]
                if event['gaps']:story += [para('Outstanding when recorded: '+ ' '.join(gap['text'] for gap in event['gaps']),'small')]
                story += [para('Scope when recorded: '+' '.join(event['scopeNotes']),'small'),para('Findings and scope acknowledged: '+('Yes' if event['findingsReviewed'] else 'No')+' · Reference: '+event['id'],'small')]
        else:
            story += [para(f'Outcome history: {len(log)} saved revision{"s" if len(log)!=1 else ""}. Every saved revision is included in the full evidence PDF and evidence-data download.','small')]
        story += [PageBreak()]
    if repeat_review or retry_history or research.get('researchNeedsRefresh'):
        story += [para('Changes & follow-up', 'h1')]
        if repeat_review:
            story += [para('Compared with '+date(repeat_review.get('previousAt'))+' · Previous check: '+str(repeat_review.get('previousReportId') or report.get('previousReportId') or 'Not recorded'), 'small'), para(repeat_review.get('note') or 'Review the two saved checks together.')]
            if comparable:
                story += [table([[label.upper() for _, label in change_groups], [str(len(change_records[key])) for key, _ in change_groups]], [118, 118, 118, 121], compact=True), para(change_caution, 'small')]
                if full_evidence:
                    for key, label in change_groups:
                        if change_records[key]:
                            story += [para(label, 'h2'), table([['RECORD', 'SOURCE', 'REFERENCE']] + [[item.get('name', 'Not recorded'), item.get('source') or item.get('sourceId') or 'Not recorded', item.get('id', 'Not recorded')] for item in change_records[key]], [210, 135, 130], compact=True)]
                elif any(change_records.values()):
                    story += [para('Every affected record name, source and reference is included in the full evidence PDF and evidence JSON.', 'small')]
            if comparison_gaps:
                story += [para('Comparison gaps', 'h2')]
                for gap in comparison_gaps:
                    story += [para(str(gap.get('label') or gap.get('sourceId') or 'Source')+': '+str(gap.get('note') or 'Comparison incomplete.'), 'small')]
        source_names = {source_id: name for source_id, name, _ in OFFICIAL_PORTALS}
        source_names.update(worldbank='World Bank', gleif='GLEIF')
        if retry_history:
            story += [para('Source retry history', 'h2'), para('Only the recorded sources were requested again. Other receipts keep their original check dates; AI and paid-provider checks were not rerun.', 'small')]
            rows = [['SOURCES RETRIED', 'STARTED / ENDED', 'OUTCOME']]
            for retry in retry_history:
                rows.append([', '.join(source_names.get(source_id, source_id) for source_id in retry.get('sourceIds', [])), date(retry.get('startedAt'))+'\n'+date(retry.get('completedAt')), statuses.get(retry.get('status'), 'In progress')])
            story += [table(rows, [190, 170, 115], compact=True)]
            if full_evidence:
                for retry in retry_history:
                    story += [para('Retry '+str(retry.get('id') or 'Not recorded'), 'coverLabel'), para('Previous run: '+str(retry.get('previousJobId') or 'Not recorded'), 'small')]
                    for check in retry.get('previousChecks', []):
                        if not isinstance(check, dict): continue
                        story += [para(source_names.get(check.get('sourceId'), check.get('sourceId') or 'Source')+' - previous outcome: '+statuses.get(check.get('status'), str(check.get('status') or 'Not recorded')), 'coverBody'), para('Checked '+date(check.get('checkedAt'))+' · Retrieved '+date(check.get('retrievedAt'))+' · Verified '+date(check.get('verifiedAt')), 'small')]
                        if check.get('error'): story += [para('Recorded earlier error: '+str(check['error']), 'small')]
        if research.get('researchNeedsRefresh'):
            story += [box([para('Earlier web findings need reassessment', 'label'), para('Original research started '+date(research.get('originalStartedAt'))+'. Web findings have not been reassessed against the retried checks. Review the updated evidence before relying on that narrative.', 'small')], compact=True)]
        story += [Spacer(1, 12) if full_evidence else PageBreak()]
    if not report.get('requiresOfficial'):
        story += [para('01 / Initial snapshot coverage' if official else '01 / Official source coverage', 'h1'), para('The official portals are listed below. Imported snapshots and direct portal searches are different checks. Finding or citing a portal page does not establish that its subject search was completed.')]
        rows = [['SOURCE', 'DATASET COVERAGE', 'SNAPSHOT RETRIEVED']]
        for i, name, _ in OFFICIAL_PORTALS[:4]:
            source = snapshots.get(i, {})
            rows.append([name, state(source), date(source.get('retrievedAt'))])
        rows.append(['Cyprus · Stratlink', 'See Deep search checks below' if official else 'Manual portal check required', 'Separate from initial snapshot'])
        story += [table(rows, [140, 175, 160]), Spacer(1, 10)]
        for i, name, url in OFFICIAL_PORTALS:
            story += [hyperlink(url, f'{name} - open official portal')]
            if snapshots.get(i, {}).get('error'): story += [para(snapshots[i]['error'], 'small')]
        story += [para('Cyprus Stratlink presents EU, US and UN lists. It is shown as a requested portal, not an additional independent dataset. Source freshness is evaluated at export; the original snapshot dates remain above.', 'small')]
    if official:
        story += [para('01 / Official checks', 'h1'), para(f'{official_done}/{official_total} completed. Publisher datasets and live portal searches are labelled separately. A failed or stopped check is incomplete.')]
        check_rows=[['SOURCE','RESULT / METHOD','CHECKED / RETRIEVED']]
        for check in official:
            label=(f"{check.get('matchCount',0)} possible {'entry' if check.get('matchCount') == 1 else 'entries'}" if check.get('matchCount') else 'No name matches') if check.get('status')=='completed' else statuses.get(check.get('status'),'Not checked')
            method='Live portal search' if check.get('method')=='live_portal' else 'Official dataset search'
            check_rows.append([hyperlink(check.get('url'),check['name']),label+'\n'+method,date(check.get('checkedAt'))+'\nList: '+date(check.get('retrievedAt'))])
        story += [table(check_rows,[125,170,180],compact=not full_evidence),Spacer(1,12)]
        if not full_evidence:
            scope_notes=['Source names link to the official portals. These checks do not establish ownership/control exposure or legal applicability.']
            ids={c['id'] for c in official}
            if 'cy' in ids:scope_notes.append('Cyprus overlaps other lists and includes export controls; its underlying list freshness is not supplied.')
            if 'bis' in ids:scope_notes.append('BIS entries concern export controls, not necessarily asset freezes.')
            if 'ca' in ids:scope_notes.append('Canada covers autonomous sanctions only; verify the current regulations.')
            if 'ch' in ids:scope_notes.append('SECO delisting events are considered; unresolved listing status still needs review.')
            scope_notes.append('Full source scope, download links and saved receipt hashes remain in the full evidence PDF and JSON.')
            story += [para('Coverage limits','h2'),para(' '.join(scope_notes),'small')]
        for check in official:
            if check.get('error'): story += [para(check['name']+': '+check['error'],'small')]
            if full_evidence:
                receipt = [para(check['name']+' / Source receipt','h2')]
                if check.get('detail'):receipt += [para(check['detail'],'small')]
                if check.get('verifiedAt'):receipt += [para('Last verified: '+date(check['verifiedAt']),'small')]
                for download in check.get('downloads',[]):
                    receipt += [hyperlink(download.get('url'),'Publisher download'),para('Retrieved: '+date(download.get('retrievedAt'))+' / SHA-256: '+download.get('sha256','Not recorded'),'small')]
                if check.get('responseSha256') or check.get('sha256'):receipt += [para('Response SHA-256: '+(check.get('responseSha256') or check['sha256']),'small')]
                story += [KeepTogether(receipt)]
            for match in ([] if report.get('requiresOfficial') or check.get('status')!='completed' else check.get('candidates',[])):
                rec=match.get('record',{})
                story += [para(rec.get('name','Unnamed entry'),'h2'),para(f"{check['name']} · {rec.get('id','')} · {match_score_label(match)}",'small')]
                story += match_brief(match,query)
                for label,value in [('Matched name',match.get('nameMatched')),('Identifiers to compare',match.get('signals')),('Birth dates',rec.get('datesOfBirth')),('Countries',rec.get('countries')),('Aliases',rec.get('aliases')),('Programmes',rec.get('programs')),('Official source information',rec.get('reasons'))]:
                    if value: story += [para(label+': '+clean(value))]
                story += [hyperlink(rec.get('sourceUrl') or check['url'],'Open official source')]
            retained_count = len(official_candidates(report, check))
            if check.get('status')=='completed' and type(check.get('matchCount')) is int and check['matchCount']>retained_count:
                story += [para(f"{retained_count} of {check['matchCount']} entries retrieved. Refine the name to retrieve the rest.",'small')]
    overview = profile_overview(matches, procurement, provider, gleif, query, decisions)
    if overview['rows']:
        story += [PageBreak(),para('Source-by-source identity comparison','h1'),para('One candidate per returned source, in saved result order. These are separate source records, not a single confirmed profile.','small')]
        supplied = ['Name: '+str(query.get('name') or 'Not supplied')]
        if query.get('type')=='entity':
            supplied += ['Company no.: '+str(query.get('registrationNumber') or 'Not supplied')]
            if query.get('lei'): supplied += ['LEI: '+str(query['lei'])]
        else:
            supplied += ['DOB: '+str(query.get('dob') or 'Not supplied')]
            if query.get('passportNumber'): supplied += ['Passport: '+str(query['passportNumber'])]
        if query.get('country'): supplied += ['Country / jurisdiction: '+str(query['country'])]
        story += [para('YOU SUPPLIED','coverLabel'),para(' / '.join(supplied),'small')]
        overview_rows = [['SOURCE / TYPE','CANDIDATE NAME','PUBLISHED IDENTIFIERS','REVIEW']]
        for row in overview['rows']:
            name_cell = para(escape(clean(row['name']))+'<br/><font color="'+muted+'">'+escape(row['nameState'])+'</font>','small',True)
            overview_rows.append([row['source']+'\n'+row['category'],name_cell,row['identifiers'],row['review']])
        story += [table(overview_rows,[95,135,170,75],compact=True),para(f"Overview: {len(overview['rows'])} of {overview['totalRecords']} retrieved candidate records, covering {min(overview['totalSources'],overview['limit'])} of {overview['totalSources']} source groups. Up to two published values per field are shown; extra values are marked. Other candidates and full fields remain in the detailed evidence sections and evidence-data download. This overview does not replace those sections; check their stated retrieval and selection limits.",'small'),para('Agreement compares the supplied field with a published value; it does not confirm identity, document authenticity, ownership/control or legal applicability. Review labels are recorded reviewer decisions, not risk ratings or client approval.','small')]
    match_section_intro = []
    if matches or full_evidence:
        story += [PageBreak() if matches and (full_evidence or not overview['rows']) else Spacer(1,12)]
        match_section_intro = [para('02 / Sanctions matches & review', 'h1')]
        if not matches: story += match_section_intro
    if not matches: story += [para('No match records are included. Review the recorded check statuses; an empty result does not establish clearance.')]
    detailed_matches = matches if full_evidence else matches[:3]
    if not full_evidence and len(matches)>3: match_section_intro += [para('The three highest-ranked retrieved records are detailed below. Every retrieved official record, full source text and research notes remain available in the full evidence PDF and JSON download. This brief is a selection, not the full result set.','small')]
    for index, match in enumerate(detailed_matches):
        record = match.get('record', {}); decision = decisions.get(record.get('id'), {})
        candidate_story = [para(f"{index + 1:02d}  {record.get('name', 'Unnamed record')}", 'h2'), para(f"{record.get('sourceId', '').upper()} · {record.get('id', '')} · {match_score_label(match)}", 'small'), *match_brief(match,query)]
        for label, value in [('Matched name', match.get('nameMatched')), ('Match type', match.get('matchKind')), ('Matching signals', match.get('signals')), ('Birth dates', record.get('datesOfBirth')), ('Countries', record.get('countries')), ('Identifiers', record.get('identifiers')), ('Aliases', record.get('aliases')), ('Programmes', record.get('programs')), ('Restrictions', record.get('restrictions')), ('Licence policy',record.get('licensePolicy')), ('Federal Register notice',record.get('federalRegisterNotice')), ('Recorded end date',record.get('endedAt')), ('Addresses', record.get('addresses')), ('Source information', record.get('reasons')), ('Listed', record.get('listedAt')), ('Updated', record.get('updatedAt'))]:
            if value and (full_evidence or label not in ('Source information','Aliases','Matched name','Match type','Matching signals','Birth dates','Countries','Identifiers')): candidate_story += [para(f'{label}: {clean(value)}','small')]
        decision_label = {'confirmed': 'Same person / company', 'dismissed': 'Different person / company', 'investigate': 'Needs further review'}.get(decision.get('status'), 'No decision recorded')
        candidate_story += [para('Reviewer decision: ' + decision_label), para(decision.get('note', ''), 'small'), *([para('Recorded '+date(decision.get('at'))+' · Reviewer (entered name): '+(decision.get('reviewer') or 'Not recorded'),'small')] if decision else []), hyperlink(record.get('sourceUrl') or snapshots.get(record.get('sourceId'), {}).get('url'), 'Open source record')]
        story += [KeepTogether((match_section_intro if index == 0 else []) + candidate_story)]
    if full_evidence and matches:
        story += [PageBreak(),para('Candidate index / Official records','h1'),para('Every retrieved entry is listed here; sources may overlap. Names, scores and countries are leads, not identity decisions. Compare identifiers and the current list entry before relying on a record.','small')]
        index_rows=[['#','RECORD / ORIGINAL SOURCE','SOURCE','WHY SHOWN','REVIEW']]
        for index,match in enumerate(matches):
            rec=match.get('record',{}); decision=decisions.get(rec.get('id'),{})
            name=clean(rec.get('name','Unnamed entry'))
            # Names remain intact; links provide the original record and context.
            linked=hyperlink(rec.get('sourceUrl'),name)
            label={'confirmed':'Same identity','dismissed':'Different identity','investigate':'Further review'}.get(decision.get('status'),'To review')
            index_rows.append([str(index+1),linked,rec.get('sourceId','').upper(),match.get('matchKind') or 'Name candidate',label])
        story += [table(index_rows,[22,225,55,93,80],compact=True)]
    if total > len(matches): story += [para(f'{len(matches)} of {total} possible matches were retrieved. Refine the search to retrieve the remaining records. The brief details up to three retrieved records; all retrieved records remain in the full evidence PDF and JSON.' if not full_evidence else f'{len(matches)} of {total} possible matches are included. Refine the search to review the remaining records.')]
    # Procurement candidates detailed below already include their latest decision.
    review_matches=matches+procurement.get('candidates',[])[3:]+[{'record':{'id':'opensanctions:'+c['id'],'name':c.get('name'),'sourceId':'opensanctions'}} for c in provider.get('candidates',[]) if c.get('id')]
    reviewed = [(m,decisions.get(m.get('record',{}).get('id'),{})) for m in review_matches if decisions.get(m.get('record',{}).get('id'),{}).get('status')]
    if not full_evidence and reviewed:
        rows=[['RECORD','REVIEWER DECISION','REASON / FOLLOW-UP']]
        for m,d in reviewed:
            rows.append([m.get('record',{}).get('name','Record')+'\n'+m.get('record',{}).get('sourceId','').upper(),{'confirmed':'Same identity','dismissed':'Different identity','investigate':'Needs further review'}.get(d.get('status'),'Not recorded'),(d.get('note') or 'No reason recorded')+'\nRecorded '+date(d.get('at'))+' · Reviewer (entered name): '+(d.get('reviewer') or 'Not recorded')])
        story += [para('Recorded identity decisions','h2'),table(rows,[160,110,205],compact=True)]
    if review_log:
        if full_evidence:
            story += [para('Decision history','h2'),para(f'{len(review_log)} saved revision{"s" if len(review_log)!=1 else ""}. Names are entered manually; this device-local record is not an authenticated audit log. Earlier changes made before history was added are not reconstructed.','small')]
            for event in review_log:
                label={'confirmed':'Same identity','dismissed':'Different identity','investigate':'Needs further review'}.get(event.get('status'),'Previous decision')
                story += [para(event.get('recordName') or event.get('recordId') or 'Source record','h2'),para(label+' · '+date(event.get('at'))+' · '+(event.get('reviewer') or 'Reviewer not recorded'),'small'),para('Earlier saved decision' if event.get('kind')=='previous_saved_decision' else 'Decision saved','small'),para(event.get('note') or 'No reason recorded.')]
        else:
            story += [para(f'Review history: {len(review_log)} saved revision{"s" if len(review_log)!=1 else ""}. Every saved revision is included in the full evidence PDF and evidence-data download. Names are entered manually; this is not an authenticated audit log.','small')]
    if report.get('notes'): story += [para('Reviewer notes', 'h2'), para(report['notes'])]
    # Briefs group short supplementary outcomes instead of reserving a page
    # per failed/empty check. Candidate evidence and full receipts stay detailed.
    compact_checks = []
    def supplemental_status(result, fallback, has_candidates):
        label = statuses.get(result.get('status'), 'Not checked')
        detail = result.get('error') or result.get('detail') or fallback
        if not full_evidence and not has_candidates:
            return [para(label + '. ' + detail)]
        return [para('Status: ' + label), para(detail)]
    def append_supplemental(section, has_candidates):
        if full_evidence or has_candidates:
            story.extend([PageBreak(), *section])
        else:
            compact_checks.extend(section)
    if procurement:
        has_candidates = bool(procurement.get('candidates'))
        section = []
        section += [para('World Bank / Procurement debarment','h1' if full_evidence or has_candidates else 'coverLabel'),*supplemental_status(procurement,'Check coverage in the publisher record.',has_candidates),para('Checked '+date(procurement.get('checkedAt'))+' · Publisher refresh '+date(procurement.get('publishedAt')),'small')]
        if procurement.get('status')=='completed':
            pc=procurement.get('candidates',[])
            section += [para(f"{procurement['totalResults']} possible {'match' if procurement['totalResults']==1 else 'matches'}; {len(pc)} returned. Table 2 other sanctions and complete controlled-affiliate coverage are not included.")]
            if not pc:section += [para('No name matches in World Bank Table 1. This does not establish procurement eligibility or client clearance.')]
            if not full_evidence and len(pc)>3:
                section += [para(f'This brief details the first 3 of {len(pc)} returned procurement candidates. Every returned candidate remains in the full evidence PDF and JSON download.','small')]
            for m in (pc if full_evidence else pc[:3]):
                r=m.get('record',{})
                section += [para(r.get('name','World Bank candidate'),'h2'),*match_brief(m,query),para(r.get('debarmentStatus','Procurement record')+' · '+str(m.get('score',''))+'% name similarity; algorithmic match','small')]
                for label,value in [('Period starts',r.get('listedAt')),('Period ends / status',r.get('ineligibilityPeriod')),('Publisher notes reference',r.get('notesReference')),('Published grounds',r.get('reasons')),('Recorded address',r.get('addresses'))]:
                    if value:section += [para(label+': '+clean(value),'small')]
                section += candidate_review(r.get('id'))
                section += [para('Verify release conditions, controlled affiliates and project scope. An end date alone does not establish eligibility.','small'),hyperlink(r.get('sourceUrl'),'Open World Bank listing'),hyperlink(r.get('notesUrl'),'Publisher notes and conditions')]
            if procurement.get('atLimit'):section += [para('Result limit reached. Refine the name to retrieve remaining candidates.')]
        section += [para('Retrieved '+date(procurement.get('retrievedAt'))+' · '+str(procurement.get('recordCount','Not recorded'))+' records searched','small'),para('Response SHA-256: '+procurement.get('sha256','Not recorded'),'small')]
        append_supplemental(section, has_candidates)

    if provider and provider.get('status')!='not_configured':
        has_candidates = bool(provider.get('candidates'))
        section = []
        section += [para('OpenSanctions / Additional provider','h1' if full_evidence or has_candidates else 'coverLabel'),*supplemental_status(provider,'Provider matching completed; candidate identities require review.' if provider.get('status')=='completed' else 'No completed provider result.',has_candidates),para('Checked '+date(provider.get('checkedAt')),'small')]
        if not full_evidence and provider.get('status')=='completed' and has_candidates:
            provider_rows=[['CANDIDATE / SOURCE','CATEGORY','MATCH SCORE / IDENTIFIERS']]
            for candidate in provider.get('candidates',[])[:10]:
                provider_rows.append([hyperlink(candidate.get('url'),candidate.get('name','Candidate')),clean(category_labels(candidate)),f"{round(candidate.get('score',0)*100)}% provider match score\n"+clean(candidate.get('countries'))])
            section += [table(provider_rows,[195,130,150],compact=True),para('Compare each candidate’s legal name, identifiers and category with the subject. Resolve differences before attributing any listing. Full provider records remain in the evidence download.','small')]
        for candidate in (provider.get('candidates',[])[:10] if full_evidence else []):
            section += [para(candidate.get('name','Candidate'),'h2'),para(clean(category_labels(candidate)) or 'Provider candidate'),para(f"{round(candidate.get('score',0)*100)}% provider match score - not confirmed identity or risk",'small'),para('Datasets: '+clean(candidate.get('datasets'))),para('Birth dates: '+clean(candidate.get('birthDates'))),para('Countries: '+clean(candidate.get('countries'))),para('Passport numbers: '+(clean(candidate.get('passportNumbers')) or 'Not supplied by source')),para('Company registration numbers: '+(clean(candidate.get('registrationNumbers')) or 'Not supplied by source')),hyperlink(candidate.get('url'),'Open provider record')]
            profile=candidate.get('profile') if isinstance(candidate.get('profile'),dict) else {}
            fields=profile.get('fields') if isinstance(profile.get('fields'),list) else []
            if fields:
                section += [para('Complete provider profile','h2'),para(f"{profile.get('fieldCount',len(fields))} populated fields / {profile.get('sourceCount',0)} source datasets / {profile.get('statementCount',0)} source statements. Counts describe provider lineage, not independent corroboration.",'small')]
                for field in fields[:40]:
                    if not isinstance(field,dict):continue
                    sources=field.get('sources') if isinstance(field.get('sources'),list) else []
                    section += [para(str(field.get('label') or field.get('key') or 'Provider field'),'label'),para(clean(field.get('values')) or 'Not supplied'),para(f"{field.get('sourceCount',0)} source datasets / {field.get('statementCount',0)} statements",'small')]
                    for source in sources[:8]:
                        if isinstance(source,dict):
                            title=str(source.get('title') or source.get('dataset') or 'Provider dataset')
                            dataset=str(source.get('dataset') or '')
                            suffix=(' ('+dataset+')') if source.get('title') and dataset else ''
                            official=' / official publisher' if source.get('official') is True else ''
                            publisher=(' / '+str(source.get('publisher'))) if source.get('publisher') else ''
                            section += [hyperlink(source.get('url'),title+suffix+publisher+official)]
                    if len(sources)>8:section += [para(f"{len(sources)-8} additional field sources remain in the evidence-data export.",'small')]
                if len(fields)>40:section += [para(f"{len(fields)-40} additional provider fields remain in the evidence-data export.",'small')]
            section += candidate_review('opensanctions:'+candidate['id'] if candidate.get('id') else '')
        if full_evidence:
            for candidate in provider.get('candidates',[])[:10]:
                if candidate.get('explanations'):
                    section += [para('Provider matching signals / '+candidate.get('name','Candidate'),'h2')]
                    for signal in candidate['explanations']:
                        section += [para(signal.get('feature','').replace('_',' '),'label'),para('Query: '+(signal.get('query') or 'Not supplied')+' / Provider: '+(signal.get('candidate') or 'Not supplied'),'small'),para(signal.get('detail') or 'No explanation supplied.','small')]
            if provider.get('sha256'): section += [para('Response SHA-256 (canonical JSON): '+provider['sha256'],'small')]
        if provider.get('atLimit'):section += [para('Candidate limit reached. Refine identifiers; results may be incomplete.')]
        append_supplemental(section, has_candidates)

    affiliations=[a for phase in research.get('phases',[]) if phase.get('id')=='ownership' for a in dated_affiliations(phase)][:12]
    relation_candidates=[c for c in provider.get('candidates',[]) if c.get('relationships')]
    if affiliations or any(c['relationships'].get('records') or c['relationships'].get('status')!='completed' or full_evidence for c in relation_candidates):
        story += [PageBreak(),para('Company affiliations & relationships','h1'),para('Candidate evidence requiring review. A directorship does not establish ownership, PEP status, sanctions or identity. Public-web directory records are not a fresh official-register check.','small')]
        for affiliation in affiliations:
            story += [KeepTogether([para(affiliation.get('organization','Company affiliation'),'h2'),para(str(affiliation.get('person','Candidate'))+' - '+str(affiliation.get('role','Recorded role'))),para('Identity unconfirmed','label')])]
            story += [para(' / '.join(str(affiliation.get(k) or 'Not supplied') for k in ('jurisdiction','registrationNumber','asOf')),'small'),para(affiliation.get('whyRelevant') or 'A cited source records this affiliation.'),para('Next check: '+str(affiliation.get('nextStep') or 'Compare identity and obtain the current official filing.'))]
            for url in affiliation.get('sourceUrls',[])[:4]:story += [hyperlink(url,'Supporting affiliation source')]
        for candidate in relation_candidates[:10]:
            detail=candidate['relationships']; records=detail.get('records',[])
            if records or detail.get('status')!='completed' or full_evidence:
                story += [para('Provider relationships / '+candidate.get('name','Candidate'),'h2'),para('Retrieval: '+str(detail.get('status','unknown'))+' / '+str(len(records))+' direct relationship records. '+str(detail.get('error') or detail.get('detail') or ''),'small')]
            for r in records[:40] if full_evidence else records[:5]:
                endpoint_name=lambda x: candidate.get('name','Candidate') if x.get('id') in (candidate.get('id'),detail.get('entityId')) else x.get('name','')
                left=', '.join(endpoint_name(x) for x in r.get('from',[]));right=', '.join(endpoint_name(x) for x in r.get('to',[]))
                story += [KeepTogether([para(r.get('kind','Relationship'),'label'),para(left+' → '+right),para('Dates: '+clean(r.get('startDate'))+' / '+clean(r.get('endDate'))+'; interest: '+(clean(r.get('percentage')) or 'Not supplied'),'small')])]
                for url in r.get('sourceUrls',[])[:3]:story += [hyperlink(url,'Underlying relationship source')]
            if not full_evidence and len(records)>5: story += [para('First five direct records shown; see the full evidence export for the remainder.','small')]
            if records: story += [hyperlink(detail.get('url') or candidate.get('url'),'Open provider relationship record'),para('Confirm both parties, dates and relationship. Related-party risk does not automatically transfer to this candidate.','small')]
            if full_evidence and detail.get('sha256'):story += [para('Relationship response SHA-256: '+detail['sha256'],'small')]

    if gleif and gleif.get('status') != 'not_applicable':
        has_candidates = bool(gleif.get('candidates'))
        section = []
        section += [para('Company identity / GLEIF','h1' if full_evidence or has_candidates else 'coverLabel'),*supplemental_status(gleif,'Company identity lookup completed; identifiers require review.' if gleif.get('status')=='completed' else 'Company identity lookup incomplete.',has_candidates),para('Checked '+date(gleif.get('checkedAt'))+' · Published '+date(gleif.get('publishedAt')),'small')]
        if gleif.get('status') == 'completed':
            section += [para(f"{gleif.get('returnedCandidates',0)} of {gleif.get('totalResults',0)} records returned. Search: {gleif.get('lookup','')} · {gleif.get('lookupText','')}")]
            if not gleif.get('candidates'): section += [para('No LEI records returned. Check the company register; this is not a finding that the company does not exist or is clear.')]
            company_matches=gleif.get('candidates',[])[:50]
            # Prefer the exact supplied name/alias without asserting identity.
            from screening_comparison import words
            company_matches=sorted(company_matches,key=lambda m:not any(words(n)==words(query.get('name')) for n in [m.get('record',{}).get('name',''),*m.get('record',{}).get('aliases',[])]))
            if not full_evidence:
                rows=[['LEGAL ENTITY','LEI / REGISTRATION','JURISDICTION / STATUS']]
                for m in company_matches[:5]:
                    r=m.get('record',{})
                    rows.append([hyperlink(r.get('sourceUrl'),r.get('name','Company')),clean([r.get('lei'),r.get('registrationNumber')]),clean(r.get('countries'))+' / '+r.get('entityStatus','')+' / LEI '+r.get('leiStatus','')])
                if company_matches: section += [table(rows,[180,180,115],compact=True),para(f'{min(5,len(company_matches))} of {len(company_matches)} retrieved candidates shown in this brief. All candidates remain in the full evidence PDF and JSON.','small')]
            for match in (company_matches if full_evidence else company_matches[:1]):
                rec=match.get('record',{})
                section += [KeepTogether([para(rec.get('name','Company record'),'h2'), *match_brief(match,query)])]
                for label,value in [('Company status',rec.get('entityStatus')),('LEI registration status',rec.get('leiStatus')),('Registration authority',rec.get('registrationAuthority')),('Registered address',rec.get('addresses')),('Record updated',rec.get('updatedAt'))]:
                    if value: section += [para(label+': '+clean(value),'small')]
                section += [hyperlink(rec.get('sourceUrl'),'Open GLEIF record')]
                for link in rec.get('parentLinks',[]): section += [hyperlink(link.get('url'),link.get('kind','Parent')+' · '+link.get('relation','reference'))]
            if gleif.get('atLimit'): section += [para('Result limit reached. Refine the name or use an exact LEI. Additional records were not retrieved.')]
            section += [hyperlink(gleif.get('queryUrl'),'Original GLEIF query'),para('Response SHA-256: '+gleif.get('sha256','Not recorded'),'small')]

        append_supplemental(section, has_candidates)
    if compact_checks:
        story += [CondPageBreak(210), para('Additional checks', 'h2'), *compact_checks]
    if deep:
        story += [PageBreak(), para('Research findings' if not full_evidence else '03 / Deep search dossier', 'h1'), box([para(identity_label, 'callout'), para(identity_note)]), Spacer(1, 12), para(f"{research_status} · {len(cited)} cited sources · {sum(s['search'] and not s['cited'] for s in sources)} other search results", 'small'), para(f"Model: {research.get('model', 'Not recorded')} · Saved run reference: {research.get('id', 'Not recorded')}\n" + (f"Original web research started {date(research.get('originalStartedAt'))} · Latest source retry ended {date(research.get('completedAt'))}" if research.get('researchNeedsRefresh') else f"Started {date(research.get('startedAt'))} · Ended {date(research.get('completedAt'))}"), 'small')]
        if research.get('error'): story += [para(research['error'])]
        for phase in research.get('phases', [])[:3]:
            phase_story = [para(phase.get('title', 'Research section'), 'h1'), para(statuses.get(phase.get('status'), 'Unknown'), 'label')]
            issues = [phase.get('error')] + phase.get('warnings', [])
            for issue in dict.fromkeys(i for i in issues if isinstance(i, str) and i): phase_story += [para('Limitation: ' + issue, 'small')]
            if not full_evidence:
                summary=phase.get('summary') or {}
                phase_story += [para(summary.get('finding') or (phase.get('identity') or {}).get('reason') or 'No validated finding was recorded. This area remains unresolved.'),para('Next check: '+(summary.get('nextStep') or 'Review the source evidence and missing identifiers.'))]
                for url in summary.get('sourceUrls',[])[:4]:
                    number=numbers.get(canonical_url(url));phase_story += [hyperlink(url,f'[{number}] Supporting source' if number else 'Supporting source')]
                story += [KeepTogether(phase_story)]
                continue
            story += phase_story
            value = str(phase.get('text', ''))[:40000]
            # Provider offsets are UTF-16. Preserve substantive text, replace only citation syntax.
            encoded = value.encode('utf-16-le'); cursor = 0; pieces = []
            for citation in sorted(phase.get('citations', []), key=lambda c: c.get('start', -1)):
                start, end = citation.get('start'), citation.get('end'); number = numbers.get(canonical_url(citation.get('url')))
                if not number or type(start) is not int or type(end) is not int or not cursor <= start < end <= len(encoded)//2: continue
                covered = encoded[start*2:end*2].decode('utf-16-le', errors='replace')
                marker = bool(re.fullmatch(r'\(?\[.*?\]\(https?://\S+\)\)?|\[[^\]\n]+\]|https?://\S+|[\uE200-\uE2FF].*', covered.strip(), re.S))
                pieces += [encoded[cursor*2:start*2].decode('utf-16-le', errors='replace'), f' [{number}]' if marker else covered + f' [{number}]']; cursor = end
            pieces += [encoded[cursor*2:].decode('utf-16-le', errors='replace')]
            value = ''.join(pieces)
            value = re.sub(r'\[([^\]]+)\]\(https?://[^\s)]+\)', r'\1 (uncited link)', value)
            for line in value.splitlines():
                if not line.strip(): continue
                is_heading = re.match(r'^#{1,4}\s+', line)
                line = re.sub(r'^#{1,4}\s+', '', line)
                line = re.sub(r'\*\*([^*]+)\*\*', r'\1', line)
                story += [para(line, 'h2' if is_heading else 'body')]
            if not value.strip(): story += [para('No findings recorded. This section was not completed.', 'small')]
        story += [Spacer(1, 18), para('Cited evidence', 'h1'), para('Numbers link findings to provider-reported citations. A citation makes a claim traceable; it does not independently verify it. Other search results are excluded from this evidence list and remain in the downloadable JSON audit.', 'small')]
        if not full_evidence:
            rows=[['REF','CITED SOURCE / ORIGINAL LINK','RESEARCH AREA']]
            for index,source in enumerate(cited):
                rows.append([str(index+1),hyperlink(source['url'],source['title']), ' · '.join(source['phases'])])
            if cited: story += [table(rows,[30,305,140],compact=True)]
        else:
            for index, source in enumerate(cited):
                story += [para(f"[{index + 1}] {source['title']}", 'h2'), hyperlink(source['url'], source['url']), para('Cited in: ' + ' · '.join(source['phases']), 'small')]
    def page(canvas, document):
        canvas.saveState(); width, height = A4
        canvas.setFillColor(colors.HexColor(teal)); canvas.setFont('NeoBold', 12); canvas.drawString(60, height-31, 'NEOLAW')
        canvas.setFillColor(colors.HexColor(muted)); canvas.setFont('NeoBody', 7); canvas.drawRightString(width-60, height-29, 'SCREENING & DUE DILIGENCE')
        canvas.setStrokeColor(colors.HexColor(cyan)); canvas.setLineWidth(1); canvas.line(60, height-40, width-60, height-40)
        canvas.setFont('NeoBody', 7); canvas.drawString(60, 29, 'PRIVATE & CONFIDENTIAL  ·  Human review required'); canvas.drawRightString(width-60, 29, f'{document.page:02d}')
        canvas.restoreState()
    doc.build(story, onFirstPage=page, onLaterPages=page)
    return output.getvalue()
