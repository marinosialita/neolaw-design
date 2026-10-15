import {createScreeningHistory} from '../modules/screening-history.js';
import {screeningInputIssue} from '../modules/screening-input.js';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountResearch, retryableChecks, citedText, uniqueSources, researchProse} from '../modules/screening-research.js';
import {sourceCounts,identitySummary,officialSummary,executiveSummary,recordPresentation,plainEvidence} from '../modules/research-evidence.js';
import {sourceReadingHTML,officialReadingHTML,phaseReadingHTML} from '../modules/screening-reading.js';
import {render as renderScreening} from '../modules/screening.js';
import {screeningActivity} from '../modules/screening-progress.js';

// These checks run against an isolated DOM with a mocked local API. They do not
// access a browser, localhost, OpenAI, or any other research provider.
const require = createRequire(import.meta.url);
const {parseHTML} = require(process.env.NEOLAW_EXPORT_DOM || '/tmp/neolaw-export-check/node_modules/linkedom');
const {IDBFactory} = require(process.env.NEOLAW_TEST_INDEXEDDB || '/tmp/neolaw-storage-check/node_modules/fake-indexeddb');
const nativeTimeout = globalThis.setTimeout;
const settle = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
const pause = ms => new Promise(resolve => nativeTimeout(resolve,ms));
const deferred = () => { let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; };
const baseReport = () => ({id:'check-alpha',query:{name:'Example Individual',type:'person',country:'Cyprus',dob:'1970-04-08',projectId:'matter-alpha'},createdAt:'2026-10-12T09:00:00Z',sourceSnapshots:[],matches:[],totalMatches:0,notes:'',decisions:{}});
let passed=0,failed=0;

