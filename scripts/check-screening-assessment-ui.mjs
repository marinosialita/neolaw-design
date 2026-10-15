import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {render} from '../modules/screening.js';
import {recordAssessment} from '../modules/screening-assessment.js';
import {historyFixture} from './screening-history-fixture.mjs';
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(predicate,label)=>{const end=Date.now()+2500;while(!predicate()&&Date.now()<end)await delay(5);assert.ok(predicate(),label);};
const sources=['eu','ofac','un','uk','cy','bis','au','ca','ch'];
const emptyBundle={schemaVersion:1,records:[],sources:sources.map(id=>({id,status:'available',recordCount:1,retrievedAt:new Date().toISOString(),indexReady:true}))};
function report(id='assessment-ready',name='Synthetic assessment subject'){
 const query={name,type:'person',mode:'search'};
 return {id,createdAt:new Date().toISOString(),query,matches:[],totalMatches:0,sourceSnapshots:[],decisions:{},notes:'',requiresOfficial:true,research:{schemaVersion:7,id:id+'-job',query,status:'completed',mode:'search',officialStatus:'completed',officialChecks:sources.map(id=>({id,status:'completed',matchCount:0,candidates:[],checkedAt:new Date().toISOString()})),worldbank:{status:'completed',totalResults:0,candidates:[]},gleif:{status:'not_applicable'},opensanctions:{status:'not_configured'},phases:[]}};
}
const outcome={status:'review_recorded',reviewer:'Synthetic Reviewer',reason:'Reviewed saved receipts and scope. Retain the recorded limitations.',findingsReviewed:true,nextReviewDate:''};
let passed=0,failed=0;
async function check(name,test){
 const keys=['document','window','matchMedia','addEventListener','removeEventListener','fetch'],before=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const {document,window}=parseHTML('<html><body><nav id="sidebar"></nav><div id="header-actions"></div><button class="mobile-menu"></button><a class="skip-link"></a><main id="main"></main></body></html>');
 let activeElement=null;Object.defineProperty(document,'activeElement',{get:()=>activeElement});
 window.HTMLElement.prototype.focus=function(){activeElement=this;};window.HTMLElement.prototype.scrollIntoView=function(){};
 window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')?[]:[{}];};
 Object.defineProperty(window.HTMLInputElement.prototype,'checked',{configurable:true,get(){return this.hasAttribute('checked');},set(value){value?this.setAttribute('checked',''):this.removeAttribute('checked');}});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){this.querySelectorAll('option').forEach(option=>option.toggleAttribute('selected',option.value===String(value)));}});
 window.open=()=>null;window.scrollTo=()=>{};
 const events=new Map(),state={toasts:[],failSave:false,newSearch:null,requests:[]},store=new Map([['screening-reports',[report()]]]);
 Object.assign(globalThis,{document,window,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},removeEventListener:(name,fn)=>events.get(name)?.delete(fn),fetch:()=>{throw Error('No network allowed in assessment tests');}});
 const storage={get:(key,fallback)=>structuredClone(store.get(key)??fallback),set:(key,value)=>{if(state.failSave)return false;store.set(key,structuredClone(value));return true;}};
 const repository=historyFixture(storage),history={...repository,save:async value=>{const snapshot=structuredClone(value),gate=state.saveGate;state.saveGate=null;if(gate)await gate.promise;return repository.save(snapshot);}},main=document.querySelector('main'),$=selector=>main.querySelector(selector);
 const holdNext=()=>{let resolve;const promise=new Promise(done=>resolve=done);state.saveGate={promise,resolve};return state.saveGate;};
 const fire=(node,type='click')=>{assert.ok(node,`Missing ${type} target`);node.dispatchEvent(new window.Event(type,{bubbles:true,cancelable:true}));};
 const ctx={storage,screeningHistory:history,params:new URLSearchParams(),setHeader(){},toast:message=>state.toasts.push(message),setNewSearchAction:fn=>state.newSearch=fn,loadScreeningData:async()=>emptyBundle,screeningIndexRequest:async()=>emptyBundle,providerRequest:async()=>({configured:false}),researchRequest:async path=>{state.requests.push(path);if(path==='/api/research/status')return {configured:false,identifierFields:['passportNumber']};throw Error('Unexpected test API request: '+path);},modal({title,body,onMount}){const dialog=document.createElement('dialog');dialog.open=true;dialog.setAttribute('open','');dialog.innerHTML=`<h2>${title}</h2>${body}`;document.body.append(dialog);const close=()=>dialog.remove();onMount?.(dialog,close);return close;}};
 let cleanup;
 const start=async()=>{cleanup=render(main,ctx);await delay(10);};
 const open=async(id='assessment-ready')=>{fire($('[data-sc-history]'));await until(()=>document.querySelector(`[data-sc-open-report="${id}"]`),'Saved report appears');fire(document.querySelector(`[data-sc-open-report="${id}"]`));await until(()=>$('[data-sc-assessment-form]'),'Assessment form appears');};
 const field=(name,value)=>{const input=$(`[data-sc-assessment-form] [name="${name}"]`);assert.ok(input,'Assessment field '+name);if(name==='findingsReviewed')input.checked=value;else input.value=value;fire(input,'input');};
 const fill=(values=outcome)=>{for(const [name,value] of Object.entries(values))field(name,value);};
 const submit=()=>fire($('[data-sc-assessment-form]'),'submit');
 try{await test({start,open,$,field,fill,submit,fire,document,state,store,history,events,holdNext});passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}finally{cleanup?.();document.querySelectorAll('dialog').forEach(d=>d.remove());for(const key of keys){if(before[key])Object.defineProperty(globalThis,key,before[key]);else delete globalThis[key];}}
}
console.log('Assessment workflow · detached DOM integration only. Synthetic reports; no live APIs, browser pixels, paid calls or user history.');
await check('Unsaved assessment text blocks sidebar/toolbar reset and browser leave without losing the draft',async({start,open,$,field,fire,state,events,history})=>{
 await start();await open();field('reviewer','Draft Reviewer');field('reason','Unsubmitted rationale');state.newSearch();assert.ok($('.sc-results'));assert.equal($('[name="reason"]').value,'Unsubmitted rationale');fire($('[data-sc-new]'));assert.ok($('.sc-results'));assert.match(state.toasts.at(-1),/Save your draft review/);
 const event={prevented:false,preventDefault(){this.prevented=true;}};for(const listener of events.get('beforeunload')||[])listener(event);assert.equal(event.prevented,true);assert.equal(history.get('assessment-ready').assessmentLog,undefined);
});
await check('A recorded review is persisted with its evidence reference and scope, then reset is allowed',async({start,open,$,fill,submit,state,history})=>{
 await start();await open();fill();submit();await until(()=>history.get('assessment-ready').assessmentLog?.length===1,'Outcome committed');await delay(5);
 const saved=history.get('assessment-ready'),event=saved.assessmentLog[0];assert.equal(event.status,'review_recorded');assert.equal(event.reviewer,outcome.reviewer);assert.equal(event.reason,outcome.reason);assert.match(event.evidenceKey,/^evidence-v1:/);assert.ok(event.scopeNotes.some(n=>/OpenSanctions was not checked/.test(n)));assert.match($('.sc-assessment-state').textContent,/Review recorded/);assert.match($('[data-sc-assessment]').textContent,/not authenticated/);
 state.newSearch();assert.ok($('#sc-form'));assert.equal(history.get('assessment-ready').assessmentLog.length,1);
});
await check('Storage failure keeps the outcome visibly unsaved and guarded; resubmission records one event',async({start,open,$,fill,submit,state,history})=>{
 await start();await open();state.failSave=true;fill();submit();await until(()=>/Outcome not saved/.test($('[data-sc-assessment-error]').textContent),'Failed outcome saving is visible');assert.equal(history.get('assessment-ready').assessmentLog,undefined);assert.equal($('.sc-save-warning').hidden,false);assert.equal($('[name="reason"]').value,outcome.reason);
 state.newSearch();assert.ok($('.sc-results'));state.failSave=false;submit();await until(()=>history.get('assessment-ready').assessmentLog?.length===1,'Retry committed one outcome');await delay(5);assert.equal($('[data-sc-assessment-error]').hidden,true);state.newSearch();assert.ok($('#sc-form'));
});
await check('Editing an outcome during its primary save preserves the newer draft and its leave guard',async({start,open,$,field,fill,submit,state,history,holdNext})=>{
 await start();await open();fill();const gate=holdNext();submit();assert.equal($('[data-sc-assessment-form] [type="submit"]').disabled,true);
 const newer='New rationale entered while the submitted outcome is saving';field('reason',newer);gate.resolve();await until(()=>history.get('assessment-ready').assessmentLog?.length===1,'Submitted outcome committed');await delay(5);
 assert.equal(history.get('assessment-ready').assessmentLog[0].reason,outcome.reason);assert.equal($('[name="reason"]').value,newer);assert.match(state.toasts.at(-1),/newer edits are still a draft/);state.newSearch();assert.ok($('.sc-results'));assert.match(state.toasts.at(-1),/Save your draft review/);
 submit();await until(()=>history.get('assessment-ready').assessmentLog?.length===2,'Newer outcome committed separately');await delay(5);assert.deepEqual(history.get('assessment-ready').assessmentLog.map(event=>event.reason),[outcome.reason,newer]);state.newSearch();assert.ok($('#sc-form'));
});
await check('Global Retry saving commits the outcome and releases the matching draft guard',async({start,open,$,fill,submit,fire,state,history})=>{
 await start();await open();state.failSave=true;fill();submit();await until(()=>/Outcome not saved/.test($('[data-sc-assessment-error]').textContent),'Failed outcome saving is visible');state.failSave=false;fire($('[data-sc-save-retry]'));await until(()=>history.get('assessment-ready').assessmentLog?.length===1,'Global retry committed the outcome');await delay(5);state.newSearch();assert.ok($('#sc-form'),'Committed matching assessment draft should not trap navigation');
});
await check('An outcome draft edited while global retry is pending remains visible and guarded',async({start,open,$,field,fill,submit,fire,state,history,holdNext})=>{
 await start();await open();state.failSave=true;fill();submit();await until(()=>/Outcome not saved/.test($('[data-sc-assessment-error]').textContent),'Failed outcome saving is visible');state.failSave=false;const gate=holdNext();fire($('[data-sc-save-retry]'));field('reason','New rationale edited while the retry is saving');gate.resolve();await until(()=>history.get('assessment-ready').assessmentLog?.length===1,'Original outcome committed');await delay(5);assert.equal(history.get('assessment-ready').assessmentLog[0].reason,outcome.reason);assert.equal($('[name="reason"]').value,'New rationale edited while the retry is saving');state.newSearch();assert.ok($('.sc-results'));assert.match(state.toasts.at(-1),/Save your draft review/);
});
await check('Changed source evidence retains the former outcome but marks it for an updated review',async({start,open,$,store,history})=>{
 const original=recordAssessment(report(),outcome);const changed=structuredClone(original);changed.query.country='Cyprus';store.set('screening-reports',[changed]);await start();await open();assert.match($('.sc-assessment-state').textContent,/Review needs updating/);assert.match($('[data-sc-assessment]').textContent,/previous outcome is retained/);assert.equal(history.get('assessment-ready').assessmentLog[0].id,original.assessmentLog[0].id);assert.equal($('[name="status"]').value,'open');
});
await check('History due filter combines follow-up dates with name search and preserves saved evidence',async({start,$,fire,document,store})=>{
 const old=new Date(Date.now()-2*864e5).toISOString(),dueDate=old.slice(0,10),later=new Date(Date.now()+7*864e5).toISOString().slice(0,10);
 const due=recordAssessment(report('due-review','Due Example'),{...outcome,nextReviewDate:dueDate},old),future=recordAssessment(report('future-review','Future Example'),{...outcome,nextReviewDate:later}),rows=[due,future,report('open-review','Open Example')];store.set('screening-reports',structuredClone(rows));await start();fire($('[data-sc-history]'));await until(()=>document.querySelector('[data-sc-history-due]'),'Due filter visible');const toggle=document.querySelector('[data-sc-history-due]');assert.match(toggle.textContent,/1/);fire(toggle);let visible=()=>[...document.querySelectorAll('[data-sc-open-report]')].filter(r=>!r.hidden);assert.deepEqual(visible().map(r=>r.dataset.scOpenReport),['due-review']);const search=document.querySelector('[data-sc-history-search]');search.value='Future';fire(search,'input');assert.equal(visible().length,0);fire(toggle);assert.deepEqual(visible().map(r=>r.dataset.scOpenReport),['future-review']);assert.deepEqual(store.get('screening-reports'),rows);
});
await check('An incomplete check cannot be recorded as completed review; explanation remains actionable',async({start,open,$,store,fill,submit,history})=>{
 const value=report();value.research.officialChecks[0].status='failed';value.research.officialChecks[0].error='Synthetic failure';store.set('screening-reports',[value]);await start();await open();assert.equal($('[name="status"] option[value="review_recorded"]').hasAttribute('disabled'),true);fill();submit();await until(()=>/Resolve the outstanding/.test($('[data-sc-assessment-error]').textContent),'Incomplete completion blocked');assert.equal(history.get('assessment-ready').assessmentLog,undefined);
});
console.log(`${passed} assessment UI checks passed; ${failed} failed.`);if(failed)process.exitCode=1;
