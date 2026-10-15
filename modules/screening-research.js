import {screeningInputIssue} from './screening-input.js';
import {procurementEvidence,procurementSource} from './screening-procurement.js';
import {companyEvidence,companySource} from './screening-company.js';
import {rankedCompanyCandidates,matchesForOfficialCheck} from './screening-match.js';
import {providerEvidence,providerSource} from './screening-provider.js';
import {icon, escape as e} from '../core.js';
import {safeURL, formatDate} from './screening-view-model.js';
import {canonicalSource, sourceCatalog, sourceCounts, identitySummary, phaseIssues, citationLabel, officialSummary} from './research-evidence.js';

const terminal = new Set(['completed','partial','failed','cancelled','interrupted']);
const labels = {pending:'Waiting',running:'Researching',completed:'Reviewed',partial:'Incomplete evidence',failed:'Could not complete',cancelled:'Stopped',interrupted:'Interrupted · saved evidence'};
const phaseInfo = [
  ['identity','Identity & official records','Names, identifiers and official-source context.'],
  ['media','Media & proceedings','Reported concerns, dates, outcomes and conflicting accounts.'],
  ['ownership','Ownership & public roles','Publicly available connections and questions to resolve.'],
];

export function citedText(text = '', citations = []) {
  const value = String(text), refs = citations.filter(c=>safeURL(c?.url)).sort((a,b)=>a.start-b.start);
  let cursor = 0, html = '';
  for (const [index,c] of refs.entries()) {
    const start=Number(c.start), end=Number(c.end);
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<cursor||end<=start||end>value.length) continue;
    html+=e(value.slice(cursor,start));
    html+=`<a class="sr-citation" href="${e(safeURL(c.url))}" target="_blank" rel="noopener noreferrer" data-sr-source="${e(canonicalSource(c.url))}" title="${e(c.title||c.url)}">${e(citationLabel(value.slice(start,end),c.number||index+1))}</a>`;
    cursor=end;
  }
  return html+e(value.slice(cursor));
}

export const uniqueSources = sourceCatalog;

