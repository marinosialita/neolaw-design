// Local review history preserves revisions; it is not an authenticated audit log.
import {restoreReturnedMatches} from './screening-match.js';
export const reviewLabels=Object.freeze(Object.assign(Object.create(null), {
  investigate:'Needs further review', confirmed:'Same identity', dismissed:'Different identity'
}));
// Namespace provider IDs so they cannot overwrite an official-list decision.
export function providerRecordId(candidate){return typeof candidate?.id==='string'&&candidate.id?`opensanctions:${candidate.id}`:'';}
// Count source records, never unique people or risk. Decisions on absent records
// and AI identity assessments cannot resolve a current candidate.
export function reviewProgress(report={}) {
  const current=restoreReturnedMatches(report),entries=[],seen=new Set(),job=current.research||{};
  let limited=Number.isSafeInteger(current.totalMatches)&&current.totalMatches>(current.matches||[]).length;
  const add=(id,kind,value)=>{
    if(id&&seen.has(id))return;
    if(id)seen.add(id);
    const saved=id?current.decisions?.[id]:null,status=id&&Object.hasOwn(reviewLabels,saved?.status)?saved.status:'unreviewed';
    entries.push({id,kind,value,status});
  };
  for(const match of current.matches||[])if(match?.record)add(match.record.id||'','official',match);
  const wb=job.worldbank;
  if(wb?.status==='completed'&&Number.isSafeInteger(wb.totalResults)&&wb.totalResults>=0&&Array.isArray(wb.candidates)&&wb.totalResults>=wb.candidates.length&&(!wb.totalResults||wb.candidates.length)){
    for(const match of wb.candidates)if(match?.record)add(match.record.id||'','procurement',match);
    limited ||= Boolean(wb.atLimit)||wb.totalResults>wb.candidates.length;
  }
  const provider=job.opensanctions;
  if(provider?.status==='completed'){
    for(const candidate of provider.candidates||[])if(candidate)add(providerRecordId(candidate),'provider',candidate);
    limited ||= Boolean(provider.atLimit);
  }
  const counts={unreviewed:0,investigate:0,confirmed:0,dismissed:0};
  for(const entry of entries)counts[entry.status]++;
  const decided=counts.confirmed+counts.dismissed;
  return {entries,counts,total:entries.length,decided,open:entries.length-decided,unreviewable:entries.filter(v=>!v.id).length,limited};
}
export function reviewProgressText(report={}) {
  const p=reviewProgress(report);if(!p.total)return '';
  return `${p.open} of ${p.total} source records still open. ${p.counts.unreviewed} not started; ${p.counts.investigate} need further review; ${p.counts.confirmed} same identity; ${p.counts.dismissed} different identity. Recorded decisions only, not client approval. GLEIF and web findings are separate.${p.limited?' More results may exist outside this retrieved set.':''}${p.unreviewable?' Some records lack a reviewable ID; check the original source.':''}`;
}
export function recordDecision(report,record,value,at=new Date().toISOString()) {
  if(!record?.id||!Object.hasOwn(reviewLabels,value?.status))throw new Error('Choose a valid record and identity decision.');
  const next={status:value.status,note:String(value.note||'').trim(),reviewer:String(value.reviewer||'').trim(),at};
  if(next.note.length>4000||next.reviewer.length>120)throw new Error('Shorten the reason or reviewer name before saving.');
  if(next.status!=='investigate'&&!next.note)throw new Error('Add a reason so this decision has an evidence trail.');
  const previous=report.decisions?.[record.id];
  if(previous&&['status','note','reviewer'].every(k=>(previous[k]||'')===(next[k]||'')))return report;
  const reviewLog=[...(report.reviewLog||[])];
  const event=(decision,kind)=>({id:globalThis.crypto?.randomUUID?.()||`review-${Date.now()}-${Math.random().toString(36).slice(2)}`,recordId:record.id,recordName:record.name||record.id,sourceId:record.sourceId||'',...decision,kind});
  if(previous&&!reviewLog.some(item=>item.recordId===record.id))reviewLog.push(event(previous,'previous_saved_decision'));
  reviewLog.push(event(next,'decision_saved'));
  return {...report,decisions:{...report.decisions,[record.id]:next},reviewLog};
}
