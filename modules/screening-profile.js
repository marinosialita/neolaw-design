import {escape as e,icon} from '../core.js';
import {executiveSummary,officialSummary,sourceCounts,recordPresentation} from './research-evidence.js';
import {explainMatch,matchesForOfficialCheck} from './screening-match.js';
import {formatDate,safeURL,sourceLabels} from './screening-view-model.js';
import {maskedIdentifier} from './screening-identifiers.js';
import {providerRecordId,reviewLabels,reviewProgress} from './screening-review.js';
import {relationshipRecords} from './screening-relationships.js';
import {procurementResult} from './screening-procurement.js';

const values=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'&&v.trim()):typeof value==='string'&&value.trim()?[value]:[];
const labels={opensanctions:'OpenSanctions',wb:'World Bank · Procurement',gleif:'GLEIF · Company identity'};
const phaseStatus=phase=>phase?.status==='completed'?'available':['running','pending'].includes(phase?.status)?'running':phase?'incomplete':'not_searched';
export const hasPublicRole=candidate=>values(candidate.topics).some(t=>/^role\.(pep(?:\.|$)|rca$)/.test(t))||values(candidate.categories).some(t=>/^(?:Former )?Politically exposed person$|^Relative \/ close associate$/i.test(t));
const nameInitials=name=>String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(v=>Array.from(v)[0]).join('').toLocaleUpperCase()||'?';

// A profile describes the supplied subject. Returned records stay separate, even
// when their names are identical or a reviewer has linked one of them.
export function profileRecords(report={}) {
  const job=report.research||{},records=[],seen=new Set();
  const add=(kind,match,receipt,candidate=null)=>{
    if(!match?.record)return;
    const r=match.record,key=r.id?`${kind}:${r.sourceId||''}:${r.id}`:'';
    if(key&&seen.has(key))return;
    if(key)seen.add(key);
    records.push({kind,match,receipt,candidate,id:r.id||'',source:sourceLabels[r.sourceId]||labels[r.sourceId]||r.sourceId||'Recorded source',url:safeURL(r.sourceUrl||candidate?.url),decision:report.decisions?.[r.id]||null});
  };
  const checks=job.officialChecks;
  if(Array.isArray(checks)){
    for(const check of checks)for(const match of matchesForOfficialCheck(report,check))add('official',match,check);
  }else if(!report.requiresOfficial)for(const match of report.matches||[])add('official',match,report.sourceSnapshots?.find(s=>s.id===match?.record?.sourceId));
  const provider=job.opensanctions;
  if(provider?.status==='completed')for(const c of provider.candidates||[]){
    add('provider',{record:{id:providerRecordId(c),sourceId:'opensanctions',name:c.name,aliases:c.aliases||[],type:c.schema==='Company'?'entity':c.schema==='Person'?'person':'other',countries:c.countries||[],datesOfBirth:c.birthDates||[],passportNumbers:c.passportNumbers||[],registrationNumbers:c.registrationNumbers||[],lei:c.lei||[],programs:c.categories||[],sourceUrl:c.url},nameMatched:c.name},provider,c);
  }
  const wb=procurementResult(job);
  if(wb?.status==='completed')for(const m of wb.candidates||[])add('procurement',m,wb);
  if(job.gleif?.status==='completed')for(const m of job.gleif.candidates||[])add('company',m,job.gleif);
  return records;
}

