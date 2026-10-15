import {applyResearchReceipt} from './screening-report-state.js';
import {mountScreeningProject} from './screening-project.js';
import {createScreeningHistory,parseScreeningReportBackup} from './screening-history.js';
import {candidateGroups} from './screening-candidates.js';
import {compareScreenings,screeningChangesHTML} from './screening-changes.js';
import {normalizeName} from './screening-engine.js';
import {relationshipsHTML,roleGroup} from './screening-relationships.js';
import {openSourcesDialog} from './screening-sources-dialog.js';
import {openScreeningConnections} from './screening-connections.js';
import {mountScreeningProgress} from './screening-progress.js';
import {mountScreeningChat} from './screening-chat.js';
import {mountOverviewPortrait,selectOverviewPortrait} from './screening-profile-portrait.js';
import {mountCandidatePortrait} from './screening-portrait.js';
import {profileHeaderHTML,profileComparisonHTML,hasPublicRole} from './screening-profile.js';
import {companyEvidence,companySource} from './screening-company.js';
import {procurementEvidence} from './screening-procurement.js';
import {maskedIdentifier} from './screening-identifiers.js';
import {screeningInputIssue} from './screening-input.js';
import {recordDecision,reviewLabels,providerRecordId,reviewProgress} from './screening-review.js';
import {evidenceMap} from './screening-visuals.js';
import {prioritizeMatches,restoreReturnedMatches,rankedCompanyCandidates} from './screening-match.js';
import {icon, escape as e} from '../core.js';
import {identitySummary, plainEvidence, officialSummary, executiveSummary, sourceCatalog, canonicalSource, recordPresentation} from './research-evidence.js';
import {procurementSource} from './screening-procurement.js';
import {mountProviderConnection,providerSource,providerCategories,providerEvidence} from './screening-provider.js';
import {mountResearch} from './screening-research.js';
import {mountSourceRecovery} from './screening-health.js';
import {assessmentSummary,assessmentFormHTML,recordAssessment} from './screening-assessment.js';
import {areaTitles,phaseReadingHTML,sourceReadingHTML,officialReadingHTML} from './screening-reading.js';
import {downloadPDF, downloadReport, downloadSnapshot, exportReportJSON} from './screening-export.js';
import {officialPortals, portalsFor, sourceOrder, sourceLabels, sourceMarks, sourceLinks, safeURL, formatDate, sourceState, coverage, decisionSummary, reportLabel, makeReport} from './screening-view-model.js';

const recoveryReports = new Map(); // Unsaved snapshots survive workspace route changes in this tab.
const MATCH_PAGE_SIZE = 10;
const emptySearchDraft = () => ({name:'', type:'person', country:'', dob:'', passportNumber:'', lei:'', registrationNumber:'', projectId:''});
let workspaceDraft = emptySearchDraft();
const hasSpecificType = type => type === 'person' || type === 'entity';
const typeRequiredMessage = 'Choose Person or Company before searching again.';
const strings = values => (Array.isArray(values) ? values : values ? [values] : []).filter(Boolean).map(String);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const count = number => Number(number || 0).toLocaleString('en-GB');
const external = (url, text, cls = '') => safeURL(url) ? `<a class="${cls}" href="${e(safeURL(url))}" target="_blank" rel="noopener noreferrer">${text}${icon('external',14)}</a>` : '';
const mark = id => `<span class="sc-source-mark sc-source-${e(id)}" aria-hidden="true">${e(sourceMarks[id] || id)}</span>`;

