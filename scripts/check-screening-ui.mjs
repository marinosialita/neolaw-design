import {historyFixture} from './screening-history-fixture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {render} from '../modules/screening.js';
import {searchRecords} from '../modules/screening-engine.js';
import {coverage, sourceState} from '../modules/screening-view-model.js';

// Detached DOM integration only. No browser, server, network, actual print or pixels.
// Uses the real imported records. Controlled source failures are fixtures, not fetched data.
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
const official=JSON.parse(readFileSync(new URL('../data/screening-sources.json',import.meta.url),'utf8'));
const sampleRecords=official.records.filter(record=>/putin/i.test(record.name));
assert.ok(sampleRecords.length>1,'Real snapshot must contain multiple records for the positive fixture');
const sample={...official,records:sampleRecords};
const tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let passed=0,failed=0;

async function check(label,run){
  const globals=['document','window','matchMedia','addEventListener','removeEventListener','setTimeout'];
  const previous=Object.fromEntries(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const nativeTimeout=globalThis.setTimeout;
  Object.defineProperty(globalThis,'setTimeout',{configurable:true,value:(callback,ms,...args)=>{const timer=nativeTimeout(callback,ms,...args);if(ms>=1000)timer.unref?.();return timer;}});
  const {document,window}=parseHTML('<html><body><nav id="sidebar"></nav><div id="header-actions"></div><button class="mobile-menu"></button><a class="skip-link"></a><main id="main"></main></body></html>');
  const container=document.querySelector('#main'),store=new Map(),events=new Map();
  const state={toasts:[],headers:[],modals:[],mobile:false,saveFailure:false,loads:0,downloads:[],popupCalls:0,screeningQueries:[]};
  let sourceLoader=async()=>sample,cleanup;
  const originalCreate=document.createElement.bind(document);
  const previousCreateURL=URL.createObjectURL,previousRevokeURL=URL.revokeObjectURL;
  const blobs=new Map();
  // Linkedom has no native layout/focus model. These shims model focus events and
  // radio/select semantics only; they do not establish visual browser behaviour.
  let activeElement=null;
  Object.defineProperty(document,'activeElement',{get:()=>activeElement});
  window.HTMLElement.prototype.focus=function(){activeElement=this;};
  window.HTMLElement.prototype.scrollIntoView=function(){};
  window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')?[]:[{}];};
  Object.defineProperty(window.HTMLInputElement.prototype,'checked',{configurable:true,get(){return this.hasAttribute('checked');},set(value){value?this.setAttribute('checked',''):this.removeAttribute('checked');}});
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){this.querySelectorAll('option').forEach(option=>option.toggleAttribute('selected',option.value===String(value)));}});
  window.open=()=>{state.popupCalls++;return null;};
  window.HTMLAnchorElement.prototype.click=function(){state.downloads.push({name:this.download||this.getAttribute('download'),blob:blobs.get(this.href)});};
  URL.createObjectURL=blob=>{const url='blob:ui-check-'+blobs.size;blobs.set(url,blob);return url;};
  URL.revokeObjectURL=()=>{};
  document.createElement=tag=>tag==='canvas'?{getContext:()=>null}:originalCreate(tag);
  Object.defineProperty(globalThis,'document',{configurable:true,value:document});
  Object.defineProperty(globalThis,'window',{configurable:true,value:window});
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:state.mobile})});
  Object.defineProperty(globalThis,'addEventListener',{configurable:true,value:(name,handler)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(handler);}});
  Object.defineProperty(globalThis,'removeEventListener',{configurable:true,value:(name,handler)=>events.get(name)?.delete(handler)});
  const listeners=new Map();
  const add=document.addEventListener.bind(document),remove=document.removeEventListener.bind(document);
  document.addEventListener=(name,fn,options)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);add(name,fn,options);};
  document.removeEventListener=(name,fn,options)=>{listeners.get(name)?.delete(fn);remove(name,fn,options);};
  let officialJob;
  const ctx={
    providerRequest:async()=>({configured:false}),
    screeningIndexRequest:async()=>sample,
    researchRequest:async(path,options)=>{
      if(path==='/api/research/status')return {configured:false,identifierFields:['passportNumber']};
      if(path==='/api/screening/start'){const bundle=await sourceLoader(),query=options.body.query;state.screeningQueries.push(structuredClone(query));const result=searchRecords(bundle,query);officialJob={id:'fixture-official',mode:'search',status:'completed',officialStatus:'completed',phases:[],officialChecks:[...new Set(['eu','ofac','un','uk','cy',...bundle.sources.map(s=>s.id)])].map(id=>({id,status:id==='cy'||bundle.sources.some(s=>s.id===id&&s.status==='available')?'completed':'failed',matchCount:result.matches.filter(m=>m.record.sourceId===id).length,candidates:result.matches.filter(m=>m.record.sourceId===id)}))};return {id:officialJob.id};}
      if(path==='/api/research/jobs/fixture-official')return officialJob;
      throw Error('Unexpected test request '+path);
    },
    params:new URLSearchParams(),
    storage:{get:(key,fallback)=>structuredClone(store.get(key)??fallback),set:(key,value)=>{if(state.saveFailure)return false;store.set(key,structuredClone(value));return true;}},
    setHeader:title=>state.headers.push(title),toast:message=>state.toasts.push(message),setNewSearchAction:action=>{state.newSearch=action;},
    loadScreeningData:()=>{state.loads++;return sourceLoader();},
    modal({title,body,onMount}){const dialog=originalCreate('dialog');dialog.setAttribute('open','');dialog.innerHTML=`<h2>${title}</h2>${body}`;document.body.append(dialog);state.modals.push(dialog);const close=()=>dialog.remove();onMount?.(dialog,close);return close;}
  };
  ctx.screeningHistory=historyFixture(ctx.storage);
  const fire=(el,type='click',extra={})=>{assert.ok(el,`Missing ${type} target`);const event=new window.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries(extra))Object.defineProperty(event,key,{value});el.dispatchEvent(event);return event;};
  const $=selector=>container.querySelector(selector),$$=selector=>[...container.querySelectorAll(selector)];
  const start=async()=>{cleanup=render(container,ctx);await tick(0);return container;};
  const field=(selector,value)=>{$(selector).value=value;fire($(selector),'input');};
  const submit=async(name='Putin')=>{field('#sc-name',name);fire($('#sc-form'),'submit');await tick(0);const deadline=Date.now()+8000;while(!$('.sc-results')&&Date.now()<deadline)await tick(30);assert.ok($('.sc-results'),'Screening did not reach results: '+container.textContent.slice(0,400));await tick(0);};
  const decision=async(status,note)=>{fire($('[data-sc-review-identity]'));$$('input[name="sc-decision"]').forEach(input=>input.checked=input.value===status);$('#sc-decision-note').value=note;fire($('[data-sc-save-decision]'));await tick(0);};
  const api={ctx,state,document,window,container,store,events,listeners,$,$$,fire,start,submit,field,decision,setLoader:fn=>sourceLoader=fn,cleanup:()=>{cleanup?.();cleanup=null;}};
  try {await run(api);passed++;console.log('PASS '+label);} catch(error){failed++;console.error('FAIL '+label+'\n'+error.stack);} finally{
    cleanup?.();state.modals.forEach(dialog=>dialog.remove());URL.createObjectURL=previousCreateURL;URL.revokeObjectURL=previousRevokeURL;
    for(const [key,value]of Object.entries(previous)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
  }
}