// Apply a small display grammar to text only; provider HTML is never interpreted.
// Citation offsets always refer to the original text, before heading/bold markers.
export function researchProse(text='', citations=[]) {
  text=String(text);
  citations=citations.map((c,i)=>({...c,number:c.number||i+1}));
  if(citations.some(c=>Number.isInteger(c.start)&&Number.isInteger(c.end)&&text.slice(c.start,c.end).includes('\n')))
    return `<p>${citedText(text,citations)}</p>`;
  let offset=0;
  return text.split('\n').map(line=>{
    const begin=offset;offset+=line.length+1;
    if(!line.trim())return '<div class="sr-paragraph-gap"></div>';
    const heading=line.match(/^#{1,4}\s+/), bullet=line.match(/^[-*]\s+/);
    const prefix=heading?.[0].length||bullet?.[0].length||0, content=line.slice(prefix);
    const originalRefs=citations.filter(c=>c.start>=begin&&c.end<=begin+line.length).map(c=>({...c,start:c.start-begin,end:c.end-begin}));
    const refs=citations.filter(c=>c.start>=begin+prefix&&c.end<=begin+line.length).map(c=>({...c,start:c.start-begin-prefix,end:c.end-begin-prefix}));
    const boundaries=[...content.matchAll(/\*\*([^*\n]+)\*\*/g)].flatMap(m=>[m.index,m.index+2,m.index+m[0].length-2,m.index+m[0].length]);
    if(originalRefs.some(c=>c.start<prefix)||refs.some(c=>boundaries.some(b=>c.start<b&&c.end>b)))
      return `<p>${citedText(line,originalRefs)}</p>`;
    // Split bold runs before escaping and citation insertion so markup cannot
    // alter an anchor attribute or execute source-supplied HTML.
    const pattern=/\*\*([^*\n]+)\*\*/g;let cursor=0, body='', match;
    const part=(from,to)=>citedText(content.slice(from,to),refs.filter(c=>c.start>=from&&c.end<=to).map(c=>({...c,start:c.start-from,end:c.end-from})));
    while((match=pattern.exec(content))){body+=part(cursor,match.index)+'<strong>'+part(match.index+2,match.index+match[0].length-2)+'</strong>';cursor=match.index+match[0].length;}
    body+=part(cursor,content.length);
    return heading?`<h4>${body}</h4>`:bullet?`<p class="sr-prose-bullet">${body}</p>`:`<p>${body}</p>`;
  }).join('');
}

// Paid providers and AI phases are deliberately excluded from this retry scope.
export function retryableChecks(job) {
  if(!job||!terminal.has(job.status))return [];
  const incomplete=new Set(['failed','partial','cancelled','interrupted','pending']);
  const officialIds=new Set(['eu','ofac','un','uk','cy','bis','au','ca','ch']);
  const checks=(job.officialChecks||[]).filter(c=>officialIds.has(c.id)&&incomplete.has(c.status)).map(c=>({id:c.id,name:c.name||c.id}));
  if(incomplete.has(job.worldbank?.status))checks.push({id:'worldbank',name:'World Bank procurement'});
  if(job.query?.type==='entity'&&incomplete.has(job.gleif?.status))checks.push({id:'gleif',name:'GLEIF company identity'});
  return checks;
}

export function mountResearch(container, {report=null, onNewRun=null, beforeRetry=null, onRetryRun=null, getDecisions=()=>report?.decisions||{}, onChange=()=>{}, onConnection=()=>{}, onProgress=()=>{}, autoStart=false, onSource=()=>{}, onViewMatches=null, compact=false, ctx={}}={}) {
  if(report?.restoredFromBackup)autoStart=false;
  let active=true, connection=null, job=report?.research||null, busy=false, error='', pollTimer=null, elapsedTimer=null, selected='', sourceFilter='cited', lastView='', dialogClose=null, cancelling=false, pollFailures=0, pollSequence=0, connectionSequence=0;
  let lastContactAt=null,lastChangeAt=null,startingAt=null;
  const progress=extra=>{if(active)onProgress({lastContactAt,lastChangeAt,startedAt:startingAt,starting:busy&&!job,cancelling,state:pollFailures?'interrupted':'connecting',retrying:pollFailures>0&&pollFailures<=3,...extra});};
  const request=ctx.researchRequest|| (async (path,options={})=>{
    const response=await fetch(path,{cache:'no-store',signal:globalThis.AbortSignal?.timeout?.(30000),...options,headers:{'Content-Type':'application/json',...options.headers},body:options.body?JSON.stringify(options.body):undefined});
    let data;try{data=await response.json();}catch{throw new Error('The research service is not available. Restart the local workspace server.');}
    if(!response.ok){const error=new Error(data?.error||'The research service could not complete this request.');error.status=response.status;throw error;}return data;
  });
  const save=next=>{job=next;onChange(next);};
  const isRunning=()=>job?.status==='running';
  function elapsed() {
    const start=Date.parse(job?.startedAt);if(!Number.isFinite(start))return '';
    const seconds=Math.max(0,Math.floor(((job.completedAt?Date.parse(job.completedAt):Date.now())-start)/1000));
    return seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`;
  }
  function retryButton(){const count=retryableChecks(job).length;return count?`<button class="sr-settings" data-sr-action="retry" ${busy?'disabled':''}>${busy?'Starting…':`Retry ${count} incomplete ${count===1?'check':'checks'}`}</button>`:'';}
  function retryReceipt(){if(!job?.retryOf)return '';return `<details class="sr-source-receipt" data-sr-receipt="retry"><summary>Check retry · evidence retained</summary><p>Only ${e((job.retrySources||[]).map(id=>({worldbank:'World Bank',gleif:'GLEIF'})[id]||job.officialChecks?.find(c=>c.id===id)?.name||id).join(', '))} were requested again. Other source receipts keep their original check dates. AI and paid-provider checks were not rerun.</p>${job.researchNeedsRefresh?'<p>Earlier web findings have not been reassessed against the updated checks.</p>':''}<small>Previous run: ${e(job.retryOf)} · Retry started ${e(formatDate(job.startedAt,true))}</small></details>`;}
  function statusText(){return connection?.configured?(connection.verified?'Deep search connected':'OpenAI API configured'):connection?'Connect live research':'Checking connection…';}
  function draw() {
    if(!active)return;
    if(compact&&job){drawCompact();return;}
    if(job?.mode==='search'){
      container.innerHTML=`<section class="sr-workspace" aria-label="Official source checks"><div class="sr-control-row"><strong>${job.status==='running'?'Checking configured official sources':officialSummary(job)?.incomplete?'Official checks incomplete':'Official checks completed'}</strong><div class="sr-actions">${isRunning()?`<button class="sr-stop" data-sr-action="cancel" ${cancelling?'disabled':''}>${cancelling?'Stopping…':'Stop search'}</button>`:`${retryButton()}<button class="sr-settings" data-sr-action="official" ${busy?'disabled':''}>Check again</button>${connection?.configured?'<button class="sr-primary" data-sr-action="start">Add web research</button>':'<button class="sr-settings" data-sr-action="connect">Connect Deep search</button>'}`}</div></div>${error||job.error?`<p class="sr-error" role="alert">${e(error||job.error)}</p>`:''}${retryReceipt()}${renderOfficialChecks(job)}${providerEvidence(job,getDecisions())}${companyEvidence(job)}${procurementEvidence(job,getDecisions())}</section>`;
      bind();return;
    }
    if(!job){
      container.innerHTML=`${report?'<div class="sr-upgrade"><h2>Go further with Deep search</h2><p>Check all configured official sources, plus identity, media and public connections.</p></div>':''}<div class="sr-compact-connection"><span>${e(connection?.configured?'Deep search ready':connection?'Connect to use Deep search':'Checking connection…')}</span><div>${report&&connection?.configured?`<button class="sr-settings" data-sr-action="start" ${busy?'disabled':''}>${busy?'Starting…':'Start deep search'}</button>`:''}<button class="sr-compact-link" data-sr-action="connect">${connection?.configured?'Connection':'Connect'}</button></div>${error?`<p role="alert">${e(error)}</p>`:''}</div>`;
      bind();return;
    }
    const focus=document.activeElement;
    const focused=container.contains(focus)?{action:focus.dataset?.srAction,phase:focus.dataset?.srPhase,href:focus.getAttribute?.('href'),officialCandidate:focus.dataset?.srOfficial,summary:focus.tagName==='SUMMARY'?(focus.closest('[data-sr-candidates]')?.dataset.srCandidates|| (focus.closest('.sr-identity-summary')?'identity':focus.closest('.sr-phase-warning')?'warning':focus.closest('.sr-official-checks')?'official':focus.closest('.sr-detail-toggle')?'phase':'ledger')):null}:null;
    const identityOpen=Boolean(container.querySelector('.sr-identity-summary')?.open),warningOpen=Boolean(container.querySelector('.sr-phase-warning')?.open);
    const officialOpen=container.querySelector('.sr-official-checks')?.open;
    const candidateOpen=new Set([...container.querySelectorAll('[data-sr-candidates]')].filter(el=>el.open).map(el=>el.dataset.srCandidates));
    const ledgerOpen=Boolean(container.querySelector('.sr-source-ledger')?.open);
    const detailOpen=Boolean(container.querySelector('.sr-detail-toggle')?.open);
    const scroll=container.querySelector('.sr-phase-content')?.scrollTop||0;
    const counts=sourceCounts(job), sources=counts.all, identity=identitySummary(job), phase=job?.phases?.find(p=>p.id===selected)||job?.phases?.find(p=>p.status==='running')||job?.phases?.find(p=>p.text)||job?.phases?.[0];
    container.innerHTML=`<section class="sr-workspace ${job?'has-research':''}" aria-label="Public-source research"><div class="sr-control-row"><div>${job?`<span class="sr-job-status ${e(job.status)}">${e(labels[job.status]||'Research status')}</span><span class="sr-meta">${counts.cited} cited ${counts.cited===1?'source':'sources'} <b>·</b> <span data-sr-elapsed>${elapsed()}</span></span>`:`<span class="sr-meta">${report?'Deep search expands to public-web sources beyond the configured official sources.':'Official-list screening remains available above.'}</span>`}</div><div class="sr-actions">${isRunning()?`<button class="sr-stop" data-sr-action="cancel" ${cancelling?'disabled':''}>${icon('x',13)}${cancelling?'Stopping…':'Stop research'}</button>`:`${retryButton()}${connection?.configured&&report?`<button class="sr-primary" data-sr-action="start" ${busy?'disabled':''}>${icon('globe',15)}${busy?'Starting…':job?'Run again':'Start deep search'}${icon('arrow',15)}</button>`:''}<button class="sr-settings ${!connection?.configured?'sr-primary':''}" data-sr-action="connect" ${busy?'disabled':''}>${icon(connection?.configured?'settings':'lock',14)}${connection?.configured?'Connection':'Connect'}</button>`}</div></div>${(error||job?.error)?`<div class="sr-error" role="alert">${icon('info',15)}<span>${e(error||(job.status==='partial'&&officialSummary(job)&&!officialSummary(job).incomplete?'All official checks completed. Additional evidence is incomplete; review the marked section below.':job.error))}</span>${job?.id&&isRunning()?'<button data-sr-action="reconnect">Reconnect to run</button>':''}</div>`:''}${job?`${retryReceipt()}${renderOfficialChecks(job)}${providerEvidence(job,getDecisions())}${companyEvidence(job)}${procurementEvidence(job,getDecisions())}<details class="sr-identity-summary ${e(identity.status)}"><summary>Identity assessment ${icon('chevron-down',13)}</summary><p><strong>${e(identity.label)}.</strong> ${e(identity.note)}</p></details><div class="sr-dossier"><div class="sr-phase-nav" role="tablist" aria-label="Research areas">${(job.phases||[]).map((p,i)=>`<button role="tab" id="sr-tab-${e(p.id)}" data-sr-phase="${e(p.id)}" aria-controls="sr-phase-content" aria-selected="${p===phase}" tabindex="${p===phase?0:-1}" class="${e(p.status)}"><span><strong>${e(({identity:'Identity',media:'Media',ownership:'Ownership'})[p.id]||p.title||'Research')}</strong><small>${e(labels[p.status]||'Waiting')}</small></span>${p.status==='running'?'<i class="sr-working-dot" aria-hidden="true"></i>':''}</button>`).join('')}</div><div id="sr-phase-content" class="sr-phase-content" role="tabpanel" aria-labelledby="sr-tab-${e(phase?.id||'identity')}">${phase?renderPhase(phase):''}</div></div><details class="sr-source-ledger"><summary>${icon('globe',14)}Source trail <span>${counts.cited} cited</span>${icon('chevron-down',14)}</summary><div><p>Cited sources support the dossier. Other results are unverified search leads; duplicate URLs count once.</p><div class="sr-ledger-filter"><button data-sr-show="cited" aria-pressed="${sourceFilter==='cited'}">Cited (${counts.cited})</button><button data-sr-show="other" aria-pressed="${sourceFilter==='other'}">Other results (${counts.uncited})</button></div>${sources.filter(s=>sourceFilter==='cited'?s.cited:!s.cited&&s.searched).map(s=>`<a href="${e(s.url)}" data-sr-source="${e(s.key)}" target="_blank" rel="noopener noreferrer"><span>${s.number}</span><div><strong>${e(s.title)}</strong><small>${e(new URL(s.url).hostname)} · ${s.cited?'Cited in findings':'Search lead · not cited'}</small></div>${icon('chevron',13)}</a>`).join('')||'<p>No sources in this category.</p>'}</div></details><p class="sr-evidence-note">Public-web findings need identity review. PEP coverage is not comprehensive.</p>`:`<p class="sr-evidence-note">Deep search sends the search name and optional identifiers to OpenAI and its search service. Office matter notes and files stay out of the request.</p>`}</section>`;
    bind();
    const identityDetail=container.querySelector('.sr-identity-summary');if(identityDetail)identityDetail.open=identityOpen;
    const warningDetail=container.querySelector('.sr-phase-warning');if(warningDetail)warningDetail.open=warningOpen;
    const official=container.querySelector('.sr-official-checks');if(official&&officialOpen!==undefined)official.open=officialOpen;
    container.querySelectorAll('[data-sr-candidates]').forEach(el=>el.open=candidateOpen.has(el.dataset.srCandidates));
    const details=container.querySelector('.sr-detail-toggle');if(details)details.open=detailOpen;
    const ledger=container.querySelector('.sr-source-ledger');if(ledger)ledger.open=ledgerOpen;
    const content=container.querySelector('.sr-phase-content');if(content)content.scrollTop=scroll;
    if(focused){
      const target=focused.action?[...container.querySelectorAll('[data-sr-action]')].find(el=>el.dataset.srAction===focused.action):focused.phase?[...container.querySelectorAll('[data-sr-phase]')].find(el=>el.dataset.srPhase===focused.phase):focused.href?[...container.querySelectorAll('a[href]')].find(el=>el.getAttribute('href')===focused.href):focused.officialCandidate?[...container.querySelectorAll('[data-sr-official]')].find(el=>el.dataset.srOfficial===focused.officialCandidate):focused.summary?(focused.summary==='identity'?identityDetail:focused.summary==='warning'?warningDetail:focused.summary==='official'?official:focused.summary==='phase'?details:focused.summary==='ledger'?ledger:[...container.querySelectorAll('[data-sr-candidates]')].find(el=>el.dataset.srCandidates===focused.summary))?.querySelector('summary'):null;
      target?.focus({preventScroll:true});
    }
  }
  function drawCompact(){
    const details=[...container.querySelectorAll('details')].filter(d=>d.open).map(d=>d.dataset.srReceipt?'receipt:'+d.dataset.srReceipt:d.className),focus=document.activeElement;
    const focused=container.contains(focus)?{action:focus.dataset?.srAction,provider:focus.dataset?.srProvider,company:focus.dataset?.srCompany,procurement:focus.dataset?.srWorldbank,source:focus.dataset?.srSource,summary:focus.tagName==='SUMMARY'?(focus.parentElement.dataset.srReceipt?'receipt:'+focus.parentElement.dataset.srReceipt:focus.parentElement.className):null}:null;
    const counts=sourceCounts(job),deep=job.mode!=='search';
    container.innerHTML=`<section class="sr-workspace sr-compact-review" aria-label="Sources and search status"><div class="sr-control-row"><div><strong>${isRunning()?'Search in progress':'Sources & search status'}</strong><span class="sr-meta">${deep?`${counts.cited} cited sources · `:''}${e(isRunning()?'Results arrive below':job.status==='completed'?'Search finished':job.status==='cancelled'?'Search stopped':job.status==='interrupted'?'Search interrupted':'Some checks need attention')}</span></div><div class="sr-actions">${isRunning()?`<button class="sr-stop" data-sr-action="cancel" ${cancelling?'disabled':''}>${cancelling?'Stopping…':'Stop search'}</button>`:`${retryButton()}<button class="sr-settings" data-sr-action="${deep?'start':'official'}" ${busy?'disabled':''}>${busy?'Starting…':'Run again'}</button><button class="sr-settings" data-sr-action="connect">Connection</button>${!deep&&connection?.configured?'<button class="sr-primary" data-sr-action="start">Add web research</button>':''}`}</div></div>${error||job.error?`<p class="sr-error" role="alert">${e(error||job.error)}${job.id&&isRunning()?'<button data-sr-action="reconnect">Reconnect to run</button>':''}</p>`:''}${retryReceipt()}${renderOfficialChecks(job)}${providerEvidence(job,getDecisions())}${companyEvidence(job)}${procurementEvidence(job,getDecisions())}${deep?`<details class="sr-source-ledger"><summary>All research sources <span>${counts.cited} cited · ${counts.uncited} other leads</span>${icon('chevron-down',14)}</summary><div><p>Citations support the findings. Other search results are leads, not verified evidence.</p><div class="sr-ledger-filter"><button data-sr-show="cited" aria-pressed="${sourceFilter==='cited'}">Cited (${counts.cited})</button><button data-sr-show="other" aria-pressed="${sourceFilter==='other'}">Other leads (${counts.uncited})</button></div>${counts.all.filter(s=>sourceFilter==='cited'?s.cited:!s.cited&&s.searched).map(s=>`<a data-sr-source="${e(s.key)}" href="${e(s.url)}"><div><strong>${e(s.title)}</strong><small>${e(new URL(s.url).hostname)}</small></div>${icon('chevron',14)}</a>`).join('')}</div></details>`:''}</section>`;
    bind();container.querySelectorAll('details').forEach(d=>{if(details.includes(d.dataset.srReceipt?'receipt:'+d.dataset.srReceipt:d.className))d.open=true;});
    if(focused){const target=focused.action?[...container.querySelectorAll('[data-sr-action]')].find(b=>b.dataset.srAction===focused.action):focused.provider?[...container.querySelectorAll('[data-sr-provider]')].find(b=>b.dataset.srProvider===focused.provider):focused.procurement!==undefined?[...container.querySelectorAll('[data-sr-worldbank]')].find(b=>b.dataset.srWorldbank===focused.procurement):focused.company!==undefined?[...container.querySelectorAll('[data-sr-company]')].find(b=>b.dataset.srCompany===focused.company):focused.source?[...container.querySelectorAll('[data-sr-source]')].find(b=>b.dataset.srSource===focused.source):focused.summary?[...container.querySelectorAll('details')].find(d=>(d.dataset.srReceipt?'receipt:'+d.dataset.srReceipt:d.className)===focused.summary)?.querySelector('summary'):null;target?.focus({preventScroll:true});}
  }
  function renderOfficialChecks(job) {
    const summary=officialSummary(job);if(!summary)return '';
    // Legacy reports kept returned records at report level. Resolve one read-only
    // view for counts and actions; explicit empty or failed receipts stay empty.
    const checks=summary.checks.map(check=>({...check,candidates:matchesForOfficialCheck(report,check)}));
    const label=c=>c.status==='completed'?(c.matchCount?`${c.matchCount} possible ${c.matchCount===1?'entry':'entries'}`:'No name matches'):({pending:'Waiting',running:'Checking…',failed:'Check failed',cancelled:'Stopped',interrupted:'Interrupted'}[c.status]||'Not checked');
    return `<details class="sr-official-checks" data-sr-official-checks ${job.officialStatus==='running'?'open':''}><summary>Official checks <span>${summary.completed}/${summary.total} checked${summary.entries?` · ${summary.entries} possible ${summary.entries===1?'entry':'entries'}`:''}</span>${icon('chevron-down',14)}</summary><div>${checks.map(c=>`<section class="sr-official-row"><div><a href="${e(safeURL(c.url))}" target="_blank" rel="noopener noreferrer">${e(c.name)}</a>${compact&&onViewMatches&&c.status==='completed'&&c.candidates?.length?`<button class="sr-view-entries" data-sr-view-matches="${e(c.id)}" aria-label="View ${c.candidates.length} returned entries from ${e(c.name)}"><strong>${e(label(c))}</strong><span>View entries ${icon('chevron',12)}</span></button>`:`<b class="${e(c.status||'pending')}">${e(label(c))}</b>`}</div><small>${c.method==='live_portal'?'Live portal search':'Official dataset search'}${c.checkedAt?` · Checked ${e(formatDate(c.checkedAt,true))}`:''}${c.retrievedAt?` · List retrieved ${e(formatDate(c.retrievedAt,true))}`:''}</small>${c.error?`<p role="status">${e(c.error)}${retryableChecks(job).some(item=>item.id===c.id)?` <button class="sr-settings" data-sr-retry-id="${e(c.id)}" ${busy?'disabled':''}>Retry this check</button>`:''}</p>`:''}${c.status==='completed'&&c.matchCount>(c.candidates?.length||0)?`<small class="sr-source-cap">${c.candidates?.length||0} of ${c.matchCount} entries retrieved. Refine the name to retrieve the rest.</small>`:''}${c.detail||c.publishedAt||c.downloads?.length?`<details class="sr-source-receipt" data-sr-receipt="${e(c.id)}"><summary>Coverage & source receipt</summary>${Object.entries(c.identifierChecks||{}).map(([field,value])=>`<p><strong>${field==='passportNumber'?'Passport':'Company number'}</strong>: ${value.status==='compared'?`${value.recordsWithIdentifier||0} records with this identifier compared; ${value.exactMatches||0} exact matches.`:'Not compared by this source; name screening only.'}</p>`).join('')}${c.detail?`<p>${e(c.detail)}</p>`:''}<dl><div><dt>Publisher date</dt><dd>${e(formatDate(c.publishedAt))}</dd></div><div><dt>Last verified</dt><dd>${e(formatDate(c.verifiedAt||c.checkedAt,true))}</dd></div></dl>${(c.downloads||[]).map(d=>`<a href="${e(safeURL(d.url))}" target="_blank" rel="noopener noreferrer">Publisher download ${icon('external',11)}</a><small>SHA-256: ${e(d.sha256||'Not recorded')}</small>`).join('')}</details>`:''}${!compact&&c.candidates?.length?`<details data-sr-candidates="${e(c.id)}"><summary>View possible entries</summary>${c.candidates.map((m,i)=>`<button class="sr-official-candidate" data-sr-official="${e(c.id)}:${i}"><span>${e(m.record?.name||m.nameMatched)}</span><small>${e(m.record?.id)} · ${m.identifierMatch?e(m.matchKind):`${e(m.score)}% name similarity`}</small>${icon('chevron',13)}</button>`).join('')}${c.matchCount>c.candidates.length?`<p>Showing ${c.candidates.length} of ${c.matchCount} entries. Refine the name to review the rest.</p>`:''}</details>`:''}</section>`).join('')}<p class="sr-reading-note">These are possible name matches, not confirmed identities. Cyprus also includes export-control records and related entities. A failed check is incomplete.</p></div></details>`;
  }
  function renderPhase(phase) {
    const issues=phaseIssues(phase), counts=sourceCounts(job), numbers=new Map(counts.all.map(s=>[s.key,s.number]));
    const warning=issues.length?`<details class="sr-phase-warning"><summary>Incomplete evidence · ${issues.length} ${issues.length===1?'issue':'issues'}</summary><ul>${issues.map(w=>`<li>${e(w)}</li>`).join('')}</ul></details>`:'';
    const metrics=Number.isInteger(phase.webSearchCalls)?`<small class="sr-phase-metrics">${phase.completedWebSearchCalls??'Unknown'} of ${phase.webSearchCalls} search calls completed · ${new Set((phase.citations||[]).map(c=>canonicalSource(c.url)).filter(Boolean)).size} cited sources</small>`:'';
    if(phase.text)return `<div class="sr-phase-label"><h3>${e(phase.title)}</h3><span>${e(labels[phase.status]||'Research')}</span></div>${warning}<p class="sr-preview-note">${e(phase.summary?.finding||phase.identity?.reason||'Review the candidate evidence and its limitations before attributing findings to the client.')}</p><details class="sr-detail-toggle"><summary>Read findings & sources</summary>${metrics}<div class="sr-research-prose">${researchProse(phase.text,(phase.citations||[]).map(c=>({...c,number:numbers.get(canonicalSource(c.url))})))}</div></details>`;
    return `${warning}<div class="sr-phase-empty ${phase.status==='running'?'is-running':''}"><span aria-hidden="true">${icon(phase.status==='running'?'globe':'file',26)}</span><h3>${e(phase.title)}</h3><p>${e(phase.error || (phase.status==='running'?'Searching and assessing sources. Findings appear when this stage returns.':phase.status==='pending'?'Waiting for the preceding research stage.':phase.status==='cancelled'?'This research stage was stopped.':'No cited findings are available for this stage.'))}</p>${phase.status==='running'?'<div class="sr-activity" aria-hidden="true"><i></i><i></i><i></i></div>':''}</div>`;
  }
  function bind() {
    container.querySelectorAll('[data-sr-view-matches]').forEach(button=>button.onclick=()=>onViewMatches?.(button.dataset.srViewMatches));
    container.querySelectorAll('[data-sr-worldbank]').forEach(button=>button.onclick=()=>{const match=job.worldbank?.candidates?.[Number(button.dataset.srWorldbank)];if(match)onSource(procurementSource(match,job.worldbank,job.query),button);});
    container.querySelectorAll('[data-sr-company]').forEach(button=>button.onclick=()=>{const match=rankedCompanyCandidates(job.gleif,job.query)[Number(button.dataset.srCompany)];if(match)onSource(companySource(match,job.gleif,job.query),button);});
    container.querySelectorAll('[data-sr-provider]').forEach(button=>button.onclick=()=>{const result=job.opensanctions,candidate=result?.candidates?.[Number(button.dataset.srProvider)];if(candidate)onSource(providerSource(candidate,result,job.query),button);});
    container.querySelectorAll('[data-sr-official]').forEach(button=>button.onclick=()=>{
      const [id,index]=button.dataset.srOfficial.split(':'),check=job?.officialChecks?.find(c=>c.id===id),match=matchesForOfficialCheck(report,check)[Number(index)],record=match?.record;if(!record)return;
      const value=[`Record: ${record.id}`,`Matched name: ${match.nameMatched}`,`Name similarity: ${match.score}% (not identity confidence)`,...(match.signals||[]),record.aliases?.length?`Aliases: ${record.aliases.join(' · ')}`:'',record.datesOfBirth?.length?`Birth dates: ${record.datesOfBirth.join(' · ')}`:'',record.countries?.length?`Countries: ${record.countries.join(' · ')}`:'',record.programs?.length?`Programmes: ${record.programs.join(' · ')}`:'',record.reasons||''].filter(Boolean).join('\n\n');
      onSource({official:true,cited:false,title:record.name,url:safeURL(record.sourceUrl)||check.url,detail:check.detail,passages:[{phaseTitle:check.name,text:value}],phases:[{title:check.method==='live_portal'?'Live portal search':'Official dataset search',status:check.status,at:check.checkedAt}]},button);
    });
    container.querySelectorAll('[data-sr-source]').forEach(link=>link.onclick=event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();const source=sourceCatalog(job).find(s=>s.key===link.dataset.srSource);if(source)onSource(source,link);});
    container.querySelectorAll('[data-sr-show]').forEach(button=>button.onclick=()=>{sourceFilter=button.dataset.srShow;draw();});
    container.querySelector('[data-sr-action="connect"]')?.addEventListener('click',showConnection);
    container.querySelector('[data-sr-action="start"]')?.addEventListener('click',()=>requestStart('deep'));
    container.querySelector('[data-sr-action="official"]')?.addEventListener('click',()=>requestStart('search'));
    container.querySelector('[data-sr-action="cancel"]')?.addEventListener('click',cancel);
    container.querySelector('[data-sr-action="retry"]')?.addEventListener('click',()=>retry());
    container.querySelectorAll('[data-sr-retry-id]').forEach(button=>button.onclick=()=>retry([button.dataset.srRetryId]));
    container.querySelector('[data-sr-action="reconnect"]')?.addEventListener('click',()=>{error='';pollFailures=0;progress({state:'connecting',retrying:true});poll();});
    container.querySelectorAll('[data-sr-phase]').forEach(button=>{
      button.onclick=()=>{selected=button.dataset.srPhase;draw();container.querySelector(`[data-sr-phase="${selected}"]`)?.focus({preventScroll:true});};
      button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const phases=job.phases, i=phases.findIndex(p=>p.id===button.dataset.srPhase), next=event.key==='Home'?0:event.key==='End'?phases.length-1:(i+(event.key==='ArrowRight'?1:phases.length-1))%phases.length;selected=phases[next].id;draw();container.querySelector(`[data-sr-phase="${selected}"]`)?.focus({preventScroll:true});};
    });
  }
  async function loadConnection() {
    const sequence=++connectionSequence;
    try{const next=await request('/api/research/status');if(!active||sequence!==connectionSequence)return;connection=next;}catch(err){if(!active||sequence!==connectionSequence)return;connection={configured:false,error:err.message};error=err.message;}
    if(active){onConnection(connection);draw();if(autoStart&&connection?.configured&&!job){autoStart=false;start('deep');}}
    return connection;
  }
  function requestStart(mode){
    if(!active||busy||isRunning()||!report)return;
    // The owning workspace creates a fresh report. Never overwrite the evidence
    // on which a saved identity decision was based when a reviewer reruns it.
    if(onNewRun){onNewRun(mode);return;}
    start(mode);
  }
  async function start(mode='deep') {
    if(!active||busy||isRunning()||!report)return;
    const inputIssue=screeningInputIssue(report.query);if(inputIssue){error=inputIssue.formMessage;draw();return;}
    if(report.query.passportNumber&&!connection?.identifierFields?.includes('passportNumber')){
      busy=true;
      try{connection=await request('/api/research/status');}catch{connection=null;}
      busy=false;if(!active)return;
      if(!connection?.identifierFields?.includes('passportNumber')){error='Passport screening needs the updated local service. Refresh after the service update; no passport check was sent.';draw();return;}
    }
    busy=true;error='';startingAt=Date.now();progress();draw();
    try{
      const result=await request(mode==='search'?'/api/screening/start':'/api/research/start',{method:'POST',body:{query:{name:report.query.name,type:report.query.type,country:report.query.country||'',dob:report.query.dob||'',...(report.query.type!=='entity'&&report.query.passportNumber?{passportNumber:report.query.passportNumber}:{}),...(report.query.type==='entity'?{lei:report.query.lei||'',registrationNumber:report.query.registrationNumber||''}:{})}}});
      if(!result.id)throw new Error('The research service did not return a job reference.');
      save({id:result.id,schemaVersion:7,worldbank:{status:'pending'},gleif:{status:report.query.type==='entity'?'pending':'not_applicable'},mode,status:'running',query:report.query,startedAt:new Date().toISOString(),model:connection?.model,officialStatus:'pending',officialChecks:[],phases:mode==='search'?[]:phaseInfo.map(([id,title])=>({id,title,status:'pending',text:'',sources:[],citations:[]}))});
      selected='';lastView='';busy=false;if(active){draw();poll();}
    }catch(err){busy=false;error=err.message;if(!job)save({schemaVersion:7,mode,status:'failed',query:report.query,startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),error,officialStatus:'failed',officialChecks:[],phases:[]});progress();if(active)draw();}
  }
  async function retry(sourceIds=retryableChecks(job).map(c=>c.id)) {
    if(!active||busy||isRunning()||!job||!sourceIds.length)return;
    busy=true;error='';draw();
    try {
      if(beforeRetry&&await beforeRetry()===false){busy=false;if(active)draw();return;}
      if(!active)return;
      if(!connection?.retryChecks)connection=await request('/api/research/status');
      if(!active)return;
      if(!connection?.retryChecks)throw new Error('The updated local service is required to retry individual checks. Your saved evidence is unchanged.');
      const prior=job;
      const result=await request('/api/screening/retry',{method:'POST',body:{research:prior,sourceIds}});
      if(!result.id)throw new Error('The retry service did not return a job reference.');
      const next=result.job||await request(`/api/research/jobs/${encodeURIComponent(result.id)}`);
      if(next.id!==result.id||next.retryOf!==prior.id||!Array.isArray(next.phases))throw new Error('The retry update could not be read.');
      // The parent persists an accepted retry even if this view was closed.
      // It receives the original report captured by this mount, never a newer subject.
      const adopted=await onRetryRun?.(next,report);
      if(!active||adopted===true)return;
      save(next);busy=false;lastView='';draw();if(isRunning())poll();
    }catch(err){busy=false;error=err.message;if(active)draw();}
  }
  function acceptUpdate(next,id) {
    if(next?.id!==id||!Array.isArray(next.phases))throw new Error('The research update could not be read.');
    const snapshot=JSON.stringify(next);
    error='';pollFailures=0;lastContactAt=Date.now();
    if(snapshot!==lastView){
      lastChangeAt=lastContactAt;lastView=snapshot;save(next);draw();
    }
    progress({state:'connected'});
  }
  async function poll() {
    clearTimeout(pollTimer);if(!active||!job?.id)return;
    const id=job.id, sequence=++pollSequence;
    try{
      const next=await request(`/api/research/jobs/${encodeURIComponent(id)}`);
      if(!active||job?.id!==id||sequence!==pollSequence)return;
      acceptUpdate(next,id);
      if(!terminal.has(next.status))pollTimer=setTimeout(poll,Date.now()-Date.parse(next.startedAt)<5000?200:1200);
    }catch(err){if(active&&sequence===pollSequence){
      if(err.status===404){save({...job,worldbank:['pending','running'].includes(job.worldbank?.status)?{...job.worldbank,status:'interrupted'}:job.worldbank,gleif:['pending','running'].includes(job.gleif?.status)?{...job.gleif,status:'interrupted'}:job.gleif,officialStatus:['running','pending'].includes(job.officialStatus)?'interrupted':job.officialStatus,opensanctions:['pending','running'].includes(job.opensanctions?.status)?{...job.opensanctions,status:'interrupted'}:job.opensanctions,officialChecks:job.officialChecks?.map(c=>['pending','running'].includes(c.status)?{...c,status:'interrupted'}:c),status:'interrupted',completedAt:new Date().toISOString(),error:'The server no longer has this run (expired or restarted). Saved evidence is retained; unfinished checks remain incomplete.',phases:(job.phases||[]).map(p=>['running','pending'].includes(p.status)?{...p,status:'interrupted'}:p)});error='';}
      else{error='Updates interrupted. '+err.message+' Saved findings remain available.';pollFailures++;if(pollFailures<=3)pollTimer=setTimeout(poll,Math.min(10000,2000*pollFailures));}
      progress();draw();
    }}
  }
  async function cancel() {
    if(!active||!isRunning()||cancelling)return;
    const id=job.id;
    cancelling=true;++pollSequence;clearTimeout(pollTimer);progress();draw();
    try{
      const receipt=await request(`/api/research/jobs/${encodeURIComponent(id)}/cancel`,{method:'POST',body:{}});
      if(job?.id!==id)return;
      // The cancellation response is already a server receipt. Persist it even
      // after navigation; a second request must not undo a confirmed stop.
      // A run may also have completed before the stop reached the server.
      if(receipt?.id===id&&Array.isArray(receipt.phases)&&terminal.has(receipt.status))acceptUpdate(receipt,id);
      else if(active)await poll();
    }catch(err){error=err.message;}
    finally{
      cancelling=false;
      if(active){progress();draw();if(isRunning()){clearTimeout(pollTimer);pollTimer=setTimeout(poll,1200);}}
    }
  }
  function showConnection() {
    if(!ctx.modal)return;
    dialogClose=ctx.modal({title:connection?.configured?'Research connection':'Connect live research',body:`<form class="sr-connect-form"><p>Deep search uses gpt-6-luna to research identity, media and ownership. It checks the configured official sources first. Your name is sent to Cyprus Stratlink; the name, date of birth, country, company identifiers and returned public records go to OpenAI for research. Your supplied passport number is excluded from OpenAI requests. API usage applies.</p>${connection?.configured?`<div class="sr-connected-detail">${icon('check',16)}API configured · ${e(connection.model||'OpenAI')}</div><p>API and search usage is billed to this account. An in-flight request may finish after you stop a run.</p><button type="button" class="btn" data-sr-disconnect>Disconnect</button>`:`<label for="sr-api-key">OpenAI API key<input id="sr-api-key" type="password" autocomplete="off" spellcheck="false" required placeholder="Enter your office API key"></label><label for="sr-model">Research model<input id="sr-model" value="${e('gpt-6-luna')}" maxlength="100" required spellcheck="false" readonly></label><small>The key stays in this local server’s memory until it restarts or you disconnect. It is not saved in browser storage or project files. API usage is billed to your account.</small><button class="btn primary" type="submit">Connect research ${icon('arrow',15)}</button>`}<p class="sr-connect-error" role="alert" hidden></p></form>`,onMount(root,close){
      const form=root.querySelector('form'), showError=message=>{const el=root.querySelector('.sr-connect-error');el.hidden=false;el.textContent=message;};
      root.querySelector('[data-sr-disconnect]')?.addEventListener('click',async event=>{event.target.disabled=true;++connectionSequence;try{connection=await request('/api/research/disconnect',{method:'POST',body:{}});close();if(active){onConnection(connection);draw();}}catch(err){showError(err.message);event.target.disabled=false;}});
      form.onsubmit=async event=>{event.preventDefault();const field=root.querySelector('#sr-api-key'), model=root.querySelector('#sr-model'), button=form.querySelector('button[type="submit"]');if(!field||!field.value.trim()||!model?.value.trim())return;++connectionSequence;button.disabled=true;button.textContent='Checking connection…';const apiKey=field.value.trim();field.value='';try{connection=await request('/api/research/connect',{method:'POST',body:{apiKey,model:model.value.trim()}});error='';close();if(active){onConnection(connection);draw();}ctx.toast?.('Research connection ready.');}catch(err){showError(err.message);button.disabled=false;button.textContent='Connect research';field.focus();}};
    }});
  }
  draw();if(autoStart&&report?.query.mode==='search'&&!job){autoStart=false;start('search');}loadConnection();if(isRunning()&&!report?.restoredFromBackup)poll();
  elapsedTimer=setInterval(()=>{if(active&&isRunning()){const el=container.querySelector('[data-sr-elapsed]');if(el)el.textContent=elapsed();}},1000);
  const dispose=()=>{active=false;++pollSequence;clearTimeout(pollTimer);clearInterval(elapsedTimer);dialogClose?.();};
  dispose.openConnection=showConnection;dispose.refreshConnection=loadConnection;dispose.retryChecks=retry;
  return dispose;
}
