import {escape as e,icon} from '../core.js';
import {formatDate} from './screening-view-model.js';
import {rankedCompanyCandidates} from './screening-match.js';
export function companyEvidence(job){
 const r=job?.gleif;if(!r||r.status==='not_applicable')return '';
 const candidates=rankedCompanyCandidates(r,job.query),done=r.status==='completed';
 const label=done?`${r.totalResults} company ${r.totalResults===1?'record':'records'}`:['pending','running'].includes(r.status)?'Checking…':'Lookup incomplete';
 return `<details class="sr-official-checks sc-company-check"><summary>GLEIF · Company identity <span>${e(label)}</span>${icon('chevron-down',14)}</summary><div><p class="sr-reading-note">Legal names, LEIs and registration details. Separate from sanctions screening.</p>${r.error?`<p role="status">${e(r.error)}</p>`:''}${done?`<p class="sr-reading-note">${e(r.lookup)}: ${e(r.lookupText)} · Checked ${e(formatDate(r.checkedAt,true))}</p>`:''}${candidates.slice(0,10).map((m,i)=>`<button class="sr-official-candidate" data-sr-company="${i}"><span>${e(m.record.name)}</span><small>${e(m.record.countries.join(' · '))} · LEI ${e(m.record.lei)} · Compare identity</small>${icon('chevron',13)}</button>`).join('')}${done&&!candidates.length?'<p>No LEI records returned. The company may have no LEI or use another name. Verify it in the company register.</p>':''}${r.atLimit||candidates.length>10?`<p class="sr-reading-note">Showing ${Math.min(candidates.length,10)} of ${r.totalResults} returned search results. Refine the name or use the exact LEI to narrow the lookup.</p>`:''}<p class="sr-reading-note">LEI registration status is separate from company status. GLEIF parent links concern accounting consolidation; they do not establish complete beneficial ownership.</p></div></details>`;
}
export function companySource(match,result,query){return {company:true,match,query,title:match.record.name,url:match.record.sourceUrl,result};}