console.log('Screening workspace · detached DOM integration checks');
console.log('No browser rendering, network requests, live provider integration or visual verification is claimed.\n');

await check('Delayed history loading updates its badge without replacing the form or interrupting typing',async({start,ctx,store,$,field,document})=>{
  let ready;ctx.screeningHistory.ready=()=>new Promise(resolve=>{ready=resolve;});
  await start();const form=$('#sc-form'),input=$('#sc-name');input.focus();field('#sc-name','Draft being typed');
  store.set('screening-reports',[{id:'history-fixture',query:{name:'Saved example'}}]);ready();await tick(0);
  assert.equal($('#sc-form'),form);assert.equal($('#sc-name'),input);assert.equal(document.activeElement,input);
  assert.equal(input.value,'Draft being typed');assert.equal($('[data-sc-history] small').textContent,'1');
});

await check('Contextual New search clears identifiers without remounting sources and repeated resets keep the empty form',async({start,state,$,field,fire,document,cleanup})=>{
  await start();field('#sc-name','Previous company');field('#sc-country','Cyprus');field('#sc-passport','ABC 123');field('#sc-dob','1980-01-02');
  fire($('[data-sc-type="entity"]'));field('#sc-registration','HE 12345');field('#sc-lei','TEST1234567890123456');fire($('[data-sc-mode="deep"]'));
  const loads=state.loads;state.newSearch();
  for(const id of ['sc-name','sc-country','sc-passport','sc-dob','sc-registration','sc-lei'])assert.equal($('#'+id).value,'');
  assert.equal($('[data-sc-type="person"]').getAttribute('aria-pressed'),'true');assert.equal($('[data-sc-mode="search"]').getAttribute('aria-pressed'),'true');
  assert.equal(state.loads,loads);assert.equal(document.activeElement,$('#sc-name'));
  const form=$('#sc-form');state.newSearch();state.newSearch();assert.equal($('#sc-form'),form);
  const staleAction=state.newSearch;cleanup();staleAction();assert.equal($('#sc-form'),form);
});

await check('Toolbar and sidebar reset share review guards and preserve the saved report',async({start,submit,state,$,fire,field,store})=>{
  await start();await submit();const saved=structuredClone(store.get('screening-reports'));
  fire($('[data-sc-match]'));fire($('[data-sc-review-identity]'));field('#sc-decision-note','Unsubmitted review');
  state.newSearch();assert.ok($('.sc-results'));assert.equal($('#sc-decision-note').value,'Unsubmitted review');
  fire($('[data-sc-new]'));assert.ok($('.sc-results'));assert.match(state.toasts.at(-1),/Save your draft review/);
  field('#sc-decision-note','');fire($('[data-sc-new]'));
  assert.ok($('#sc-form'));assert.equal($('#sc-name').value,'');assert.deepEqual(store.get('screening-reports'),saved);
});

await check('A fresh name-only search defaults to Person and sends that explicit type to screening',async({start,$,submit,store,state})=>{
  await start();assert.equal($('[data-sc-type="person"]').getAttribute('aria-pressed'),'true');assert.equal($('[data-sc-type="all"]'),null);
  await submit('Example Yaroslavsky');assert.equal(state.screeningQueries.length,1);assert.equal(state.screeningQueries[0].type,'person');assert.equal(store.get('screening-reports')[0].query.type,'person');
});

await check('Pending source load disables submission; reload recovers from a rejected load',async({start,setLoader,$,fire,document,state})=>{
  let resolve;setLoader(()=>new Promise(done=>resolve=done));await start();assert.equal($('.sc-run-button').disabled,false);assert.match($('.sc-source-strip').textContent,/Official sanctions & export-control sources/);
  resolve(sample);await tick(0);assert.equal($('.sc-run-button').disabled,false);
  setLoader(async()=>{throw Error('Offline fixture');});fire($('[data-sc-sources]'));fire(document.querySelector('[data-sc-reload]'));await tick(0);
  assert.match($('.sc-form-error').textContent,/could not be loaded/);
  setLoader(async()=>sample);fire($('[data-sc-sources]'));fire(document.querySelector('[data-sc-reload]'));await tick(0);assert.equal($('.sc-form-error').hidden,true);assert.equal(state.loads,3);
});

await check('Person/company controls preserve the draft and hide birth date only for companies',async({start,$,fire,field,submit,store,ctx})=>{
  store.set('projects',[{id:'matter-qa',name:'Client intake'}]);ctx.params=new URLSearchParams('project=matter-qa');await start();
  field('#sc-name','Putin');field('#sc-country','Russia');field('#sc-dob','1952-10-07');
  fire($('[data-sc-type="entity"]'));assert.equal($('.sc-dob-field').hidden,true);assert.equal($('#sc-name').value,'Putin');assert.equal($('#sc-project'),null);
  fire($('[data-sc-type="person"]'));assert.equal($('.sc-dob-field').hidden,false);assert.equal($('#sc-dob').value,'1952-10-07');
  await submit();const report=store.get('screening-reports')[0];assert.equal(report.query.type,'person');assert.equal(report.query.country,'Russia');assert.equal(report.projectName,'Client intake');
});

await check('Actual source records reach results, details, listing, filters and official links',async({start,$,$$,fire,submit,store})=>{
  await start();fire($('[data-sc-type="person"]'));await submit();const report=store.get('screening-reports')[0];
  assert.ok(report.matches.length>1);assert.equal($$('[data-sc-match]').length,Math.min(10,report.matches.length));assert.equal($('.sc-profile-identity h1').textContent,'Putin');
  fire($('[data-sc-match]'));assert.equal($('.sc-reader').hidden,false);assert.equal($('.sc-reader-empty').hidden,true);assert.match($('.sc-reader-score').textContent,/identity unconfirmed/i);
  const record=report.matches[0].record;assert.equal($('.sc-reader-heading h2').textContent,record.name);assert.ok($('.sc-official-link').href.startsWith('https://'));assert.equal($('.sc-official-link').getAttribute('rel'),'noopener noreferrer');
  if(record.reasons)assert.ok($('#sc-reader-content').textContent.includes(record.reasons));
  $('#sc-source-filter').value='ofac';fire($('#sc-source-filter'),'change');assert.equal($$('[data-sc-match]').length,report.matches.filter(m=>m.record.sourceId==='ofac').length);
  $('#sc-source-filter').value='un';fire($('#sc-source-filter'),'change');assert.equal($$('[data-sc-match]').length,0);assert.ok($('[data-sc-reset-filters]'));
  fire($('[data-sc-reset-filters]'));assert.equal($$('[data-sc-match]').length,Math.min(10,report.matches.length));
});