export function profileSections(report={}) {
  const job=report.research||{},records=profileRecords(report),sources=sourceCounts(job),official=officialSummary(job);
  const roles=records.filter(r=>r.kind==='provider'&&hasPublicRole(r.candidate));
  const media=job.phases?.find(p=>p.id==='media'),ownership=job.phases?.find(p=>p.id==='ownership');
  const mediaSources=sources.all.filter(s=>s.cited&&s.phases.some(p=>p.id==='media'));
  const connectionSources=sources.all.filter(s=>s.cited&&s.phases.some(p=>p.id==='ownership'));
  const parentRecords=records.filter(r=>r.kind==='company'&&r.match.record.parentLinks?.some(p=>safeURL(p.url)));
  const provider=job.opensanctions,providerState=provider?.status==='completed'?'available':!provider||provider.status==='not_configured'?'not_checked':['pending','running'].includes(provider.status)?'running':'incomplete';
  const receipts=(official?.completed||0)+['opensanctions','gleif','worldbank'].filter(id=>job[id]?.status==='completed').length;
  const summary=executiveSummary(report);
  return [
    {id:'overview',label:'Overview',count:null,countLabel:'',status:summary.incomplete?'incomplete':'available',description:'Outcome, supplied identity and next action.'},
    {id:'matches',label:'Matches',count:records.length,countLabel:'returned source records',status:summary.incomplete?'incomplete':'available',description:'Returned source records, not unique people or confirmed identities. Includes company-reference records where available.'},
    {id:'roles',label:'PEP & associates',count:providerState==='available'?roles.length:null,countLabel:'provider records explicitly tagged PEP, relative or associate',status:providerState,description:providerState==='available'?'Provider classifications and reported roles require identity review; this is not comprehensive PEP coverage.':'No completed provider role check is available.'},
    {id:'media',label:'Media',count:media?mediaSources.length:null,countLabel:'cited media-research sources',status:phaseStatus(media),description:media?'Cited web pages, not allegations or confirmed findings. Read the source and outcome.':'Wider-web media research was not run. Choose Deep search when needed.'},
    {id:'connections',label:'Connections',count:ownership||parentRecords.length||relationshipRecords(job).length?(ownership?.affiliations||job.opensanctions?.relationshipCoverage?relationshipRecords(job).length:connectionSources.length)+parentRecords.length:null,countLabel:ownership?.affiliations||job.opensanctions?.relationshipCoverage?'structured candidate relationships and company parent references':'cited research pages and company parent references',status:ownership?phaseStatus(ownership):parentRecords.length?'available':'not_searched',description:'Candidate connections need supporting evidence. GLEIF parent links concern accounting consolidation, not complete beneficial ownership.'},
    {id:'sources',label:'Sources',count:receipts+sources.cited,countLabel:'completed source receipts and cited web pages',status:summary.incomplete?'incomplete':'available',description:`${receipts} completed source receipts · ${sources.cited} cited web pages · ${sources.uncited} unverified search leads. Counts are not risk scores or independent corroborations.`}
  ];
}

export function profileViewModel(report={}) {
  const query=report.query||report.research?.query||{},summary=executiveSummary({...report,query}),records=profileRecords(report),progress=reviewProgress(report);
  const facts=[{label:'Entity type',value:query.type==='entity'?'Company':query.type==='person'?'Person':'Name screening'}];
  if(query.country)facts.push({label:query.type==='entity'?'Jurisdiction':'Country',value:query.country});
  if(query.type!=='entity'&&query.dob)facts.push({label:'Date of birth',value:query.dob});
  if(query.type!=='entity'&&query.passportNumber)facts.push({label:'Passport',value:maskedIdentifier(query.passportNumber)});
  if(query.type==='entity'&&query.registrationNumber)facts.push({label:'Registration no.',value:query.registrationNumber});
  if(query.type==='entity'&&query.lei)facts.push({label:'LEI',value:query.lei});
  return {name:query.name||'Unnamed subject',initials:nameInitials(query.name),facts,summary,records,sections:profileSections(report),progress,date:formatDate(report.createdAt,true),mode:report.research?.retryOf?'Source retry':query.mode==='deep'?'Deep search':'Standard search',identityLabel:'Supplied identity · not verified',previousReportId:report.previousReportId||'',next:summary.next||'Review the available source records and any incomplete checks.'};
}

