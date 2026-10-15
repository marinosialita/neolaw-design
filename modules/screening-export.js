import {screeningInputIssue} from './screening-input.js';
import {providerRecordId,reviewLabels,reviewProgressText} from './screening-review.js';
import {assessmentSummary,assessmentLabels} from './screening-assessment.js';
import {procurementResult} from './screening-procurement.js';
import {explainMatch,rankedCompanyCandidates,restoreReturnedMatches,matchesForOfficialCheck} from './screening-match.js';
// PDF rendering stays local. Optional public candidate photos are embedded with credit.
import {reportPortrait} from './screening-profile-portrait.js';
import {sourceCounts, identitySummary, citationLabel, officialSummary, executiveSummary} from './research-evidence.js';
import {providerCategories} from './screening-provider.js';
import {coverage,sourceState} from './screening-view-model.js';
const BRAND = {ink:'#173a40',teal:'#2b6b74',cyan:'#86c4cd',paper:'#eef2f2',muted:'#5b7276',line:'#d9e4e5',amber:'#8b5d23'};
const SCOPE = 'Official source screening; see the recorded checks and methods. This report is not a live clearance, a PEP check, an adverse-media search or an ownership assessment.';
const RESEARCH_SCOPE = 'Sanctions-list snapshots and public-web research are separate checks. Read each research stage and its cited evidence; an incomplete stage is not a completed check. Public-role information is not comprehensive licensed PEP screening. This report is not a live clearance or an automatic client-acceptance decision.';
const researchLabels = {running:'Research in progress',completed:'Research completed',partial:'Research partially completed',failed:'Research failed',cancelled:'Research cancelled',interrupted:'Research interrupted'};
const phaseLabels = {pending:'Not started',queued:'Not started',running:'In progress',completed:'Completed',partial:'Partially completed',failed:'Failed',cancelled:'Cancelled',interrupted:'Interrupted',skipped:'Not performed'};
const labels = {confirmed:'Same person / entity',dismissed:'Different person / entity',investigate:'Needs investigation'};
const text = value => value == null ? '' : String(value);
const escapeHTML = value => text(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const list = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
const present = value => typeof value === 'object' && value !== null ? Object.entries(value).filter(([,v])=>v != null && v !== '').map(([key,v])=>`${key}: ${list(v).map(text).join(', ')}`).join(' · ') : text(value);
const joined = value => list(value).map(present).filter(Boolean).join(' · ');
const safeURL = value => {try {const url = new URL(text(value));return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';}catch{return '';}};
const link = (url,label) => {const href=safeURL(url);return href ? `<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label||href)}</a>` : '<span class="muted">Source link unavailable</span>';};
function date(value) {
  if (!value) return 'Not recorded';
  const d = new Date(value);if(!Number.isFinite(d.getTime()))return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',...( /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? {} : {timeStyle:'short'}),timeZone:'Asia/Nicosia'}).format(d);
}
function describe(report = {}) {
  const matches=list(report.matches).filter(match=>match?.record);
  const recordedSources=list(report.sourceSnapshots).filter(Boolean);
  const requiredSources=coverage(recordedSources).sources;
  const sources=[...requiredSources,...recordedSources.filter(source=>!requiredSources.some(required=>required.id===source.id))];
  const evaluatedAt=Date.now();
  const states=new Map(sources.map(source=>[source.id,sourceState(source,evaluatedAt)]));
  const ready=sources.filter(source=>states.get(source.id).ready);
  const total = Number.isSafeInteger(report.totalMatches) && report.totalMatches >= matches.length ? report.totalMatches : matches.length;
  const decisions=report.decisions||{};
  const reviewed=matches.filter(match=>labels[decisions[match.record.id]?.status]).length;
  const unresolved=matches.filter(match=>!labels[decisions[match.record.id]?.status]||decisions[match.record.id]?.status==='investigate').length;
  const pendingTotal=Math.max(0,total-(matches.length-unresolved));
  const incomplete = sources.some(source=>!states.get(source.id).ready);
  return {report,matches,sources,recordedSources,states,ready,total,decisions,reviewed,unresolved,pendingTotal,incomplete,evaluatedAt};
}
const count = (n,singular,plural=singular+'s') => `${n} ${n===1?singular:plural}`;
function outcome(data) {
  const issue=screeningInputIssue(data.report.query);if(issue)return issue.title;
  const official=officialSummary(data.report.research);
  if(official)return official.entries?'Possible official matches require review':official.incomplete?'Official checks incomplete':'No name matches in completed official checks';
  if(data.incomplete)return 'Coverage incomplete';
  return data.total ? (data.pendingTotal ? 'Potential matches require review' : 'Review recorded') : 'No matches in the snapshots checked';
}
function filename(report, extension) {
  const name=text(report?.query?.name||'report').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,'-').replace(/[.\s]+$/g,'').trim().slice(0,90)||'report';
  return `NeoLaw-screening-${name}.${extension}`;
}
function downloadBlob(blob,name) {
  let url,anchor;
  try {
    url=URL.createObjectURL(blob);anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.hidden=true;
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);return true;
  } catch {anchor?.remove();if(url)URL.revokeObjectURL(url);return false;}
}
function row(label,value) {return value ? `<div class="detail"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>` : '';}
function researchData(report) {
  const research=report.research;
  if(!research || research.mode==='search' || typeof research!=='object' || Array.isArray(research))return null;
  const phases=list(research.phases).filter(phase=>phase&&typeof phase==='object');
  const counts=sourceCounts(research);
  const cited=new Map(counts.all.filter(s=>s.cited).map(s=>[s.key,s])),searched=new Map(counts.all.filter(s=>s.searched).map(s=>[s.key,s]));
  return {research,phases,cited,searched,completed:phases.filter(phase=>phase.status==='completed').length,label:research.status==='completed'&&!['identity','media','ownership'].every(id=>phases.some(p=>p.id===id&&p.status==='completed'))?'Research incomplete':researchLabels[research.status]||'Research status not recorded'};
}
function comparisonHTML(match,query){
 const info=explainMatch(match,query);
 return `<h4>Why this appeared</h4><p>${escapeHTML(info.why)}</p><table><thead><tr><th>Detail</th><th>You supplied</th><th>Source record</th></tr></thead><tbody>${info.comparisons.map(c=>`<tr><td>${escapeHTML(c.label)}</td><td>${escapeHTML(c.input)}</td><td>${escapeHTML(c.source)}</td></tr>`).join('')}</tbody></table><h4>What to check next</h4><ul>${info.next.map(v=>`<li>${escapeHTML(v)}</li>`).join('')}</ul>`;
}
function companyHTML(job){
 const result=job?.gleif;if(!result||result.status==='not_applicable')return '';
 return `<section><h2>GLEIF · Company identity</h2><p>${escapeHTML(result.status)} · ${escapeHTML(result.error||result.detail||'Lookup incomplete')}</p>${result.status==='completed'?`<p>${result.returnedCandidates} of ${result.totalResults} records retrieved${result.atLimit?' · Result limit reached':''}.</p>${rankedCompanyCandidates(result,job.query).map(m=>`<article class="match"><h3>${escapeHTML(m.record.name)}</h3>${comparisonHTML(m,job.query)}<p>Company status: ${escapeHTML(m.record.entityStatus)} · LEI registration: ${escapeHTML(m.record.leiStatus)}</p>${link(m.record.sourceUrl,'Open GLEIF record')}</article>`).join('')}`:''}</section>`;
}
function reportScope(report) {return researchData(report)?RESEARCH_SCOPE:SCOPE;}
function reviewUpdatesHTML(report) {
  const comparison=report.comparison,job=report.research||{},retries=list(job.retryHistory).filter(v=>v&&typeof v==='object');
  if(!comparison&&!retries.length&&!job.researchNeedsRefresh)return '';
  const groups=[['added','Newly returned records'],['changed','Records with changed details'],['notReturned','Not returned now'],['newlyAvailable','Newly available evidence']];
  const sourceName=id=>list(job.officialChecks).find(c=>c.id===id)?.name||({worldbank:'World Bank',gleif:'GLEIF'})[id]||id;
  const comparable=comparison&&['compared','running'].includes(comparison.status);
  const caution='Changes compare saved retrievals, not confirmed new sanctions or delistings. A record missing now is not clearance. Earlier identity decisions are not automatically carried forward.';
  return `<section class="review-updates"><h2>Changes & follow-up</h2>${comparison?`<h3>Since the previous check</h3><p class="meta">Previous check: ${escapeHTML(date(comparison.previousAt))} · ${escapeHTML(comparison.previousReportId||report.previousReportId||'Not recorded')}</p><p>${escapeHTML(comparison.note||'Review the two saved checks together.')}</p>${comparable?`<table><thead><tr>${groups.map(([,title])=>`<th>${title}</th>`).join('')}</tr></thead><tbody><tr>${groups.map(([key])=>`<td>${list(comparison[key]).length}</td>`).join('')}</tr></tbody></table><p>${caution}</p>${groups.filter(([key])=>list(comparison[key]).length).map(([key,title])=>`<h4>${title}</h4><table><thead><tr><th>Record</th><th>Source</th><th>Reference</th></tr></thead><tbody>${list(comparison[key]).map(item=>`<tr><td>${escapeHTML(item.name)}</td><td>${escapeHTML(item.source||item.sourceId)}</td><td>${escapeHTML(item.id)}</td></tr>`).join('')}</tbody></table>`).join('')}`:''}${list(comparison.gaps).length?`<h4>Comparison gaps</h4><ul>${list(comparison.gaps).map(gap=>`<li>${escapeHTML(gap.label||gap.sourceId)}: ${escapeHTML(gap.note)}</li>`).join('')}</ul>`:''}`:''}${retries.length?`<h3>Source retry history</h3><p>Only the recorded sources were requested again. Other source receipts retain their original dates; AI and paid-provider checks were not rerun.</p>${retries.map(retry=>`<article class="review-note"><p><strong>${escapeHTML(list(retry.sourceIds).map(sourceName).join(', ')||'Sources not recorded')}</strong> · ${escapeHTML(phaseLabels[retry.status]||retry.status||'In progress')}</p><p class="meta">Started ${escapeHTML(date(retry.startedAt))} · Ended ${escapeHTML(date(retry.completedAt))}</p><p class="meta">Retry ${escapeHTML(retry.id||'Not recorded')} · Previous run ${escapeHTML(retry.previousJobId||'Not recorded')}</p>${list(retry.previousChecks).length?`<ul>${list(retry.previousChecks).map(check=>`<li>${escapeHTML(sourceName(check.sourceId))}: previously ${escapeHTML(phaseLabels[check.status]||check.status||'Not recorded')}${check.checkedAt?` · checked ${escapeHTML(date(check.checkedAt))}`:''}${check.error?` · ${escapeHTML(check.error)}`:''}</li>`).join('')}</ul>`:''}</article>`).join('')}`:''}${job.researchNeedsRefresh?`<div class="research-warnings"><strong>Earlier web findings need reassessment.</strong><p>Web research from the original run has not been reassessed against the retried source checks. Original research started ${escapeHTML(date(job.originalStartedAt))}. Review the updated evidence before relying on the earlier narrative.</p></div>`:''}</section>`;
}
// Provider citation offsets refer to plaintext. Escape each segment separately and
// never interpret model output as HTML or Markdown. Invalid offsets retain a
// visible source list without inventing an association with a particular sentence.
function citedText(phase,run) {
  const value=text(phase.text),citations=list(phase.citations).map((citation,index)=>({citation,index})).filter(({citation})=>safeURL(citation?.url));
  const inline=citations.filter(({citation})=>Number.isSafeInteger(citation.start)&&Number.isSafeInteger(citation.end)&&citation.start>=0&&citation.end>citation.start&&citation.end<=value.length).sort((a,b)=>a.citation.end-b.citation.end||a.index-b.index);
  let output='',cursor=0;
  for(const {citation,index} of inline){
    if(citation.end>cursor){const marker=citationLabel(value.slice(citation.start,citation.end),index+1);output+=escapeHTML(value.slice(cursor,Math.max(cursor,citation.start)))+(marker===`[${index+1}]`?'':escapeHTML(value.slice(Math.max(cursor,citation.start),citation.end)));cursor=citation.end;}
    output+=`<sup class="research-citation">${link(citation.url,`[${index+1}]`)}</sup>`;
  }
  output+=escapeHTML(value.slice(cursor));
  const recordedAt=date(phase.completedAt||phase.startedAt||(run.researchNeedsRefresh?run.originalStartedAt:run.completedAt||run.startedAt));
  return `${value?`<p class="research-text">${output}</p>`:''}${citations.length?`<ol class="research-citations">${citations.map(({citation,index})=>`<li value="${index+1}">${link(citation.url,citation.title||citation.url)} <span class="muted">· Research run ${escapeHTML(recordedAt)}, Cyprus time</span></li>`).join('')}</ol>`:value?'<p class="meta">No source citations were recorded for this stage. Treat its findings as unverified.</p>':''}`;
}
function phaseWarnings(phase) {
  const warnings=list(phase.warnings).filter(value=>typeof value==='string'&&value.trim());
  return warnings.length?`<aside class="research-warnings"><h4>Research limitations</h4><ul>${warnings.map(value=>`<li>${escapeHTML(value)}</li>`).join('')}</ul></aside>`:'';
}
function officialChecksHTML(report) {
  const s=officialSummary(report.research);if(!s)return '';
  return `<section><h2>Official checks from this search</h2><p>${escapeHTML(s.label)} · ${s.entries} possible entries (may overlap).</p>${s.checks.map(c=>`<article class="research-phase"><h3>${link(c.url,c.name)}</h3><p>${c.status==='completed'?c.matchCount?count(c.matchCount,'possible entry','possible entries'):'No name matches':escapeHTML(phaseLabels[c.status]||'Not checked')} · ${c.method==='live_portal'?'Live portal search':'Official dataset search'}</p><p class="meta">Checked ${escapeHTML(date(c.checkedAt))} · Retrieved ${escapeHTML(date(c.retrievedAt))}</p>${c.error?`<p>${escapeHTML(c.error)}</p>`:''}<p class="meta">${escapeHTML(c.detail||'')}</p>${matchesForOfficialCheck(report,c).map(m=>`<p>${link(m.record?.sourceUrl||c.url,m.record?.name)} · ${escapeHTML(m.record?.id)} · ${escapeHTML(m.score)}% name similarity (identity unconfirmed)</p>`).join('')}</article>`).join('')}</section>`;
}
function researchHTML(data) {
  if(!data)return '';
  const {research,phases,cited,searched}=data;
  const query=research.query&&typeof research.query==='object'?[research.query.name,research.query.type,research.query.country,research.query.dob?`Date of birth: ${research.query.dob}`:''].filter(Boolean).join(' · '):text(research.query);
  return `<section class="research"><h2>Public-web research</h2><div class="research-summary"><strong>${escapeHTML(data.label)}</strong><p><b>${escapeHTML(identitySummary(research).label)}</b> — ${escapeHTML(identitySummary(research).note)}</p>${query?`<p class="meta">Research subject: ${escapeHTML(query)}</p>`:''}<p class="meta">${data.completed} of ${phases.length} stages completed · ${count(cited.size,'cited source')} · ${count(searched.size,'search source')}</p><p class="meta">${research.researchNeedsRefresh?`Original web research started ${escapeHTML(date(research.originalStartedAt))} · Latest source retry ended ${escapeHTML(date(research.completedAt))}`:`Started ${escapeHTML(date(research.startedAt))}${research.completedAt?` · Ended ${escapeHTML(date(research.completedAt))}`:''}`} · Cyprus time</p><p class="meta">Separate from sanctions snapshot coverage. A completed research run is not a clearance decision.</p>${research.error?`<p class="research-error">${escapeHTML(research.error)}</p>`:''}${research.id?`<p class="meta">Saved run reference: ${escapeHTML(research.id)}${research.model?` · Model: ${escapeHTML(research.model)}`:''}</p>`:''}</div>${phases.length?phases.map((phase,index)=>`<article class="research-phase"><header class="match-head"><h3>${escapeHTML(phase.title||`Research stage ${index+1}`)}</h3><span class="tag ${phase.status==='completed'?'':'warning'}">${escapeHTML(phaseLabels[phase.status]||'Status not recorded')}</span></header>${citedText(phase,research)}${phaseWarnings(phase)}${phase.error?`<p class="research-error">${escapeHTML(phase.error)}</p>`:''}${!phase.text?'<p class="meta">No findings recorded for this stage.</p>':''}</article>`).join(''):'<p class="meta">No research stages were recorded.</p>'}${searched.size?`<div class="research-source-list"><h3>Search sources</h3><p class="meta">Sources returned by the research search tools. Inclusion here does not mean a source supports a finding; cited evidence is listed with each stage above.</p><ul>${[...searched.values()].map(source=>`<li>${link(source.url,source.title)} <span class="muted">· ${cited.has(source.url)?'Cited in findings':'Not cited in findings'}</span></li>`).join('')}</ul></div>`:''}<p class="meta">Public-role information does not replace comprehensive licensed PEP screening. Confirm identity and ownership findings from the underlying evidence.</p></section>`;
}

function reviewHistoryHTML(report) {
  const log=report.reviewLog||[];if(!log.length)return '';
  return `<section class="review-history"><h2>Decision history</h2><p class="meta">Saved on this device. Reviewer names are entered manually; this is not an authenticated audit log. Earlier changes made before history was added are not reconstructed.</p>${log.map(item=>`<article class="review-note"><h4>${escapeHTML(item.recordName||item.recordId)}</h4><p>${escapeHTML(labels[item.status]||item.status)} · ${escapeHTML(date(item.at))} · ${escapeHTML(item.reviewer||'Reviewer not recorded')}${item.kind==='previous_saved_decision'?' · Earlier saved decision':''}</p><p>${escapeHTML(item.note||'No reason recorded.')}</p></article>`).join('')}</section>`;
}

// Derive from saved evidence every time. An earlier conclusion cannot remain the
// current outcome after source evidence or record decisions change.
export function assessmentExportSummary(report, options) {
  const s=assessmentSummary(report,options);
  return Object.fromEntries(['status','label','recorded','log','stale','gaps','scopeNotes','canRecord','nextReviewDate','due','overdue','note','auditNote'].map(key=>[key,s[key]]));
}
function assessmentHTML(report) {
  const s=assessmentExportSummary(report),current=s.recorded;
  return `<section class="case-assessment"><h2>Case review outcome</h2><div class="research-summary"><strong>${escapeHTML(s.label)}</strong><p>${escapeHTML(s.note)}</p>${current?`<p class="meta">${s.stale?'Previous recorded outcome':'Recorded outcome'}: ${escapeHTML(assessmentLabels[current.status])} · ${escapeHTML(current.reviewer)} · ${escapeHTML(date(current.at))}</p><h4>${s.stale?'Previous reason and follow-up':'Reason and follow-up'}</h4><p>${escapeHTML(current.reason)}</p>${s.nextReviewDate?`<p>Next review: ${escapeHTML(date(s.nextReviewDate))}${s.overdue?' · Overdue':s.due?' · Due today':''}. Local review date; no automatic monitoring is implied.</p>`:''}`:'<p>No reviewer outcome has been recorded.</p>'}</div>${s.gaps.length?`<h3>Outstanding items</h3><ul>${s.gaps.map(g=>`<li>${escapeHTML(g.text)}</li>`).join('')}</ul>`:''}<h3>Scope of this review</h3><ul>${s.scopeNotes.map(note=>`<li>${escapeHTML(note)}</li>`).join('')}</ul>${s.log.length?`<h3>Outcome history · ${s.log.length} saved revision${s.log.length===1?'':'s'}</h3>${s.log.map((item,index)=>`<article class="review-note"><h4>${index+1}. ${escapeHTML(assessmentLabels[item.status])}</h4><p class="meta">${escapeHTML(item.reviewer)} · ${escapeHTML(date(item.at))}</p><p>${escapeHTML(item.reason)}</p>${item.nextReviewDate?`<p class="meta">Next review recorded: ${escapeHTML(date(item.nextReviewDate))}</p>`:''}${item.gaps.length?`<p class="meta">Outstanding when recorded: ${escapeHTML(item.gaps.map(g=>g.text).join(' '))}</p>`:''}<p class="meta">Scope when recorded: ${escapeHTML(item.scopeNotes.join(' '))}</p><p class="meta">Findings and scope acknowledged: ${item.findingsReviewed?'Yes':'No'}. Reference: ${escapeHTML(item.id)}</p></article>`).join('')}`:''}<p class="meta">${escapeHTML(s.auditNote)}</p></section>`;
}

/** Pure HTML builder, also used by the export fidelity checks. All report data is escaped. */
export function buildReportHTML(report = {}) {
  report=restoreReturnedMatches(report);
  const data=describe(report),query=report.query||{},research=researchData(report),executive=executiveSummary(report);
  const sourceRows=data.sources.map(source=>{const state=data.states.get(source.id);return `<tr><td><strong>${escapeHTML(source.name||source.id||'Unnamed source')}</strong><small>${link(source.url,'Official source')}</small></td><td><span class="tag ${state.ready?'':'warning'}">${state.kind==='unavailable'?'Unavailable':state.label}</span>${state.kind==='stale'?'<small>Older than 48 hours or retrieval time is missing.</small>':''}${!state.ready&&source.error?`<small>${escapeHTML(source.error)}</small>`:''}</td><td>${escapeHTML(date(source.publishedAt))}</td><td>${escapeHTML(date(source.retrievedAt))}</td><td>${Number.isSafeInteger(source.recordCount)&&source.recordCount>=0?source.recordCount.toLocaleString('en-GB'):'Not recorded'}</td></tr>`;}).join('');
  const matches=data.matches.map((match,index)=>{
    const record=match.record,decision=data.decisions[record.id]||{},source=data.sources.find(item=>item.id===record.sourceId);
    const score=typeof match.score==='number'&&Number.isFinite(match.score)?`${match.score<=1?match.score.toFixed(2):Math.round(match.score)}${match.score<=1?' (0–1 scale)':' (reported score)'}`:'';
    return `<article class="match"><header class="match-head"><div><span class="eyebrow">${String(index+1).padStart(2,'0')} · ${escapeHTML(source?.name||record.sourceId||'Source not recorded')}</span><h3>${escapeHTML(record.name||'Unnamed record')}</h3></div><span class="tag ${decision.status==='investigate'||!labels[decision.status]?'warning':''}">${escapeHTML(labels[decision.status]||'Not reviewed')}</span></header>${comparisonHTML(match,query)}<dl class="details">${row('Record ID',record.id)}${row('Type',record.type)}${row('Matched name',match.nameMatched)}${row('Match type',match.matchKind)}${row('Identity similarity score',score)}${row('Matching signals',joined(match.signals))}${row('Aliases',joined(record.aliases))}${row('Countries',joined(record.countries))}${row('Dates of birth',joined(record.datesOfBirth))}${row('Identifiers',joined(record.identifiers))}${row('Addresses',joined(record.addresses))}${row('Programmes / regimes',joined(record.programs))}${row('Restrictions',joined(record.restrictions))}${row('Listed',record.listedAt?date(record.listedAt):'')}${row('Record updated',record.updatedAt?date(record.updatedAt):'')}</dl>${record.reasons?`<div class="evidence"><h4>Source information</h4><p>${escapeHTML(joined(record.reasons))}</p></div>`:''}<div class="review-note"><h4>Reviewer decision</h4><p>${escapeHTML(labels[decision.status]||'No decision recorded')}${decision.at?` · ${escapeHTML(date(decision.at))}`:''}</p>${decision.reviewer?`<p>Reviewer (entered name): ${escapeHTML(decision.reviewer)}</p>`:''}${decision.note?`<p>${escapeHTML(decision.note)}</p>`:''}</div><p class="source-link">${link(record.sourceUrl||source?.url,'Open source evidence')}</p></article>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>NeoLaw Screening · ${escapeHTML(query.name||'Report')}</title><style>
  :root{color-scheme:light;font-family:Arial,"Helvetica Neue",sans-serif;color:${BRAND.ink};background:${BRAND.paper};font-synthesis:none}*{box-sizing:border-box}body{margin:0;font-size:14px;line-height:1.6}button{font:inherit}.print-controls{max-width:960px;margin:22px auto;padding:0 34px;display:flex;align-items:center;justify-content:space-between;gap:20px;color:${BRAND.muted};font-size:13px}.print-controls button{background:${BRAND.teal};color:#fff;border:0;border-radius:9px;padding:10px 18px;cursor:pointer;white-space:nowrap}.report{max-width:960px;margin:0 auto 40px;background:#fff;padding:44px 48px;border:1px solid ${BRAND.line};border-radius:12px}.brand{display:flex;justify-content:space-between;align-items:center;margin-bottom:34px;color:${BRAND.teal};font-size:13px;letter-spacing:1px}.brand b{font-size:21px;letter-spacing:3px}.eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:1.6px;font-weight:700;color:${BRAND.muted}}h1{font-size:32px;letter-spacing:-1px;line-height:1.18;margin:10px 0}h2{font-size:19px;margin:28px 0 14px;letter-spacing:-.3px}h3{font-size:19px;line-height:1.3;margin:7px 0;overflow-wrap:anywhere}h4{font-size:11px;letter-spacing:.7px;text-transform:uppercase;margin:0 0 4px;color:${BRAND.muted}}p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}.meta{color:${BRAND.muted};font-size:13px}.summary{background:${BRAND.paper};padding:20px 22px;border-radius:10px;margin:24px 0;border-left:3px solid ${BRAND.cyan}}.summary.incomplete{border-left-color:#b17b39}.summary strong{font-size:17px}.summary p{color:${BRAND.muted};font-size:13px}.metrics{display:flex;gap:32px;margin-top:15px}.metrics b{font-size:22px;display:block;color:${BRAND.ink}}.metrics span{font-size:11px;color:${BRAND.muted}}table{border-collapse:collapse;width:100%;font-size:12px}th{text-align:left;color:${BRAND.muted};font-size:10px;text-transform:uppercase;letter-spacing:.7px;border-bottom:1px solid ${BRAND.line};padding:9px 8px}td{padding:12px 8px;vertical-align:top;border-bottom:1px solid ${BRAND.line};overflow-wrap:anywhere}small{display:block;font-size:11px;color:${BRAND.muted};margin-top:4px}.tag{display:inline-block;background:#edf6f5;color:${BRAND.teal};border-radius:5px;padding:3px 7px;font-size:11px;line-height:1.5;white-space:nowrap}.tag.warning{background:#f9f2e8;color:${BRAND.amber}}.match{border:1px solid ${BRAND.line};border-radius:9px;padding:22px;margin:14px 0}.match-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.details{margin:16px 0}.detail{display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;padding:4px 0;font-size:12px}.detail dt{color:${BRAND.muted}}.detail dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.evidence,.review-note{padding-top:12px;margin-top:12px;border-top:1px solid ${BRAND.line};font-size:13px}.source-link{margin-top:14px;font-size:12px}.research{margin-top:30px;border-top:1px solid ${BRAND.line}}.research-summary{padding:16px 20px;background:${BRAND.paper};border-radius:8px}.research-phase{margin:18px 0;padding:18px 20px;border:1px solid ${BRAND.line};border-radius:8px}.research-phase h3{font-size:17px;margin:0 0 10px}.research-text{line-height:1.75}.research-citation{margin-left:3px;font-size:10px;white-space:nowrap}.research-citations,.research-source-list ul{padding-left:22px;font-size:11px;overflow-wrap:anywhere}.research-citations li,.research-source-list li{margin:7px 0}.research-error{font-size:12px;color:${BRAND.amber}}.research-warnings{margin-top:14px;padding:12px 15px;background:#fbf5eb;border-radius:6px;color:${BRAND.amber};font-size:12px}.research-warnings h4{color:${BRAND.amber}}.research-warnings ul{margin:4px 0;padding-left:18px}.research-warnings li{margin:4px 0;overflow-wrap:anywhere}a{color:${BRAND.teal};text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}.muted,.scope{color:${BRAND.muted}}.scope{font-size:11px;border-top:1px solid ${BRAND.line};padding-top:18px;margin-top:24px}.notes{padding:16px 20px;background:${BRAND.paper};border-radius:8px}footer{font-size:10px;color:${BRAND.muted};margin-top:25px;overflow-wrap:anywhere}@page{size:A4;margin:16mm}@media print{:root,body{background:#fff}.print-controls{display:none}.report{border:0;border-radius:0;max-width:none;margin:0;padding:0}.brand{margin-bottom:22px}h2,h3,h4,.match-head{break-after:avoid}thead{display:table-header-group}tr,.summary,.detail,.review-note{break-inside:avoid}.match{box-decoration-break:clone;-webkit-box-decoration-break:clone}.summary,.tag,.notes{-webkit-print-color-adjust:exact;print-color-adjust:exact}a{color:${BRAND.teal}}.source-link a::after{content:' — ' attr(href);font-size:10px}.scope{break-inside:avoid}}@media(max-width:650px){.report{padding:25px 20px;border:0}.print-controls{padding:0 20px}.match-head{display:block}.detail{grid-template-columns:1fr;gap:1px}.metrics{gap:18px}table{font-size:10px}th,td{padding:8px 3px}.brand{align-items:flex-start;gap:15px}}
  </style></head><body><div class="print-controls"><span>Choose “Save as PDF” in your print dialog.</span><button id="print-report" type="button">Print / Save as PDF</button></div><main class="report"><div class="brand"><b>NEOLAW</b><span>SCREENING REPORT</span></div><span class="eyebrow">${escapeHTML(report.projectName||'Office screening')}</span><h1>${escapeHTML(query.name||'Unnamed subject')}</h1><p class="meta">${escapeHTML([query.type,query.country,query.dob?`Date of birth: ${query.dob}`:'',query.passportNumber?`Passport number: ${query.passportNumber}`:'',query.registrationNumber?`Company registration number: ${query.registrationNumber}`:''].filter(Boolean).join(' · '))}</p><p class="meta">Checked ${escapeHTML(date(report.createdAt))} · Cyprus time</p><section class="summary ${executive.incomplete?'incomplete':''}"><span class="eyebrow">Executive summary</span><h2>${escapeHTML(executive.title)}</h2><p>${escapeHTML(executive.note)}</p>${executive.items.map(item=>`<h4>${escapeHTML(item.label)}</h4><p>${escapeHTML(item.text)}${item.candidate?' Candidate evidence; identity unresolved.':''}</p>`).join('')}<h4>Next action</h4><p>${escapeHTML(executive.next)}</p>${reviewProgressText(report)?`<h4>Recorded identity review</h4><p>${escapeHTML(reviewProgressText(report))}</p>`:''}${!report.requiresOfficial?`<strong>${outcome(data)}</strong><div class="metrics"><div><b>${data.total}</b><span>saved potential matches</span></div><div><b>${data.ready.length} / ${data.sources.length}</b><span>saved source snapshots current</span></div><div><b>${data.unresolved}</b><span>included matches unresolved</span></div></div>`:''}</section>${assessmentHTML(report)}${reviewUpdatesHTML(report)}<h2>Source coverage</h2>${!data.recordedSources.length?'<p>No source snapshots recorded. Coverage is incomplete.</p>':''}${data.sources.length?`<table class="source-coverage-table"><thead><tr><th>Source</th><th>Status</th><th>Published / updated</th><th>Retrieved</th><th>Records</th></tr></thead><tbody>${sourceRows}</tbody></table>`:'<p>No source snapshots recorded. Coverage is incomplete.</p>'}<h2>Match review</h2>${data.total&&!data.pendingTotal?'<p class="meta">Review recorded for every potential match.</p>':''}<p class="meta">${data.matches.length!==data.total?`${data.matches.length} of ${data.total} potential matches included. `:''}Matching indicates identity similarity, not a risk score or proof of a sanctions breach.</p>${matches||'<p>No match records are included. An empty result is not a client approval.</p>'}${reviewHistoryHTML(report)}${officialChecksHTML(report)}${providerHTML(report.research?.opensanctions,data.decisions)}${companyHTML(report.research)}${procurementHTML(report.research,data.decisions)}${researchHTML(research)}${report.notes?`<h2>Reviewer notes</h2><div class="notes"><p>${escapeHTML(report.notes)}</p></div>`:''}<p class="scope">${reportScope(report)} Confirm identity, applicable restrictions and ownership separately. A reviewer’s recorded decision is an assessment of this match, not an automatic client-acceptance decision.</p><footer>Report reference: ${escapeHTML(report.id||'Not recorded')}${report.previousReportId?` · Previous check: ${escapeHTML(report.previousReportId)}`:''} · Source evidence and review decisions as saved with this report.</footer></main></body></html>`;
}

/** Opens a native print-ready report. A true result means the window opened, not that a PDF was saved. */
export function downloadReport(report) {
  let popup;
  try {
    popup=window.open('','_blank');if(!popup)return false;
    popup.opener=null;
    popup.document.open();popup.document.write(buildReportHTML(report));popup.document.close();
    const print=()=>{if(!popup.closed){try{popup.focus();popup.print();}catch{/* The visible button allows the user to try again. */}}};
    popup.document.getElementById('print-report')?.addEventListener('click',print);
    Promise.resolve(popup.document.fonts?.ready).then(()=>setTimeout(print,200));
    return true;
  } catch {try{popup?.close();}catch{}return false;}
}

/** A faithful, standalone JSON audit record; no external service is called. */
export function exportReportJSON(report) {
  try {
    const data=describe(report);
    const payload={...report,schema:'neolaw.screening-report.v1',inputAssessment:screeningInputIssue(report.query),executive:executiveSummary(report),caseReview:assessmentExportSummary(report),recordedIdentityReview:reviewProgressText(report),scope:reportScope(report),totalMatches:data.total,coverageComplete:officialSummary(report.research)?!officialSummary(report.research).incomplete:!data.incomplete,sourceReadiness:data.sources.map(source=>({sourceId:source.id,...data.states.get(source.id)})),freshnessEvaluatedAt:new Date(data.evaluatedAt).toISOString(),exportedAt:new Date().toISOString()};
    return downloadBlob(new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json;charset=utf-8'}),filename(report,'json'));
  } catch {return false;}
}

// Canvas draws only text and local shapes, so PNG export never captures hidden UI or loads remote images.
function fitLines(ctx,value,width,maxLines=Infinity) {
  const paragraphs=text(value).split(/\r?\n/),lines=[];
  for(const paragraph of paragraphs){
    if(!paragraph){lines.push('');continue;}
    let line='';
    for(const word of paragraph.split(/\s+/)){
      if(ctx.measureText(line?line+' '+word:word).width<=width){line=line?line+' '+word:word;continue;}
      if(line){lines.push(line);line='';}
      if(ctx.measureText(word).width<=width){line=word;continue;}
      for(const char of Array.from(word)){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}
    }
    if(line)lines.push(line);
  }
  if(lines.length>maxLines){lines.length=maxLines;let last=lines.at(-1)||'';while(last&&ctx.measureText(last+'…').width>width)last=Array.from(last).slice(0,-1).join('');lines[maxLines-1]=last+'…';}
  return lines;
}
/** Downloads an actual PNG summary. Full evidence is retained in the PDF/JSON exports. */
export async function downloadSnapshot(report = {}) {
  try {
    await document.fonts?.ready;
    const data=describe(report),research=researchData(report),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)return false;
    const sourceRows=Math.ceil(Math.max(1,data.sources.length)/2),shown=data.matches.slice(0,6);
    const width=1200,height=750+sourceRows*130+shown.length*94+(report.notes?100:0)+(research?220:0);
    canvas.width=width;canvas.height=height;ctx.textBaseline='top';
    const font=(size,weight=400)=>{ctx.font=`${weight} ${size}px Arial, "Helvetica Neue", sans-serif`;};
    const label=(value,x,y,{size=17,weight=400,color=BRAND.ink,maxWidth=1080,maxLines=1,lineHeight=size*1.4}={})=>{font(size,weight);ctx.fillStyle=color;const lines=fitLines(ctx,value,maxWidth,maxLines);lines.forEach((line,index)=>ctx.fillText(line,x,y+index*lineHeight));return lines.length*lineHeight;};
    const box=(x,y,w,h,fill,border)=>{ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);if(border){ctx.strokeStyle=border;ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);}};
    box(0,0,width,height,'#fff');box(0,0,width,12,BRAND.cyan);
    label('NEOLAW',60,48,{size:27,weight:700,color:BRAND.teal});label('SCREENING',930,52,{size:16,weight:700,color:BRAND.muted,maxWidth:210});
    label(report.projectName||'OFFICE SCREENING',60,114,{size:14,weight:700,color:BRAND.muted,maxLines:1});
    label(report.query?.name||'Unnamed subject',60,145,{size:38,weight:700,maxLines:2,lineHeight:44});
    label([report.query?.type,report.query?.country,report.query?.dob?`DOB ${report.query.dob}`:''].filter(Boolean).join(' · '),60,246,{size:17,color:BRAND.muted});
    label(`Checked ${date(report.createdAt)} · Cyprus time`,60,278,{size:15,color:BRAND.muted});
    box(60,325,1080,140,BRAND.paper);box(60,325,5,140,data.incomplete?'#b17b39':BRAND.cyan);
    label(outcome(data),85,346,{size:24,weight:700});
    label(officialSummary(report.research)?`${officialSummary(report.research).entries} possible official entries · ${officialSummary(report.research).completed}/${officialSummary(report.research).total} checks completed`:`${count(data.total,'potential match','potential matches')}     ·     ${data.ready.length} / ${data.sources.length} sources ready`,85,390,{size:20,weight:600});
    label(officialSummary(report.research)?'See the full report for official methods, gaps and evidence. Name matches need identity review.':data.incomplete?'Coverage is incomplete. Some sources are unavailable or need refreshing.':'Snapshot results only. Current list changes are not checked automatically.',85,429,{size:15,color:data.incomplete?BRAND.amber:BRAND.muted});
    let y=500;label(officialSummary(report.research)?'INITIAL SNAPSHOT COVERAGE':'SOURCE COVERAGE',60,y,{size:14,weight:700,color:BRAND.muted});y+=32;
    if(!data.sources.length){box(60,y,1080,102,'#fbf5eb');label('No source snapshots recorded',80,y+20,{weight:700,color:BRAND.amber});label('The search cannot be treated as complete.',80,y+55,{size:15,color:BRAND.muted});}
    data.sources.forEach((source,index)=>{
      const x=60+(index%2)*552,sy=y+Math.floor(index/2)*130,state=data.states.get(source.id);
      box(x,sy,528,110,state.ready?'#f7faf9':'#fbf5eb',BRAND.line);
      label(source.name||source.id||'Unnamed source',x+18,sy+14,{size:18,weight:700,maxWidth:490});
      label(state.kind==='unavailable'?'Unavailable · not checked':state.label,x+18,sy+43,{size:15,color:state.ready?BRAND.teal:BRAND.amber,maxWidth:490});
      label(`Updated ${date(source.publishedAt)}`,x+18,sy+67,{size:13,color:BRAND.muted,maxWidth:490});
      label(`Retrieved ${date(source.retrievedAt)}`,x+18,sy+86,{size:12,color:BRAND.muted,maxWidth:490});
    });
    y+=sourceRows*130+14;
    if(research){
      label('PUBLIC-WEB RESEARCH',60,y,{size:14,weight:700,color:BRAND.muted});y+=28;
      box(60,y,1080,138,BRAND.paper,BRAND.line);
      label(research.label,80,y+15,{size:21,weight:700});
      label(`${research.completed} / ${research.phases.length} stages completed · ${count(research.cited.size,'cited source')} · ${count(research.searched.size,'search source')}`,80,y+49,{size:16,color:BRAND.muted});
      label(`${research.research.researchNeedsRefresh?'Original research':'Run'} ${date(research.research.researchNeedsRefresh?research.research.originalStartedAt:research.research.completedAt||research.research.startedAt)} · Cyprus time`,80,y+77,{size:14,color:BRAND.muted});
      label('Summary only. Read the full report for findings, stage status and source links.',80,y+102,{size:14,color:BRAND.muted});
      y+=164;
    }
    label('MATCH REVIEW',60,y,{size:14,weight:700,color:BRAND.muted});y+=35;
    if(!shown.length){label('No match records included. An empty result is not a client approval.',60,y,{size:17,maxLines:2});y+=54;}
    shown.forEach(match=>{
      const record=match.record,decision=data.decisions[record.id],source=data.sources.find(item=>item.id===record.sourceId);
      label(record.name||'Unnamed record',60,y,{size:20,weight:600,maxWidth:690});
      label(labels[decision?.status]||'Not reviewed',800,y+2,{size:15,color:decision?.status==='dismissed'?BRAND.teal:BRAND.amber,maxWidth:340});
      label([source?.name||record.sourceId,match.nameMatched?`Matched: ${match.nameMatched}`:''].filter(Boolean).join(' · '),60,y+31,{size:14,color:BRAND.muted,maxWidth:1030});
      box(60,y+67,1080,1,BRAND.line);y+=94;
    });
    if(data.total>shown.length)label(`${shown.length} of ${data.total} potential matches shown. Full evidence is in the report.`,60,y,{size:14,color:BRAND.muted});
    if(report.notes){y+=40;label('REVIEWER NOTES',60,y,{size:13,weight:700,color:BRAND.muted});label(report.notes,60,y+25,{size:15,maxLines:2});}
    const footerY=height-(research?122:98);
    box(60,footerY-15,1080,1,BRAND.line);
    label(reportScope(report),60,footerY,{size:13,color:BRAND.muted,maxLines:research?3:2,lineHeight:19});
    label(`Reference: ${text(report.id)||'Not recorded'} · Summary image · Download the full report for evidence and reviewer notes.`,60,height-41,{size:12,color:BRAND.muted});
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    return blob ? downloadBlob(blob,filename(report,'png')) : false;
  }catch{return false;}
}

/** Generates and downloads a PDF entirely through the loopback server. */
// The PDF renderer receives readable table rows, while the JSON audit retains
// exact provider text. Map UTF-16 boundaries so citation ranges remain attached.
export function preparePDFReport(report) {
  report=restoreReturnedMatches(report);
  if(!Array.isArray(report?.research?.phases))return {...report,executive:executiveSummary(report)};
  const phases=report.research.phases.map(phase=>{
    const original=text(phase.text),offsets=[],lines=original.match(/[^\n]*\n|[^\n]+$/g)||[];
    let output='',offset=0;
    for(const line of lines){
      const table=/^\s*\|.*\|\s*$/.test(line.trimEnd());
      const separator=table&&/^\s*\|[\s:|—-]+\|\s*$/.test(line.trimEnd());
      const first=line.indexOf('|'),last=line.lastIndexOf('|');
      for(let i=0;i<line.length;i++){
        offsets[offset+i]=output.length;
        if(separator){if(line[i]==='\n')output+='\n';continue;}
        if(table&&line[i]==='|'){if(i!==first&&i!==last)output+='—';}
        else output+=line[i];
      }
      offset+=line.length;
    }
    offsets[original.length]=output.length;
    return {...phase,text:output,citations:(phase.citations||[]).map(c=>Number.isSafeInteger(c.start)&&Number.isSafeInteger(c.end)&&c.start>=0&&c.end<=original.length?{...c,start:offsets[c.start],end:offsets[c.end]}:c)};
  });
  return {...report,executive:executiveSummary(report),assessmentOriginalPhases:report.assessmentLog?.length?report.research.phases.map(p=>({id:p.id,text:p.text,citations:p.citations})):undefined,research:{...report.research,phases}};
}

export async function downloadPDF(report) {
  if(screeningInputIssue(report.query))throw new Error('Correct the name and repeat the search before downloading a PDF. The original evidence can still be exported with Download evidence data or Print / Save as PDF.');
  const portrait=await reportPortrait(report);
  const response=await fetch('/api/screening/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...preparePDFReport(report),reportPortrait:portrait}),signal:globalThis.AbortSignal?.timeout?.(45000)});
  if(!response.ok){let message='The PDF could not be created. Use Print / Save as PDF from Export.';try{message=(await response.json()).error||message;}catch{}throw new Error(message);}
  const blob=await response.blob();if(blob.type!=='application/pdf')throw new Error('The server did not return a PDF report.');
  if(!downloadBlob(blob,filename(report,report.reportDetail==='full'?'full-evidence.pdf':'pdf')))throw new Error('The report download could not be started.');
  return true;
}

function candidateDecisionHTML(decision){
  return `<div class="review-note"><h4>Reviewer identity decision</h4><p>${escapeHTML(reviewLabels[decision?.status]||'Not reviewed')}${decision?.at?` · ${escapeHTML(date(decision.at))}`:''}</p>${decision?.reviewer?`<p>Reviewer (entered name): ${escapeHTML(decision.reviewer)}</p>`:''}${decision?.note?`<p>${escapeHTML(decision.note)}</p>`:''}<p>Identity assessment only; restrictions and client acceptance require separate review.</p></div>`;
}
function providerProfileExport(profile){
  if(!profile?.fields?.length)return '';
  return `<h4>Complete provider profile · ${escapeHTML(profile.fieldCount||profile.fields.length)} fields</h4><p class="meta">${escapeHTML(profile.status)} · ${escapeHTML(profile.sourceCount||0)} source datasets · ${escapeHTML(profile.statementCount||0)} statements. Source counts describe dataset lineage, not independent corroboration.</p><table><thead><tr><th>Field</th><th>Provider values</th><th>Lineage</th></tr></thead><tbody>${profile.fields.map(field=>`<tr><td>${escapeHTML(field.label||field.key)}</td><td>${escapeHTML((field.values||[]).join(' · ')||'Not supplied')}</td><td>${escapeHTML(field.sourceCount||0)} sources · ${escapeHTML(field.statementCount||0)} statements${field.sources?.length?`<br>${field.sources.map(source=>link(source.url,`${source.title||source.dataset}${source.title?` (${source.dataset})`:''}`)).join(' · ')}`:''}</td></tr>`).join('')}</tbody></table>`;
}
function providerHTML(value,decisions={}){
  if(!value||value.status==='not_configured')return '';
  return `<section><h2>OpenSanctions · additional provider</h2><p>${escapeHTML(value.status)} · ${escapeHTML(date(value.checkedAt))}</p><p>${escapeHTML(value.error||value.detail||'No completed provider result.')}</p>${(value.candidates||[]).map(c=>`<article><h3>${link(c.url,c.name)}</h3><p>${escapeHTML(providerCategories(c).join(', ')||'Provider candidate')} · ${Math.round(c.score*100)}% provider match score, not confirmed identity or risk</p><p>Datasets: ${escapeHTML(c.datasets?.join(', ')||'Not recorded')}</p><p>Birth dates: ${escapeHTML(c.birthDates?.join(', ')||'Not supplied')}</p><p>Passport numbers: ${escapeHTML(c.passportNumbers?.join(', ')||'Not supplied')}</p><p>Company registration numbers: ${escapeHTML(c.registrationNumbers?.join(', ')||'Not supplied')}</p>${providerProfileExport(c.profile)}${candidateDecisionHTML(decisions[providerRecordId(c)])}</article>`).join('')}${value.atLimit?'<p>Candidate limit reached. Refine identifiers.</p>':''}</section>`;
}

function procurementHTML(job,decisions={}){
 const r=procurementResult(job);if(!r)return '';
 return `<section class="research"><h2>World Bank / Procurement debarment</h2><p>${escapeHTML(r.status)} · Checked ${escapeHTML(date(r.checkedAt))}</p><p>${escapeHTML(r.error||r.detail||'No completed procurement check.')}</p><p>Publisher refresh: ${escapeHTML(date(r.publishedAt))} · Retrieved ${escapeHTML(date(r.retrievedAt))}</p>${r.status==='completed'?`<p>${r.totalResults} possible matches; ${(r.candidates||[]).length} returned. Table 2 other sanctions and complete controlled-affiliate coverage are not included.</p>${(r.candidates||[]).map(m=>`<article class="match"><h3>${escapeHTML(m.record.name)}</h3>${comparisonHTML(m,job.query||{})}<p>${escapeHTML(m.record.debarmentStatus)} · Algorithmic name match</p><p>Period: ${escapeHTML(m.record.listedAt)} — ${escapeHTML(m.record.ineligibilityPeriod)}</p><p>Publisher notes reference: ${escapeHTML(m.record.notesReference||'Not supplied')}</p><p>Published grounds: ${escapeHTML(m.record.reasons||'Not supplied')}</p><p>An end date alone does not establish eligibility; verify release conditions and project scope.</p>${candidateDecisionHTML(decisions[m.record.id])}${link(m.record.sourceUrl,'World Bank listing')} · ${link(m.record.notesUrl,'Publisher notes and conditions')}</article>`).join('')}${r.atLimit?'<p>Result limit reached. Refine the name.</p>':''}`:''}<p class="meta">${escapeHTML(r.recordCount||'Not recorded')} records searched · Response SHA-256: ${escapeHTML(r.sha256||'Not recorded')}</p></section>`;
}