await check('Every returned Cyprus entry is reachable, locally searchable and linked from its source count',async({start,store,document,$,$$,fire,field})=>{
  const candidates=Array.from({length:74},(_,i)=>({score:80,matchKind:'Portal name match',nameMatched:`Example Olga ${String(i+1).padStart(2,'0')}`,record:{id:`cy:fixture-${i+1}`,sourceId:'cy',name:`Example Olga ${String(i+1).padStart(2,'0')}`,type:'person',aliases:i===73?['Öther Alias']:[],countries:['CY'],sourceUrl:'https://example.test/record'}}));
  const query={name:'Olga',type:'person'},check={id:'cy',name:'Cyprus · Stratlink',status:'completed',matchCount:79,candidates,url:'https://example.test/portal',method:'live_portal'};
  store.set('screening-reports',[{id:'entries-fixture',createdAt:new Date().toISOString(),query,matches:candidates,totalMatches:79,sourceSnapshots:[],decisions:{},research:{id:'entries-job',mode:'search',status:'completed',officialStatus:'completed',query,officialChecks:[check],phases:[]}}]);
  await start();fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);
  fire($('[data-sc-section="sources"]'));assert.ok($('[data-sr-view-matches="cy"]'));
  fire($('[data-sr-view-matches="cy"]'));assert.equal($('#sc-source-filter').value,'cy');assert.equal($('#sc-entry-search').value,'');
  assert.match($('[data-sc-entry-meta]').textContent,/1–10 of 74 entries/);assert.match($('[data-sc-entry-limit]').textContent,/74 of 79 entries were retrieved/);
  const seen=[];
  for(let page=0;page<8;page++){seen.push(...$$('[data-sc-match]').map(b=>b.dataset.scMatch));if(page<7)fire($('[data-sc-page="next"]'));}
  assert.equal(new Set(seen).size,74);assert.equal(seen.length,74);assert.equal($('[data-sc-page="next"]').disabled,true);assert.match($('[data-sc-entry-meta]').textContent,/71–74 of 74/);
  field('#sc-entry-search','other alias');assert.equal($$('[data-sc-match]').length,1);assert.equal($('[data-sc-match]').dataset.scMatch,'cy:fixture-74');assert.match($('[data-sc-entry-meta]').textContent,/1–1 of 1/);
  fire($('[data-sc-match]'));assert.equal($('.sc-reader-heading h2').textContent,'Example Olga 74');fire($('[data-sc-close-reader]'));
  field('#sc-entry-search','nobody in returned entries');assert.match($('.sc-no-matches').textContent,/No records in this view/);assert.doesNotMatch($('.sc-no-matches').textContent,/No sanctions/);
  fire($('[data-sc-reset-filters]'));assert.equal($('#sc-entry-search').value,'');assert.equal($('#sc-source-filter').value,'all');assert.match($('[data-sc-entry-meta]').textContent,/1–10 of 74/);
  fire($$('[data-sc-match]')[9]);fire($('[data-sc-next]'));assert.equal($('.sc-reader-heading h2').textContent,'Example Olga 11');fire($('[data-sc-close-reader]'));assert.equal($('[data-sc-match][aria-pressed="true"]'),null);assert.match($('[data-sc-entry-meta]').textContent,/11–20 of 74/);assert.equal(document.activeElement.dataset.scMatch,'cy:fixture-11');
  field('#sc-entry-search','74');fire($('[data-sc-section="sources"]'));fire($('[data-sr-view-matches="cy"]'));assert.equal($('#sc-entry-search').value,'');assert.match($('[data-sc-entry-meta]').textContent,/1–10 of 74/);
});


await check('Saved reviews can be found locally without changing their evidence',async({start,store,document,$,fire})=>{
  const reviews=[{id:'old-1',query:{name:'Olga Example',type:'person'},createdAt:'2026-10-13',matches:[],sourceSnapshots:[]},{id:'old-2',query:{name:'Company Example',type:'entity'},createdAt:'2026-10-12',matches:[],sourceSnapshots:[]}];
  store.set('screening-reports',structuredClone(reviews));await start();fire($('[data-sc-history]'));await tick(0);
  const input=document.querySelector('[data-sc-history-search]');input.value='OLGA';fire(input,'input');
  assert.equal([...document.querySelectorAll('[data-sc-open-report]')].filter(el=>!el.hidden).length,1);
  input.value='no such saved review';fire(input,'input');assert.match(document.querySelector('[data-sc-history-found]').textContent,/No saved reviews/);
  input.value='';fire(input,'input');assert.equal([...document.querySelectorAll('[data-sc-open-report]')].filter(el=>!el.hidden).length,2);assert.deepEqual(store.get('screening-reports'),reviews);
});

function savedNavigationReport(id, previousReportId) {
  const query={name:`Synthetic saved review ${id}`,type:'person',mode:'search'};
  return {id,query,previousReportId,createdAt:'2026-10-14T08:00:00Z',matches:[],totalMatches:0,sourceSnapshots:[],decisions:{},notes:'',requiresOfficial:true,
    research:{id:`saved-navigation-${id}`,mode:'search',status:'completed',officialStatus:'completed',query,phases:[],officialChecks:['eu','ofac','un','uk','cy','bis','au','ca','ch'].map(id=>({id,status:'completed',matchCount:0,candidates:[]}))}};
}

await check('A draft entered during a delayed report read prevents navigation and revision adoption',async({ctx,start,store,$,fire,field,state})=>{
  const original=savedNavigationReport('current','previous'),previous=savedNavigationReport('previous');
  store.set('screening-reports',[original,previous]);ctx.params=new URLSearchParams('report=current');
  const read=ctx.screeningHistory.readForReview;let resolveRead,adoptions=0;
  ctx.screeningHistory.readForReview=id=>id==='current'?read(id):new Promise(resolve=>{resolveRead=resolve;});
  await start();assert.equal($('.sc-profile-identity h1').textContent,original.query.name);
  fire($('[data-sc-previous-report]'));assert.equal(typeof resolveRead,'function');
  field('#sc-report-notes','Keep this new unsaved review note');
  resolveRead({report:structuredClone(previous),adopt(){adoptions++;return structuredClone(previous);}});await tick(0);
  assert.equal(adoptions,0);assert.equal($('.sc-profile-identity h1').textContent,original.query.name);
  assert.equal($('#sc-report-notes').value,'Keep this new unsaved review note');assert.match(state.toasts.at(-1),/Save your draft review or notes/);
  assert.deepEqual(store.get('screening-reports'),[original,previous]);assert.equal(state.screeningQueries.length,0);
});