export function render(container, ctx) {
  ctx.setHeader('Screening');
  let active = true, bundle = null, loadError = '', loading = true, running = false, generation = 0;
  let view = 'start', report = null, selected = '', activeTab = 'identity', filter = 'all', sourceFilter = 'all';
  let matchPage=0, matchText='', readerArea='', researchSource = null, sourceTrigger = null, searchMode = 'search', resultsTab = 'overview';
  let reviewTrigger = null, draftPreviousReportId='';
  let triggerId = '', modalClose = null, noteDrafts = new Map(), inertBefore = new Map(), reportNotesDraft = '';
  let cleanupProvider=()=>{},cleanupPortrait=()=>{},cleanupOverviewPortrait=()=>{};
  let screeningChat=null,screeningProgress=null;const chatSessions=new Map();
  let cleanupResearch=()=>{}, researchReady=false, autoResearch=false;
  let cleanupSourceHealth=null, assessmentDraft=null, projectControl=null;
  const params = ctx.params || new URLSearchParams();
  const draft = {...workspaceDraft, projectId:params.get('project') || workspaceDraft.projectId};
  const history = ctx.screeningHistory || createScreeningHistory({legacyStorage:ctx.storage});
  const histories = () => history.list();
  let saveSerial=0, saveFailure='', saving=0, openRequest=0;
  const pendingReports=recoveryReports;
  const projects = () => { const values=ctx.storage.get('projects',[]); return Array.isArray(values) ? values.filter(p=>p?.id && p?.name) : []; };
  const sourceRecords = () => coverage(bundle?.sources || []).sources;
  const isMobileReader = () => Boolean((selected||researchSource) && view === 'results');
  const clearInert = () => { for(const [el, value] of inertBefore) el.inert = value; inertBefore.clear(); };

  async function loadSources() {
    loading = true; loadError = '';
    try {
      const result = ctx.loadScreeningData ? await ctx.loadScreeningData() : await fetch('/api/screening/index', {cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('The prepared source index could not be loaded.');return response.json();});
      if(!result || !Array.isArray(result.records) || !Array.isArray(result.sources) || result.schemaVersion !== 1) throw new Error('The source snapshot format is not recognised.');
      if (!active) return;
      bundle = result;
    } catch { if (active) loadError = 'Source files could not be loaded. Reload them before starting a check.'; }
    finally { if(active) {loading=false; if(view==='start'&&!running) {
      const strip=container.querySelector('.sc-source-strip');if(strip)strip.outerHTML=sourceStrip();bindSourceButtons();
      updateSearchMode();
      const error=container.querySelector('.sc-form-error');if(error){error.hidden=!loadError;error.textContent=loadError;}
    }} }
  }
  function updateSaveState() {
    if(!active)return;
    projectControl?.refresh();
    const warning=container.querySelector('.sc-save-warning');
    // The live search card already reports progress. A short-lived save banner
    // in normal flow shifts the complete report whenever a receipt is stored.
    // Keep the banner for actionable save failures only.
    const saveNeedsAttention=!saving&&Boolean(report?.unsaved||saveFailure);
    if(warning){warning.hidden=!saveNeedsAttention;warning.textContent=saveFailure||'Not saved: download the evidence backup before leaving.';}
    const retry=container.querySelector('[data-sc-save-retry]');if(retry)retry.hidden=!!saving||!report?.unsaved;
    const historyButton=container.querySelector('[data-sc-history]');
    let badge=historyButton?.querySelector('small');
    if(!badge&&historyButton&&histories().length){badge=document.createElement('small');historyButton.append(badge);}
    if(badge)badge.textContent=histories().length;
  }
  async function persist(next) {
    const serial=++saveSerial;
    if(next.previousReportId)next.comparison=compareScreenings(history.get(next.previousReportId),next);
    next.unsaved=true;pendingReports.set(next.id,next);saving++;updateSaveState();
    try {await history.save(next);next.unsaved=false;if(pendingReports.get(next.id)===next)pendingReports.delete(next.id);if(serial===saveSerial)saveFailure='';return true;}
    catch(error){if(serial===saveSerial)saveFailure=error.message||'This check could not be saved. Download its evidence backup before leaving.';ctx.toast(saveFailure);return false;}
    finally {saving--;updateSaveState();}
  }
  const unsubscribeHistory=history.subscribe?.(event=>{if(event.type==='external-change'&&active)ctx.toast('Screening history changed in another tab. Reopen History to load it; your open review is unchanged.');});
  function shell(body, mode='', actions='') {
    projectControl?.destroy();projectControl=null;
    cleanupSourceHealth?.();cleanupSourceHealth=null;
    screeningChat?.destroy();screeningChat=null;screeningProgress?.destroy();screeningProgress=null;
    cleanupOverviewPortrait();cleanupOverviewPortrait=()=>{};cleanupPortrait();cleanupPortrait=()=>{};cleanupResearch();cleanupResearch=()=>{};cleanupProvider();cleanupProvider=()=>{};
    clearInert();
    const sourcesAction=mode==='sc-results'?'':`<button class="sc-quiet-button" aria-label="Sources" data-sc-sources>${icon('globe',15)}<span>Sources</span></button>`;
    container.innerHTML = `<section class="sc-studio ${mode}"><div class="sc-studio-head"><a href="#/chat" class="sc-back-home">${icon('arrow-left',15)}<span>Workspace</span></a><span class="sc-section-name">Screening</span><div class="sc-head-actions">${sourcesAction}<button class="sc-quiet-button" aria-label="Screening history" data-sc-history>${icon('history',15)}<span>History</span>${histories().length?`<small>${histories().length}</small>`:''}</button>${actions}</div></div>${body}<div data-sc-provider hidden></div><button type="button" class="sc-connections-plug" data-sc-connections aria-label="Screening connections" title="Connections · OpenAI & OpenSanctions">${icon('plug',16)}</button><div class="sc-announcement" role="status" aria-live="polite"></div></section>`;
    const sourcesButton=container.querySelector('[data-sc-sources]');
    if(sourcesButton)sourcesButton.onclick = showSources;
    container.querySelector('[data-sc-history]').onclick = showHistory;
    cleanupProvider=mountProviderConnection(container.querySelector('[data-sc-provider]'),ctx);
    container.querySelector('[data-sc-connections]').onclick=showConnections;
  }
  function sourceStrip() {
    return `<div class="sc-source-strip" aria-label="Source coverage"><button type="button" class="sc-coverage-link" data-sc-source-info="">${icon('globe',14)}Official sanctions & export-control sources${icon('chevron',12)}</button></div>`;
  }
  function bindSourceButtons() { container.querySelectorAll('[data-sc-source-info]').forEach(button=>button.onclick=()=>showSources(button.dataset.scSourceInfo)); }
  function updateSearchMode() {
    const deep=searchMode==='deep', button=container.querySelector('.sc-run-button');
    container.querySelectorAll('[data-sc-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.scMode===searchMode)));
    if(button){button.disabled=false;button.innerHTML=`${deep?(researchReady?'Start deep search':'Connect to search'):'Search'} ${icon(deep&&!researchReady?'plug':'arrow',17)}`;}
  }
  function drawStart() {
    const focused = document.activeElement;
    const restore = focused?.id && container.contains(focused) ? {id:focused.id,start:focused.selectionStart,end:focused.selectionEnd} : null;
    shell(`<div class="sc-landing">
      <ol class="sc-workflow" aria-label="Screening workflow"><li aria-current="step"><b>1</b>Search</li><li><b>2</b>Review</li><li><b>3</b>Report</li></ol>
      <header class="sc-intro"><h1>Who are you screening?</h1></header>
      <form class="sc-search-card" id="sc-form">
        <div class="sc-card-top"><label class="sc-name-label" for="sc-name">Name</label><div class="sc-type-switch" role="group" aria-label="Search for"><button type="button" data-sc-type="person" aria-pressed="${draft.type==='person'}">Person</button><button type="button" data-sc-type="entity" aria-pressed="${draft.type==='entity'}">Company</button></div></div>
        <p class="sc-input-help" data-sc-type-help ${hasSpecificType(draft.type)?'hidden':''}>${typeRequiredMessage}</p>
        <div class="sc-name-entry">${icon('search',21)}<input id="sc-name" name="name" autocomplete="off" placeholder="Enter a person or company name" maxlength="160" minlength="2" aria-describedby="sc-name-help" required value="${e(draft.name)}"></div>
        <p id="sc-name-help" class="sc-input-help">Enter the name only; add identifiers in the fields below.</p>
        <div class="sc-mode-options" role="group" aria-label="Search depth">
          <button type="button" class="sc-mode-choice" data-sc-mode="search" aria-pressed="${searchMode==='search'}"><span class="sc-mode-icon">${icon('search',18)}</span><span><strong>Search</strong><small>Sanctions & export controls</small></span><i></i></button>
          <button type="button" class="sc-mode-choice sc-deep-button" data-sc-mode="deep" aria-pressed="${searchMode==='deep'}"><span class="sc-mode-icon">${icon('globe',18)}</span><span><strong>Deep search</strong><small>Official checks + wider web</small></span><i></i></button>
        </div>
        <div class="sc-form-details sc-identifying-details" aria-label="Optional identifying details">
          <label><span>Country / jurisdiction</span><input id="sc-country" name="country" placeholder="Optional" maxlength="80" value="${e(draft.country)}" autocomplete="off"></label>
          <label class="sc-dob-field" ${draft.type==='entity'?'hidden':''}><span>Date of birth</span><input id="sc-dob" name="dob" type="date" value="${e(draft.dob)}" max="${new Date().toISOString().slice(0,10)}"></label>
          <label class="sc-passport-field" ${draft.type==='entity'?'hidden':''}><span>Passport number</span><input id="sc-passport" name="passportNumber" placeholder="Optional · as printed" maxlength="64" value="${e(draft.passportNumber||'')}" autocomplete="off" spellcheck="false"></label>
          <label class="sc-company-field" ${draft.type==='entity'?'':'hidden'}><span>Company registration number</span><input id="sc-registration" maxlength="100" placeholder="Optional · registry number" value="${e(draft.registrationNumber||'')}" autocomplete="off"></label>
          <label class="sc-company-field" ${draft.type==='entity'?'':'hidden'}><span>LEI</span><input id="sc-lei" maxlength="20" placeholder="Optional · 20 characters" value="${e(draft.lei||'')}" autocomplete="off"></label>
        </div>
        <div class="sc-search-footer"><button class="sc-run-button" type="submit">Search ${icon('arrow',17)}</button></div>
        <p class="sc-form-error" role="alert" ${loadError?'':'hidden'}>${e(loadError)}</p>
      </form>${sourceStrip()}<div data-sc-research hidden></div>
    </div>`, 'sc-start');
    const form = container.querySelector('#sc-form');
    const keep = () => {draft.name=container.querySelector('#sc-name').value;draft.country=container.querySelector('#sc-country').value;draft.dob=container.querySelector('#sc-dob').value;draft.passportNumber=container.querySelector('#sc-passport').value.trim();draft.lei=container.querySelector('#sc-lei').value.trim().toUpperCase();draft.registrationNumber=container.querySelector('#sc-registration').value.trim();workspaceDraft={...draft};};
    form.oninput = keep; form.onchange = keep;
    container.querySelectorAll('[data-sc-type]').forEach(button=>button.onclick=()=>{keep();draft.type=button.dataset.scType;workspaceDraft={...draft};container.querySelectorAll('[data-sc-type]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));container.querySelector('[data-sc-type-help]').hidden=true;const error=container.querySelector('.sc-form-error');if(error.textContent===typeRequiredMessage){error.hidden=true;error.textContent='';}container.querySelector('.sc-dob-field').hidden=draft.type==='entity';container.querySelectorAll('.sc-passport-field').forEach(el=>el.hidden=draft.type==='entity');container.querySelectorAll('.sc-company-field').forEach(el=>el.hidden=draft.type!=='entity');});
    container.querySelectorAll('[data-sc-mode]').forEach(button=>button.onclick=()=>{searchMode=button.dataset.scMode;updateSearchMode();});
    form.onsubmit = event=>{event.preventDefault();keep();if(!hasSpecificType(draft.type)){container.querySelector('[data-sc-type-help]').hidden=false;container.querySelector('[data-sc-type]')?.focus();return;}const mode=event.submitter?.dataset.scMode||searchMode;if(mode==='deep'&&!researchReady){showConnections();return;}runCheck({...draft,passportNumber:draft.type==='entity'?'':draft.passportNumber,lei:draft.type==='entity'?draft.lei:'',registrationNumber:draft.type==='entity'?draft.registrationNumber:'',dob:draft.type==='entity'?'':draft.dob,mode},draftPreviousReportId);};
    bindSourceButtons();updateSearchMode();
    cleanupResearch=mountResearch(container.querySelector('[data-sc-research]'),{ctx,onConnection:status=>{researchReady=Boolean(status?.configured);updateSearchMode();}});
    if(restore){const input=container.querySelector('#'+restore.id);input?.focus({preventScroll:true});if(typeof restore.start==='number')input?.setSelectionRange?.(restore.start,restore.end);}
  }
  async function runCheck(query,previousReportId='') {
    if(running)return;
    query={...query,name:query.name.trim(),country:query.country.trim()};
    const inputIssue=screeningInputIssue(query), validation=inputIssue?.formMessage||(query.passportNumber&&!/^[A-Za-z0-9][A-Za-z0-9 -]{2,63}$/.test(query.passportNumber)?'Enter one passport number using letters, numbers, spaces or hyphens (3–64 characters).':'')||(query.name.length<2||!/[\p{L}]/u.test(query.name)?'Enter a name of at least two characters, including a letter.':'');
    if(validation){const error=container.querySelector('.sc-form-error');if(error){error.hidden=false;error.textContent=validation;}else ctx.toast(validation);container.querySelector(inputIssue?.field==='registrationNumber'?'#sc-registration':'#sc-name')?.focus();return;}
    const token=++generation; matchPage=0;matchText='';running=true;view='progress';selected='';researchSource=null;
    shell(`<div class="sc-progress-wrap"><div class="sc-scan-orbit" aria-hidden="true"><span class="brand-symbol"></span><i></i><i></i></div><p class="sc-eyebrow">SCREENING IN PROGRESS</p><h1>${e(query.name)}</h1><p class="sc-progress-label" role="status" aria-live="polite">Preparing ${officialPortals.length} official checks</p><div class="sc-progress-sources">${officialPortals.map(({id})=>`<div data-progress-source="${id}">${mark(id)}<span>${sourceLabels[id]}</span><span class="sc-progress-tick">${icon('clock',15)}</span></div>`).join('')}</div><p class="sc-progress-sub">Starting the official checks. Results and source dates appear next.</p><button class="sc-quiet-button" data-sc-cancel>Cancel check</button></div>`, 'sc-progress');
    container.querySelector('[data-sc-cancel]').onclick=()=>{generation++;running=false;view='start';drawStart();};
    try {
      if(!active||token!==generation)return;

      const label=container.querySelector('.sc-progress-label');label.textContent=`Starting ${officialPortals.length} official checks`;
      const result={matches:[],totalMatches:0};
      const next=makeReport(query,result,sourceRecords(),projects().find(project=>project.id===query.projectId)?.name || '');
      if(previousReportId)next.previousReportId=previousReportId;
      next.matches=[];next.totalMatches=0;next.requiresOfficial=true;autoResearch=true;resultsTab='overview';const saved=await persist(next);if(!active||token!==generation)return;report={...next,...(!saved?{unsaved:true}:{})};reportNotesDraft='';assessmentDraft=null;running=false;view='results';filter='all';sourceFilter='all';matchPage=0;matchText='';noteDrafts.clear();drawResults();
      container.querySelector('.sc-result-heading h1')?.focus({preventScroll:true});
    } catch(error){if(!active||token!==generation)return;running=false;view='start';drawStart();const field=container.querySelector('.sc-form-error');field.hidden=false;field.textContent=error.message || 'This check could not be completed. Try again.';}
  }
  async function rerun(mode) {
    if(!report||running)return;
    if(report.research?.status==='running'){ctx.toast('Stop the current search before starting another.');return;}
    captureReaderDraft();
    const dirtyDecision=[...noteDrafts].some(([id,draft])=>['status','note','reviewer'].some(key=>(draft[key]||'')!==(report.decisions?.[id]?.[key]||(key==='status'?'investigate':''))));
    if(dirtyDecision||hasDraftReview()){ctx.toast('Save your draft review or notes before starting another check.');return;}
    // Persist the original before navigating away, including any unsaved evidence.
    // If storage is full, leave it open for export instead of losing the report.
    const original=report;if(!await persist(original)||!active||report?.id!==original.id)return;
    const inputIssue=screeningInputIssue(report.query);
    if(inputIssue||!hasSpecificType(report.query.type)){
      Object.assign(draft,{country:'',dob:'',passportNumber:'',registrationNumber:'',lei:''},report.query,{type:report.query.type||'all',name:inputIssue?.suggestedName||report.query.name});workspaceDraft={...draft};draftPreviousReportId=report.id;searchMode=mode;
      selected='';researchSource=null;report=null;view='start';drawStart();
      container.querySelector(inputIssue?.field==='registrationNumber'?'#sc-registration':inputIssue?'#sc-name':'[data-sc-type]')?.focus();return;
    }
    runCheck({...report.query,mode},report.id);
  }
  async function prepareRetry(){
    if(!report||hasDraftReview()){ctx.toast('Save your draft review or notes before retrying a check.');return false;}
    const original=report;
    return await persist(original)&&active&&report?.id===original.id;
  }
  async function adoptRetry(research,original=report){
    const next=makeReport(original.query,{matches:original.matches||[],totalMatches:0},original.sourceSnapshots||[],original.projectName||'');
    Object.assign(next,{previousReportId:original.id,requiresOfficial:true,research});
    const restored=restoreReturnedMatches(next),show=active&&report?.id===original.id;
    if(show){report=restored;reportNotesDraft='';assessmentDraft=null;selected='';researchSource=null;noteDrafts.clear();
      filter='all';sourceFilter='all';matchPage=0;matchText='';resultsTab='sources';autoResearch=false;}
    if(active)await persist(restored);
    else {
      // A request accepted before route navigation still belongs in history.
      // The previous view's repository may already be closed.
      const lateHistory=ctx.screeningHistory||createScreeningHistory({legacyStorage:ctx.storage});
      restored.unsaved=true;pendingReports.set(restored.id,restored);
      try{await lateHistory.ready();restored.comparison=compareScreenings(lateHistory.get(original.id),restored);await lateHistory.save(restored);restored.unsaved=false;pendingReports.delete(restored.id);}
      catch{ /* The recovery queue retains the complete accepted-job snapshot. */ }
      finally{if(!ctx.screeningHistory)lateHistory.close();}
    }
    if(show&&active&&report?.id===restored.id){view='results';drawResults();}
    return true;
  }
  function reportFor(original) {
    return (report?.id===original.id?report:null)||pendingReports.get(original.id)||history.get(original.id)||original;
  }
  async function saveLateResearchReceipt(original,research) {
    // A response accepted before navigation still belongs to the original report.
    // Read committed review fields afresh: the disposed view may have stale notes.
    const repository=ctx.screeningHistory||createScreeningHistory({legacyStorage:ctx.storage});
    let next=applyResearchReceipt(reportFor(original),research);
    try {
      await repository.ready();
      const latest=repository.get(original.id)||original;
      if(latest.research?.id&&latest.research.id!==research.id)return;
      next=applyResearchReceipt(latest,research);
      if(next.previousReportId)next.comparison=compareScreenings(repository.get(next.previousReportId),next);
      await repository.save(next);
      if(pendingReports.get(next.id)===next)pendingReports.delete(next.id);
    } catch {
      // Preserve the receipt for the existing recovery/export workflow on failure.
      pendingReports.set(next.id,next);
    } finally {
      if(!ctx.screeningHistory)await repository.close?.();
    }
  }
  function filteredMatches() {
    return prioritizeMatches(report?.matches || [],report?.query).filter(match=>{
      const decision=report.decisions?.[match.record.id]?.status;
      const terms=normalizeName(matchText).split(' ').filter(Boolean),r=match.record;
      const haystack=normalizeName([r.name,match.nameMatched,...strings(r.aliases),...strings(r.countries),...strings(r.datesOfBirth),r.id].filter(Boolean).join(' '));
      return terms.every(term=>haystack.includes(term))&&(sourceFilter==='all'||r.sourceId===sourceFilter)&&(filter==='all'||(filter==='pending'?!['confirmed','dismissed'].includes(decision):decision===filter));
    });
  }
  function drawResults() {
    const summary=decisionSummary(report), state=coverage(report.sourceSnapshots), saved=!report.unsaved&&histories().some(item=>item.id===report.id);
    const toolbar=`<button class="sc-quiet-button sc-new-search" aria-label="New search" title="New search" data-sc-new>${icon('plus',15)}<span>New search</span></button><div class="sc-result-actions"><span data-sc-progress-slot>${searchProgressHTML()}</span><div data-sc-project></div><button class="sc-ask-trigger" data-sc-ask aria-expanded="false" aria-controls="sc-ask-panel">${icon('sparkles',15)}Ask AI</button><button class="btn primary sc-download-report" aria-label="Download report" title="Download report" data-sc-export="download">${icon('download',15)}<span>Download report</span></button><details class="sc-export-menu"><summary aria-label="More report options">${icon('chevron-down',15)}</summary><div>${report.previousReportId&&histories().some(h=>h.id===report.previousReportId)?'<button data-sc-previous-report>Previous check</button>':''}<button data-sc-recheck>${icon('history',16)}${report.query.mode==='deep'?'Deep search again':'Search again'}</button><button data-sc-export="full">${icon('file',16)}Download full evidence PDF</button><button data-sc-export="pdf">${icon('file',16)}Print / Save as PDF</button><button data-sc-export="png">${icon('panel',16)}Download summary image</button><button data-sc-export="json">${icon('download',16)}Download evidence data</button></div></details></div>`;
    shell(`<div data-sc-search-activity hidden></div>
      <button class="sc-quiet-button" data-sc-save-retry hidden>Retry saving</button><p class="sc-save-warning" role="status" ${saved?'hidden':''}>Not saved: the latest evidence is only open in this page. Download the report before leaving.</p>
      <div class="sc-results-body"><div class="sc-results-primary"><div data-sc-source-recovery hidden></div>
        <div data-sc-profile>${profileHeaderHTML(report,{activeSection:resultsTab,showSummary:false})}</div>
        <div data-sc-panel="overview"><div data-sc-changes>${screeningChangesHTML(report.comparison)}</div><section class="sc-at-a-glance sc-results-summary" aria-label="Review summary">${reviewSummary()}</section>
        <details class="sc-profile-matrix"><summary>Compare identifiers across sources ${icon('chevron-down',14)}</summary><div data-sc-profile-comparison>${profileComparisonHTML(report)}</div></details><div data-sc-assessment-slot></div></div>
        <div data-sc-panel="matches" hidden><div data-sc-groups>${groupsHTML()}</div><section id="sc-findings" aria-label="Official list entries" class="sc-review-section"><div class="sc-section-title"><h2>Official list candidates</h2><span>Open a name to compare details and record your decision.</span></div>
          ${!report.requiresOfficial&&state.incomplete?`<div class="sc-coverage-note">${icon('info',15)}<span>Incomplete coverage · ${state.ready}/${state.sources.length} lists current.</span><button data-sc-coverage>View sources</button></div>`:''}
          <div class="sc-result-filters" ${summary.total?'':'hidden'}><label class="sc-entry-search">${icon('search',16)}<input id="sc-entry-search" type="search" aria-label="Find in returned entries" placeholder="Find a name, alias or record…" autocomplete="off" value="${e(matchText)}"></label><div class="sc-filter-pills" role="group" aria-label="Review status">${[['all','All'],['pending','To review'],['confirmed','Same identity'],['dismissed','Different identity']].map(([value,label])=>`<button data-sc-filter="${value}" aria-pressed="${filter===value}">${label}</button>`).join('')}</div><select aria-label="Filter by source" id="sc-source-filter"><option value="all">All official sources</option>${portalsFor(report.research).map(({id})=>`<option value="${id}" ${sourceFilter===id?'selected':''}>${sourceLabels[id]}</option>`).join('')}</select></div>
          <div class="sc-entry-meta" data-sc-entry-meta></div><div class="sc-matches" id="sc-match-list"></div><div class="sc-truncated" data-sc-entry-limit hidden></div>
          <div class="sc-source-footer"><button data-sc-check-coverage>Source methods & dates ${icon('chevron',12)}</button><span>Names can appear in more than one list</span></div>
        </section>
        <div data-sc-supplemental>${supplementalHTML()}</div></div>
        <section data-sc-panel="roles" hidden><div data-sc-role-content>${rolesHTML()}</div></section>
        <section data-sc-panel="media" hidden><div data-sc-media-content>${researchAreaHTML('media')}</div></section>
        <section data-sc-panel="connections" hidden><div data-sc-connections-content>${researchAreaHTML('ownership')}</div></section>
        <div data-sc-panel="sources" hidden><div data-sc-evidence-map>${evidenceMap(report)}</div><section id="sc-research" class="sc-research-section" aria-label="Sources and search status"><div data-sc-research></div></section></div>
        <details id="sc-notes" class="sc-review-notes"><summary>Review notes</summary><div class="sc-notes-card"><label for="sc-report-notes">Review notes</label><p>Included in your downloaded report.</p><textarea id="sc-report-notes" maxlength="6000" placeholder="Record your decision, evidence or follow-up…">${e(reportNotesDraft)}</textarea><button class="btn primary" data-sc-save-notes>Save notes</button><span class="sc-note-status" role="status"></span></div></details>
      </div><aside class="sc-reader-empty" hidden></aside><button class="sc-reader-backdrop" data-sc-close-backdrop tabindex="-1" aria-hidden="true" hidden></button><aside class="sc-reader" aria-label="Source record" hidden></aside><aside id="sc-ask-panel" class="sc-ask-panel" aria-label="Ask this screening" hidden></aside></div>`, 'sc-results',toolbar);
    projectControl=mountScreeningProject(container.querySelector('[data-sc-project]'),{ctx,getReport:()=>report,onAssign:async project=>{
      const next={...report,query:{...report.query,projectId:project?.id||''},projectName:project?.name||''};
      report=next;return persist(next);
    }});
    screeningProgress=mountScreeningProgress(container.querySelector('[data-sc-search-activity]'),{getJob:()=>report?.research,expectedSources:officialPortals.length,onInspect:()=>selectResultsTab('sources'),onRetry:()=>container.querySelector('[data-sr-action="reconnect"]')?.click()});
    container.querySelector('[data-sc-save-retry]').onclick=async()=>{
      const next=report,draftAtSave=assessmentDraft&&JSON.stringify(assessmentDraft),last=next.assessmentLog?.at(-1);
      const saved=await persist(next);
      if(saved&&active&&report?.id===next.id&&draftAtSave===JSON.stringify(assessmentDraft)&&last&&['status','reviewer','reason','nextReviewDate','findingsReviewed'].every(key=>(typeof assessmentDraft[key]==='string'?assessmentDraft[key].trim():assessmentDraft[key])===last[key])){assessmentDraft=null;refreshAssessment(true);}
    };
    const chatTrigger=container.querySelector('[data-sc-ask]');
    screeningChat=mountScreeningChat(container.querySelector('#sc-ask-panel'),{getReport:()=>report,trigger:chatTrigger,sessions:chatSessions,request:ctx.screeningChatRequest,onOpen:()=>{if(selected||researchSource)closeReader(false);},onEvidence:openChatEvidence,onConnect:showConnections});
    chatTrigger.onclick=()=>screeningChat.toggle();
    screeningChat.open(false);
    container.querySelector('[data-sc-new]').onclick=startNewSearch;
    container.querySelector('[data-sc-recheck]').onclick=()=>rerun(report.query.mode||'search');
    container.querySelectorAll('[data-sc-previous-report]').forEach(button=>button.onclick=()=>openSavedReport(report.previousReportId));
    container.querySelectorAll('[data-sc-coverage],[data-sc-check-coverage]').forEach(button=>button.onclick=showCheckCoverage);
    container.querySelector('#sc-source-filter').onchange=event=>{sourceFilter=event.target.value;matchPage=0;if(selected||researchSource)closeReader(false);drawMatchList();};
    container.querySelector('#sc-entry-search').oninput=event=>{matchText=event.target.value;matchPage=0;drawMatchList();};
    container.querySelectorAll('[data-sc-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.scFilter;matchPage=0;container.querySelectorAll('[data-sc-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));drawMatchList();});

    container.querySelector('#sc-report-notes').oninput=event=>{reportNotesDraft=event.target.value;};
    container.querySelector('[data-sc-save-notes]').onclick=async event=>{const button=event.currentTarget,next={...report,notes:container.querySelector('#sc-report-notes').value};report=next;reportNotesDraft=next.notes;button.disabled=true;const ok=await persist(next);button.disabled=false;if(active&&report?.id===next.id)container.querySelector('.sc-note-status').textContent=ok?'Saved':'Not saved · export a backup';};
    container.querySelectorAll('[data-sc-export]').forEach(button=>button.onclick=async()=>{container.querySelector('.sc-export-menu').open=false;try{button.disabled=true;if(button.dataset.scExport==='download'){await downloadPDF(report);}else if(button.dataset.scExport==='full'){await downloadPDF({...report,reportDetail:'full'});}else if(button.dataset.scExport==='pdf'){if(!downloadReport(report))ctx.toast('Allow pop-up windows to open the printable report.');}else if(button.dataset.scExport==='png'){button.disabled=true;const ok=await downloadSnapshot(report);if(!ok)ctx.toast('The summary image could not be created. Try exporting the evidence data.');}else if(!exportReportJSON(report))ctx.toast('The evidence file could not be downloaded. Please try again.');}catch(error){ctx.toast(error.message||'The export could not be created. Please try again.');}finally{button.disabled=false;}});
    container.scrollTop=0;
    bindSummary();bindProfileActions();drawMatchList();selectResultsTab(resultsTab,true);
    if(selected)drawReader();else if(researchSource)drawResearchReader();
    const researchReport=report, shouldStart=autoResearch;autoResearch=false;
    cleanupResearch=mountResearch(container.querySelector('[data-sc-research]'),{report:researchReport,onNewRun:rerun,beforeRetry:prepareRetry,onRetryRun:adoptRetry,getDecisions:()=>reportFor(researchReport).decisions||{},autoStart:shouldStart,compact:true,ctx,onViewMatches:showSourceMatches,onProgress:value=>screeningProgress?.update(value),onSource:(source,trigger)=>{captureReaderDraft();selected='';readerArea='';researchSource=source;activeTab='identity';sourceTrigger=trigger;drawMatchList();drawResearchReader();},onChange:research=>{
      if(!active){void saveLateResearchReceipt(researchReport,research);return;}
      const stored=reportFor(researchReport);
      const next=applyResearchReceipt(stored,research);
      if(next.previousReportId)next.comparison=compareScreenings(history.get(next.previousReportId),next);
      if(active&&report?.id===researchReport.id){
        if(researchSource&&report.research?.id!==research.id)closeReader();
        report=next;
        updateSaveState();
        const summary=container.querySelector('.sc-at-a-glance');if(summary)summary.innerHTML=reviewSummary();
        const map=container.querySelector('[data-sc-evidence-map]');if(map)map.innerHTML=evidenceMap(report);
        refreshProfile();bindSummary();drawMatchList();refreshCandidateReviewLabels();updateSourceRecovery();refreshAssessment();
        const retry=container.querySelector('[data-sc-save-retry]');if(retry)retry.hidden=!!saving||!report?.unsaved;
    const badge=container.querySelector('[data-sc-results-tab="findings"] span');if(badge)badge.textContent=report.matches.length;
        const filters=container.querySelector('.sc-result-filters');if(filters)filters.hidden=!report.totalMatches;
        // Keep the evidence view stable while the job reports progress.
      }
      void persist(next);
    }});
    updateSaveState();updateSourceRecovery();refreshAssessment();
  }
  function refreshAssessment(force=false){
    const slot=container.querySelector('[data-sc-assessment-slot]'),summary=container.querySelector('.sc-at-a-glance');
    if(report&&summary){summary.innerHTML=reviewSummary();bindSummary();}
    if(!slot||!report||assessmentDraft&&!force)return;
    const open=slot.querySelector('[data-sc-assessment]')?.open;
    slot.innerHTML=assessmentFormHTML(report,{draft:assessmentDraft});
    const details=slot.querySelector('[data-sc-assessment]'),form=slot.querySelector('[data-sc-assessment-form]');
    details.open=!!open;
    const values=()=>Object.fromEntries(['status','reviewer','reason','nextReviewDate','findingsReviewed'].map(key=>{const input=form.querySelector(`[name="${key}"]`);return [key,key==='findingsReviewed'?input.checked:input.value];}));
    const initial=JSON.stringify(values());
    form.oninput=form.onchange=()=>{const next=values();assessmentDraft=JSON.stringify(next)===initial?null:next;};
    form.onsubmit=async event=>{
      event.preventDefault();const error=form.querySelector('[data-sc-assessment-error]'),button=form.querySelector('[type="submit"]');
      const submitted=JSON.stringify(values());let next;try{next=recordAssessment(report,JSON.parse(submitted));}catch(problem){error.hidden=false;error.textContent=problem.message;return;}
      error.hidden=true;button.disabled=true;const originalId=report.id;report=next;
      const ok=await persist(next);if(!active||report?.id!==originalId)return;
      button.disabled=false;
      if(ok){if(JSON.stringify(values())===submitted){assessmentDraft=null;refreshAssessment(true);container.querySelector('[data-sc-assessment]')?.setAttribute('open','');ctx.toast('Review outcome saved with this check.');}else{assessmentDraft=values();ctx.toast('The submitted outcome is saved. Your newer edits are still a draft.');}}
      else{error.hidden=false;error.textContent='Outcome not saved. Retry saving or download the evidence backup before leaving.';}
    };
  }
  function updateSourceRecovery(){
    const target=container.querySelector('[data-sc-source-recovery]');if(!target)return;
    const job=report?.research;
    const needsRetry=job&&job.status!=='running'&&job.officialChecks?.some(c=>c.id!=='cy'&&['failed','partial','cancelled','interrupted','pending'].includes(c.status));
    if(needsRetry&&!cleanupSourceHealth)cleanupSourceHealth=mountSourceRecovery(target,{ctx,getJob:()=>report?.research,onRetry:ids=>cleanupResearch.retryChecks?.(ids)});
    else if(!needsRetry){cleanupSourceHealth?.();cleanupSourceHealth=null;target.hidden=true;target.innerHTML='';}
  }
  function openChatEvidence(ref){
    const target=ref?.target||{};
    if(target.kind==='overview'){selectResultsTab('overview');container.querySelector('[data-sc-profile]')?.scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(target.kind==='coverage'){showCheckCoverage();return;}
    if(target.kind==='official'){
      if(!report.matches.some(m=>m.record.id===target.id)){ctx.toast('That record is not in the current result.');return;}
      filter='all';sourceFilter='all';matchText='';container.querySelector('#sc-entry-search').value='';selectResultsTab('matches',true);container.querySelector('#sc-source-filter').value='all';container.querySelectorAll('[data-sc-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scFilter==='all')));selected=target.id;researchSource=null;activeTab='identity';triggerId=target.id;matchPage=Math.max(0,Math.floor(filteredMatches().findIndex(m=>m.record.id===target.id)/MATCH_PAGE_SIZE));drawMatchList();drawReader();container.querySelector('[data-sc-close-reader]')?.focus({preventScroll:true});return;
    }
    let source;
    if(target.kind==='phase'&&report.research?.phases?.some(p=>p.id===target.id)){source={area:target.id};}
    if(target.kind==='provider'){const result=report.research?.opensanctions,c=result?.candidates?.find(c=>c.id===target.id);if(c)source=providerSource(c,result,report.query);}
    if(target.kind==='worldbank'||target.kind==='gleif'){const result=report.research?.[target.kind],m=result?.candidates?.find(m=>m.record?.id===target.id);if(m)source=target.kind==='worldbank'?procurementSource(m,result,report.query):companySource(m,result,report.query);}
    if(!source){ctx.toast('That evidence is not available in this report.');return;}
    captureReaderDraft();selected='';readerArea='';researchSource=source;activeTab='identity';sourceTrigger=container.querySelector('[data-sc-ask]');drawResearchReader();
  }
  function supplementalHTML(){
    const job=report.research||{};
    return `<div class="sc-profile-supplemental">${providerEvidence(job,report.decisions||{})}${procurementEvidence(job,report.decisions||{})}${companyEvidence(job)}</div>`;
  }
  function rolesHTML(){
    const provider=report.research?.opensanctions;
    const records=provider?.status==='completed'?(provider.candidates||[]).map((candidate,index)=>({candidate,index})).filter(({candidate})=>hasPublicRole(candidate)||candidate.positions?.length):[];
    const groups=['PEP classification','Relative / close associate','Other recorded roles'];
    const explicit=records.filter(({candidate})=>hasPublicRole(candidate));
    const groupHTML=groups.map(group=>{const rows=records.filter(({candidate})=>roleGroup(candidate)===group);return rows.length?`<section class="sc-role-group"><h3>${e(group)} <small>${rows.length}</small></h3>${group==='Other recorded roles'?'<p class="sc-profile-limit">Ordinary company roles, political-role tags and other descriptions are shown separately. A role description alone is not a PEP classification.</p>':''}<div class="sc-profile-role-list">${rows.map(({candidate,index})=>`<button class="sc-profile-role" data-sr-provider="${index}"><span><strong>${e(candidate.name)}</strong><small>${e(providerCategories(candidate).join(' · ')||'No explicit provider classification')}</small><p>${e((candidate.positions||[]).slice(0,2).join(' · ')||'No dated role description supplied. Inspect the source record.')}</p></span>${icon('chevron',15)}</button>`).join('')}</div></section>`:'';}).join('');
    return `<div class="sc-profile-section-head"><p class="sc-eyebrow">PEP & ASSOCIATES</p><h2>Classifications and recorded roles</h2><p>Provider candidates, not confirmed identities. PEP status does not itself mean sanctions or wrongdoing.</p></div>${!explicit.length?`<div class="sc-profile-empty"><h3>${provider?.status==='completed'?'No explicit PEP or associate candidates returned':'PEP coverage not established'}</h3><p>${provider?.status==='completed'?'This applies only to the returned candidates. It is not comprehensive PEP clearance.':'The provider check has not completed. Review its source status.'}</p></div>`:''}${groupHTML}<p class="sc-profile-limit">${provider?.atLimit?'Candidate limit reached; additional records may exist. ':''}Verify the exact role, relationship, dates and underlying source before assigning a classification to the client.</p>`;
  }
  function researchAreaHTML(area){
    const phase=report.research?.phases?.find(p=>p.id===area);
    const title=area==='media'?'Media & proceedings':'Ownership & connections';
    const gleif=report.research?.gleif;
    const parents=area==='ownership'&&gleif?.status==='completed'?rankedCompanyCandidates(gleif,report.query).map((match,index)=>({match,index})).filter(({match})=>match.record.parentLinks?.some(p=>safeURL(p.url))):[];
    const companyLinks=parents.length?`<div class="sc-profile-parent-links"><h3>Company parent references</h3><p>GLEIF accounting-consolidation references; these do not establish beneficial ownership or a match to the client.</p>${parents.map(({match,index})=>`<button class="sc-profile-role" data-sr-company="${index}"><span><strong>${e(match.record.name)}</strong><small>LEI ${e(match.record.lei)} · Compare identity and parent references</small></span>${icon('chevron',15)}</button>`).join('')}</div>`:'';
    return `<div class="sc-profile-section-head"><p class="sc-eyebrow">${area==='media'?'PUBLIC-WEB RESEARCH':'PUBLIC CONNECTIONS'}</p><h2>${title}</h2><p>${area==='media'?'Allegations, proceedings and outcomes remain distinct.':'Published affiliations and ownership evidence; each relationship needs its own supporting source.'}</p></div>${companyLinks}${area==='ownership'?relationshipsHTML(report.research):''}${phase?`<div class="sc-profile-research-reading">${phaseReadingHTML(report.research,area)}</div>`:`<div class="sc-profile-empty"><h3>Not researched in this check</h3><p>Deep search adds sourced web research to the official screening. A standard search does not establish a negative result here.</p><button class="btn" data-sc-section="sources">View search options ${icon('arrow',14)}</button></div>`}${area==='ownership'?'<p class="sc-profile-limit">No comprehensive beneficial-ownership graph or complete company-register search is available. A professional affiliation does not establish ownership.</p>':''}`;
  }
  function searchProgressHTML(){return report?.research?.status==='running'?'<button class="btn sc-stop-search" data-sc-stop-search>Stop search</button>':'';}
  function hasDraftReview(){
    if(!report)return false;
    const decisionBox=container.querySelector('#sc-decision-note');
    if(decisionBox)captureReaderDraft();
    return !!assessmentDraft||reportNotesDraft!==(report.notes||'')||[...noteDrafts].some(([id,value])=>['status','note','reviewer'].some(key=>(value[key]||'')!==(report.decisions?.[id]?.[key]||(key==='status'?'investigate':''))));
  }
  function canLeaveReview(){
    if(hasDraftReview()){ctx.toast('Save your draft review or notes before leaving this check.');return false;}
    if(saving||report?.unsaved){ctx.toast('This check is still saving or has unsaved evidence. Retry saving or download its backup before closing the page.');return false;}
    return true;
  }
  function startNewSearch(){
    if(!active||!canLeaveReview())return;
    const nextDraft={...emptySearchDraft(),projectId:params.get('project')||''};
    const alreadyEmpty=view==='start'&&searchMode==='search'&&Object.keys(nextDraft).every(key=>draft[key]===nextDraft[key]);
    generation++;running=false;autoResearch=false;draftPreviousReportId='';
    selected='';researchSource=null;report=null;reportNotesDraft='';assessmentDraft=null;noteDrafts.clear();
    Object.assign(draft,nextDraft);workspaceDraft={...draft};searchMode='search';view='start';
    if(!alreadyEmpty)drawStart();
    container.querySelector('#sc-name')?.focus({preventScroll:true});
    window.scrollTo?.({top:0,behavior:'instant'});
  }
  function groupsHTML(){
    const grouped=candidateGroups(report),linked=grouped.groups.filter(g=>g.recordsCount>1);
    if(!grouped.recordCount)return '';
    return `<section class="sc-linked-records" aria-label="Linked source records"><div><p><strong>${grouped.recordCount} source records</strong> · ${grouped.groupCount} groups <span>Identity unconfirmed.</span></p></div>${linked.length?`<details><summary>${linked.length} ${linked.length===1?'group shares':'groups share'} a reliable reference ${icon('chevron-down',14)}</summary><div class="sc-group-list">${linked.map(g=>`<article><h3>${e(g.name)} <small>${g.recordsCount} records</small></h3><p>${e(g.links.join(' · '))}</p>${g.differences?.length?`<p class="sc-group-difference">${e(g.differences.join(' · '))}</p>`:''}<div>${g.entries.map(entry=>`<button class="sc-quiet-button" data-sc-group-entry="${e(entry.id)}" data-sc-group-kind="${e(entry.kind)}">${e(entry.source)} ${icon('chevron',13)}</button>`).join('')}</div><small>Review each source separately. Grouping does not confirm the client’s identity.</small></article>`).join('')}</div></details>`:'<small>No shared reference; similar names stay separate.</small>'}</section>`;
  }
  function openGroupEntry(id,kind,trigger){
    const entry=candidateGroups(report).groups.flatMap(g=>g.entries).find(v=>v.id===id&&v.kind===kind);if(!entry)return;
    captureReaderDraft();activeTab='identity';readerArea='';
    if(kind==='official'){sourceFilter='all';filter='all';matchText='';selected=id;researchSource=null;triggerId=id;container.querySelector('#sc-entry-search').value='';container.querySelector('#sc-source-filter').value='all';matchPage=Math.max(0,Math.floor(filteredMatches().findIndex(m=>m.record.id===id)/MATCH_PAGE_SIZE));drawMatchList();drawReader();}
    else {selected='';sourceTrigger=trigger;researchSource=kind==='provider'?providerSource(entry.candidate,entry.receipt,report.query):kind==='procurement'?procurementSource(entry.match,entry.receipt,report.query):companySource(entry.match,entry.receipt,report.query);drawResearchReader();}
  }
  function bindProfileActions(){
    container.querySelectorAll('[data-sc-group-entry]').forEach(button=>button.onclick=()=>openGroupEntry(button.dataset.scGroupEntry,button.dataset.scGroupKind,button));
    container.querySelectorAll('[data-sc-previous-report]').forEach(button=>button.onclick=()=>openSavedReport(report.previousReportId));
    cleanupOverviewPortrait();cleanupOverviewPortrait=mountOverviewPortrait(container.querySelector('[data-sc-profile-portrait]'),report);
    const stopButton=container.querySelector('[data-sc-stop-search]');if(stopButton)stopButton.onclick=()=>{const stop=container.querySelector('[data-sr-action="cancel"]');if(stop&&!stop.disabled){stop.click();}else{selectResultsTab('sources');}};
    container.querySelectorAll('[data-sc-section]').forEach(button=>button.onclick=()=>{selectResultsTab(button.dataset.scSection);container.querySelector(`[data-sc-profile] [data-sc-section="${resultsTab}"]`)?.focus({preventScroll:true});});
    container.querySelectorAll('[data-sc-profile] [data-sc-section]').forEach(button=>button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...container.querySelectorAll('[data-sc-profile] [data-sc-section]')],i=buttons.indexOf(button),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length;buttons[next]?.click();});
    const openSource=(source,trigger)=>{captureReaderDraft();selected='';readerArea='';activeTab='identity';researchSource=source;sourceTrigger=trigger;drawMatchList();drawResearchReader();};
    container.querySelectorAll('[data-sc-supplemental] [data-sr-provider],[data-sc-role-content] [data-sr-provider],[data-sc-connections-content] [data-sr-provider]').forEach(button=>button.onclick=()=>{const result=report.research?.opensanctions,candidate=result?.candidates?.[Number(button.dataset.srProvider)];if(candidate)openSource(providerSource(candidate,result,report.query),button);});
    container.querySelectorAll('[data-sc-supplemental] [data-sr-worldbank]').forEach(button=>button.onclick=()=>{const result=report.research?.worldbank,match=result?.candidates?.[Number(button.dataset.srWorldbank)];if(match)openSource(procurementSource(match,result,report.query),button);});
    container.querySelectorAll('[data-sc-supplemental] [data-sr-company],[data-sc-connections-content] [data-sr-company]').forEach(button=>button.onclick=()=>{const result=report.research?.gleif,match=rankedCompanyCandidates(result,report.query)[Number(button.dataset.srCompany)];if(match)openSource(companySource(match,result,report.query),button);});
    container.querySelectorAll('[data-sc-media-content] [data-sc-evidence-source],[data-sc-connections-content] [data-sc-evidence-source],[data-sc-media-content] [data-sr-source],[data-sc-connections-content] [data-sr-source]').forEach(link=>link.onclick=event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();const source=sourceCatalog(report.research).find(s=>s.key===(link.dataset.scEvidenceSource||link.dataset.srSource));if(source)openSource(source,link);});
  }
  function refreshProfile(){
    screeningChat?.update();
    const focused=document.activeElement,regionSelectors=['[data-sc-profile]','[data-sc-profile-comparison]','[data-sc-supplemental]','[data-sc-role-content]','[data-sc-media-content]','[data-sc-connections-content]'],regionSelector=regionSelectors.find(selector=>container.querySelector(selector)?.contains(focused));
    const focusAttrs=['data-sc-section','data-sr-provider','data-sr-worldbank','data-sr-company','data-sc-evidence-source','data-sr-source'];
    const focusAttr=regionSelector&&focusAttrs.find(attr=>focused?.hasAttribute(attr)),focusValue=focusAttr&&focused.getAttribute(focusAttr),summaryIndex=regionSelector&&!focusAttr?[...container.querySelector(regionSelector).querySelectorAll('summary')].indexOf(focused):-1;
    const slot=container.querySelector('[data-sc-progress-slot]');if(slot)slot.innerHTML=searchProgressHTML();
    const header=container.querySelector('[data-sc-profile]');if(header)header.innerHTML=profileHeaderHTML(report,{activeSection:resultsTab,showSummary:false});
    for(const [selector,html] of [['[data-sc-changes]',screeningChangesHTML(report.comparison)],['[data-sc-groups]',groupsHTML()],['[data-sc-profile-comparison]',profileComparisonHTML(report)],['[data-sc-supplemental]',supplementalHTML()],['[data-sc-role-content]',rolesHTML()],['[data-sc-media-content]',researchAreaHTML('media')],['[data-sc-connections-content]',researchAreaHTML('ownership')]]){const target=container.querySelector(selector);if(target){const opens=[...target.querySelectorAll('details')].map(d=>d.open);target.innerHTML=html;target.querySelectorAll('details').forEach((d,i)=>d.open=!!opens[i]);}}
    bindProfileActions();selectResultsTab(resultsTab,true);
    if(regionSelector&&!selected&&!researchSource){const region=container.querySelector(regionSelector),target=focusAttr?[...region.querySelectorAll(`[${focusAttr}]`)].find(el=>el.getAttribute(focusAttr)===focusValue):summaryIndex>=0?region.querySelectorAll('summary')[summaryIndex]:null;target?.focus({preventScroll:true});}
  }
  function reviewSummary() {
    const summary=executiveSummary(report),job=report.research,official=officialSummary(job),provider=job?.opensanctions;
    const assessment=report.assessmentLog?.length?assessmentSummary(report):null;
    const followup=assessment?.recorded?(assessment.stale?assessment.note:assessment.recorded.reason):summary.next;
    const nextText=followup.length>280?followup.slice(0,277)+'…':followup;
    const keys={'Sanctions':'official','OpenSanctions':'provider','Company identity':'company','Procurement':'procurement','Identity':'identity','Media & proceedings':'media','Ownership & public roles':'ownership'};
    const affiliates=(report.matches||[]).filter(m=>recordPresentation(m.record).affiliate).length;
    const officialDetail=official&&!official.completed?'No completed source results':official?`${official.entries} possible ${official.entries===1?'entry':'entries'}${report.matches?.length<official.entries?` · ${report.matches.length} retrieved`:''}${affiliates?` · ${affiliates} labelled as affiliates`:''}`:'Checks are being prepared';
    const providerDone=provider?.status==='completed';
    const company=job?.gleif,companyDone=company?.status==='completed';
    const checks=`<div class="sc-check-overview"><button data-sc-open-finding="official" aria-label="View Sanctions evidence"><span><small>Official lists</small><strong>${official?`${official.completed}/${official.total} checked`:'Preparing checks'}</strong><span>${e(officialDetail)}</span>${official?.incomplete?'<em>Coverage incomplete</em>':''}</span>${icon('chevron',17)}</button>${provider&&provider.status!=='not_configured'?`<button data-sc-open-finding="provider" aria-label="View OpenSanctions evidence"><span><small>OpenSanctions</small><strong>${providerDone?`${count(provider.possibleMatches)} candidates`:provider.status==='running'||provider.status==='pending'?'Checking…':'Check incomplete'}</strong><span>${providerDone?(provider.atLimit?'Result limit reached · more may exist':'Sanctions, PEP and other categories'):'Review provider status'}</span></span>${icon('chevron',17)}</button>`:''}${company&&company.status!=='not_applicable'?`<button data-sc-open-finding="company" aria-label="View company identity evidence"><span><small>Company identity · GLEIF</small><strong>${companyDone?`${company.totalResults} LEI records`:['pending','running'].includes(company.status)?'Checking…':'Lookup incomplete'}</strong><span>${companyDone?(company.totalResults?'Compare registration details':'No LEI found · check the registry'):'Identity remains unverified'}</span></span>${icon('chevron',17)}</button>`:''}</div>`;
    const rows=summary.items.filter(item=>!['Sanctions','OpenSanctions','Company identity','Identity','Media & proceedings','Ownership & public roles'].includes(item.label)).map(item=>{const key=keys[item.label],enabled=key==='company'||key==='procurement'||job?.phases?.some(p=>p.id===key);
      return `<div class="sc-finding-row"><span>${e(item.label)}</span><div><p>${e(item.text)}</p></div>${enabled?`<button data-sc-open-finding="${key}" aria-label="View ${e(item.label)} evidence">Read ${icon('chevron',13)}</button>`:''}</div>`;}).join('');
    const researchFindings=(job?.phases||[]).filter(phase=>['media','ownership'].includes(phase.id)&&['completed','partial'].includes(phase.status)).map(phase=>`<button class="sc-overview-research-item" data-sc-section="${phase.id==='ownership'?'connections':'media'}"><span><strong>${phase.id==='media'?'Media & proceedings':'Ownership & connections'}${phase.status==='partial'?' · Partial evidence':''}</strong><span>${e(plainEvidence(phase.summary?.finding||phase.identity?.reason||'No supported summary was saved. Open the research and inspect its sources.'))}</span></span>${icon('chevron',14)}</button>`).join('');
    const identity=identitySummary(job),identityNotice=(job?.mode==='deep'||job?.phases?.some(p=>p.id==='identity'))?`<div class="sc-identity-notice">${icon('info',14)}<span>${e(identity.label)}${identity.status!=='corroborated'?'. Research findings concern candidates until identifiers are verified.':'. Review the supporting evidence.'}</span><button data-sc-open-finding="identity">Identity evidence ${icon('chevron',12)}</button></div>`:'';
    return `<div class="sc-executive-heading"><span class="sc-eyebrow">EXECUTIVE SUMMARY</span><span class="sc-summary-stage">${summary.inputIssue?'Input needs correction':job?.status==='running'?'Searching…':summary.incomplete?'Incomplete checks':assessment?e(assessment.label):'Human review required'}</span></div><div class="sc-summary-main"><div><h2>${e(summary.title)}</h2><p>${e(summary.note)}</p></div></div>${checks}${identityNotice}${researchFindings?`<div class="sc-overview-research" aria-label="Research findings">${researchFindings}</div>`:''}${summary.researchGaps.length?`<div class="sc-research-gaps" aria-label="What is missing">${summary.researchGaps.map(g=>`<button data-sc-open-finding="${g.id}"><span><strong>${e(g.label)} research incomplete</strong><small>${e(g.detail)}</small></span>${icon('chevron',14)}</button>`).join('')}</div>`:''}<div class="sc-finding-list sc-overview-facts">${rows}</div><div class="sc-next-action"><span>${icon('arrow',15)}<strong>${assessment?.recorded?'Reviewer follow-up':'Next step'}</strong></span><p>${e(nextText)}</p>${summary.inputIssue?'<button class="btn" data-sc-correct-input>Correct search details</button>':''}</div><div data-sc-review-progress>${reviewProgressHTML()}</div>`;
  }
  function reviewProgressHTML(){
    const progress=reviewProgress(report);if(!progress.total)return '';
    const detail=[['unreviewed','not started'],['investigate','for further review'],['confirmed','same identity'],['dismissed','different identity']].filter(([key])=>progress.counts[key]).map(([key,label])=>`${count(progress.counts[key])} ${label}`).join(' · ');
    const actionable=progress.entries.some(item=>item.id),pending=progress.entries.some(item=>item.id&&['unreviewed','investigate'].includes(item.status));
    return `<div class="sc-review-progress" role="region" aria-label="Recorded identity decisions"><div><small>RECORDED IDENTITY REVIEW</small><strong>${progress.open?`${count(progress.open)} of ${count(progress.total)} ${progress.total===1?'record':'records'} still open`:`Identity decisions recorded for ${count(progress.total)} records`}</strong><p>${e(detail)}</p><span>Source records, not unique identities. GLEIF and web findings are separate. This does not approve the client.${progress.limited?' More results may exist outside this retrieved set.':''}${progress.unreviewable?' Some records have no reviewable ID; check the original source.':''}</span></div>${actionable?`<button class="btn" data-sc-review-next>${pending?'Review next record':'Review decisions'} ${icon('arrow',14)}</button>`:''}</div>`;
  }
  function bindReviewProgress(){container.querySelector('[data-sc-review-next]')?.addEventListener('click',event=>{
    const progress=reviewProgress(report),entry=progress.entries.find(v=>v.id&&v.status==='unreviewed')||progress.entries.find(v=>v.id&&v.status==='investigate')||progress.entries.find(v=>v.id);if(!entry)return;
    captureReaderDraft();reviewTrigger=event.currentTarget;readerArea='';activeTab='identity';
    if(entry.kind==='official'){
      researchSource=null;report=restoreReturnedMatches(report);selected=entry.id;filter='all';sourceFilter='all';triggerId=entry.id;
      matchText='';container.querySelector('#sc-entry-search').value='';matchPage=Math.max(0,Math.floor(filteredMatches().findIndex(m=>m.record.id===entry.id)/MATCH_PAGE_SIZE));
      container.querySelector('#sc-source-filter').value='all';container.querySelectorAll('[data-sc-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scFilter==='all')));
      drawMatchList();drawReader();container.querySelector('[data-sc-close-reader]')?.focus({preventScroll:true});
    }else{
      selected='';sourceTrigger=reviewTrigger;researchSource=entry.kind==='procurement'?procurementSource(entry.value,report.research.worldbank,report.query):providerSource(entry.value,report.research.opensanctions,report.query);
      drawMatchList();drawResearchReader();
    }
  });}
  function refreshReviewProgress(){const region=container.querySelector('[data-sc-review-progress]');if(region){region.innerHTML=reviewProgressHTML();bindReviewProgress();}}
  function bindSummary(){container.querySelector('[data-sc-correct-input]')?.addEventListener('click',()=>rerun(report.query.mode||'search'));bindReviewProgress();container.querySelectorAll('[data-sc-map-source]').forEach(button=>button.onclick=()=>showSourceMatches(button.dataset.scMapSource));container.querySelectorAll('[data-sc-open-finding]').forEach(button=>button.onclick=()=>{
    const id=button.dataset.scOpenFinding;
    if(id==='official'){selectResultsTab('matches');closeReader(false);container.querySelector('#sc-findings')?.scrollIntoView({block:'start',behavior:'smooth'});container.querySelector('[data-sc-match]')?.focus({preventScroll:true});return;}
    if(id==='procurement'){selectResultsTab('matches');closeReader(false);const detail=container.querySelector('.sc-procurement-check');if(detail){detail.open=true;detail.scrollIntoView({block:'center',behavior:'smooth'});detail.querySelector('summary')?.focus({preventScroll:true});}return;}
    if(id==='company'){selectResultsTab('matches');closeReader(false);const detail=container.querySelector('.sc-company-check');if(detail){detail.open=true;detail.scrollIntoView({block:'center',behavior:'smooth'});detail.querySelector('summary')?.focus({preventScroll:true});}return;}
    if(id==='provider'){selectResultsTab('matches');closeReader(false);const detail=container.querySelector('.sr-provider-check');if(detail){detail.open=true;detail.scrollIntoView({block:'start',behavior:'smooth'});detail.querySelector('summary')?.focus({preventScroll:true});}return;}
    captureReaderDraft();selected='';readerArea=id;researchSource={area:id};sourceTrigger=button;drawMatchList();drawResearchReader();
  });}
  function drawResearchReader() {
    screeningChat?.hide();
    cleanupPortrait();cleanupPortrait=()=>{};
    if(!researchSource)return;
    const source=researchSource,reader=container.querySelector('.sc-reader'),isArea=!!source.area;
    clearInert();reader.hidden=false;container.querySelector('.sc-reader-empty').hidden=true;container.querySelector('.sc-results-body').classList.add('has-reader');reader.setAttribute('aria-label','Research source evidence');
    const reviewRecord=(source.procurement||source.provider)?source.match?.record:null;
    const reviewing=Boolean(reviewRecord?.id&&activeTab==='decision'),decision=report.decisions?.[reviewRecord?.id];
    const title=isArea?areaTitles[source.area]:source.title,kind=isArea?'RESEARCH FINDING':source.procurement?'PROCUREMENT DEBARMENT':source.company?'COMPANY IDENTITY':source.provider?'PROVIDER RECORD':source.official?'OFFICIAL RECORD':source.cited?'CITED SOURCE':'UNVERIFIED LEAD';
    reader.innerHTML=`<div class="sc-reader-toolbar"><span>${!isArea&&readerArea?`<button class="sc-quiet-button" data-sc-reader-back>${icon('arrow-left',14)}Back to finding</button>`:'Evidence'}</span><button class="icon-btn" data-sc-close-reader aria-label="Close source evidence">${icon('x',18)}</button></div><div class="sc-reader-heading"><p class="sc-eyebrow">${kind}</p><h2>${e(title)}</h2>${isArea?'':`<p class="sc-evidence-domain">${e(safeURL(source.url)?new URL(source.url).hostname:'Original link unavailable')}</p>`}</div>${reviewing?'<button class="sc-reader-back" data-sc-decision-back>← Back to evidence</button>':''}<div class="sc-reader-content">${reviewing?'':`${reviewRecord?.id?`<div class="sc-source-review-state"><div><small>Identity review</small><strong>${e(reviewLabels[decision?.status]||'Not reviewed')}</strong></div><button class="btn" data-sc-review-identity>${decision?'Update decision':'Review identity'}</button></div>`:''}${source.provider?'<div data-sc-candidate-portrait></div>':''}${isArea?phaseReadingHTML(report.research,source.area):sourceReadingHTML(source)}`}</div>${isArea?'':`<div class="sc-reader-footer">${external(source.url,'Open original source','sc-official-link')}</div>`}`;
    reader.querySelector('[data-sc-close-reader]').onclick=closeReader;
    if(source.provider&&!reviewing){
      const reportId=report.id;
      cleanupPortrait=mountCandidatePortrait(reader.querySelector('[data-sc-candidate-portrait]'),source,{onPhotoLoaded:photo=>{
        if(!active||report?.id!==reportId)return;
        const next=selectOverviewPortrait(report,reviewRecord?.id,photo);if(!next)return;
        report=next;void persist(next);refreshProfile();
        updateSaveState();
      }});
    }
    if(reviewing)drawDecision(reader.querySelector('.sc-reader-content'),reviewRecord,source.procurement?'This records identity only. Procurement eligibility, release conditions and project scope need separate review.':'This records identity only. Provider categories, allegations and applicable restrictions still need separate review.');
    reader.querySelector('[data-sc-review-identity]')?.addEventListener('click',()=>{activeTab='decision';drawResearchReader();reader.querySelector('input[name="sc-decision"]')?.focus();});
    reader.querySelector('[data-sc-decision-back]')?.addEventListener('click',()=>{captureReaderDraft();activeTab='identity';drawResearchReader();reader.querySelector('[data-sc-review-identity]')?.focus();});
    reader.querySelector('[data-sc-reader-back]')?.addEventListener('click',()=>{researchSource={area:readerArea};drawResearchReader();});
    reader.querySelectorAll('[data-sc-evidence-source],[data-sr-source]').forEach(a=>a.onclick=event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();const key=a.dataset.scEvidenceSource||a.dataset.srSource;const found=sourceCatalog(report.research).find(v=>v.key===key);if(found){researchSource=found;drawResearchReader();}});
    setReaderMode();reader.querySelector('[data-sc-close-reader]').focus({preventScroll:true});
  }
  function selectResultsTab(tab,keepReader=false) {
    const id=({findings:'matches',research:'overview',notes:'overview'})[tab]||tab;
    resultsTab=['overview','matches','roles','media','connections','sources'].includes(id)?id:'overview';
    if(!keepReader&&(selected||researchSource))closeReader(false);
    container.querySelectorAll('[data-sc-panel]').forEach(panel=>panel.hidden=panel.dataset.scPanel!==resultsTab);
    container.querySelectorAll('[data-sc-section]').forEach(button=>{const selected=button.dataset.scSection===resultsTab;button.setAttribute('aria-pressed',String(selected));if(button.getAttribute('role')==='tab'){button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}});
    if(tab==='notes')container.querySelector('#sc-notes').open=true;
  }
  function drawMatchList() {
    const sourceSelect=container.querySelector('#sc-source-filter'),portals=portalsFor(report.research);
    const loaded=report.matches||[],sourceCount=id=>loaded.filter(m=>m.record.sourceId===id).length;
    if(sourceFilter!=='all'&&!portals.some(p=>p.id===sourceFilter))sourceFilter='all';
    if(sourceSelect){sourceSelect.innerHTML=`<option value="all">All official sources · ${loaded.length}</option>`+portals.map(p=>`<option value="${e(p.id)}">${e(p.name)} · ${sourceCount(p.id)}</option>`).join('');sourceSelect.value=sourceFilter;}
    const list=container.querySelector('#sc-match-list'), matches=filteredMatches(), inputIssue=screeningInputIssue(report.query);
    const pages=Math.max(1,Math.ceil(matches.length/MATCH_PAGE_SIZE));matchPage=Math.max(0,Math.min(matchPage,pages-1));
    const from=matchPage*MATCH_PAGE_SIZE,to=Math.min(from+MATCH_PAGE_SIZE,matches.length),meta=container.querySelector('[data-sc-entry-meta]');
    meta.innerHTML=`<div><strong role="status" aria-live="polite">${matches.length?`${from+1}–${to} of ${count(matches.length)} ${matches.length===1?'entry':'entries'}`:'0 entries in this view'}</strong><small>${e(sourceFilter==='all'?'All official sources':sourceLabels[sourceFilter]||sourceFilter)} · Entries can overlap across lists</small></div>${pages>1?`<nav aria-label="Entry pages"><button class="icon-btn" data-sc-page="prev" aria-label="Previous entries" ${matchPage===0?'disabled':''}>${icon('arrow-left',15)}</button><span>Page ${matchPage+1} / ${pages}</span><button class="icon-btn" data-sc-page="next" aria-label="Next entries" ${matchPage===pages-1?'disabled':''}>${icon('arrow',15)}</button></nav>`:''}`;
    meta.hidden=!loaded.length;
    meta.querySelectorAll('[data-sc-page]').forEach(button=>button.onclick=()=>{matchPage+=button.dataset.scPage==='next'?1:-1;drawMatchList();container.querySelector(`[data-sc-page="${button.dataset.scPage}"]:not(:disabled)`)?.focus({preventScroll:true});});
    const selectedCheck=report.research?.officialChecks?.find(c=>c.id===sourceFilter);
    const available=sourceFilter==='all'?loaded.length:sourceCount(sourceFilter),reported=sourceFilter==='all'?report.totalMatches:selectedCheck?.matchCount;
    const limit=container.querySelector('[data-sc-entry-limit]');limit.hidden=!(reported>available);limit.textContent=reported>available?`${count(available)} of ${count(reported)} entries were retrieved from ${sourceFilter==='all'?'the official sources':sourceLabels[sourceFilter]}. Refine the original search to retrieve the rest.`:'';
    if(report.requiresOfficial&&!report.research?.officialChecks?.some(c=>c.status==='completed')){list.innerHTML='<div class="sc-no-matches"><h3>No completed checks yet</h3><p>Check progress under Sources and search status. Unfinished checks cannot rule out a match.</p></div>';return;}
    list.innerHTML=matches.length?matches.slice(from,to).map(match=>{const record=match.record, presentation=recordPresentation(record), decision=report.decisions?.[record.id], label=decision?.status==='confirmed'?'Same identity':decision?.status==='dismissed'?'Different identity':'To review';return `<button class="sc-match-row ${selected===record.id?'is-selected':''}" data-sc-match="${e(record.id)}" aria-pressed="${selected===record.id}">${mark(record.sourceId)}<span class="sc-match-copy"><span class="sc-match-title">${e(presentation.name)}${presentation.affiliate?'<small class="sc-affiliate-label">Affiliate entry</small>':''}${record.listingStatus?`<small class="sc-affiliate-label">${e(record.listingStatus)}</small>`:''}</span><span class="sc-match-sub">${e(sourceLabels[record.sourceId] || record.sourceId)}<b>·</b>${e(record.programs?.join(' · ')||'List entry')}<b>·</b>${e(record.type==='person'?'Person':record.type==='entity'?'Entity':record.type==='vessel'?'Vessel':'Record')}${strings(record.countries).length?`<b>·</b>${e(strings(record.countries).slice(0,2).join(', '))}`:''}</span><span class="sc-match-reason">${e(match.matchKind||'Name returned by source')}${match.signals?.find(v=>/differs|matches/.test(v))?` · ${e(match.signals.find(v=>/differs|matches/.test(v)))}`:' · Identity needs checking'}</span></span><span class="sc-match-status ${decision?.status==='confirmed'?'confirmed':decision?.status==='dismissed'?'dismissed':''}">${e(label)}</span>${icon('chevron',15)}</button>`;}).join(''):`<div class="sc-no-matches">${icon('search',26)}<h3>${report.totalMatches?'No records in this view':(inputIssue?'Repeat the search with the name only':officialSummary(report.research)?.incomplete?'Checks incomplete':'No sanctions or export-control name matches')}</h3><p>${report.totalMatches?'Clear the name filter or choose another source or review status. This does not change the screening outcome.':inputIssue?e(inputIssue.message):'Check spelling and aliases, and review the source coverage before making a decision.'}</p>${report.totalMatches?'<button class="btn" data-sc-reset-filters>Reset filters</button>':'<button class="btn" data-sc-no-source>View source coverage</button>'}</div>`;
    list.querySelectorAll('[data-sc-match]').forEach(button=>button.onclick=()=>{captureReaderDraft();researchSource=null;selected=button.dataset.scMatch;triggerId=selected;activeTab='identity';container.querySelectorAll('[data-sc-match]').forEach(b=>{b.setAttribute('aria-pressed',String(b===button));b.classList.toggle('is-selected',b===button);});drawReader();container.querySelector('[data-sc-close-reader]')?.focus({preventScroll:true});});
    list.querySelector('[data-sc-reset-filters]')?.addEventListener('click',()=>{filter='all';sourceFilter='all';matchText='';matchPage=0;drawResults();});
    list.querySelector('[data-sc-no-source]')?.addEventListener('click',showCheckCoverage);
  }
  function showSourceMatches(id) {
    const check=report.research?.officialChecks?.find(c=>c.id===id);
    if(check?.status!=='completed'||!(report.matches||[]).some(match=>match.record?.sourceId===id)){showCheckCoverage();return;}
    if(selected||researchSource)closeReader(false);
    selectResultsTab('matches');sourceFilter=id;filter='all';matchText='';matchPage=0;
    container.querySelector('#sc-entry-search').value='';
    container.querySelectorAll('[data-sc-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scFilter==='all')));
    drawMatchList();container.querySelector('#sc-findings')?.scrollIntoView({block:'start',behavior:'smooth'});container.querySelector('#sc-entry-search')?.focus({preventScroll:true});
  }
  function showCheckCoverage() {
    selectResultsTab('sources');
    const checks=container.querySelector('[data-sr-official-checks]');
    if(report.research?.officialChecks?.length&&checks){checks.open=true;checks.scrollIntoView({block:'center',behavior:'smooth'});checks.querySelector('summary')?.focus({preventScroll:true});}
    else showSources(null,report.sourceSnapshots);
  }
  function captureReaderDraft() {
    const field=container.querySelector('#sc-decision-note');
    const recordId=selected||researchSource?.match?.record?.id;
    if(recordId&&field)noteDrafts.set(recordId,{note:field.value,reviewer:container.querySelector('#sc-reviewer')?.value||'',status:container.querySelector('input[name="sc-decision"]:checked')?.value || 'investigate'});
  }
  function closeReader(restoreFocus=true) {
    cleanupPortrait();cleanupPortrait=()=>{};
    captureReaderDraft();const wasResearch=Boolean(researchSource),area=readerArea;researchSource=null;readerArea='';selected='';clearInert();container.querySelector('.sc-reader').hidden=true;container.querySelector('.sc-reader-backdrop').hidden=true;container.querySelector('.sc-reader-empty').hidden=false;container.querySelector('.sc-results-body').classList.remove('has-reader');container.querySelectorAll('[data-sc-match]').forEach(button=>{button.classList.remove('is-selected');button.setAttribute('aria-pressed','false');});
    if(restoreFocus===false){reviewTrigger=null;return;}
    if(reviewTrigger){container.querySelector('[data-sc-review-next]')?.focus({preventScroll:true});reviewTrigger=null;return;}
    if(wasResearch){const target=area?container.querySelector(`[data-sc-open-finding="${area}"]`):sourceTrigger;target?.focus?.({preventScroll:true});return;}
    [...container.querySelectorAll('[data-sc-match]')].find(button=>button.dataset.scMatch===triggerId)?.focus({preventScroll:true});
  }
  function drawReader() {
    screeningChat?.hide();
    cleanupPortrait();cleanupPortrait=()=>{};
    const match=filteredMatches().find(item=>item.record.id===selected);if(!match){closeReader(false);return;}
    const record=match.record, presentation=recordPresentation(record), source=report.sourceSnapshots.find(item=>item.id===record.sourceId), visible=filteredMatches(), position=visible.indexOf(match), decision=report.decisions?.[record.id];
    const reader=container.querySelector('.sc-reader');reader.setAttribute('aria-label','Source record');reader.hidden=false;container.querySelector('.sc-reader-empty').hidden=true;container.querySelector('.sc-results-body').classList.add('has-reader');
    reader.innerHTML=`<div class="sc-reader-toolbar"><span>${icon('file',15)}Source record</span><div><button class="icon-btn" data-sc-prev aria-label="Previous source record" ${position===0?'disabled':''}>${icon('arrow-left',15)}</button><span>${position+1} / ${visible.length}</span><button class="icon-btn" data-sc-next aria-label="Next source record" ${position===visible.length-1?'disabled':''}>${icon('arrow',15)}</button><button class="icon-btn" data-sc-close-reader aria-label="Close source record">${icon('x',18)}</button></div></div><div class="sc-reader-heading"><div class="sc-reader-source">${mark(record.sourceId)}<div><strong>${e(sourceLabels[record.sourceId])}</strong><small>${record.localReference?'Portal record':'Official list record'}</small></div></div><h2>${e(presentation.name)}</h2>${presentation.affiliate?'<span class="sc-affiliate-label">Affiliate entry</span>':''}<div class="sc-reader-score"><span>${match.identifierMatch?e(match.matchKind):`${Math.round(match.score)}% name similarity`}</span><small>Identity unconfirmed</small></div></div>${activeTab==='decision'?'<button class="sc-reader-back" data-sc-reader-back>← Back to record</button>':''}<div class="sc-reader-content" id="sc-reader-content" aria-label="${e(activeTab)}"></div><div class="sc-reader-footer">${external(record.sourceUrl||source?.url||sourceLinks[record.sourceId],'Open official source','sc-official-link')}<span>${record.localReference?'Local record reference':'Official record'}</span></div>`;
    reader.querySelector('[data-sc-close-reader]').onclick=closeReader;
    reader.querySelector('[data-sc-prev]').onclick=()=>moveReader(-1);reader.querySelector('[data-sc-next]').onclick=()=>moveReader(1);
    reader.querySelector('[data-sc-reader-back]')?.addEventListener('click',()=>{captureReaderDraft();activeTab='identity';drawReader();});
    const body=reader.querySelector('#sc-reader-content');
    if(activeTab!=='decision'){
      body.innerHTML=officialReadingHTML(match,report.research?.officialChecks?.find(c=>c.id===record.sourceId),report.query);
      body.querySelector('[data-sc-review-identity]').onclick=()=>{activeTab='decision';drawReader();container.querySelector('input[name="sc-decision"]')?.focus();};
    }else{
      drawDecision(body,record);
    }
    setReaderMode();
  }
  function drawDecision(body,record,scope='Record the identity decision and the evidence behind it.') {
    const decision=report.decisions?.[record.id];
      const pending=noteDrafts.get(record.id) || decision || {status:'investigate',note:''};
      body.innerHTML=`<h3 class="sc-decision-title">Does this record refer to your client?</h3><p class="sc-decision-subtitle">${e(scope)}</p><fieldset class="sc-decision-options"><legend class="sc-visually-hidden">Identity decision</legend>${[['investigate','Needs further review','Keep this match open.'],['confirmed','Same person or company','Identifiers support an identity match.'],['dismissed','Different person or company','Identifiers support excluding this match.']].map(([value,label,detail])=>`<label><input type="radio" name="sc-decision" value="${value}" ${pending.status===value?'checked':''}><span><strong>${label}</strong><small>${detail}</small></span></label>`).join('')}</fieldset><label class="sc-decision-note-label" for="sc-reviewer">Reviewer name <small>Optional</small></label><input id="sc-reviewer" class="sc-reviewer-input" maxlength="120" autocomplete="name" value="${e(pending.reviewer||'')}"><label class="sc-decision-note-label" for="sc-decision-note">Reason for your decision</label><textarea id="sc-decision-note" maxlength="4000" placeholder="For example: date of birth and registration details compared…">${e(pending.note || '')}</textarea><p class="sc-decision-error" role="alert" hidden></p><button class="btn primary sc-save-decision" data-sc-save-decision>Save decision ${icon('check',15)}</button>${decision?`<p class="sc-decision-saved">Last saved ${formatDate(decision.at,true)}</p>`:''}${decisionHistory(record.id)}`;
      body.querySelector('[data-sc-save-decision]').onclick=async event=>{
        const status=body.querySelector('input[name="sc-decision"]:checked')?.value || 'investigate', note=body.querySelector('#sc-decision-note').value.trim();
        if(status!=='investigate'&&!note){const err=body.querySelector('.sc-decision-error');err.textContent='Add a reason so this decision has an evidence trail.';err.hidden=false;body.querySelector('#sc-decision-note').focus();return;}
        let next;try{next=recordDecision(report,record,{status,note,reviewer:body.querySelector('#sc-reviewer').value});}catch(error){const err=body.querySelector('.sc-decision-error');err.textContent=error.message;err.hidden=false;return;}
        report=next;event.currentTarget.disabled=true;const ok=await persist(next);if(!active||report?.id!==next.id)return;if(ok){noteDrafts.delete(record.id);drawMatchList();researchSource?drawResearchReader():drawReader();refreshCandidateReviewLabels();refreshReviewProgress();refreshProfile();refreshAssessment();container.querySelector('[data-sc-save-decision]')?.focus({preventScroll:true});ctx.toast('Decision saved with this check.');}else{const button=body.querySelector('[data-sc-save-decision]');if(button)button.disabled=false;}
      };
  }
  function refreshCandidateReviewLabels(){
    for(const [selector,candidates,idOf] of [
      ['[data-sr-worldbank]',report.research?.worldbank?.candidates||[],c=>c.record?.id],
      ['[data-sr-provider]',report.research?.opensanctions?.candidates||[],c=>providerRecordId(c)]
    ])container.querySelectorAll(selector).forEach((button,i)=>{
      const index=Number(button.dataset.srWorldbank??button.dataset.srProvider??i);const label=reviewLabels[report.decisions?.[idOf(candidates[index]||{})]?.status]||'Identity needs review';
      const small=button.querySelector('small');if(small)small.textContent=small.textContent.replace(/(?:Identity needs review|Needs further review|Same identity|Different identity)$/,label);
    });
  }
  function decisionHistory(recordId) {
    const events=(report.reviewLog||[]).filter(item=>item.recordId===recordId);
    if(!events.length)return '';
    return `<details class="sc-decision-history"><summary>Decision history <span>${events.length}</span></summary><p class="sc-history-scope">Saved on this device. Reviewer names are entered manually; this is not an authenticated audit log.</p><ol>${[...events].reverse().map(item=>`<li><strong>${e(reviewLabels[item.status]||'Previous decision')}</strong><small>${e(formatDate(item.at,true))} · ${e(item.reviewer||'Reviewer not recorded')}${item.kind==='previous_saved_decision'?' · Earlier saved decision':''}</small><p>${e(item.note||'No reason recorded.')}</p></li>`).join('')}</ol></details>`;
  }
  function moveReader(direction) {const visible=filteredMatches(),current=visible.findIndex(match=>match.record.id===selected),next=visible[current+direction];if(next){captureReaderDraft();selected=next.record.id;triggerId=selected;matchPage=Math.floor((current+direction)/MATCH_PAGE_SIZE);drawMatchList();drawReader();container.querySelector(direction>0?'[data-sc-next]':'[data-sc-prev]')?.focus({preventScroll:true});}}
  function setReaderMode() {
    clearInert();const reader=container.querySelector('.sc-reader');if(!reader||reader.hidden)return;const backdrop=container.querySelector('.sc-reader-backdrop');backdrop.hidden=false;backdrop.onclick=()=>closeReader();
    if(isMobileReader()){reader.setAttribute('role','dialog');reader.setAttribute('aria-modal','true');for(const el of document.querySelectorAll('#sidebar,#header-actions,.mobile-menu,.skip-link,.sc-studio-head,.sc-result-heading,.sc-results-primary,.sc-connections-plug')){inertBefore.set(el,el.inert);el.inert=true;}}
    else {reader.removeAttribute('role');reader.removeAttribute('aria-modal');}
  }
  function reportLoadError(message) {
    shell(`<div class="sc-report-unavailable"><h1>Saved screening unavailable</h1><p role="alert">${e(message)}</p><button class="btn" data-sc-report-retry>Try again</button><button class="sc-quiet-button" data-sc-report-new>New search</button></div>`);
    container.querySelector('[data-sc-report-retry]').onclick=()=>openSavedReport(params.get('report'),true);
    container.querySelector('[data-sc-report-new]').onclick=startNewSearch;
  }
  async function openSavedReport(id,fromRoute=false) {
    if(!canLeaveReview())return;
    const request=++openRequest,routeGeneration=generation,previousReport=report;
    const stillCurrent=()=>active&&request===openRequest&&routeGeneration===generation&&report===previousReport;
    try {
      // Reading does not advance the revision until this view accepts navigation.
      const entry=history.readForReview
        ? await history.readForReview(id)
        : (await history.refresh(),{adopt:()=>history.get(id)});
      if(!stillCurrent()||!canLeaveReview())return;
      const item=entry?.adopt();
      if(!item){
        const message='This screening is not in this device’s history. Restore its evidence backup from History, or open another saved review.';
        if(fromRoute)reportLoadError(message);else ctx.toast(message);
        return;
      }
      modalClose?.();modalClose=null;
      report=restoreReturnedMatches(item);
      if(report.previousReportId)report.comparison=compareScreenings(history.get(report.previousReportId),report);
      resultsTab='overview';reportNotesDraft=item.notes||'';assessmentDraft=null;
      selected='';researchSource=null;activeTab='identity';filter='all';sourceFilter='all';
      matchPage=0;matchText='';noteDrafts.clear();view='results';drawResults();
    } catch(error) {
      if(!stillCurrent())return;
      if(fromRoute)reportLoadError(error.message);else ctx.toast(error.message);
    }
  }
  function bindHistoryRows(root) {root.querySelectorAll('[data-sc-open-report]').forEach(button=>button.onclick=()=>openSavedReport(button.dataset.scOpenReport));}

  function historyStatus(item) {
    if(screeningInputIssue(item.query))return 'Input needs correction';
    if(item.query.mode==='deep'&&!item.research)return 'Deep search not run';
    const official=officialSummary(item.research);
    if(item.research?.status==='running')return 'Unfinished · reopen to check';
    if(official?.incomplete || (item.research&&item.research.status!=='completed'))return `Incomplete${official?.entries?` · ${count(official.entries)} possible ${official.entries===1?'entry':'entries'}`:''}`;
    if(official?.entries)return `${count(official.entries)} possible ${official.entries===1?'entry':'entries'}`;
    if(item.research?.worldbank?.totalResults)return `${count(item.research.worldbank.totalResults)} procurement candidates`;
    if(item.research?.opensanctions?.possibleMatches)return `${count(item.research.opensanctions.possibleMatches)} provider candidates`;
    if(official)return 'No name matches';
    if(coverage(item.sourceSnapshots).incomplete&&!item.totalMatches)return 'Incomplete coverage';
    return reportLabel(item);
  }
  async function showHistory() {
    if(running)return;
    try{await history.refresh({preserveIds:report?[report.id]:[]});}catch(error){ctx.toast(error.message);}if(!active)return;
    const rows=histories(), assessments=new Map(rows.map(item=>[item.id,assessmentSummary(item)]));
    const dueCount=rows.filter(item=>assessments.get(item.id).due).length;
    modalClose=ctx.modal({title:'Screening history',body:`<div class="sc-history-dialog"><p>Evidence and decisions saved on this device. Export important reviews for your office records.</p><div class="sc-history-tools">${pendingReports.size?`<button class="btn" data-sc-recover>Retry saving ${pendingReports.size} unsaved checks</button>`:''}<button class="btn" data-sc-import-backup>Restore evidence backup</button><input type="file" accept=".json,application/json" data-sc-backup-file hidden><span role="status" data-sc-import-status></span></div>${rows.length?`<label class="sc-entry-search">${icon('search',16)}<input type="search" data-sc-history-search aria-label="Find saved screenings" placeholder="Find a name or matter…" autocomplete="off"></label><div class="sc-history-followup"><p class="sc-history-found" data-sc-history-found role="status">${rows.length} saved reviews</p><button class="sc-quiet-button" data-sc-history-due aria-pressed="false">Review due <b>${dueCount}</b></button></div>`:''}${rows.length?rows.map(item=>`<button class="sc-history-row" data-sc-open-report="${e(item.id)}"><span class="sc-history-icon">${icon('search',16)}</span><span><strong>${e(item.query.name)}</strong><small>${item.research?.retryOf?'Source retry':item.research?.mode!=='search'&&item.research||item.query.mode==='deep'?'Deep search':'Search'}${item.projectName?` · ${e(item.projectName)}`:''} · ${formatDate(item.createdAt,true)}</small></span><span class="sc-history-status">${e(historyStatus(item))}${assessments.get(item.id).recorded?`<small>${e(assessments.get(item.id).label)}${assessments.get(item.id).due?' · Review due':''}</small>`:''}</span>${icon('chevron',15)}</button>`).join(''):'<div class="sc-history-empty">Your first completed check will appear here.</div>'}</div>`,onMount(el){bindHistoryRows(el);
      el.querySelector('[data-sc-recover]')?.addEventListener('click',async()=>{for(const value of [...pendingReports.values()])await persist(value);modalClose?.();showHistory();});
      const file=el.querySelector('[data-sc-backup-file]'),status=el.querySelector('[data-sc-import-status]');el.querySelector('[data-sc-import-backup]').onclick=()=>file.click();
      file.onchange=async()=>{try{const chosen=file.files?.[0];if(!chosen)return;if(chosen.size>50*1024*1024)throw new Error('Choose an evidence backup smaller than 50 MB.');const value=parseScreeningReportBackup(await chosen.text());if(history.get(value.id)){value.importedFromReportId=value.id;value.id=crypto.randomUUID();}if(value.research&&['pending','running'].includes(value.research.status)){value.research.restoredStatus=value.research.status;value.research.status='interrupted';value.research.error='Imported snapshot; active requests were not resumed.';if(['pending','running'].includes(value.research.officialStatus))value.research.officialStatus='interrupted';for(const check of [...(value.research.officialChecks||[]),...['worldbank','gleif','opensanctions'].map(k=>value.research[k]).filter(Boolean),...(value.research.phases||[])])if(['pending','running'].includes(check.status)){check.restoredStatus=check.status;check.status='interrupted';}}await history.save({...value,restoredFromBackup:true,importedAt:new Date().toISOString()});status.textContent='Backup restored.';modalClose?.();showHistory();}catch(error){status.textContent=error.message;}};
      const input=el.querySelector('[data-sc-history-search]'),due=el.querySelector('[data-sc-history-due]');let dueOnly=false;const filterHistory=()=>{const terms=normalizeName(input.value).split(' ').filter(Boolean);let shown=0;el.querySelectorAll('[data-sc-open-report]').forEach(row=>{row.hidden=!(terms.every(term=>normalizeName(row.textContent).includes(term))&&(!dueOnly||assessments.get(row.dataset.scOpenReport)?.due));if(!row.hidden)shown++;});el.querySelector('[data-sc-history-found]').textContent=shown?`${shown} of ${rows.length} saved reviews`:'No saved reviews match this filter.';};if(input)input.oninput=filterHistory;if(due)due.onclick=()=>{dueOnly=!dueOnly;due.setAttribute('aria-pressed',String(dueOnly));filterHistory();};}});
  }
  function showConnections(){
    modalClose=openScreeningConnections(ctx,{research:cleanupResearch,provider:cleanupProvider});
  }
  function showSources(focusId, sources=bundle?.sources || []) {
    modalClose=openSourcesDialog(ctx,{sources,focusId:typeof focusId==='string'?focusId:null,canReload:view==='start',onReload:()=>{loadSources();drawStart();}});
  }
  function showConnection() {
    modalClose=ctx.modal({title:'Connect your office’s Lexis access',body:`<div class="sc-lexis-dialog"><span class="sc-connection-status">Not connected</span><h3>More context. In the same workspace.</h3><p>A licensed Lexis connection can add PEP, adverse-media and other risk information included in your office’s subscription.</p><ol><li>Confirm your exact Lexis product and internal API access.</li><li>Obtain the product’s integration documentation and test credentials.</li><li>Connect through the office backend; keep credentials off this page.</li></ol><p>Official-list screening works independently. This local workspace currently searches downloaded sanctions records.</p>${external('https://risk.lexisnexis.com/global/en/products/bridger-insight-xg','Screening integration options','sc-official-link')}</div>`});
  }
  const keydown=event=>{
    if(event.key==='Escape'){
      const menu=container.querySelector('.sc-export-menu');if(menu?.open){menu.open=false;menu.querySelector('summary')?.focus();return;}
      if((selected||researchSource)&&!document.querySelector('dialog[open]')){event.preventDefault();closeReader();}
    }
    if(event.key==='Tab'&&isMobileReader()&&!document.querySelector('dialog[open]')){
      const reader=container.querySelector('.sc-reader'), controls=[...reader.querySelectorAll('button:not(:disabled),a[href],summary,input,textarea,[tabindex="0"]')].filter(el=>!el.hidden&&el.getClientRects().length),first=controls[0],last=controls.at(-1);
      if(first&&(!reader.contains(document.activeElement)||(event.shiftKey?document.activeElement===first:document.activeElement===last))){event.preventDefault();(event.shiftKey?last:first).focus();}
    }
  };
  const outside=event=>{const menu=container.querySelector('.sc-export-menu');if(menu?.open&&!menu.contains(event.target))menu.open=false;};
  document.addEventListener('keydown',keydown);document.addEventListener('click',outside);globalThis.addEventListener?.('resize',setReaderMode);
  if(params.get('report')){view='opening';shell('<p class="sc-report-opening" role="status">Opening saved screening…</p>');}else drawStart();loadSources();
  // Loading saved reviews only changes the history count, not the search form.
  // Replacing the form here replayed its entrance and interrupted active typing.
  history.ready().then(()=>{if(!active)return;updateSaveState();if(view==='opening')void openSavedReport(params.get('report'),true);}).catch(error=>{if(active){if(view==='opening')reportLoadError(error.message);else ctx.toast(error.message);}});
  ctx.setNewSearchAction?.(startNewSearch);
  const beforeLeave=event=>{if(saving||pendingReports.size||hasDraftReview()){event.preventDefault();event.returnValue='';}};
  globalThis.addEventListener?.('beforeunload',beforeLeave);
  const guardNavigation=event=>{if(event.target.closest?.('[data-nav],.sc-back-home')&&!canLeaveReview()){event.preventDefault();event.stopImmediatePropagation();}};
  document.addEventListener('click',guardNavigation,true);
  return()=>{active=false;generation++;projectControl?.destroy();cleanupSourceHealth?.();unsubscribeHistory?.();if(!ctx.screeningHistory)void history.close?.();document.removeEventListener('click',guardNavigation,true);globalThis.removeEventListener?.('beforeunload',beforeLeave);screeningChat?.destroy();screeningProgress?.destroy();chatSessions.clear();cleanupOverviewPortrait();cleanupPortrait();cleanupResearch();cleanupProvider();clearInert();modalClose?.();document.removeEventListener('keydown',keydown);document.removeEventListener('click',outside);globalThis.removeEventListener?.('resize',setReaderMode);};
}
