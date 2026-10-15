import {officialSummary, passportCoverage} from './research-evidence.js';
import {reviewProgress} from './screening-review.js';
import {screeningInputIssue} from './screening-input.js';
import {procurementResult} from './screening-procurement.js';
import {formatDate, safeURL} from './screening-view-model.js';

// A device-local reviewer workflow. These are entered names and editable local
// records, not authenticated approvals or a tamper-proof audit trail.
export const assessmentLabels = Object.freeze({
  open:'Review open', needs_information:'Needs information',
  escalated:'Escalated', review_recorded:'Review recorded'
});
const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const text = value => typeof value === 'string' ? value.trim() : '';
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
const day = value => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) throw new Error('A valid assessment time is required.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Nicosia',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

// Receipt times, loaded portraits and UI state do not change substantive evidence.
// Record dates (birth, appointment, listing and source updatedAt) remain included.
const presentationKeys = new Set(['checkedAt','retrievedAt','verifiedAt','fetchedAt','startedAt','completedAt','loadedAt','elapsedMs','timing','photos','photo','image','images','imageUrl','portrait','portraits','portraitStatus','selected','expanded']);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.keys(value).filter(k=>!presentationKeys.has(k)&&value[k]!==undefined).sort().map(k=>[k,stable(value[k])]));
  return value ?? null;
}
const pick = (value, keys) => Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
function receipt(value) {
  return pick(value,['id','status','matchCount','totalResults','possibleMatches','candidates','atLimit','error','warnings','relationshipStatus','relationshipError','profileStatus','profileCoverage','query','parsedQuery','lookup','lookupText','identifierChecks']);
}
/** Change detector only; deliberately not a cryptographic integrity guarantee. */
export function assessmentEvidenceKey(report={}) {
  const job=report.research, progress=reviewProgress(report);
  const evidence={query:pick(report.query,['name','type','country','dob','passportNumber','registrationNumber','lei']),
    research:job?{schemaVersion:job.schemaVersion,mode:job.mode,status:job.status,researchNeedsRefresh:!!job.researchNeedsRefresh,
      officialChecks:(job.officialChecks||[]).map(receipt).sort((a,b)=>String(a.id).localeCompare(String(b.id))),
      opensanctions:receipt(job.opensanctions),worldbank:receipt(job.worldbank),gleif:receipt(job.gleif),
      phases:(job.phases||[]).map(p=>pick(p,['id','status','text','summary','identity','sources','citations','warnings','error','affiliations'])).sort((a,b)=>String(a.id).localeCompare(String(b.id)))}:null,
    sourceSnapshots:job?undefined:report.sourceSnapshots,
    matches:progress.entries.map(v=>({id:v.id,kind:v.kind,value:v.value,decision:pick(report.decisions?.[v.id],['status','reviewer','note'])})).sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id)),
    totalMatches:Array.isArray(job?.officialChecks)?job.officialChecks.reduce((n,c)=>n+(c.status==='completed'&&Number.isSafeInteger(c.matchCount)&&c.matchCount>=0?c.matchCount:0),0):report.totalMatches};
  const serialized=JSON.stringify(stable(evidence));
  // Two seeded 32-bit checksums avoid a long duplicate copy of the saved dossier.
  let a=2166136261,b=3339675911;
  for(let i=0;i<serialized.length;i++){a=Math.imul(a^serialized.charCodeAt(i),16777619);b=Math.imul(b^serialized.charCodeAt(i),2246822519);}
  return `evidence-v1:${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}:${serialized.length}`;
}

export function validAssessmentEvent(value) {
  return object(value) && value.schemaVersion===1 && typeof value.id==='string' && value.id.length>0 && value.id.length<=250 &&
    Object.hasOwn(assessmentLabels,value.status) && typeof value.reviewer==='string' && !!value.reviewer.trim() && value.reviewer.length<=120 &&
    typeof value.reason==='string' && !!value.reason.trim() && value.reason.length<=4000 &&
    typeof value.at==='string' && Number.isFinite(Date.parse(value.at)) && typeof value.evidenceKey==='string' && /^evidence-v1:[0-9a-f]{16}:\d+$/.test(value.evidenceKey) &&
    (value.nextReviewDate==='' || dateValid(value.nextReviewDate)) && typeof value.findingsReviewed==='boolean' &&
    Array.isArray(value.gaps) && value.gaps.every(g=>object(g)&&typeof g.code==='string'&&typeof g.text==='string') &&
    Array.isArray(value.scopeNotes) && value.scopeNotes.every(v=>typeof v==='string');
}