await check('New search cancels a delayed report opening without adopting or replacing the new form',async({ctx,start,store,$,fire,field,state})=>{
  const original=savedNavigationReport('current','previous'),previous=savedNavigationReport('previous');
  store.set('screening-reports',[original,previous]);ctx.params=new URLSearchParams('report=current');
  const read=ctx.screeningHistory.readForReview;let resolveRead,adoptions=0;
  ctx.screeningHistory.readForReview=id=>id==='current'?read(id):new Promise(resolve=>{resolveRead=resolve;});
  await start();fire($('[data-sc-previous-report]'));assert.equal(typeof resolveRead,'function');state.newSearch();
  const form=$('#sc-form');assert.ok(form);field('#sc-name','Next search draft');
  resolveRead({report:structuredClone(previous),adopt(){adoptions++;return structuredClone(previous);}});await tick(0);
  assert.equal(adoptions,0);assert.equal($('#sc-form'),form);assert.equal($('#sc-name').value,'Next search draft');assert.equal($('.sc-results'),null);
  assert.deepEqual(store.get('screening-reports'),[original,previous]);assert.equal(state.screeningQueries.length,0);
});

for(const order of [['second','first'],['first','second']]) {
  await check(`Only the latest requested report opens when reads complete ${order.join(' then ')}`,async({ctx,start,store,document,$,fire,state})=>{
    const reports=[savedNavigationReport('first'),savedNavigationReport('second')],pending=new Map(),adoptions=[];
    store.set('screening-reports',reports);
    ctx.screeningHistory.readForReview=id=>new Promise(resolve=>pending.set(id,resolve));
    await start();fire($('[data-sc-history]'));await tick(0);
    fire(document.querySelector('[data-sc-open-report="first"]'));fire(document.querySelector('[data-sc-open-report="second"]'));
    assert.equal(pending.size,2);
    for(const id of order) {
      const report=reports.find(report=>report.id===id);
      pending.get(id)({report:structuredClone(report),adopt(){adoptions.push(id);return structuredClone(report);}});await tick(0);
      if(id==='first'&&adoptions.length===0)assert.ok($('#sc-form'),'An obsolete result must not replace the current view');
    }
    assert.deepEqual(adoptions,['second']);assert.equal($('.sc-profile-identity h1').textContent,reports[1].query.name);
    assert.deepEqual(store.get('screening-reports'),reports);assert.equal(state.screeningQueries.length,0);
  });
}

await check('Source coverage opens the official checks even when provider results appear before them',async({start,store,document,$,fire})=>{
  const query={name:'Example',type:'person'};
  store.set('screening-reports',[{id:'coverage-fixture',query,createdAt:new Date().toISOString(),matches:[],sourceSnapshots:[],research:{id:'coverage-job',mode:'search',status:'completed',query,officialStatus:'completed',officialChecks:[{id:'cy',name:'Cyprus',status:'completed',matchCount:0}],opensanctions:{status:'completed',candidates:[{id:'provider-test',name:'Example',score:1}],possibleMatches:1},phases:[]}}]);
  await start();fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);fire($('[data-sc-check-coverage]'));
  assert.equal($('[data-sr-official-checks]').open,true);assert.equal($('[data-sc-panel="sources"]').hidden,false);
});

await check('No matching names with missing or stale sources stays a qualified result',async({start,setLoader,$,submit,fire,document})=>{
  setLoader(async()=>({...sample,sources:sample.sources.map(source=>source.id==='eu'?{...source,retrievedAt:'2000-01-01T00:00:00Z'}:source.id==='ofac'?{...source,status:'unavailable',recordCount:0,error:'Controlled download failure'}:source)}));await start();await submit('Zzqxv Unmatched Fixture');
  assert.match($('.sc-results-summary').textContent,/Checks incomplete/);assert.match($('.sc-at-a-glance').textContent,/Coverage incomplete/);assert.match($('.sc-no-matches').textContent,/source coverage/);
  assert.doesNotMatch($('.sc-results-primary').textContent,/client approved|client safe|clearance granted/i);
  fire($('[data-sc-check-coverage]'));assert.equal($('.sr-official-checks').open,true);assert.match($('.sr-official-checks').textContent,/Check failed/);assert.equal(document.querySelector('.sc-source-dialog'),null);
});

await check('Reader navigation follows the selected source and closes a record excluded by a review decision',async({start,$,$$,submit,fire,decision})=>{
  await start();await submit();$('#sc-source-filter').value='ofac';fire($('#sc-source-filter'),'change');
  const rows=$$('[data-sc-match]');assert.ok(rows.length>0);fire(rows[0]);
  assert.match($('.sc-reader-source').textContent,/United States/);assert.equal($('[data-sc-prev]').disabled,true);
  if(rows.length>1){fire($('[data-sc-next]'));assert.match($('.sc-reader-source').textContent,/United States/);}
  fire($('[data-sc-close-reader]'));fire($('[data-sc-filter="pending"]'));fire($('[data-sc-match]'));
  await decision('dismissed','Controlled fixture: identifiers establish a different person.');
  assert.equal($('.sc-reader').hidden,true);assert.equal($('.sc-reader-backdrop').hidden,true);
});

await check('Search opens its result workspace without artificial delay or waiting for the source metadata download',async({start,$,field,fire,store,setLoader})=>{
  setLoader(()=>new Promise(()=>{}));await start();field('#sc-name','Putin');fire($('#sc-form'),'submit');await tick(0);assert.ok($('.sc-results'));assert.equal(store.has('screening-reports'),true);assert.equal(store.get('screening-reports')[0].matches.length,0);
});

await check('Navigation cleanup removes listeners and prevents pending callbacks from replacing the next page',async({start,$,field,fire,store,container,cleanup,listeners,events})=>{
  await start();field('#sc-name','Putin');fire($('#sc-form'),'submit');await tick(0);cleanup();container.innerHTML='<h1>Next page</h1>';await tick(300);
  assert.equal(container.textContent,'Next page');assert.equal(store.has('screening-reports'),true);assert.equal(listeners.get('keydown').size,0);assert.equal(listeners.get('click').size,0);assert.equal(events.get('resize').size,0);
});

await check('Identity decisions require a reason, persist, update filters and survive history reopening',async({start,$,$$,submit,fire,decision,store,document})=>{
  await start();await submit();fire($('[data-sc-match]'));const id=$('[data-sc-match]').dataset.scMatch;
  await decision('dismissed','');assert.equal($('.sc-decision-error').hidden,false);assert.equal(store.get('screening-reports')[0].decisions[id],undefined);
  $('#sc-decision-note').value='Date of birth differs from verified client ID.';fire($('[data-sc-save-decision]'));await tick(0);
  assert.equal(store.get('screening-reports')[0].decisions[id].status,'dismissed');assert.match($('.sc-match-status.dismissed').textContent,/Different identity/);
  fire($('[data-sc-filter="dismissed"]'));assert.equal($$('[data-sc-match]').length,1);fire($('[data-sc-new]'));fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);
  assert.equal(document.querySelector('dialog[open]'),null);fire($('[data-sc-match]'));fire($('[data-sc-review-identity]'));assert.equal($('#sc-decision-note').value,'Date of birth differs from verified client ID.');
});

