import {reviewLabels} from './screening-review.js';
import {escape as e,icon} from '../core.js';
import {formatDate} from './screening-view-model.js';
export function procurementResult(job){
 const r=job?.worldbank;
 if(!r)return job?.schemaVersion>=7?{status:'failed',error:'No World Bank result was saved. The procurement check is incomplete.'}:null;
 if(r.status==='completed'&&(!Number.isSafeInteger(r.totalResults)||r.totalResults<0||!Array.isArray(r.candidates)||r.totalResults<r.candidates.length||(r.totalResults>0&&!r.candidates.length)))return {...r,status:'failed',error:'World Bank returned incomplete match evidence. Retry the procurement check.'};
 return r;
}
export function procurementEvidence(job,decisions={}){
 const r=procurementResult(job);if(!r)return '';
 const done=r.status==='completed',candidates=done?(r.candidates||[]):[];
 const label=done?`${r.totalResults} possible ${r.totalResults===1?'match':'matches'}`:['pending','running'].includes(r.status)?'Checking…':'Check incomplete';
 const button=(m,i)=>`<button class="sr-official-candidate" data-sr-worldbank="${i}"><span>${e(m.record.name)}</span><small>${e(m.record.debarmentStatus)} · ${e(m.record.countries?.join(' · '))} · ${e(reviewLabels[decisions[m.record.id]?.status]||'Identity needs review')}</small>${icon('chevron',13)}</button>`;
 return `<details class="sr-official-checks sc-procurement-check"><summary>World Bank · Procurement <span>${e(label)}</span>${icon('chevron-down',14)}</summary><div><p class="sr-reading-note">Table 1 debarments and cross-debarments. Separate from asset-freeze sanctions.</p>${r.error?`<p role="status">${e(r.error)}</p>`:''}${done?`<p class="sr-reading-note">Checked ${e(formatDate(r.checkedAt,true))} · Publisher refresh ${e(formatDate(r.publishedAt,true))}</p>`:''}${candidates.slice(0,10).map(button).join('')}${candidates.length>10?`<details class="sc-procurement-more"><summary>More returned records · ${candidates.length-10}</summary>${candidates.slice(10).map((m,i)=>button(m,i+10)).join('')}</details>`:''}${done&&!candidates.length?'<p>No name matches in World Bank Table 1. Other sanctions, affiliates and eligibility conditions may require separate review.</p>':''}${r.atLimit?`<p>${candidates.length} of ${r.totalResults} possible matches returned. Refine the name to retrieve the rest.</p>`:''}<p class="sr-reading-note">${e(r.detail||'A missing check cannot rule out a match.')}</p></div></details>`;
}
export function procurementSource(match,result,query){return {procurement:true,match,result,query,title:match.record.name,url:match.record.sourceUrl};}