function readiness(report) {
  const job=report?.research, gaps=[], scopeNotes=[], progress=reviewProgress(report);
  const add=(code,message)=>gaps.push({code,text:message});
  const input=screeningInputIssue(report?.query);
  if(!text(report?.query?.name)) add('missing_subject','Enter the subject’s name and run a screening.');
  if(input) add('input_issue',input.message||input.formMessage||'Correct the supplied search details and repeat the check.');
  const official=officialSummary(job);
  if(!official) add('official_not_checked','No official-check receipts are saved. Run the screening first.');
  else for(const check of official.checks){
    if(check.status!=='completed') add('official:'+check.id,`${check.name}: ${['pending','running'].includes(check.status)?'check has not finished':'check is incomplete'}.`);
    else if((check.matchCount>0&&!Array.isArray(check.candidates))||(Array.isArray(check.candidates)&&check.matchCount!==check.candidates.filter(c=>object(c?.record)).length)) add('official_evidence:'+check.id,`${check.name}: the saved candidate records do not support its result count. Retrieve the complete evidence.`);
    else if(check.atLimit) add('official_limit:'+check.id,`${check.name}: the result limit was reached. Refine the search before recording a completed review.`);
  }
  if(job&&['pending','running'].includes(job.status)) add('running','The screening is still running.');
  const provider=job?.opensanctions;
  if(!provider||provider.status==='not_configured') scopeNotes.push('OpenSanctions was not checked. PEP and other provider coverage is outside this saved check.');
  else if(provider.status!=='completed') add('opensanctions','OpenSanctions did not complete. Retry the provider check.');
  else {
    const count=provider.possibleMatches, candidates=provider.candidates;
    // possibleMatches counts only candidates above the provider's threshold;
    // returnedCandidates includes all rows and must not be confused with it.
    if(!Number.isSafeInteger(count)||count<0||!Array.isArray(candidates)||count>candidates.length||candidates.some(c=>!object(c))||(provider.returnedCandidates!=null&&provider.returnedCandidates!==candidates.length)) add('opensanctions_evidence','OpenSanctions returned incomplete candidate evidence. Retrieve a complete result.');
    if(provider.atLimit) add('opensanctions_limit','OpenSanctions reached its result limit. Refine the search and review the remaining candidates.');
    if(provider.relationshipStatus&&provider.relationshipStatus!=='completed'&&provider.relationshipStatus!=='not_requested') add('provider_relationships','Requested OpenSanctions relationships are incomplete.');
    if(provider.profileStatus&&provider.profileStatus!=='completed'&&provider.profileStatus!=='not_requested') add('provider_profile','OpenSanctions profile facts or their field-level source lineage are incomplete.');
    scopeNotes.push('OpenSanctions categories are provider classifications; this does not establish comprehensive PEP coverage or confirm identity.');
  }
  const procurement=procurementResult(job);
  if(procurement&&procurement.status!=='completed') add('worldbank','World Bank procurement did not complete. Retry this check.');
  else if(procurement&&(procurement.atLimit||procurement.totalResults>procurement.candidates.length)) add('worldbank_limit','World Bank results are limited. Retrieve and review the remaining candidate records.');
  else if(!procurement) scopeNotes.push('No World Bank procurement check was recorded in this earlier report.');
  const company=job?.gleif;
  if(report.query?.type==='entity') {
    if(!company||company.status!=='completed') add('gleif','The company identity lookup has not completed.');
    else if(!Number.isSafeInteger(company.totalResults)||company.totalResults<0||!Array.isArray(company.candidates)||company.totalResults!==company.candidates.length||company.candidates.some(m=>!object(m?.record))||company.atLimit) add('gleif_evidence','The company identity lookup returned incomplete or limited records.');
    scopeNotes.push('GLEIF is an LEI identity source; company-register and complete beneficial-ownership checks remain separate.');
  }
  if(job&&job.mode!=='search'){
    for(const id of ['identity','media','ownership']){
      const phase=job.phases?.find(p=>p.id===id);
      if(phase?.status!=='completed') add('research:'+id,`${{identity:'Identity',media:'Media and proceedings',ownership:'Ownership and public roles'}[id]} research is incomplete.`);
      else if(!text(phase.text)||!phase.citations?.some(c=>safeURL(c?.url))) add('research_evidence:'+id,`${{identity:'Identity',media:'Media and proceedings',ownership:'Ownership and public roles'}[id]} has no saved findings with usable source citations.`);
    }
    if(job.researchNeedsRefresh) add('research_stale','Earlier web findings have not been reassessed against the updated source checks.');
    scopeNotes.push('Web findings are source-backed leads. This review does not make allegations proven findings or establish comprehensive PEP/ownership coverage.');
  } else scopeNotes.push('Wider web research was not run. This review covers only the checks saved in this report.');
  const passport=passportCoverage(job,report.query);
  if(passport&&!passport.checked&&!passport.providerAccepted) add('passport','No completed passport-field comparison is recorded.');
  if(progress.open) add('open_records',`${progress.open} of ${progress.total} returned source records still need an identity decision.`);
  if(progress.limited&&!gaps.some(g=>g.code.includes('limit')||g.code.startsWith('official_evidence'))) add('limited_results','More candidate records may exist outside this retrieved set.');
  if(progress.unreviewable) add('missing_record_ids',`${progress.unreviewable} returned records have no reviewable identifier. Check the originals before concluding the review.`);
  const unsupported=progress.entries.filter(v=>['confirmed','dismissed'].includes(v.status)&&!text(report.decisions?.[v.id]?.note));
  if(unsupported.length) add('decision_reasons',`${unsupported.length} identity decisions have no saved reason. Add the supporting explanation.`);
  return {gaps,scopeNotes,progress};
}

