import {escape as e,icon} from '../core.js';
import {officialSummary,sourceCounts} from './research-evidence.js';
import {sourceMarks,officialPortals} from './screening-view-model.js';
import {matchesForOfficialCheck} from './screening-match.js';

// Counts describe the evidence actually saved, never identity confidence or risk.
export function evidenceMetrics(report) {
  const job=report?.research,official=officialSummary(job),sources=sourceCounts(job);
  const rows=(official?.checks||[]).map(c=>({id:c.id,name:c.name,complete:c.status==='completed',count:c.status==='completed'&&Number.isSafeInteger(c.matchCount)&&c.matchCount>=0?c.matchCount:null,returned:matchesForOfficialCheck(report,c).length,status:c.status||'pending'}));
  const areas=['identity','media','ownership'].map(id=>({id,label:({identity:'Identity',media:'Media',ownership:'Ownership'})[id],count:sources.all.filter(s=>s.cited&&s.phases.some(p=>p.id===id)).length,status:job?.phases?.find(p=>p.id===id)?.status||'pending'}));
  return {official,rows,areas,cited:sources.cited,leads:sources.uncited,deep:job?.mode==='deep',domains:new Set(sources.all.filter(s=>s.cited).map(s=>new URL(s.key).hostname.replace(/^www\./,''))).size};
}
export function evidenceMap(report) {
  const m=evidenceMetrics(report);if(!m.official)return '';
  const circumference=2*Math.PI*36,offset=circumference*(1-m.official.completed/m.official.total);
  return `<section class="sc-evidence-map" aria-label="Evidence overview">
    <div class="sc-map-title"><div><span class="sc-eyebrow">EVIDENCE OVERVIEW</span><h2>See what supports this review.</h2></div><span>${icon('globe',15)}Traceable to the original sources</span></div>
    <div class="sc-map-grid"><div class="sc-map-official"><div class="sc-map-coverage"><svg viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="36" class="sc-map-track"/><circle cx="44" cy="44" r="36" class="sc-map-ring" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/><text x="44" y="43" text-anchor="middle">${m.official.completed}/${m.official.total}</text><text x="44" y="57" text-anchor="middle" class="sc-map-ring-label">CHECKED</text></svg><div><strong>${m.official.incomplete?'Coverage incomplete':'Official checks completed'}</strong><p>${m.official.completed?`${m.official.entries} possible list ${m.official.entries===1?'entry':'entries'}${m.official.incomplete?' in completed checks':''}. Names can overlap between sources.`:'No completed source results. The uncompleted checks cannot rule out a match.'}</p></div></div>
    <div class="sc-map-sources" role="group" aria-label="Possible entries by official source">${m.rows.map(r=>`<button class="sc-map-source ${!r.complete?'incomplete':r.count?'has-entries':'no-entries'}" data-sc-map-source="${e(r.id)}" aria-label="${e(r.name)}: ${r.count===null?'check incomplete':`${r.count} possible entries, ${r.returned} retrieved`}"><span class="sc-map-source-count">${r.count===null?'—':r.count.toLocaleString('en-GB')}</span><i aria-hidden="true"></i><span>${e(sourceMarks[r.id]||r.id.toUpperCase())}</span></button>`).join('')}</div><p class="sc-map-caption"><span class="sc-map-key has-entries"></span>Possible entries <span class="sc-map-key no-entries"></span>No name matches <span class="sc-map-key incomplete"></span>Incomplete</p></div>
    ${m.deep?`<div class="sc-map-research"><div class="sc-map-research-head"><div><strong>${m.cited}</strong><span>cited sources</span></div><p>Across ${m.domains} ${m.domains===1?'website':'websites'}<br>${m.leads} other search leads</p></div><div class="sc-map-area-list">${m.areas.map(a=>`<button data-sc-open-finding="${a.id}" aria-label="View ${a.label} sources, ${a.count} cited"><span>${a.label}</span><span class="sc-map-meter" aria-hidden="true"><i style="width:${m.cited?Math.min(100,a.count/m.cited*100):0}%"></i></span><b>${a.count}</b>${icon('chevron',12)}</button>`).join('')}</div><p class="sc-map-caption">A source can support more than one area.</p></div>`:`<div class="sc-map-research sc-map-no-research"><span class="sc-eyebrow">SEARCH SCOPE</span><h3>Official records first.</h3><p>This run checks named lists. Deep search adds public-web research on identity, media and public connections.</p></div>`}</div>
    <p class="sc-map-footnote">${m.official.total<officialPortals.length?`This saved run covered ${m.official.total} official sources; new searches include ${officialPortals.length}. `:''}Counts describe the saved evidence, not the subject’s risk. A possible match still needs identity review.</p>
  </section>`;
}