async function check(label,run){
  const globals=['document','window','matchMedia','setTimeout','clearTimeout','setInterval','clearInterval','fetch','requestAnimationFrame','cancelAnimationFrame','indexedDB','BroadcastChannel'];
  const previous=Object.fromEntries(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const {document,window}=parseHTML('<html><body><button id="outside">Outside control</button><main id="research"></main></body></html>');
  const container=document.querySelector('#research');
  let activeElement=null,nextTimer=1,now=0,cleanup=null;
  const timers=new Map(),calls=[],changes=[],connections=[],store=new Map();
  const state={toasts:[],modals:[],request:null};
  Object.defineProperty(document,'activeElement',{configurable:true,get:()=>activeElement});
  window.HTMLElement.prototype.focus=function(){activeElement=this;};
  window.HTMLElement.prototype.scrollIntoView=function(){};
  // Linkedom omits the native select value setter; model only selection semantics.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){this.querySelectorAll('option').forEach(option=>option.toggleAttribute('selected',option.value===String(value)));}});
  window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')?[]:[{}];};
  const setTimer=(fn,delay=0,repeat=false)=>{const id=nextTimer++;timers.set(id,{fn,at:now+Math.max(0,Number(delay)||0),delay:Number(delay)||0,repeat});return id;};
  const override={document,window,indexedDB:new IDBFactory(),BroadcastChannel:undefined,matchMedia:()=>({matches:false}),setTimeout:(fn,delay)=>setTimer(fn,delay),clearTimeout:id=>timers.delete(id),setInterval:(fn,delay)=>setTimer(fn,delay,true),clearInterval:id=>timers.delete(id),requestAnimationFrame:fn=>setTimer(()=>fn(now),16),cancelAnimationFrame:id=>timers.delete(id),fetch:()=>{throw Error('Unexpected real network request in detached research checks');}};
  Object.entries(override).forEach(([key,value])=>Object.defineProperty(globalThis,key,{configurable:true,value}));
  const fire=(el,type='click',extra={})=>{assert.ok(el,`Missing ${type} target`);const event=new window.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries(extra))Object.defineProperty(event,key,{value});el.dispatchEvent(event);return event;};
  const $=selector=>container.querySelector(selector),$$=selector=>[...container.querySelectorAll(selector)];
  const ctx={
    providerRequest:async()=>({configured:false}),
    params:new URLSearchParams(),setHeader:()=>{},
    storage:{get:(key,fallback)=>structuredClone(store.get(key)??fallback),set:(key,value)=>{store.set(key,structuredClone(value));return true;}},
    loadScreeningData:async()=>({schemaVersion:1,sources:[{id:'eu',status:'available',retrievedAt:new Date().toISOString(),recordCount:1}],records:[{id:'eu-fixture',sourceId:'eu',name:'Example Individual',type:'person',aliases:[],countries:[],datesOfBirth:[],identifiers:[],programs:[],sourceUrl:'https://example.org/sanctions'}]}),
    toast:message=>state.toasts.push(message),
    researchRequest:async(path,options={})=>{calls.push({path,...options});assert.ok(state.request,`No request fixture for ${path}`);return state.request(path,options);},
    modal({title,body,onMount}){const el=document.createElement('dialog');el.setAttribute('open','');el.innerHTML=`<h2>${title}</h2>${body}`;document.body.append(el);state.modals.push(el);const close=()=>el.remove();onMount?.(el,close);return close;}
  };
  const advance=async(ms=1000)=>{const stop=now+ms;let turns=0;while(true){const next=[...timers].filter(([,timer])=>timer.at<=stop).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;assert.ok(++turns<100,'Timer loop should be bounded');const [id,timer]=next;now=timer.at;timers.delete(id);if(timer.repeat)timers.set(id,{...timer,at:now+timer.delay});timer.fn();await settle();}now=stop;await settle();};
  const start=async(report=baseReport(),options={})=>{cleanup=mountResearch(container,{report,onChange:value=>changes.push(structuredClone(value)),onConnection:value=>connections.push(structuredClone(value)),ctx,...options});await settle();return report;};
  const startScreening=async()=>{cleanup=renderScreening(container,ctx);await settle();};
  const api={document,window,container,ctx,state,calls,changes,connections,store,timers,$,$$,fire,start,startScreening,advance,cleanup:()=>{cleanup?.();cleanup=null;},setRequest:fn=>state.request=fn};
  try{await run(api);passed++;console.log('PASS '+label);}catch(error){failed++;console.error('FAIL '+label+'\n'+error.stack);}finally{cleanup?.();state.modals.forEach(el=>el.remove());for(const [key,value] of Object.entries(previous)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
}

console.log('Selective retry · detached DOM checks; mocked APIs only');
const original=()=>({id:'a'.repeat(32),mode:'search',status:'partial',query:baseReport().query,startedAt:'2026-10-13T08:00:00Z',completedAt:'2026-10-13T08:00:01Z',phases:[],officialStatus:'partial',officialChecks:[{id:'eu',name:'European Union',status:'completed',matchCount:0,checkedAt:'2026-10-13T08:00:00Z'},{id:'cy',name:'Cyprus',status:'failed',error:'Portal unavailable'}],worldbank:{status:'failed',error:'Unavailable'},gleif:{status:'not_applicable'},opensanctions:{status:'failed'}});
const connected=()=>({configured:false,retryChecks:true});
await check('Eligible retry list excludes completed lists, paid provider and AI stages',async()=>{
 assert.deepEqual(retryableChecks(original()).map(c=>c.id),['cy','worldbank']);
 assert.deepEqual(retryableChecks({...original(),status:'running'}),[]);
 assert.deepEqual(retryableChecks({...original(),query:{type:'entity'},gleif:{status:'failed'}}).map(c=>c.id),['cy','worldbank','gleif']);
});
await check('Retry forks through owner callback before evidence changes and requests only incomplete free sources',async({start,setRequest,$,fire,calls,changes})=>{
 const old=original(),before=structuredClone(old),order=[];
 const next={...old,id:'b'.repeat(32),retryOf:old.id,retrySources:['cy','worldbank'],status:'completed',officialChecks:old.officialChecks.map(c=>({...c,status:'completed',matchCount:0})),worldbank:{status:'completed',totalResults:0,candidates:[]}};
 setRequest(async(path)=>path==='/api/research/status'?connected():path==='/api/screening/retry'?{id:next.id}:next);
 await start({...baseReport(),research:old},{compact:true,onRetryRun:job=>{order.push('fork');assert.equal(job.id,next.id);assert.equal(changes.length,0);},onChange:job=>{order.push('change');changes.push(job);}});
 fire($('[data-sr-action="retry"]'));await settle();
 assert.deepEqual(order,['fork','change']);assert.deepEqual(old,before);
 const posted=calls.find(c=>c.path==='/api/screening/retry');assert.deepEqual(posted.body.sourceIds,['cy','worldbank']);assert.deepEqual(posted.body.research,old);
 assert.equal(calls.filter(c=>c.path.includes('/start')||c.path.includes('/opensanctions')).length,0);
 assert.match($('[data-sr-receipt="retry"]').textContent,/AI and paid-provider checks were not rerun/);
});
await check('Individual source retry sends only selected failed list',async({start,setRequest,$,fire,calls})=>{
 const old=original(),next={...old,id:'b'.repeat(32),retryOf:old.id,status:'partial',retrySources:['cy']};
 setRequest(async path=>path==='/api/research/status'?connected():path==='/api/screening/retry'?{id:next.id}:next);
 await start({...baseReport(),research:old},{compact:true});fire($('[data-sr-retry-id="cy"]'));await settle();assert.deepEqual(calls.find(c=>c.path==='/api/screening/retry').body.sourceIds,['cy']);
});
await check('Retry errors preserve old evidence and report service incompatibility accurately',async({start,setRequest,$,fire,calls,changes,container})=>{
 setRequest(async()=>({configured:false}));await start({...baseReport(),research:original()},{compact:true});fire($('[data-sr-action="retry"]'));await settle();assert.match(container.textContent,/updated local service is required/);assert.equal(changes.length,0);assert.equal(calls.filter(c=>c.path==='/api/screening/retry').length,0);
});
await check('Running retry has stop action and cancellation polls same retry run',async({start,setRequest,$,fire,calls,changes})=>{
 const old=original(),run={...old,id:'b'.repeat(32),retryOf:old.id,retrySources:['cy'],status:'running'};let cancelled=false;
 setRequest(async path=>{if(path==='/api/research/status')return connected();if(path.endsWith('/cancel'))cancelled=true;return {...run,status:cancelled?'cancelled':'running'};});
 await start({...baseReport(),research:run},{compact:true});assert.equal($('[data-sr-action="retry"]'),null);fire($('[data-sr-action="cancel"]'));await settle();assert.ok(calls.some(c=>c.path===`/api/research/jobs/${run.id}/cancel`));assert.equal(changes.at(-1).status,'cancelled');
});
await check('Imported snapshot never resumes polling or starts a new request automatically',async({start,setRequest,calls})=>{
 setRequest(async path=>{assert.equal(path,'/api/research/status');return connected();});await start({...baseReport(),restoredFromBackup:true,research:{...original(),status:'running'}},{autoStart:true});assert.equal(calls.length,1);
});
await check('Owner can stop retry before POST when original evidence or a review draft is unsaved',async({start,setRequest,$,fire,calls,changes})=>{
 let guarded=false;setRequest(async()=>connected());await start({...baseReport(),research:original()},{compact:true,beforeRetry:async()=>{guarded=true;return false;}});fire($('[data-sr-action="retry"]'));await settle();assert.equal(guarded,true);assert.equal(calls.filter(c=>c.path==='/api/screening/retry').length,0);assert.equal(changes.length,0);assert.equal($('[data-sr-action="retry"]').disabled,false);
});
await check('Asynchronous owner adoption completes before new evidence reaches old report',async({start,setRequest,$,fire,changes})=>{
 const old=original(),next={...old,id:'b'.repeat(32),retryOf:old.id,retrySources:['cy']},adopting=deferred();let started=false;
 setRequest(async path=>path==='/api/research/status'?connected():path==='/api/screening/retry'?{id:next.id}:next);await start({...baseReport(),research:old},{compact:true,onRetryRun:async()=>{started=true;await adopting.promise;return true;}});fire($('[data-sr-action="retry"]'));await settle();assert.equal(started,true);assert.equal(changes.length,0);adopting.resolve();await settle();assert.equal(changes.length,0);
});
await check('Late confirmed cancellation reopens storage and preserves later review fields and the current report',async({ctx,setRequest,startScreening,$,fire,cleanup,container,calls})=>{
 const accepted=deferred();
 const match=name=>({score:name==='Example Individual'?98:100,record:{id:name==='Example Individual'?'eu-original':'eu-other',sourceId:'eu',name,type:'person',aliases:[],countries:[],datesOfBirth:[],identifiers:[],programs:[],sourceUrl:'https://example.org/official'}});
 const candidates=[match('Different New Subject'),match('Example Individual')];
 const running={...original(),status:'running',officialStatus:'running',completedAt:null,
   officialChecks:[{id:'eu',status:'completed',matchCount:2,candidates},{id:'cy',status:'running'}]};
 const first={...baseReport(),id:'late-stop-original',requiresOfficial:true,research:running,projectName:'Original matter',notes:'Earlier notes',query:{...baseReport().query,mode:'search'}};
 const second={...baseReport(),id:'late-stop-current',query:{...baseReport().query,name:'Different New Subject',mode:'search'},notes:'Second report notes',research:{...original(),id:'b'.repeat(32)}};
 const repository=createScreeningHistory({indexedDB:globalThis.indexedDB,legacyStorage:ctx.storage,channelFactory:()=>null});
 const until=async(predicate,label)=>{for(let tries=0;tries<100;tries++){if(await predicate())return;await pause(5);}assert.fail(label);};
 try{
   await repository.ready();await repository.save(first);await repository.save(second);
   setRequest(async path=>path==='/api/research/status'?connected():path.endsWith('/cancel')?accepted.promise:structuredClone(running));
   ctx.params=new URLSearchParams({report:first.id});await startScreening();
   await until(()=>$('[data-sc-stop-search]'),'Original running report did not open');
   await until(()=>$('.sc-save-warning')?.hidden,'Initial poll did not commit');
   fire($('[data-sc-stop-search]'));await settle();assert.equal(calls.filter(c=>c.path.endsWith('/cancel')).length,1);
   cleanup();
   await repository.refresh();
   const later={...repository.get(first.id),notes:'Later committed reviewer note',projectName:'Later matter',query:{...first.query,projectId:'later-matter'},decisions:{'eu-original':{status:'investigate',note:'Later reason',reviewer:'Later reviewer'}}};
   await repository.save(later);
   ctx.params=new URLSearchParams({report:second.id});await startScreening();
   await until(()=>container.textContent.includes('Different New Subject')&&$('[data-sc-new]'),'Current saved report did not open');
   const currentBefore=repository.get(second.id);
   const cancelled={...running,status:'cancelled',officialStatus:'cancelled',completedAt:'2026-10-14T09:30:00Z',officialChecks:running.officialChecks.map(c=>c.status==='running'?{...c,status:'cancelled'}:c)};
   accepted.resolve(cancelled);
   await until(async()=>{await repository.refresh();return repository.get(first.id).research.status==='cancelled';},'Accepted stop was not committed after disposal');
   const saved=repository.get(first.id);
   assert.equal(saved.notes,later.notes);assert.equal(saved.projectName,later.projectName);assert.equal(saved.query.projectId,'later-matter');assert.deepEqual(saved.decisions,later.decisions);
   assert.equal(saved.matches[0].record.name,'Example Individual','Candidate ordering must use the stopped report subject');
   assert.deepEqual(saved.research,cancelled);assert.equal(saved.unsaved,false);assert.equal(repository.list().length,2);
   assert.deepEqual(repository.get(second.id),currentBefore);assert.match(container.textContent,/Different New Subject/);assert.equal($('#sc-report-notes').value,'Second report notes');
   assert.equal(calls.filter(c=>c.path.endsWith('/start')).length,0,'Opening or completing saved evidence never starts a fresh check');
 }finally{await repository.close();}
});
console.log(`\n${passed} passed; ${failed} failed.`);if(failed)process.exitCode=1;