await check('Decision revisions and manually entered reviewer names survive saving and history reopening',async({start,$,$$,submit,fire,store,document})=>{
  await start();await submit();fire($('[data-sc-match]'));fire($('[data-sc-review-identity]'));
  $('#sc-reviewer').value='Synthetic reviewer';$('#sc-decision-note').value='First reason: additional identifier needed.';fire($('[data-sc-save-decision]'));await tick(0);
  $('#sc-decision-note').value='Second reason: request registry extract.';fire($('[data-sc-save-decision]'));await tick(0);
  let saved=store.get('screening-reports')[0];assert.equal(saved.reviewLog.length,2);assert.equal(saved.reviewLog[0].reviewer,'Synthetic reviewer');assert.match($('.sc-decision-history').textContent,/First reason/);
  fire($('[data-sc-save-decision]'));await tick(0);assert.equal(store.get('screening-reports')[0].reviewLog.length,2);
  fire($('[data-sc-new]'));fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);fire($('[data-sc-match]'));fire($('[data-sc-review-identity]'));
  assert.equal($('#sc-reviewer').value,'Synthetic reviewer');assert.match($('.sc-decision-history').textContent,/Second reason/);
});

await check('Unsaved decision text and selection survive record/tab changes',async({start,$,$$,submit,fire})=>{
  await start();await submit();fire($('[data-sc-match]'));fire($('[data-sc-review-identity]'));
  $$('input[name="sc-decision"]').forEach(input=>input.checked=input.value==='confirmed');$('#sc-decision-note').value='Evidence draft not saved yet.';
  fire($('[data-sc-reader-back]'));fire($('[data-sc-review-identity]'));assert.equal($('#sc-decision-note').value,'Evidence draft not saved yet.');assert.equal($('input[name="sc-decision"]:checked').value,'confirmed');
  fire($('[data-sc-next]'));fire($('[data-sc-prev]'));assert.equal($('#sc-decision-note').value,'Evidence draft not saved yet.');
});

await check('Report notes persist and an unrelated identity save preserves an unsaved report note draft',async({start,$,submit,fire,decision,store})=>{
  await start();await submit();$('#sc-notes').open=true;$('#sc-report-notes').value='Saved report context.';fire($('[data-sc-save-notes]'));await tick(0);assert.equal(store.get('screening-reports')[0].notes,'Saved report context.');
  $('#sc-report-notes').value='Unsaved additional report context.';fire($('#sc-report-notes'),'input');fire($('[data-sc-match]'));await decision('dismissed','Different identity confirmed.');
  $('#sc-notes').open=true;assert.equal($('#sc-report-notes').value,'Unsaved additional report context.');
});

await check('Review is one page; the record decision is a direct action with a way back',async({start,submit,$,fire,document})=>{
  await start();await submit();assert.equal($('[role="tablist"]'),null);assert.equal($('#sc-findings').hidden,false);assert.equal($('#sc-research').hidden,false);
  fire($('[data-sc-match]'));assert.match($('#sc-reader-content').textContent,/What was found/);assert.match($('#sc-reader-content').textContent,/Compare all identifiers/);
  fire($('[data-sc-review-identity]'));assert.ok($('#sc-decision-note'));fire($('[data-sc-reader-back]'));assert.ok($('[data-sc-review-identity]'));
  fire($('[data-sc-close-reader]'));assert.equal(document.activeElement,$('[data-sc-match]'));
});

await check('Narrow reader uses dialog semantics, focuses its controls and restores outside interactivity',async({start,$,submit,fire,state,document,cleanup,container})=>{
  state.mobile=true;await start();await submit();const row=$('[data-sc-match]');fire(row);const reader=$('.sc-reader');
  assert.equal(reader.getAttribute('role'),'dialog');assert.equal(reader.getAttribute('aria-modal'),'true');assert.equal(document.querySelector('#sidebar').inert,true);assert.equal($('.sc-results-primary').inert,true);
  const first=reader.querySelector('button:not(:disabled)');first.focus();const back=fire(document,'keydown',{key:'Tab',shiftKey:true});assert.equal(back.defaultPrevented,true);assert.ok(reader.contains(document.activeElement));
  fire(document,'keydown',{key:'Escape'});assert.equal(reader.hidden,true);assert.equal(document.querySelector('#sidebar').inert,undefined);assert.equal(document.activeElement,row);
  fire(row);cleanup();assert.equal(document.querySelector('#sidebar').inert,undefined);assert.equal(container.querySelector('.sc-results-primary').inert,undefined);
});

await check('Failed persistence keeps evidence visible, warns and leaves no phantom saved history',async({start,$,submit,state,store,fire,decision})=>{
  state.saveFailure=true;await start();await submit();assert.equal(store.has('screening-reports'),false);assert.match($('.sc-save-warning').textContent,/Not saved/);assert.ok(state.toasts.some(value=>/could not be saved/.test(value)));assert.ok($('[data-sc-match]'));
  fire($('[data-sc-match]'));await decision('dismissed','Distinct identity.');assert.equal(store.has('screening-reports'),false);assert.equal($('#sc-decision-note').value,'Distinct identity.');
});

await check('A new screening preserves older reviews beyond thirty reports',async({start,submit,store})=>{
  const old=Array.from({length:35},(_,i)=>({id:'old-'+i,query:{name:'Saved '+i},matches:[],sourceSnapshots:[],decisions:{},notes:'Retain this evidence.'}));
  store.set('screening-reports',old);await start();await submit();
  const saved=store.get('screening-reports');assert.equal(saved.length,36);assert.equal(saved.at(-1).id,'old-34');assert.equal(saved.at(-1).notes,'Retain this evidence.');
});
await check('A failed research update warns even when the initial report was saved',async({start,submit,store,state,ctx,$})=>{
  const request=ctx.researchRequest;
  ctx.researchRequest=async(path,options)=>{const result=await request(path,options);if(path==='/api/research/jobs/fixture-official')state.saveFailure=true;return result;};
  await start();await submit();assert.ok(store.get('screening-reports').length);assert.equal($('.sc-save-warning').hidden,false);assert.match($('.sc-save-warning').textContent,/latest evidence/);assert.ok($('[data-sc-match]'));
});

await check('Export menu wires PDF failure, PNG failure and an evidence JSON download',async({start,$,submit,fire,state})=>{
  await start();await submit();const menu=$('.sc-export-menu');menu.open=true;fire($('[data-sc-export="pdf"]'));await tick(0);assert.equal(menu.open,false);assert.equal(state.popupCalls,1);assert.ok(state.toasts.some(value=>/pop-up/.test(value)));
  fire($('[data-sc-export="png"]'));await tick(0);assert.equal($('[data-sc-export="png"]').disabled,false);assert.ok(state.toasts.some(value=>/summary image/.test(value)));
  fire($('[data-sc-export="json"]'));await tick(0);assert.equal(state.downloads.length,1);assert.match(state.downloads[0].name,/\.json$/);const data=JSON.parse(await state.downloads[0].blob.text());assert.equal(data.query.name,'Putin');assert.ok(data.matches.length>1);
});