/** All state is derived from the report; a draft never becomes a saved outcome. */
export function assessmentSummary(report={}, {now=new Date().toISOString()}={}) {
  const {gaps,scopeNotes,progress}=readiness(report);
  const log=(Array.isArray(report.assessmentLog)?report.assessmentLog:[]).filter(validAssessmentEvent);
  const recorded=log.at(-1)||null, evidenceKey=assessmentEvidenceKey(report);
  const stale=!!recorded&&recorded.evidenceKey!==evidenceKey;
  const invalidRecorded=recorded?.status==='review_recorded'&&(!recorded.findingsReviewed||gaps.length>0);
  const status=stale||invalidRecorded?'open':recorded?.status||'open';
  const nextReviewDate=recorded?.nextReviewDate||'',today=day(now);
  const due=!!nextReviewDate&&nextReviewDate<=today;
  return {status,label:stale||invalidRecorded?'Review needs updating':assessmentLabels[status],recorded,log,stale:stale||!!invalidRecorded,
    gaps,scopeNotes,progress,evidenceKey,canRecord:gaps.length===0,
    nextReviewDate,due,overdue:due&&nextReviewDate<today,
    note:stale||invalidRecorded?'Evidence or identity decisions have changed. The previous outcome is retained; record an updated review.':recorded?'Reviewer-entered outcome for the saved evidence. Not client approval.':'Record what happens next after reviewing the saved evidence.',
    auditNote:'Stored on this device. Reviewer names are entered, not authenticated; history is not tamper-proof.'};
}

/** Append only: callers must persist the returned report and handle storage errors. */
export function recordAssessment(report,value,at=new Date().toISOString()) {
  if(!Object.hasOwn(assessmentLabels,value?.status)) throw new Error('Choose a review outcome.');
  const reviewer=text(value.reviewer), reason=text(value.reason),nextReviewDate=text(value.nextReviewDate),findingsReviewed=value.findingsReviewed===true;
  if(!reviewer) throw new Error('Enter the reviewer’s name.');
  if(!reason) throw new Error('Add the reason and the next action for this outcome.');
  if(reviewer.length>120||reason.length>4000) throw new Error('Shorten the reviewer name or reason before saving.');
  const today=day(at);
  if(nextReviewDate&&(!dateValid(nextReviewDate)||nextReviewDate<today)) throw new Error('Choose today or a future date for the next review.');
  const summary=assessmentSummary(report,{now:at});
  if(value.status==='review_recorded'&&summary.gaps.length) throw new Error('Resolve the outstanding checks and identity reviews, or choose Needs information or Escalated.');
  if(value.status==='review_recorded'&&!findingsReviewed) throw new Error('Confirm that you reviewed the findings, scope and follow-up before recording the review.');
  const next={schemaVersion:1,status:value.status,reviewer,reason,nextReviewDate,findingsReviewed,evidenceKey:summary.evidenceKey,
    gaps:summary.gaps.map(g=>({...g})),scopeNotes:[...summary.scopeNotes]};
  if(summary.recorded&&['status','reviewer','reason','nextReviewDate','findingsReviewed','evidenceKey'].every(k=>summary.recorded[k]===next[k])) return report;
  const event={...next,id:globalThis.crypto?.randomUUID?.()||`assessment-${Date.now()}-${Math.random().toString(36).slice(2)}`,at:new Date(at).toISOString()};
  return {...report,assessmentDraft:null,assessmentLog:[...(Array.isArray(report.assessmentLog)?report.assessmentLog:[]),event]};
}

