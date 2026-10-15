import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {render} from '../modules/screening.js';
import {recordAssessment,assessmentEvidenceKey} from '../modules/screening-assessment.js';
import {historyFixture} from './screening-history-fixture.mjs';
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(predicate,label)=>{const end=Date.now()+2500;while(!predicate()&&Date.now()<end)await delay(5);assert.ok(predicate(),label);};
const sourceIds=['eu','ofac','un','uk','cy','bis','au','ca','ch'];
const emptyBundle={schemaVersion:1,records:[],sources:sourceIds.map(id=>({id,status:'available',recordCount:1,retrievedAt:new Date().toISOString(),indexReady:true}))};
const projects=[{id:'project-a',name:'Aurora review',description:'Acquisition checks'},{id:'project-b',name:'Orion review',description:'Corporate review'}];
function makeReport(){
 const id='project-link-report',query={name:'Synthetic project subject',type:'person',mode:'search'},at=new Date().toISOString();
 return recordAssessment({id,createdAt:at,query,matches:[],totalMatches:0,sourceSnapshots:[],decisions:{'retained-record':{status:'investigate',reviewer:'Test Reviewer',note:'Retain underlying source context'}},reviewLog:[{id:'retained-event',recordId:'retained-record',at,status:'investigate',reviewer:'Test Reviewer',note:'Review remains open'}],notes:'Existing saved review notes',requiresOfficial:true,research:{schemaVersion:7,id:id+'-job',query,status:'completed',mode:'search',officialStatus:'completed',officialChecks:sourceIds.map(id=>({id,status:'completed',matchCount:0,candidates:[],checkedAt:at})),worldbank:{status:'completed',totalResults:0,candidates:[]},gleif:{status:'not_applicable'},opensanctions:{status:'not_configured'},phases:[]}}, {status:'needs_information',reviewer:'Test Reviewer',reason:'Awaiting documentary identity evidence.',findingsReviewed:false,nextReviewDate:''});
}
let passed=0,failed=0;
async function check(name,test){
 const keys=['document','window','matchMedia','addEventListener','removeEventListener','fetch'],before=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const {document,window}=parseHTML('<html><body><nav id="sidebar"></nav><div id="header-actions"></div><button class="mobile-menu"></button><a class="skip-link"></a><main id="main"></main></body></html>');
 let activeElement=null;Object.defineProperty(document,'activeElement',{get:()=>activeElement});
 window.HTMLElement.prototype.focus=function(){activeElement=this;};window.HTMLElement.prototype.scrollIntoView=function(){};window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')?[]:[{}];};
 Object.defineProperty(window.HTMLInputElement.prototype,'checked',{configurable:true,get(){return this.hasAttribute('checked');},set(value){value?this.setAttribute('checked',''):this.removeAttribute('checked');}});
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){this.querySelectorAll('option').forEach(option=>option.toggleAttribute('selected',option.value===String(value)));}});
 window.open=()=>null;window.scrollTo=()=>{};
 const events=new Map(),state={toasts:[],failSave:false,conflict:false,requests:[],saves:0},store=new Map([['screening-reports',[makeReport()]],['projects',structuredClone(projects)]]);
 Object.assign(globalThis,{document,window,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},removeEventListener:(name,fn)=>events.get(name)?.delete(fn),fetch:()=>{throw Error('No network allowed in project tests');}});
 const storage={get:(key,fallback)=>structuredClone(store.get(key)??fallback),set:(key,value)=>{if(state.failSave)return false;store.set(key,structuredClone(value));return true;}};
 const repository=historyFixture(storage),history={...repository,save:async value=>{state.saves++;if(state.conflict)throw Error('This screening changed in another tab. Reopen History before saving.');return repository.save(value);}};
 const main=document.querySelector('main'),$=selector=>main.querySelector(selector),dialog=()=>document.querySelector('dialog'),fire=(node,type='click')=>{assert.ok(node,`Missing ${type} target`);node.dispatchEvent(new window.Event(type,{bubbles:true,cancelable:true}));};
 const ctx={storage,screeningHistory:history,params:new URLSearchParams(),setHeader(){},toast:message=>state.toasts.push(message),setNewSearchAction:fn=>state.newSearch=fn,loadScreeningData:async()=>emptyBundle,screeningIndexRequest:async()=>emptyBundle,providerRequest:async()=>({configured:false}),researchRequest:async path=>{state.requests.push(path);if(path==='/api/research/status')return {configured:false,identifierFields:['passportNumber']};throw Error('Unexpected test API request: '+path);},modal({title,body,onMount}){const node=document.createElement('dialog');node.open=true;node.setAttribute('open','');node.innerHTML=`<h2>${title}</h2>${body}`;document.body.append(node);const close=()=>node.remove();onMount?.(node,close);return close;}};
 let cleanup;
 const start=async(params='')=>{ctx.params=new URLSearchParams(params);cleanup=render(main,ctx);await delay(10);};
 const open=async()=>{fire($('[data-sc-history]'));await until(()=>document.querySelector('[data-sc-open-report="project-link-report"]'),'Saved report appears');fire(document.querySelector('[data-sc-open-report="project-link-report"]'));await until(()=>$('[data-sc-save-project]'),'Saved result appears');};
 const picker=()=>{fire($('[data-sc-save-project]'));assert.ok(dialog()?.querySelector('.sc-project-picker'));};
 const choose=id=>fire(dialog().querySelector(`[name="screeningProject"][value="${id}"]`),'change');
 const submit=()=>fire(dialog().querySelector('form'),'submit');
 const assign=async id=>{picker();choose(id);submit();await until(()=>!dialog(),'Picker closes after saving');};
 try{await test({start,open,picker,choose,submit,assign,$,dialog,fire,document,state,store,history,ctx});passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}finally{cleanup?.();document.querySelectorAll('dialog').forEach(d=>d.remove());for(const key of keys){if(before[key])Object.defineProperty(globalThis,key,before[key]);else delete globalThis[key];}}
}
console.log('Project linking · detached DOM integration. Synthetic reports and projects; no network, paid calls or user history.');
await check('Saving a project keeps the same report, evidence, recorded review and unsaved review drafts',async({start,open,assign,$,fire,history,state})=>{
 await start();await open();const before=history.get('project-link-report'),notes=$('#sc-report-notes'),reason=$('[data-sc-assessment-form] [name="reason"]');notes.value='Unsubmitted report note';fire(notes,'input');reason.value='Unsubmitted follow-up rationale';fire(reason,'input');await assign('project-a');
 const saved=history.get(before.id);assert.equal(history.list().length,1);assert.equal(saved.query.projectId,'project-a');assert.equal(saved.projectName,'Aurora review');assert.equal(saved.createdAt,before.createdAt);for(const key of ['research','matches','decisions','reviewLog','assessmentLog','sourceSnapshots','notes'])assert.deepEqual(saved[key],before[key],key+' preserved');assert.equal(assessmentEvidenceKey(saved),assessmentEvidenceKey(before));assert.equal($('#sc-report-notes'),notes);assert.equal(notes.value,'Unsubmitted report note');assert.equal($('[data-sc-assessment-form] [name="reason"]'),reason);assert.equal(reason.value,'Unsubmitted follow-up rationale');assert.match($('[data-sc-project]').textContent,/Saved inAurora review/);state.newSearch();assert.ok($('.sc-results'));assert.match(state.toasts.at(-1),/Save your draft review/);
});
await check('Reassignment and repeated assignment never duplicate a screening',async({start,open,assign,history,$})=>{
 await start();await open();await assign('project-a');await assign('project-b');await assign('project-b');assert.equal(history.list().length,1);assert.equal(history.get('project-link-report').query.projectId,'project-b');assert.equal(history.get('project-link-report').projectName,'Orion review');assert.equal($('[data-sc-project] a').getAttribute('href'),'#/projects/project-b');
});
await check('Removing a project link preserves the report and recorded evidence in History',async({start,open,assign,picker,dialog,fire,history,$})=>{
 await start();await open();await assign('project-a');const before=history.get('project-link-report');picker();fire(dialog().querySelector('[data-project-unlink]'));await until(()=>!dialog(),'Unlink saved');const saved=history.get(before.id);assert.equal(history.list().length,1);assert.equal(saved.query.projectId,'');assert.equal(saved.projectName,'');assert.deepEqual(saved.research,before.research);assert.deepEqual(saved.assessmentLog,before.assessmentLog);assert.match($('[data-sc-save-project]').textContent,/Save to project/);
});
await check('Storage failure stays visibly unsaved and picker retry commits one report',async({start,open,picker,choose,submit,dialog,history,state,$})=>{
 await start();await open();state.failSave=true;picker();choose('project-a');submit();await until(()=>!dialog().querySelector('[data-project-error]').hidden,'Project failure visible');assert.equal(history.get('project-link-report').query.projectId,undefined);assert.equal($('.sc-save-warning').hidden,false);assert.match($('[data-sc-project]').textContent,/Project change not saved/);assert.ok(!state.toasts.some(v=>v==='Saved to Aurora review.'));state.failSave=false;submit();await until(()=>!dialog(),'Retry succeeds');assert.equal(history.list().length,1);assert.equal(history.get('project-link-report').query.projectId,'project-a');assert.equal($('.sc-save-warning').hidden,true);
});
await check('A project removed after opening the picker cannot be assigned',async({start,open,picker,choose,submit,dialog,store,history,state})=>{
 await start();await open();picker();choose('project-a');store.set('projects',[projects[1]]);submit();await until(()=>!dialog().querySelector('[data-project-error]').hidden,'Deleted project rejected');assert.match(dialog().querySelector('[data-project-error]').textContent,/no longer available/);assert.equal(state.saves,0);assert.equal(history.get('project-link-report').query.projectId,undefined);
});
await check('Exact project report deep link opens the stored screening without running a search',async({start,$,history,state})=>{
 await start('report=project-link-report&project=project-a');await until(()=>$('[data-sc-save-project]'),'Deep-linked report opens');assert.match($('.sc-results').textContent,/Synthetic project subject/);assert.equal($('#sc-form'),null);assert.equal(state.saves,0);assert.equal(history.list().length,1);assert.ok(state.requests.every(path=>path==='/api/research/status'),'No research job started');assert.equal(history.get('project-link-report').query.projectId,undefined,'Navigation must not silently assign a project');
});
await check('An unknown report deep link produces an explicit recoverable error',async({start,$,state,history})=>{
 await start('report=does-not-exist&project=project-a');await until(()=>$('[data-sc-report-retry]'),'Missing report recovery appears');assert.match($('.sc-report-unavailable').textContent,/not in this device’s history/);assert.equal($('#sc-form'),null);assert.equal(state.saves,0);assert.equal(history.list().length,1);assert.ok(state.requests.every(path=>path==='/api/research/status'));
});
await check('A repository conflict is not reported as a successful project assignment',async({start,open,picker,choose,submit,dialog,history,state,$})=>{
 await start();await open();state.conflict=true;picker();choose('project-b');submit();await until(()=>!dialog().querySelector('[data-project-error]').hidden,'Conflict exposed');assert.equal(history.get('project-link-report').query.projectId,undefined);assert.match($('.sc-save-warning').textContent,/another tab/);assert.ok(!state.toasts.some(v=>v==='Saved to Orion review.'));state.conflict=false;submit();await until(()=>!dialog(),'Resolved repository can save');assert.equal(history.list().length,1);
});
await check('Picker search filters project choices and reports an empty filter',async({start,open,picker,dialog,fire})=>{
 await start();await open();picker();const search=dialog().querySelector('[type="search"]');search.value='Orion corporate';fire(search,'input');assert.deepEqual([...dialog().querySelectorAll('[data-project-option]')].filter(row=>!row.hidden).map(row=>row.querySelector('input').value),['project-b']);search.value='nonexistent project';fire(search,'input');assert.equal(dialog().querySelector('[data-project-empty]').hidden,false);
});
console.log(`${passed} project-link UI checks passed; ${failed} failed.`);if(failed)process.exitCode=1;