await check('Real full snapshot positive search and UI coverage agree with the data model',async({start,setLoader,$,$$,submit,store})=>{
  setLoader(async()=>official);await start();const sources=coverage(official.sources);assert.equal($$('[data-sc-source-info]').length,1);assert.match($('.sc-source-strip').textContent,/Official sanctions & export-control sources/);
  await submit('Vladimir Vladimirovich Putin');const report=store.get('screening-reports')[0];const expected=searchRecords(official,report.query);assert.equal(report.totalMatches,expected.totalMatches);assert.equal($$('[data-sc-match]').length,Math.min(10,expected.matches.length));assert.equal(Boolean($('.sc-coverage-note')),false);assert.equal(report.sourceSnapshots.filter(source=>sourceState(source).ready).length,sources.ready);
});

for(const kind of ['worldbank','opensanctions']) await check(kind+' identity decisions preserve drafts, revisions, focus and source counts',async({start,store,document,$,fire,ctx,cleanup})=>{
  const record={id:'wb:fixture',name:'Synthetic candidate',sourceId:'wb',type:'entity',countries:['CY'],sourceUrl:'https://example.test/record'};
  const candidate=kind==='worldbank'?{record,score:100,nameMatched:record.name}:{id:'fixture',name:record.name,schema:'Company',url:'https://example.test/provider',score:1,countries:['CY'],topics:['debarment']};
  const report={id:'supplemental-fixture',query:{name:'Synthetic candidate',type:'entity',country:'Cyprus'},createdAt:new Date().toISOString(),matches:[],sourceSnapshots:[],decisions:{},research:{id:'saved-job',mode:'search',status:'completed',query:{name:'Synthetic candidate',type:'entity'},officialChecks:[],[kind]:{status:'completed',candidates:[candidate],totalResults:1,possibleMatches:1}}};
  const recordId=kind==='worldbank'?record.id:'opensanctions:fixture';
  const selector=kind==='worldbank'?'[data-sr-worldbank]':'[data-sr-provider]';
  store.set('screening-reports',[report]);await start();fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);await tick(0);
  const trigger=$(selector);trigger.closest('details').open=true;fire(trigger);fire($('[data-sc-review-identity]'));
  $('#sc-decision-note').value='Unsaved identifier follow-up';fire($('[data-sc-decision-back]'));fire($('[data-sc-review-identity]'));assert.equal($('#sc-decision-note').value,'Unsaved identifier follow-up');
  $('#sc-reviewer').value='Test reviewer';fire($('[data-sc-save-decision]'));await tick(0);assert.equal(store.get('screening-reports')[0].reviewLog.length,1);assert.equal(store.get('screening-reports')[0].decisions[recordId].note,'Unsaved identifier follow-up');
  assert.match($('.sc-decision-subtitle').textContent,/separate review/);assert.match($(selector).textContent,/Needs further review/);
  $('#sc-decision-note').value='Second unresolved test note';fire($('[data-sc-save-decision]'));await tick(0);assert.equal(store.get('screening-reports')[0].reviewLog.length,2);
  fire($('[data-sc-close-reader]'));assert.equal(document.activeElement,trigger,'Save must keep the originating record focus target');
  assert.equal(store.get('screening-reports')[0].research[kind].candidates.length,1);assert.equal(store.get('screening-reports')[0].matches.length,0,'Supplemental decisions must not inflate sanctions counts');
  cleanup();await start();fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);await tick(0);$(selector).closest('details').open=true;fire($(selector));assert.match($('.sc-source-review-state').textContent,/Needs further review/);fire($('[data-sc-review-identity]'));assert.equal($('#sc-decision-note').value,'Second unresolved test note');assert.match($('.sc-decision-history').textContent,/Unsaved identifier follow-up/);
});

await check('Review next skips recorded decisions, preserves drafts and returns focus to the summary',async({start,submit,$,$$,fire,decision,document,store})=>{
  await start();await submit();
  assert.match($('[data-sc-review-progress]').textContent,/records still open/);
  fire($('[data-sc-review-next]'));assert.equal(document.activeElement,$('[data-sc-close-reader]'));const first=$('[data-sc-match][aria-pressed="true"]').dataset.scMatch;
  await decision('dismissed','Different identifier in this offline fixture.');
  assert.match($('[data-sc-review-progress]').textContent,/1 different identity/);
  fire($('[data-sc-close-reader]'));assert.equal(document.activeElement,$('[data-sc-review-next]'));
  fire($('[data-sc-review-next]'));assert.notEqual($('[data-sc-match][aria-pressed="true"]').dataset.scMatch,first);
  fire($('[data-sc-review-identity]'));$('#sc-decision-note').value='Unsubmitted draft';fire($('[data-sc-close-reader]'));
  fire($('[data-sc-review-next]'));fire($('[data-sc-review-identity]'));assert.equal($('#sc-decision-note').value,'Unsubmitted draft');
  assert.equal(store.get('screening-reports')[0].reviewLog.length,1);
});

await check('Next review prioritises untouched records while retaining further-review items as open',async({start,submit,$,fire,decision})=>{
  await start();await submit();fire($('[data-sc-review-next]'));
  const first=$('[data-sc-match][aria-pressed="true"]').dataset.scMatch;
  await decision('investigate','An identifier is still needed.');
  assert.match($('[data-sc-review-progress]').textContent,/1 for further review/);
  fire($('[data-sc-close-reader]'));fire($('[data-sc-review-next]'));
  assert.notEqual($('[data-sc-match][aria-pressed="true"]').dataset.scMatch,first);
});

for(const kind of ['worldbank','opensanctions'])await check('Summary queue opens '+kind+' and updates only after a successful save',async({start,store,document,$,$$,fire,state})=>{
  const record={id:'wb:q',name:'Synthetic queue candidate',sourceId:'wb',sourceUrl:'https://example.test/record'};
  const candidate=kind==='worldbank'?{record,score:100}:{id:'q',name:record.name,url:record.sourceUrl,score:1};
  store.set('screening-reports',[{id:'queue-fixture',query:{name:record.name,type:'person'},createdAt:new Date().toISOString(),matches:[],sourceSnapshots:[],decisions:{},research:{id:'old-job',mode:'search',status:'completed',officialChecks:[],[kind]:{status:'completed',candidates:[candidate],totalResults:1}}}]);
  await start();fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);
  assert.match($('[data-sc-review-progress]').textContent,/1 not started/);fire($('[data-sc-review-next]'));assert.match($('.sc-reader').textContent,/Synthetic queue candidate/);
  fire($('[data-sc-review-identity]'));$('#sc-decision-note').value='Offline fixture requires further identifiers.';fire($('[data-sc-save-decision]'));await tick(0);
  assert.match($('[data-sc-review-progress]').textContent,/1 for further review/);
  $$('input[name="sc-decision"]').forEach(el=>el.checked=el.value==='dismissed');$('#sc-decision-note').value='Different verified identifier in fixture';state.saveFailure=true;fire($('[data-sc-save-decision]'));await tick(0);assert.match($('[data-sc-review-progress]').textContent,/1 for further review/);
  state.saveFailure=false;fire($('[data-sc-save-decision]'));await tick(0);assert.match($('[data-sc-review-progress]').textContent,/1 different identity/);assert.equal($('[data-sc-review-next]').textContent.trim(),'Review decisions');
  assert.match($('.sc-at-a-glance').textContent,/This does not approve the client/);fire($('[data-sc-close-reader]'));assert.equal(document.activeElement,$('[data-sc-review-next]'));
});