/** Optional compact UI. Submit fields are status, reviewer, reason, nextReviewDate,
 * findingsReviewed. Root owns draft protection, saving, focus and error display. */
export function assessmentFormHTML(report={}, {draft=report.assessmentDraft,now=new Date().toISOString()}={}) {
  const s=assessmentSummary(report,{now}),current=draft||(!s.stale?s.recorded:null)||{},id='sc-assessment-'+String(report.id||'current').replace(/[^a-z0-9_-]/gi,'');
  const status=Object.hasOwn(assessmentLabels,current.status)?current.status:s.gaps.length?'needs_information':'open';
  return `<details class="sc-assessment" data-sc-assessment><summary><span>Review outcome</span><span class="sc-assessment-state${s.stale||s.due?' is-attention':''}">${e(s.label)}${s.due?' · Review due':''}</span></summary><div class="sc-assessment-body"><p>${e(s.note)}</p>${s.recorded?`<div class="sc-assessment-recorded"><strong>${e(assessmentLabels[s.recorded.status])}</strong><span>${e(s.recorded.reviewer)} · ${e(formatDate(s.recorded.at,true))}</span><p>${e(s.recorded.reason)}</p>${s.nextReviewDate?`<span>Next review: ${e(formatDate(s.nextReviewDate))}${s.overdue?' · Overdue':s.due?' · Due today':''}</span>`:''}</div>`:''}${s.gaps.length?`<details class="sc-assessment-gaps"><summary>${s.gaps.length} outstanding ${s.gaps.length===1?'item':'items'}</summary><ul>${s.gaps.map(g=>`<li>${e(g.text)}</li>`).join('')}</ul></details>`:''}<form data-sc-assessment-form><div class="sc-assessment-fields"><label for="${id}-status">Outcome<select id="${id}-status" name="status">${Object.entries(assessmentLabels).map(([key,label])=>`<option value="${key}"${status===key?' selected':''}${key==='review_recorded'&&!s.canRecord?' disabled':''}>${e(label)}</option>`).join('')}</select></label><label for="${id}-reviewer">Reviewer name<input id="${id}-reviewer" name="reviewer" value="${e(current.reviewer||'')}" maxlength="120" autocomplete="name" required></label></div><label for="${id}-reason">Reason and next action<textarea id="${id}-reason" name="reason" rows="3" maxlength="4000" required placeholder="Explain the outcome and what needs to happen next.">${e(current.reason||'')}</textarea></label><div class="sc-assessment-fields"><label for="${id}-next">Next review <span>Optional · local reminder</span><input id="${id}-next" name="nextReviewDate" type="date" min="${day(now)}" value="${e(current.nextReviewDate||'')}"></label></div><label class="sc-assessment-ack"><input name="findingsReviewed" type="checkbox"${current.findingsReviewed?' checked':''}><span>I reviewed the findings, scope and required follow-up. This is not client approval.</span></label><p class="sc-assessment-error" role="alert" data-sc-assessment-error hidden></p><button type="submit" class="btn primary">Record outcome</button></form><details class="sc-assessment-scope"><summary>Review scope${s.log.length?' and history':''}</summary><ul>${s.scopeNotes.map(note=>`<li>${e(note)}</li>`).join('')}</ul>${s.log.length?`<ol>${s.log.map(item=>`<li><strong>${e(assessmentLabels[item.status])}</strong> · ${e(item.reviewer)} · ${e(formatDate(item.at,true))}<p>${e(item.reason)}</p></li>`).join('')}</ol>`:''}<p>${e(s.auditNote)}</p></details></div></details>`;
}
