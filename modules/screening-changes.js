import {profileRecords} from './screening-profile.js';
import {normalizeName} from './screening-engine.js';
import {escape as e,icon} from '../core.js';
import {formatDate,sourceLabels} from './screening-view-model.js';

const fields=['name','type','country','dob','passportNumber','registrationNumber','lei'];
const stable=value=>Array.isArray(value)?value.map(stable).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value??null;
const signature=entry=>JSON.stringify(stable(Object.fromEntries(['name','aliases','type','countries','datesOfBirth','passportNumbers','registrationNumbers','registrationNumber','lei','programs','reasons','positions','addresses','identifiers','listingStatus','listingStatusNote','endedAt','parentLinks'].map(key=>[key,entry.match.record[key]]).concat(entry.candidate?[['providerCategories',entry.candidate.categories],['providerPositions',entry.candidate.positions],['providerRelationships',entry.candidate.relationships]]:[]))));
function receipts(report){return new Map([...(report.research?.officialChecks||[]).map(c=>[c.id,c]),...['opensanctions','worldbank','gleif'].filter(k=>report.research?.[k]).map(k=>[k,report.research[k]])]);}
const sourceKey=entry=>entry.kind==='procurement'?'worldbank':entry.kind==='company'?'gleif':entry.match.record.sourceId;
function complete(receipt){
  if(receipt?.status!=='completed'||receipt.atLimit)return false;
  const n=receipt.matchCount??receipt.totalResults??receipt.possibleMatches;
  return !Number.isFinite(n)||(Array.isArray(receipt.candidates)&&n<=receipt.candidates.length);
}
// Differences describe two saved retrievals. Absence never establishes delisting.
export function compareScreenings(previous,current){
  const base={schemaVersion:1,previousReportId:previous?.id||current.previousReportId||'',previousAt:previous?.createdAt||'',currentAt:current.createdAt,added:[],changed:[],notReturned:[],newlyAvailable:[],gaps:[],comparedSources:[]};
  if(!previous)return {...base,status:'missing',note:'The previous check is not available on this device.'};
  if(fields.some(k=>normalizeName(previous.query?.[k])!==normalizeName(current.query?.[k])))return {...base,status:'different_subject_details',note:'Search details changed. Review these checks separately; a record difference may come from the changed query.'};
  const oldReceipts=receipts(previous),newReceipts=receipts(current);
  const oldEntries=profileRecords(previous),newEntries=profileRecords(current),oldMap=new Map(oldEntries.map(v=>[sourceKey(v)+':'+v.id,v])),newMap=new Map(newEntries.map(v=>[sourceKey(v)+':'+v.id,v]));
  const item=v=>({id:v.id,name:v.match.record.name||v.id,sourceId:sourceKey(v),source:v.source,kind:v.kind});
  for(const sourceId of new Set([...oldReceipts.keys(),...newReceipts.keys()])){
    const old=oldReceipts.get(sourceId),next=newReceipts.get(sourceId),label=sourceLabels[sourceId]||({worldbank:'World Bank',opensanctions:'OpenSanctions',gleif:'GLEIF'})[sourceId]||sourceId;
    if(sourceId==='gleif'&&old?.status==='not_applicable'&&next?.status==='not_applicable')continue;
    if(complete(old)&&complete(next))base.comparedSources.push(sourceId);
    else base.gaps.push({sourceId,label,previousStatus:old?.status||'not_checked',currentStatus:next?.status||'not_checked',note:next?.status!=='completed'?'Current check is incomplete or not run.':old?.status!=='completed'?'No completed earlier check to compare.':'Returned records are limited; absence cannot be compared.'});
  }
  for(const [key,entry] of newMap){
    const sourceId=sourceKey(entry),old=oldMap.get(key);
    if(!old){(complete(oldReceipts.get(sourceId))?base.added:base.newlyAvailable).push(item(entry));}
    else if(signature(old)!==signature(entry))base.changed.push(item(entry));
  }
  for(const [key,entry] of oldMap)if(!newMap.has(key)&&base.comparedSources.includes(sourceKey(entry)))base.notReturned.push(item(entry));
  return {...base,status:current.research?.status==='running'?'running':'compared',note:'Changes are between retrieved records, not confirmed new sanctions or delistings. Earlier identity decisions have not been applied to this check.'};
}
export function screeningChangesHTML(comparison){
  if(!comparison)return '';
  const c=comparison,groups=[['added','Newly returned'],['changed','Details changed'],['notReturned','Not returned now'],['newlyAvailable','Newly available evidence']];
  const total=groups.reduce((n,[k])=>n+c[k].length,0);
  return `<details class="sc-changes" data-sc-change-details><summary><span>${icon('history',16)}Changes since previous check</span><small>${c.status==='running'?'Updating…':total+' record '+(total===1?'change':'changes')}</small>${icon('chevron-down',14)}</summary><div class="sc-changes-body"><p>Compared with ${e(c.previousAt?formatDate(c.previousAt,true):'the previous saved check')}.</p><p>${e(c.note)}</p>${c.status==='compared'||c.status==='running'?`<div class="sc-change-counts">${groups.map(([key,title])=>`<div><strong>${c[key].length}</strong><span>${title}</span></div>`).join('')}</div>${groups.filter(([key])=>c[key].length).map(([key,title])=>`<details><summary>${title} · ${c[key].length}</summary><ul>${c[key].map(v=>`<li><strong>${e(v.name)}</strong><span>${e(v.source)} · ${e(v.id)}</span></li>`).join('')}</ul></details>`).join('')}${c.gaps.length?`<details><summary>Comparison gaps · ${c.gaps.length}</summary><ul>${c.gaps.map(g=>`<li><strong>${e(g.label)}</strong><span>${e(g.note)}</span></li>`).join('')}</ul></details>`:''}`:''}<button class="sc-quiet-button" data-sc-previous-report>Open previous check ${icon('arrow',13)}</button></div></details>`;
}