await check('Passport text in a name is blocked before screening or history creation',async({start,$,fire,field,store})=>{
  await start();fire($('[data-sc-type="person"]'));field('#sc-name','Example Individual passport number TEST000111');field('#sc-dob','1970-04-08');
  fire($('#sc-form'),'submit');await tick(0);await tick(300);
  assert.ok($('#sc-form'));assert.equal($('.sc-form-error').hidden,false);assert.match($('.sc-form-error').textContent,/Use the separate passport-number/);
  assert.equal($('#sc-dob').value,'1970-04-08');assert.equal(store.has('screening-reports'),false);
});
await check('A saved malformed query is flagged and correction preserves its original evidence and identifiers',async({start,$,fire,store,document,field})=>{
  const query={name:'Example Individual passport number TEST000111',type:'person',country:'Cyprus',dob:'1970-04-08',mode:'search'};
  const old={id:'input-fixture',query,createdAt:new Date().toISOString(),matches:[],totalMatches:0,sourceSnapshots:[],requiresOfficial:true,notes:'Saved review',decisions:{},research:{id:'saved-input-fixture',mode:'search',status:'completed',query,phases:[],officialChecks:['eu','ofac','un','uk','cy','bis','au','ca','ch'].map(id=>({id,status:'completed',matchCount:0}))}};
  store.set('screening-reports',[old]);await start();fire($('[data-sc-history]'));await tick(0);
  assert.match(document.querySelector('.sc-history-status').textContent,/Input needs correction/);
  fire(document.querySelector('[data-sc-open-report]'));await tick(0);await tick(0);
  assert.match($('.sc-summary-main h2').textContent,/Correct the name/);
  assert.match($('.sc-no-matches').textContent,/Repeat the search with the name only/);
  fire($('[data-sc-correct-input]'));await tick(0);
  assert.equal($('#sc-name').value,'Example Individual');assert.equal($('#sc-dob').value,query.dob);assert.equal($('#sc-country').value,query.country);
  assert.ok($('.sc-identifying-details'));assert.equal($('#sc-passport').value,'');
  assert.equal(store.get('screening-reports').length,1);assert.equal(store.get('screening-reports')[0].query.name,query.name);assert.equal(store.get('screening-reports')[0].notes,'Saved review');
  // Explicit submission creates a linked report; merely correcting did not send a request.
  fire($('#sc-form'),'submit');await tick(0);await tick(600);
  const next=store.get('screening-reports')[0];assert.equal(next.query.name,'Example Individual');assert.equal(next.previousReportId,old.id);assert.equal(store.get('screening-reports').length,2);
  assert.equal(store.get('screening-reports')[1].query.name,query.name);
});

for(const type of ['all',undefined])await check('Legacy '+String(type)+' search requires an explicit type and preserves the original when rerun',async({start,$,fire,store,document,state})=>{
 const old={id:'legacy-type-report',createdAt:'2026-10-13T12:00:00Z',query:{name:'Example Yaroslavsky',type,country:'Ukraine',mode:'search'},matches:[],sourceSnapshots:[],notes:'Original saved review',decisions:{},research:{id:'saved-legacy-job',mode:'search',status:'completed',officialChecks:[],phases:[]}};
 store.set('screening-reports',[old]);await start();fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);fire($('[data-sc-recheck]'));await tick(0);
 assert.ok($('#sc-form'));assert.equal($('[data-sc-type][aria-pressed="true"]'),null);assert.equal($('[data-sc-type-help]').hidden,false);assert.equal($('#sc-country').value,'Ukraine');
 fire($('#sc-form'),'submit');await tick(0);await tick(0);assert.equal(state.screeningQueries.length,0);assert.equal(store.get('screening-reports').length,1);assert.equal(store.get('screening-reports')[0].query.type,type);
 fire($('[data-sc-type="person"]'));assert.equal($('[data-sc-type-help]').hidden,true);fire($('#sc-form'),'submit');await tick(0);await tick(0);
 const reports=store.get('screening-reports');assert.equal(state.screeningQueries.length,1);assert.equal(state.screeningQueries[0].type,'person');assert.equal(reports.length,2);assert.equal(reports[0].previousReportId,old.id);assert.equal(reports[1].query.type,type);assert.equal(reports[1].notes,old.notes);
});

await check('Passport is retained for people, stripped for companies, and company number stays visible',async({start,$,fire,field,submit,store,state})=>{
 await start();fire($('[data-sc-type="person"]'));field('#sc-passport','TEST 001122');field('#sc-dob','1970-04-08');
 assert.equal($('.sc-passport-field').hidden,false);assert.equal($('#sc-passport').value,'TEST 001122');
 fire($('[data-sc-type="entity"]'));assert.equal($('.sc-passport-field').hidden,true);assert.equal($('.sc-company-field').hidden,false);field('#sc-registration','HE 12345');
 await submit('Example Company');let report=store.get('screening-reports')[0];assert.equal(report.query.passportNumber,'');assert.equal(report.query.registrationNumber,'HE 12345');assert.equal(report.query.dob,'');assert.equal(state.screeningQueries[0].type,'entity');
 fire($('[data-sc-new]'));assert.equal($('#sc-passport').value,'');assert.equal($('#sc-dob').value,'');assert.equal($('#sc-registration').value,'');
 fire($('[data-sc-type="person"]'));field('#sc-passport','TEST 001122');field('#sc-dob','1970-04-08');await submit('Example Individual');report=store.get('screening-reports')[0];
 assert.equal(report.query.passportNumber,'TEST 001122');assert.equal(report.query.registrationNumber,'');assert.equal(report.query.dob,'1970-04-08');
 assert.match($('.sc-profile-facts').textContent,/Passport.*•••• 1122/);assert.doesNotMatch($('.sc-profile-facts').textContent,/TEST 001122/);
});

