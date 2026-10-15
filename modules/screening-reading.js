import {screeningInputIssue,identityNextStep} from './screening-input.js';
import {candidateReviewSummary as explainMatch} from './screening-candidates.js';
import {identifierValues} from './screening-identifiers.js';
import {escape as e,icon} from '../core.js';
import {safeURL,formatDate} from './screening-view-model.js';
import {sourceCatalog,sourceCounts,canonicalSource,identitySummary,identityFinding,phaseIssues,plainEvidence,recordPresentation} from './research-evidence.js';
import {researchProse} from './screening-research.js';

const values=value=>Array.isArray(value)?value.filter(v=>v!==null&&v!==undefined&&v!==''):value===null||value===undefined||value===''?[]:[value];
const text=value=>values(value).join(' · ');
const link=(url,label)=>safeURL(url)?`<a href="${e(safeURL(url))}" target="_blank" rel="noopener noreferrer">${e(label)} ${icon('external',13)}</a>`:'';
const section=(title,body,kind='')=>`<section class="sc-reading-section${kind?' '+kind:''}"><h3>${e(title)}</h3>${body}</section>`;
const rows=items=>`<dl class="sc-reading-facts">${items.map(([k,v])=>[k,text(v)]).filter(([,v])=>v!=='').map(([k,v])=>`<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>`;
const details=(title,body)=>body?`<details class="sc-reading-details"><summary>${e(title)}</summary>${body}</details>`:'';
const passagesHTML=passages=>(passages||[]).map(p=>{
  const text=plainEvidence(p.text).trim();
  const cells=text.startsWith('|')&&text.endsWith('|')?text.slice(1,-1).split('|').map(v=>v.trim()).filter(Boolean):[text];
  return `<div class="sc-reading-passage"><strong>${e(areaTitles[p.phaseId]||p.phaseTitle||'Saved evidence')}</strong>${cells.map(v=>`<p>${e(v)}</p>`).join('')}</div>`;
}).join('');
const provenance=(items)=>{const known=items.filter(([,value])=>value);return known.length?`<div class="sc-profile-provenance">${known.map(([label,value])=>`<span><span>${e(label)}</span> ${e(value)}</span>`).join('')}</div>`:'';};
const actionHTML=review=>section('What to check next',`<ol class="sc-checklist">${review.next.map(step=>`<li>${e(step)}</li>`).join('')}</ol>`,'sc-profile-next');

const regionNames=typeof Intl?.DisplayNames==='function'?new Intl.DisplayNames(['en'],{type:'region'}):null;
function providerValue(field,value){
  if(['country','birthCountry','citizenship','nationality'].includes(field.key)&&/^[a-z]{2}$/i.test(value)){
    try{return regionNames?.of(value.toUpperCase())||value.toUpperCase();}catch{return value.toUpperCase();}
  }
  return field.key==='topics'?(value.split(/\s+/).map(part=>part).join(' ')):value;
}
function providerFieldSources(field){
  if(!field.sources?.length)return '<p class="sc-provider-no-lineage">No field-level source lineage was returned for this fact.</p>';
  return `<div class="sc-provider-source-list">${field.sources.map(source=>`<a href="${e(safeURL(source.url))}" target="_blank" rel="noopener noreferrer"><span><strong>${e(source.title||source.dataset)}</strong><small>${e(source.dataset)}${source.publisher?` · ${e(source.publisher)}`:''}${source.official===true?' · official publisher':''}</small><small>${source.statementCount||0} ${source.statementCount===1?'statement':'statements'}${source.lastSeen?` · last observed ${e(formatDate(source.lastSeen,true))}`:''}</small>${source.values?.length?`<em>${e(source.values.slice(0,3).join(' · '))}${source.values.length>3?' · …':''}</em>`:''}</span>${icon('external',12)}</a>`).join('')}</div>`;
}
function providerProfileHTML(profile){
  if(!profile?.fields?.length)return '';
  const facts=profile.fields.map(field=>{
    const displayed=(field.values||[]).map(value=>providerValue(field,value));
    const preview=displayed.slice(0,2).join(' · ')+(displayed.length>2?` · +${displayed.length-2} more`:``);
    const count=field.sourceCount?`${field.sourceCount} ${field.sourceCount===1?'source':'sources'}`:'Source lineage unavailable';
    return `<details class="sc-provider-fact"><summary><span><strong>${e(field.label||field.key)}</strong><em>${e(preview)}</em></span><small>${e(count)}</small>${icon('chevron-down',13)}</summary><div>${displayed.length>2?`<ul>${displayed.map(value=>`<li>${e(value)}</li>`).join('')}</ul>`:''}${field.valuesTruncated?`<p class="sc-provider-no-lineage">${Math.max(0,(field.valueCount||0)-displayed.length)} additional values remain on the original provider record.</p>`:''}<p class="sc-provider-lineage-count">${field.statementCount||0} provider ${(field.statementCount||0)===1?'statement':'statements'} · ${field.sourceCount||0} source datasets</p>${providerFieldSources(field)}</div></details>`;
  }).join('');
  const status=profile.status==='completed'?'Field-level lineage retrieved':profile.status==='partial'?'Some source lineage is incomplete':'Summary facts from the match response';
  return section(`Provider profile · ${profile.fieldCount||profile.fields.length} fields`,`<div class="sc-provider-profile-meta"><strong>${e(status)}</strong><span>${profile.sourceCount||0} datasets · ${profile.statementCount||0} statements</span></div>${profile.error?`<p class="sc-reading-guidance">${e(profile.error)}</p>`:''}<div class="sc-provider-facts">${facts}</div>`,'sc-provider-profile');
}

// This describes field comparison only. It is deliberately separate from the
// reviewer's recorded identity decision and is never a risk/confidence score.
function comparisonHTML(review){
  const counts=Object.fromEntries(['match','review','missing'].map(status=>[status,review.comparisons.filter(c=>c.status===status).length]));
  const disagreements=review.comparisons.filter(c=>c.status==='review').map(c=>c.label.toLowerCase());
  return `<div class="sc-profile-assessment ${counts.review?'has-differences':''}"><div><strong>Identity comparison</strong><span>Not identity confirmation</span></div><div class="sc-profile-signals"><span class="match">${counts.match} agree</span><span class="${counts.review?'review':'neutral'}">${counts.review} differ</span><span class="missing">${counts.missing} need detail</span></div>${disagreements.length?`<p>Compare the ${e(disagreements.join(', '))} before linking this candidate to the client.</p>`:''}</div>`+
    section('Why it matched',`<p class="sc-finding-lead">${e(review.whyMatched)}</p>`)+
    section('What differs',`<p>${e(review.whatDiffers.join(' '))}</p>${review.missingDetails.length?`<small>Still needed: ${e(review.missingDetails.join(' '))}</small>`:''}`)+
    details('Compare all identifiers',`<div class="sc-comparison sc-profile-comparison">${review.comparisons.map(c=>`<div class="sc-compare-row ${c.status}"><div><strong>${e(c.label)}</strong><span>${c.status==='match'?'Agrees':c.status==='review'?'Differs / review':'Needs detail'}</span></div><dl><div><dt>You supplied</dt><dd>${e(c.input)}</dd></div><div><dt>Source record</dt><dd>${e(c.source)}</dd></div></dl>${c.note?`<p>${e(c.note)}</p>`:''}</div>`).join('')}</div>`);
}
export function matchExplanationHTML(match,query){const review=explainMatch(match,query);return comparisonHTML(review)+actionHTML(review);}
function companyReadingHTML(source){
 const r=source.match.record,result=source.result||{},review=explainMatch(source.match,source.query);
 return provenance([['Checked',result.checkedAt&&formatDate(result.checkedAt,true)],['Record updated',r.updatedAt&&formatDate(r.updatedAt,true)]])+comparisonHTML(review)+
   section('Company & LEI status',rows([['Company status',r.entityStatus],['LEI registration',r.leiStatus],['Registry authority',r.registrationAuthority],['Registered address',r.addresses],['LEI renewal due',r.nextRenewal&&formatDate(r.nextRenewal)]]))+
   actionHTML(review)+details('Parent references & lookup receipt',`<p>These references describe accounting-consolidating parents or reporting exceptions. They have not been verified as beneficial ownership.</p>${(r.parentLinks||[]).map(p=>link(p.url,`${p.kind==='direct-parent'?'Direct':'Ultimate'} parent · ${p.relation==='reporting-exception'?'reporting exception':'GLEIF reference'}`)).join('')}${rows([['Query',result.lookupText],['Results',result.totalResults],['Response SHA-256',result.sha256]])}${link(r.apiUrl,'Machine-readable GLEIF record')}`);
}
export const areaTitles={identity:'Identity',media:'Media & proceedings',ownership:'Ownership & public roles'};
export function sourceButtons(sources){return (sources||[]).filter(s=>safeURL(s.url)).map(s=>`<a class="sc-source-choice" data-sc-evidence-source="${e(s.key)}" href="${e(safeURL(s.url))}"><span><strong>${e(s.title)}</strong><small>${e(new URL(safeURL(s.url)).hostname)}</small></span>${icon('chevron',14)}</a>`).join('');}
export function phaseReadingHTML(job,id){
  const phase=job?.phases?.find(p=>p.id===id);if(!phase)return '<p>This research area has not started.</p>';
  const sources=sourceCatalog(job).filter(s=>s.cited&&s.phases.some(p=>p.id===id));
  const numbers=new Map(sourceCounts(job).all.map(s=>[s.key,s.number])),issues=phaseIssues(phase).map(v=>/No usable inline source citations/i.test(v)?'No source citations were saved for this research section.':v),identity=identitySummary(job);
  const finding=id==='identity'?identityFinding(job):phase.summary?.finding||phase.identity?.reason||'No supported summary is available. Review the saved research and its limitations.';
  const inputIssue=screeningInputIssue(job.query),next=inputIssue?inputIssue.next:id==='identity'?identityNextStep(job.query):phase.summary?.nextStep||identityNextStep(job.query);
  const statusLabels={pending:'Not started',running:'In progress',completed:'Research completed',partial:'Partial evidence',failed:'Research failed',cancelled:'Research stopped',interrupted:'Research interrupted'};
  return provenance([['Research',statusLabels[phase.status]||'Status unavailable'],['Saved',phase.completedAt&&formatDate(phase.completedAt,true)]])+
    (inputIssue?section('Search details need correction',`<p>${e(inputIssue.message)}</p>`,'sc-profile-warning'):'')+
    section('What we found',`<p class="sc-finding-lead">${e(plainEvidence(finding))}</p>`)+
    (issues.length?section('What is incomplete',`<ul>${issues.map(v=>`<li>${e(v)}</li>`).join('')}</ul>`,'sc-profile-warning'):'')+
    section('What to check next',`<p>${e(next)}</p>${identity.status!=='corroborated'?'<small>These findings concern a candidate. Identity has not been confirmed.</small>':''}`,'sc-profile-next')+
    section(`Cited sources · ${sources.length}`,sources.length?sourceButtons(sources):'<p>No cited sources were saved for this area.</p>')+
    (phase.text?details('Full research notes',`<div class="sr-research-prose">${researchProse(phase.text,(phase.citations||[]).map(c=>({...c,number:numbers.get(canonicalSource(c.url))})))}</div>`):'');
}
function providerReadingHTML(source){
  const review=source.match?explainMatch(source.match,source.query):null;
  const passages=source.passages||[],providerDetails=source.details||[];
  // Identifier values already appear in the comparison. Keep scores and method
  // accessible as supporting detail, rather than repeating them as findings.
  const findingPassages=passages.filter(p=>!['Provider match score','Identifiers to compare'].includes(p.phaseTitle));
  const scorePassages=passages.filter(p=>p.phaseTitle==='Provider match score');
  const roles=providerDetails.filter(d=>/^Reported roles/.test(d.title));
  const otherDetails=providerDetails.filter(d=>!/^Reported roles/.test(d.title));
  const roleLines=[...new Set(roles.flatMap(d=>d.text&&d.text!=='Not supplied'?d.text.split('\n').map(x=>x.trim()).filter(Boolean):[]))];
  return provenance((source.phases||[]).filter(p=>p.at).map(p=>[p.title==='Last seen by provider'?'Provider last seen':'Checked',formatDate(p.at,true)]))+
    (review?comparisonHTML(review):'')+
    section('What this record shows',passagesHTML(findingPassages)||'<p>No categories or findings were supplied.</p>')+
    providerProfileHTML(source.profile)+
    (roleLines.length?section('Reported roles · source descriptions',`<ul class="sc-reported-roles">${roleLines.slice(0,3).map(role=>`<li>${e(role)}</li>`).join('')}</ul>${roleLines.length>3?details(`View all ${roleLines.length} reported roles`,`<ul class="sc-reported-roles">${roleLines.slice(3).map(role=>`<li>${e(role)}</li>`).join('')}</ul>`):''}`):'')+
    (review?actionHTML(review):section('What to check next','<p>Compare the candidate’s identifiers, source datasets and current listing before linking it to the client.</p>','sc-profile-next'))+
    '<p class="sc-reading-guidance">Provider categories are review leads. A PEP role, allegation or connection is not itself a finding of wrongdoing.</p>'+
    details('Provider match score',passagesHTML(scorePassages))+
    otherDetails.map(d=>details(d.title,`<p class="sc-preserve-lines">${e(d.text)}</p>`)).join('');
}
export function sourceReadingHTML(source){
  if(source.procurement){
    const r=source.match.record,result=source.result||{},review=explainMatch(source.match,source.query);
    return provenance([['Checked',result.checkedAt&&formatDate(result.checkedAt,true)],['List retrieved',result.retrievedAt&&formatDate(result.retrievedAt,true)]])+comparisonHTML(review)+
      section('Procurement restriction',`<p class="sc-finding-lead">${e(r.debarmentStatus||'Returned entry')} in World Bank Table 1. This concerns eligibility for World Bank-financed contracts, not an asset-freeze determination.</p>${rows([['Period starts',r.listedAt&&formatDate(r.listedAt)],['Period ends / status',r.ineligibilityPeriod],['Publisher notes reference',r.notesReference],['Published grounds',r.reasons],['Recorded address',r.addresses]])}`)+
      actionHTML(review)+section('Conditions to verify',`<p>Check release conditions, controlled affiliates and project scope before relying on the listing or its end date.</p>${link(r.notesUrl,'World Bank notes on debarred firms and individuals')}`)+
      details('Coverage & source receipt',`${result.detail?`<p>${e(result.detail)}</p>`:''}${rows([['Publisher refresh',result.publishedAt&&formatDate(result.publishedAt,true)],['Records searched',result.recordCount],['Record reference',r.id],['Response SHA-256',result.sha256]])}`);
  }
  if(source.company)return companyReadingHTML(source);
  if(source.provider)return providerReadingHTML(source);
  const passages=source.passages||[],phases=source.phases||[];
  return `<div class="sc-profile-evidence-label">${icon(source.official?'file':source.cited?'attach':'search',14)}<span>${source.official?'Returned source record':source.cited?'Cited in the research':'Unverified search lead'}</span></div>`+
    section(source.official?'Returned record':'Linked research passages',passages.length?passagesHTML(passages):source.cited?'<p>This page was cited, but no supporting passage was saved. Open the original and verify what it supports.</p>':'<p>This is an unverified search lead. No finding cites this page.</p>')+
    section('What to check next',`<p>${source.official?'Compare this record’s identifiers with the subject and check the current source entry.':'Open the original source and verify the person or company, publication date, claim and reported outcome.'}</p>`,'sc-profile-next')+
    (!source.official?'<p class="sc-reading-guidance">Linked passages are AI research summaries, not quotations or independently verified findings. Allegations remain allegations.</p>':'')+
    details('Source details',phases.length?rows(phases.map(p=>[areaTitles[p.id]||p.title||'Research',`${p.status||'Status unavailable'}${p.at?' · '+formatDate(p.at,true):' · Date not supplied'}`])):'<p>No source date or research receipt was saved.</p>');
}
export function officialReadingHTML(match,check,query={}){
  const r=match.record,presentation=recordPresentation(r),review=explainMatch(match,query);
  const programmes=values(r.programs),exportList=r.sourceId==='bis'||programmes.some(p=>/BIS|export control/i.test(p)),nonSDN=programmes.some(p=>/non-SDN|CMIC/i.test(p));
  const meaning=nonSDN?'An OFAC Non-SDN record was returned. Review the programme and applicable restrictions; do not interpret it as an SDN asset-freeze entry.':exportList?'An export-control record was returned. Review the listed entity, licence requirements and applicable restrictions. This is not automatically an asset freeze.':match.identifierMatch?'An official record shares the supplied identifier. Establish whether this is the same person or company before applying its listing to the client.':'The official source returned a possible name match. The entry alone does not establish that it belongs to the subject.';
  return provenance([['Checked',check?.checkedAt&&formatDate(check.checkedAt,true)],['List retrieved',check?.retrievedAt&&formatDate(check.retrievedAt,true)]])+comparisonHTML(review)+
    (presentation.affiliate?section('Affiliate entry',`<p>The portal labels this entity as an affiliate of ${e(presentation.listedWith)} Compare this entity’s own identifiers; it is not automatically the company you searched for.</p>`,'sc-profile-warning'):'')+
    section('What was found',`<p class="sc-finding-lead">${e(meaning)}</p>${programmes.length?`<div class="sc-program-tags">${programmes.map(p=>`<span>${e(p)}</span>`).join('')}</div>`:''}`)+
    ((r.restrictions||r.licensePolicy||r.federalRegisterNotice||r.endedAt)?section('Restriction details',rows([[exportList?'Licence requirement':'Recorded measures',r.restrictions],['Review policy',r.licensePolicy],['Federal Register',r.federalRegisterNotice],['Recorded end date',r.endedAt]])):'')+
    actionHTML(review)+'<button class="btn primary sc-review-identity" data-sc-review-identity>Record identity decision</button>'+
    details('Full identifiers & addresses',rows([['Matched name',match.nameMatched||r.name],['Country',r.countries],['Date of birth',r.type!=='entity'?r.datesOfBirth:''],['Passport numbers',identifierValues(r,'passportNumber')],['Company numbers',identifierValues(r,'registrationNumber')],['LEI',r.lei],['Other identifiers',r.identifiers],['Address',r.addresses]]))+
    details('Matching method & signals',`${!match.identifierMatch&&Number.isFinite(match.score)?`<p>${e(Math.round(match.score))}% name similarity. This compares names, not identity or risk.</p>`:''}${match.identifierMatch?`<p>Exact ${match.identifierMatch==='passportNumber'?'passport-number':'company-number'} match after normalising spaces and hyphens. Names and other identifiers still require comparison.</p>`:''}${match.signals?.length?`<ul class="sc-reading-signals">${match.signals.map(v=>`<li>${e(v)}</li>`).join('')}</ul>`:''}`)+
    (r.reasons?details('Listing details',`<p>${e(r.reasons)}</p>`):'')+
    (r.aliases?.length?details(`Other names · ${r.aliases.length}`,`<p>${e(r.aliases.join(' · '))}</p>`):'')+
    details('Source dates & references',rows([['Record reference',r.localReference?'Local reference; source does not supply an ID':r.id],['List retrieved',check?.retrievedAt?formatDate(check.retrievedAt,true):'Not supplied'],['Listed',r.listedAt?formatDate(r.listedAt):'']])+(r.legalSources||[]).map((url,i)=>link(url,`Original listing source ${i+1}`)).join(''));
}