export function profileHeaderHTML(report={}, {activeSection='overview',showSummary=true}={}) {
  const model=profileViewModel(report),summary=model.summary;
  return `<section class="sc-profile" aria-label="Screened subject profile"><div class="sc-profile-subject"><div class="sc-profile-avatar" data-sc-profile-portrait aria-label="Initials only; no verified portrait">${e(model.initials)}</div><div class="sc-profile-identity"><p class="sc-profile-eyebrow">${e(model.identityLabel)}</p><h1>${e(model.name)}</h1><dl class="sc-profile-facts">${model.facts.map(f=>`<div><dt>${e(f.label)}</dt><dd>${e(f.value)}</dd></div>`).join('')}</dl></div><div class="sc-profile-stamp"><span>${e(model.mode)}</span><time>${e(model.date)}</time>${model.previousReportId?'<small>Linked follow-up check</small>':''}</div></div>${showSummary?`<div class="sc-profile-outcome ${summary.incomplete?'is-incomplete':''}"><div><span class="sc-profile-eyebrow">Result</span><h3>${e(summary.title)}</h3><p>${e(summary.note)}</p></div><div class="sc-profile-action"><span class="sc-profile-eyebrow">What to do next</span><p>${e(model.next)}</p></div></div>`:''}<nav class="sc-profile-nav" aria-label="Screening profile sections">${model.sections.map(s=>`<button type="button" data-sc-section="${e(s.id)}" aria-pressed="${s.id===activeSection}" aria-label="${e(s.label+(s.count===null?'':`: ${s.count} ${s.countLabel}`))}" title="${e(s.description)}"><span>${e(s.label)}</span>${s.count===null?'':`<small>${s.count}</small>`}${s.status==='incomplete'?'<i class="sc-profile-nav-gap" aria-label="Incomplete coverage"></i>':''}</button>`).join('')}</nav></section>`;
}

function comparisonRecordHTML(entry,query) {
  const r=entry.match.record,comparison=explainMatch(entry.match,query),presentation=recordPresentation(r),label=reviewLabels[entry.decision?.status]||'Identity unconfirmed';
  const table=`<div class="sc-profile-table-wrap"><table class="sc-profile-compare-table"><caption class="sc-profile-sr-only">Identifier comparison for ${e(presentation.name)} · ${e(entry.source)}</caption><thead><tr><th scope="col">Identifier</th><th scope="col">You supplied</th><th scope="col">Source record</th><th scope="col">Comparison</th></tr></thead><tbody>${comparison.comparisons.map(row=>`<tr class="is-${row.status}"><th scope="row">${e(row.label)}</th><td>${e(row.input)}</td><td>${e(row.source)}</td><td><span class="sc-profile-compare-status">${row.status==='match'?'Matches':row.status==='review'?'Different':'Not compared'}</span></td></tr>`).join('')}</tbody></table></div>`;
  return `<article class="sc-profile-source-comparison-record" data-sc-profile-record="${e(entry.id)}"><header><div><small>${e(entry.source)}</small><h4>${e(presentation.name||'Unnamed source record')}</h4></div><span class="sc-profile-decision">${e(label)}</span></header><p class="sc-profile-match-why">${e(comparison.why)}</p>${table}<footer><span>${entry.receipt?.checkedAt?`Checked ${e(formatDate(entry.receipt.checkedAt,true))}`:entry.receipt?.retrievedAt?`Snapshot retrieved ${e(formatDate(entry.receipt.retrievedAt,true))}`:'Check date not saved'}${entry.id?` · Record ${e(entry.id)}`:''}</span>${entry.url?`<a href="${e(entry.url)}" target="_blank" rel="noopener noreferrer">Source record ${icon('arrow',12)}</a>`:'<span>Original link not saved</span>'}</footer></article>`;
}

export function profileComparisonHTML(report={}, {initialLimit=2}={}) {
  const query=report.query||report.research?.query||{},records=profileRecords(report),limit=Math.max(1,Math.min(5,Number.isInteger(initialLimit)?initialLimit:2));
  if(!records.length)return '<section class="sc-profile-source-comparison" aria-label="Identifier comparison"><div class="sc-profile-section-heading"><h3>Compare the identity</h3></div><p class="sc-profile-empty">No returned source records are available to compare. Review the source coverage; missing records do not verify identity or clear the client.</p></section>';
  return `<section class="sc-profile-source-comparison" aria-label="Identifier comparison"><div class="sc-profile-section-heading"><h3>Compare the identity</h3><span>${records.length} source ${records.length===1?'record':'records'}</span></div><p class="sc-profile-source-comparison-note">Each source stays separate. A matching name or number alone does not confirm identity; “Not compared” means a detail is missing.</p>${records.slice(0,limit).map(entry=>comparisonRecordHTML(entry,query)).join('')}${records.length>limit?`<details class="sc-profile-more"><summary>Compare ${records.length-limit} more source ${records.length-limit===1?'record':'records'} ${icon('chevron-down',13)}</summary>${records.slice(limit).map(entry=>comparisonRecordHTML(entry,query)).join('')}</details>`:''}</section>`;
}