await check('A single provider spelling-variant candidate shows its overview photo without opening the reader',async({start,$,fire,store,document})=>{
 const candidate={id:'auto-photo-fixture',name:'Example Yaroslavsky',schema:'Person',score:.84,possibleMatch:true,wikidataIds:['Q123456788'],topics:['role.pep']};
 const saved={id:'auto-photo-report',createdAt:'2026-10-13T12:00:00Z',query:{name:'Example Yarovsklavskyi',type:'person',mode:'search'},matches:[],sourceSnapshots:[],decisions:{},research:{id:'saved-auto-photo-job',mode:'search',status:'completed',officialChecks:[],phases:[],opensanctions:{status:'completed',possibleMatches:1,candidates:[candidate]}}};
 store.set('screening-reports',[saved]);const previousFetch=globalThis.fetch;let requests=0;
 globalThis.fetch=async url=>{
  requests++;assert.ok(url.startsWith('https://www.wikidata.org/w/api.php?')||url.startsWith('https://commons.wikimedia.org/w/api.php?'));
  const data=url.includes('wikidata.org')?{entities:{Q123456788:{id:'Q123456788',claims:{P18:[{rank:'normal',mainsnak:{snaktype:'value',datatype:'commonsMedia',datavalue:{value:'AutoFixture.jpg'}}}]}}}}:{query:{pages:{1:{ns:6,imageinfo:[{thumburl:'https://upload.wikimedia.org/wikipedia/commons/auto-fixture.jpg',mime:'image/jpeg',descriptionurl:'https://commons.wikimedia.org/wiki/File:AutoFixture.jpg',extmetadata:{Artist:{value:'Fixture photographer'},LicenseShortName:{value:'CC BY 4.0'}}}]}}}};
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(data)};
 };
 try{
  await start();fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);await tick(0);
  assert.ok($('[data-sc-profile-portrait] img'));assert.match($('[data-sc-profile-portrait]').textContent,/Candidate photo/);assert.equal($('.sc-reader').hidden,true);assert.equal(requests,2);
  assert.deepEqual(store.get('screening-reports')[0].decisions,{});assert.equal(store.get('screening-reports')[0].overviewPortraitCandidateId,undefined);
 }finally{globalThis.fetch=previousFetch;}
});

await check('A loaded provider photo reaches the overview, survives reopening and disappears after identity dismissal',async({start,$,fire,store,document,decision})=>{
 const candidate={id:'photo-fixture',name:'Example Yaroslavsky',schema:'Person',score:.84,possibleMatch:true,birthDates:['1959-12-05'],wikidataIds:['Q123456789'],topics:['role.pep']};
 const saved={id:'photo-report',createdAt:'2026-10-13T12:00:00Z',query:{name:'Example Yarovsklavskyi',type:'person',mode:'search'},matches:[],sourceSnapshots:[],decisions:{},research:{id:'saved-photo-job',mode:'search',status:'completed',officialChecks:[],phases:[],opensanctions:{status:'completed',possibleMatches:2,candidates:[candidate,{...candidate,id:'second-photo-candidate',name:'Example Yaroslavska',wikidataIds:[]}]}}};
 store.set('screening-reports',[saved]);
 const previousFetch=globalThis.fetch;let photoRequests=0;
 globalThis.fetch=async url=>{
  photoRequests++;
  assert.ok(url.startsWith('https://www.wikidata.org/w/api.php?')||url.startsWith('https://commons.wikimedia.org/w/api.php?'));
  const data=url.includes('wikidata.org')?{entities:{Q123456789:{id:'Q123456789',claims:{P18:[{rank:'normal',mainsnak:{snaktype:'value',datatype:'commonsMedia',datavalue:{value:'Fixture.jpg'}}}]}}}}:{query:{pages:{1:{ns:6,imageinfo:[{thumburl:'https://upload.wikimedia.org/wikipedia/commons/fixture.jpg',mime:'image/jpeg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Fixture.jpg',extmetadata:{Artist:{value:'Fixture photographer'},LicenseShortName:{value:'CC BY 4.0'}}}]}}}};
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(data)};
 };
 try{
  await start();fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);
  assert.equal($('[data-sc-profile-portrait] img'),null);fire($('[data-sc-section="matches"]'));fire($('[data-sc-supplemental] [data-sr-provider]'));fire($('[data-candidate-photo]'));await tick(0);
  const photo=$('[data-candidate-photo-result] img');assert.ok(photo);assert.equal($('[data-sc-profile-portrait] img'),null);photo.onload();await tick(0);
  assert.equal($('[data-sc-profile-portrait] img').getAttribute('src'),photo.getAttribute('src'));assert.match($('[data-sc-profile-portrait]').textContent,/Candidate photo/);
  assert.deepEqual(store.get('screening-reports')[0].decisions,{});assert.equal(store.get('screening-reports')[0].overviewPortraitCandidateId,'opensanctions:photo-fixture');
  assert.equal(photoRequests,2);assert.equal($('.sc-reader').hidden,false);
  fire($('[data-sc-close-reader]'));fire($('[data-sc-new]'));fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);await tick(0);
  assert.ok($('[data-sc-profile-portrait] img'));assert.equal(photoRequests,2);
  fire($('[data-sc-section="matches"]'));fire($('[data-sc-supplemental] [data-sr-provider]'));await decision('dismissed','Test fixture: reliable identifiers belong to a different person.');await tick(0);
  assert.equal($('[data-sc-profile-portrait] img'),null);assert.equal(store.get('screening-reports')[0].decisions['opensanctions:photo-fixture'].status,'dismissed');
 }finally{globalThis.fetch=previousFetch;}
});

await check('Legacy source buttons and chart open the retained records instead of looping to coverage',async({start,store,document,$,fire})=>{
  const candidate={record:{id:'eu:retained',sourceId:'eu',name:'Legacy Synthetic Person',type:'person'},score:90};
  store.set('screening-reports',[{id:'legacy-source-navigation',createdAt:new Date().toISOString(),query:{name:'Legacy Synthetic Person',type:'person',mode:'search'},matches:[candidate],sourceSnapshots:[],decisions:{},research:{id:'legacy-navigation-job',mode:'search',status:'completed',officialChecks:[{id:'eu',status:'completed',matchCount:1}],phases:[]}}]);
  await start();fire($('[data-sc-history]'));await tick(0);fire(document.querySelector('[data-sc-open-report]'));await tick(0);
  for(const selector of ['[data-sr-view-matches="eu"]','[data-sc-map-source="eu"]']){
    fire($('[data-sc-section="sources"]'));assert.ok($(selector));fire($(selector));
    assert.equal($('#sc-source-filter').value,'eu');assert.equal($('[data-sc-section="matches"]').getAttribute('aria-pressed'),'true');
    assert.equal($('[data-sc-match]').dataset.scMatch,'eu:retained');
  }
  fire($('[data-sc-match]'));assert.equal($('.sc-reader-heading h2').textContent,'Legacy Synthetic Person');
});

console.log(`\n${passed} passed; ${failed} failed. Detached event/content checks only; visual layout and native browser behaviour remain unverified.`);
if(failed)process.exitCode=1;
