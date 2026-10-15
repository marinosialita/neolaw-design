import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {render} from '../modules/screening.js';
import {createScreeningHistory} from '../modules/screening-history.js';
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
const {IDBFactory}=require(process.env.NEOLAW_TEST_INDEXEDDB||'/tmp/neolaw-storage-check/node_modules/fake-indexeddb');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(predicate,label)=>{const end=Date.now()+3000;while(!predicate()&&Date.now()<end)await delay(5);assert.ok(predicate(),label);};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};};
const sample={schemaVersion:1,records:[],sources:[]};
const completed={id:'persistence-job',mode:'search',status:'completed',officialStatus:'completed',phases:[],officialChecks:['eu','ofac','un','uk','cy','bis','au','ca','ch'].map(id=>({id,status:'completed',matchCount:0,candidates:[]})),gleif:{status:'not_applicable'},worldbank:{status:'completed',totalResults:0,candidates:[]}};
let passed=0,failed=0;

async function check(name,test){
  const keys=['document','window','matchMedia','addEventListener','removeEventListener','fetch'],before=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const {document,window}=parseHTML('<html><body><nav id="sidebar"></nav><div id="header-actions"></div><button class="mobile-menu"></button><a class="skip-link"></a><main id="main"></main></body></html>');
  let activeElement=null;
  Object.defineProperty(document,'activeElement',{get:()=>activeElement});
  window.HTMLElement.prototype.focus=function(){activeElement=this;};window.HTMLElement.prototype.scrollIntoView=function(){};
  window.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')?[]:[{}];};
  Object.defineProperty(window.HTMLInputElement.prototype,'checked',{configurable:true,get(){return this.hasAttribute('checked');},set(value){value?this.setAttribute('checked',''):this.removeAttribute('checked');}});
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(value){this.querySelectorAll('option').forEach(option=>option.toggleAttribute('selected',option.value===String(value)));}});
  window.open=()=>null;
  const events=new Map(),toasts=[],polls=[];
  Object.assign(globalThis,{document,window,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},removeEventListener:(name,fn)=>events.get(name)?.delete(fn),fetch:()=>{throw Error('No network is allowed in persistence UI tests.');}});
  const store=new Map(),repository=createScreeningHistory({indexedDB:new IDBFactory(),legacyStorage:{get:()=>[]},channelFactory:()=>null});
  let gates=[],failNext=false,queue=Promise.resolve(),saveCalls=0;
  const history={...repository,save(value){const snapshot=structuredClone(value),gate=gates.shift(),fail=failNext;failNext=false;saveCalls++;const task=queue.then(async()=>{if(gate)await gate.promise;if(fail)throw new Error('Synthetic storage unavailable. Evidence was not saved.');return repository.save(snapshot);});queue=task.catch(()=>{});return task;}};
  let cleanup;
  const ctx={screeningHistory:history,storage:{get:(key,fallback)=>store.get(key)??fallback,set:(key,value)=>{store.set(key,value);return true;}},params:new URLSearchParams(),setHeader(){},toast:message=>toasts.push(message),loadScreeningData:async()=>sample,providerRequest:async()=>({configured:false}),researchRequest:async(path)=>{
    if(path==='/api/research/status')return {configured:false,identifierFields:['passportNumber']};
    if(path==='/api/screening/start')return {id:'persistence-job'};
    if(path==='/api/research/jobs/persistence-job'){const poll=deferred();polls.push(poll);return poll.promise;}
    throw Error('Unexpected test API request: '+path);
  },modal({title,body,onMount}){const dialog=document.createElement('dialog');dialog.setAttribute('open','');dialog.innerHTML=`<h2>${title}</h2>${body}`;document.body.append(dialog);const close=()=>dialog.remove();onMount?.(dialog,close);return close;}};
  const main=document.querySelector('main'),$=selector=>main.querySelector(selector),fire=(node,type='click')=>{assert.ok(node,`Missing ${type} target`);node.dispatchEvent(new window.Event(type,{bubbles:true,cancelable:true}));};
  const start=async()=>{cleanup=render(main,ctx);await repository.ready();await delay(10);$('#sc-name').value='Synthetic review subject';fire($('#sc-name'),'input');fire($('#sc-form'),'submit');await until(()=>$('.sc-results'),'Search reached results');await until(()=>polls.length,'Initial job was polled');await queue;};
  const api={start,$,fire,main,document,history:repository,toasts,polls,events,holdNext(){const gate=deferred();gates.push(gate);return gate;},failNext(){failNext=true;},settled:()=>queue,saveCalls:()=>saveCalls};
  try{await test(api);console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name+'\n'+error.stack);failed++;}
  finally{cleanup?.();for(const gate of gates)gate.resolve();for(const poll of polls)poll.resolve(completed);await queue;await repository.close();for(const key of keys){if(before[key])Object.defineProperty(globalThis,key,before[key]);else delete globalThis[key];}}
}
console.log('Async report persistence · detached DOM + fake IndexedDB. No live screening, network, or user history.');
await check('A source update arriving while notes save is pending retains those notes in the final committed report',async({start,$,fire,holdNext,polls,history,settled})=>{
  await start();const gate=holdNext();$('#sc-report-notes').value='Reviewer note made during the source check';fire($('[data-sc-save-notes]'));assert.equal($('.sc-save-warning').hidden,true,'Routine saving must not shift the report layout');
  polls[0].resolve(completed);await delay(10);gate.resolve();await settled();await delay(10);assert.equal(history.list()[0].notes,'Reviewer note made during the source check');assert.equal(history.list()[0].research.status,'completed');assert.equal($('.sc-save-warning').hidden,true);
});
await check('Failed note saving keeps entered evidence visible and never labels it Saved',async({start,$,fire,failNext,polls,history,settled,toasts})=>{
  await start();polls[0].resolve(completed);await delay(10);await settled();failNext();$('#sc-report-notes').value='Keep this failed save visible';fire($('[data-sc-save-notes]'));await settled();await delay(10);
  assert.equal($('#sc-report-notes').value,'Keep this failed save visible');assert.match($('.sc-note-status').textContent,/Not saved/);assert.equal($('.sc-save-warning').hidden,false);assert.equal(history.list()[0].notes,'');assert.ok(toasts.some(value=>/not saved/.test(value)));
  fire($('[data-sc-save-notes]'));await settled();await delay(10);assert.equal(history.list()[0].notes,'Keep this failed save visible');
});
await check('Pending writes register a browser-leave warning and remove it after commit',async({start,$,fire,holdNext,polls,events,settled})=>{
  await start();polls[0].resolve(completed);await delay(10);await settled();const gate=holdNext();$('#sc-report-notes').value='Save before leaving';fire($('[data-sc-save-notes]'));
  const before={prevented:false,preventDefault(){this.prevented=true;}};for(const fn of events.get('beforeunload')||[])fn(before);assert.equal(before.prevented,true);gate.resolve();await settled();await delay(10);
  const after={prevented:false,preventDefault(){this.prevented=true;}};for(const fn of events.get('beforeunload')||[])fn(after);assert.equal(after.prevented,false);
});
await check('History restore rejects malformed nested research without changing saved history',async({start,$,fire,polls,document,history,settled})=>{
  await start();polls[0].resolve(completed);await delay(10);await settled();const count=history.list().length;fire($('[data-sc-history]'));await until(()=>document.querySelector('[data-sc-backup-file]'),'History restore input');
  const input=document.querySelector('[data-sc-backup-file]'),value={id:'invalid-import',schema:'neolaw.screening-report.v1',createdAt:'2026-10-13T12:00:00Z',query:{name:'Invalid backup'},matches:[],sourceSnapshots:[],research:{phases:'not an array'}};
  Object.defineProperty(input,'files',{configurable:true,value:[{size:1000,text:async()=>JSON.stringify(value)}]});fire(input,'change');await until(()=>/not a supported/.test(document.querySelector('[data-sc-import-status]').textContent),'Malformed evidence validation shown');assert.equal(history.list().length,count);assert.equal(history.get('invalid-import'),null);
});
await check('Restoring a running backup preserves unfinished evidence without resuming network work',async({start,$,fire,polls,document,history,settled})=>{
  await start();polls[0].resolve(completed);await delay(10);await settled();fire($('[data-sc-history]'));await until(()=>document.querySelector('[data-sc-backup-file]'),'History restore input');
  const input=document.querySelector('[data-sc-backup-file]'),value={id:'restored-running',schema:'neolaw.screening-report.v1',createdAt:'2026-10-13T12:00:00Z',query:{name:'Restored synthetic subject',type:'person',mode:'search'},matches:[],sourceSnapshots:[],research:{id:'old-unavailable-job',status:'running',officialStatus:'pending',mode:'search',phases:[],officialChecks:[{id:'cy',status:'pending'}]}};
  Object.defineProperty(input,'files',{configurable:true,value:[{size:1000,text:async()=>JSON.stringify(value)}]});fire(input,'change');await until(()=>history.get('restored-running'),'Backup committed');assert.equal(history.get('restored-running').research.status,'interrupted');assert.equal(history.get('restored-running').research.officialChecks[0].status,'interrupted');
  await until(()=>document.querySelector('[data-sc-open-report="restored-running"]'),'Restored report in history');const count=polls.length;fire(document.querySelector('[data-sc-open-report="restored-running"]'));await delay(30);assert.equal(polls.length,count);assert.ok($('.sc-results').textContent.includes('Restored synthetic subject'));assert.ok($('.sc-results').textContent.includes('Interrupted'));
});
console.log(`\n${passed} passed; ${failed} failed.`);if(failed)process.exitCode=1;
