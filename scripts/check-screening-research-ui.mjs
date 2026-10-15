import {historyFixture} from './screening-history-fixture.mjs';
import {screeningInputIssue} from '../modules/screening-input.js';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountResearch, citedText, uniqueSources, researchProse} from '../modules/screening-research.js';
import {sourceCounts,identitySummary,officialSummary,executiveSummary,recordPresentation,plainEvidence} from '../modules/research-evidence.js';
import {sourceReadingHTML,officialReadingHTML,phaseReadingHTML} from '../modules/screening-reading.js';
import {render as renderScreening} from '../modules/screening.js';
import {screeningActivity} from '../modules/screening-progress.js';

// These checks run against an isolated DOM with a mocked local API. They do not
// access a browser, localhost, OpenAI, or any other research provider.
const require = createRequire(import.meta.url);
const {parseHTML} = require(process.env.NEOLAW_EXPORT_DOM || '/tmp/neolaw-export-check/node_modules/linkedom');
const nativeTimeout = globalThis.setTimeout;
const settle = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
const pause = ms => new Promise(resolve => nativeTimeout(resolve,ms));
const deferred = () => { let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; };
const baseReport = () => ({id:'check-alpha',query:{name:'Example Individual',type:'person',country:'Cyprus',dob:'1970-04-08',projectId:'matter-alpha'},createdAt:'2026-10-12T09:00:00Z',sourceSnapshots:[],matches:[],totalMatches:0,notes:'',decisions:{}});
let passed=0,failed=0;

async function check(label,run){
  const globals=['document','window','matchMedia','setTimeout','clearTimeout','setInterval','clearInterval','fetch','requestAnimationFrame','cancelAnimationFrame'];
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
  const override={document,window,matchMedia:()=>({matches:false}),setTimeout:(fn,delay)=>setTimer(fn,delay),clearTimeout:id=>timers.delete(id),setInterval:(fn,delay)=>setTimer(fn,delay,true),clearInterval:id=>timers.delete(id),requestAnimationFrame:fn=>setTimer(()=>fn(now),16),cancelAnimationFrame:id=>timers.delete(id),fetch:()=>{throw Error('Unexpected real network request in detached research checks');}};
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
  ctx.screeningHistory=historyFixture(ctx.storage);
  const advance=async(ms=1000)=>{const stop=now+ms;let turns=0;while(true){const next=[...timers].filter(([,timer])=>timer.at<=stop).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;assert.ok(++turns<100,'Timer loop should be bounded');const [id,timer]=next;now=timer.at;timers.delete(id);if(timer.repeat)timers.set(id,{...timer,at:now+timer.delay});timer.fn();await settle();}now=stop;await settle();};
  const start=async(report=baseReport(),options={})=>{cleanup=mountResearch(container,{report,onChange:value=>changes.push(structuredClone(value)),onConnection:value=>connections.push(structuredClone(value)),ctx,...options});await settle();return report;};
  const startScreening=async()=>{cleanup=renderScreening(container,ctx);await settle();};
  const api={document,window,container,ctx,state,calls,changes,connections,store,timers,$,$$,fire,start,startScreening,advance,cleanup:()=>{cleanup?.();cleanup=null;},setRequest:fn=>state.request=fn};
  try{await run(api);passed++;console.log('PASS '+label);}catch(error){failed++;console.error('FAIL '+label+'\n'+error.stack);}finally{cleanup?.();state.modals.forEach(el=>el.remove());for(const [key,value] of Object.entries(previous)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
}

console.log('Screening research · detached DOM integration checks');
console.log('Mocked local API only; no browser, network, provider, or visual verification.\n');

await check('Executive review retains official matches when the additional provider also matches',async()=>{
  const summary=executiveSummary({research:{mode:'search',status:'completed',officialChecks:['eu','ofac','un','uk','cy'].map(id=>({id,status:'completed',matchCount:id==='eu'?1:0})),opensanctions:{status:'completed',possibleMatches:2,returnedCandidates:2}}});
  assert.equal(summary.title,'Possible list matches');assert.match(summary.next,/official entries and OpenSanctions candidates/);
});
await check('Failed web research cannot produce a completed executive conclusion after five negative list checks',async()=>{
  const summary=executiveSummary({research:{mode:'deep',status:'partial',officialChecks:['eu','ofac','un','uk','cy'].map(id=>({id,status:'completed',matchCount:0})),phases:[{id:'identity',status:'completed'},{id:'media',status:'failed'},{id:'ownership',status:'completed'}]}});
  assert.equal(summary.title,'Checks incomplete');assert.match(summary.next,/Complete Media & proceedings research with traceable sources/);assert.doesNotMatch(summary.items[0].text,/Coverage incomplete/);
});
await check('Missing research areas and unfinished provider checks stay incomplete',async()=>{
  const job={mode:'deep',status:'completed',officialChecks:['eu','ofac','un','uk','cy'].map(id=>({id,status:'completed',matchCount:0})),phases:[{id:'identity',status:'completed'},{id:'media',status:'completed'}]};
  assert.equal(executiveSummary({research:job}).incomplete,true);
  for(const status of ['failed','cancelled','interrupted','pending','running']){
    const summary=executiveSummary({research:{...job,mode:'search',opensanctions:{status}}});
    assert.equal(summary.incomplete,true);assert.equal(summary.title,'Checks incomplete');assert.match(summary.next,/Retry OpenSanctions/);assert.match(summary.note,/missing or failed/);
  }
  assert.equal(officialSummary({officialChecks:[{id:'cy',status:'failed',matchCount:62}]}).entries,0);
});
await check('Explicit affiliate labels stay distinct without inferring a relationship from a similar name',async()=>{
  const record={sourceId:'cy',name:'Example Parent. Affiliated Entity: Example Services',programs:['US BIS Entity List · export controls']};
  assert.deepEqual(recordPresentation(record),{name:'Example Services',listedWith:'Example Parent.',affiliate:true});
  assert.equal(recordPresentation({sourceId:'cy',name:'Example Services'}).affiliate,false);
  assert.equal(recordPresentation({...record,sourceId:'ofac'}).affiliate,false);
  assert.match(officialReadingHTML({record,score:95}),/not automatically the company you searched for/);
  assert.equal(record.name,'Example Parent. Affiliated Entity: Example Services');
});
await check('A cited source without saved offsets is not mislabelled an uncited lead',async()=>{
  const html=sourceReadingHTML({cited:true,passages:[],phases:[]});
  assert.match(html,/was cited, but no supporting passage was saved/);assert.doesNotMatch(html,/No finding cites this page/);
});
await check('Saved source passages remove titled Markdown links without removing allegations or identity caveats',async({container,$})=>{
  const text=String.raw`**Contested allegation; identity unresolved.** &#x20; [\[2\]](https://example.org/record?utm_source=openai "Record title")`;
  assert.equal(plainEvidence(text),'Contested allegation; identity unresolved.   [2]');
  container.innerHTML=sourceReadingHTML({cited:true,phases:[],passages:[{phaseTitle:'Media',text:text+' <script>bad</script>'}]});
  assert.doesNotMatch(container.textContent,/utm_source|https:\/\/|&#x20;|\*\*/);assert.equal($('script'),null);
});


const status = configured => ({configured,provider:'openai',model:'test-research-model'});
const makeJob = (state='running',extra={}) => ({id:'research-alpha',status:state,query:baseReport().query,startedAt:'2026-10-12T09:00:00Z',completedAt:state==='running'?null:'2026-10-12T09:01:30Z',model:'test-research-model',phases:[
  {id:'identity',title:'Identity & official records',status:state==='running'?'running':state,text:state==='completed'?'Identity evidence [1]':'',citations:state==='completed'?[{url:'https://example.org/official-record',title:'Official record',start:18,end:21}]:[],sources:[]},
  {id:'media',title:'Media & proceedings',status:state==='running'?'pending':state,text:'',citations:[],sources:[]},
  {id:'ownership',title:'Ownership & public roles',status:state==='running'?'pending':state,text:'',citations:[],sources:[]}
],...extra});

await check('A disconnected account cannot start research or invent a dossier',async({setRequest,start,$,container,calls,changes})=>{
  setRequest(async path=>{assert.equal(path,'/api/research/status');return status(false);});await start();
  assert.equal($('[data-sr-action="start"]'),null);assert.ok($('[data-sr-action="connect"]'));assert.equal($('.sr-dossier'),null);
  assert.match(container.textContent,/Connect to use Deep search/);assert.doesNotMatch(container.textContent,/Reviewed/);assert.equal(changes.length,0);assert.equal(calls.length,1);
});

await check('An unavailable service exposes its error without claiming connection',async({setRequest,start,$,container})=>{
  setRequest(async()=>{throw Error('Research service unavailable <script>bad</script>');});await start();
  assert.equal($('[data-sr-action="start"]'),null);assert.match($('[role="alert"]').textContent,/Research service unavailable/);assert.equal($('script'),null);assert.doesNotMatch(container.textContent,/Connected to OpenAI/);
});

await check('Start sends only the subject identifiers, debounces clicks, and saves actual job evidence',async({setRequest,start,$,fire,calls,changes,advance})=>{
  const beginning=deferred();let pollCount=0;
  setRequest(async(path,options)=>{if(path==='/api/research/status')return status(true);if(path==='/api/research/start')return beginning.promise;if(path==='/api/research/jobs/research-alpha'){pollCount++;return makeJob(pollCount>1?'completed':'running');}throw Error(path);});
  const report=baseReport();report.notes='Office-only notes';report.projectName='Private matter';await start(report);
  fire($('[data-sr-action="start"]'));fire($('[data-sr-action="start"]'));await settle();
  const starts=calls.filter(call=>call.path==='/api/research/start');assert.equal(starts.length,1);assert.deepEqual(starts[0].body,{query:{name:'Example Individual',type:'person',country:'Cyprus',dob:'1970-04-08'}});
  beginning.resolve({id:'research-alpha'});await settle();assert.ok($('[data-sr-action="cancel"]'));assert.equal(changes.at(-1).status,'running');
  await advance(1200);assert.equal(changes.at(-1).status,'completed');assert.match($('.sr-job-status').textContent,/Reviewed/);assert.ok($('.sr-research-prose').textContent.includes('Identity evidence'));assert.ok($('a.sr-citation'));
});

await check('Saved completed findings remain readable when no account is connected',async({setRequest,start,$,calls})=>{
  setRequest(async path=>{assert.equal(path,'/api/research/status');return status(false);});await start({...baseReport(),research:makeJob('completed')});
  assert.ok($('.sr-research-prose'));assert.equal($('.sr-citation').href,'https://example.org/official-record');assert.equal(calls.length,1);assert.equal($('[data-sr-action="start"]'),null);
});

await check('A saved active job resumes polling rather than creating another billable job',async({setRequest,start,$,calls,changes})=>{
  setRequest(async path=>path==='/api/research/status'?status(true):makeJob('completed'));
  await start({...baseReport(),research:makeJob()});assert.ok(calls.some(call=>call.path==='/api/research/jobs/research-alpha'));assert.ok(calls.every(call=>call.path!='/api/research/start'));assert.equal(changes.at(-1).status,'completed');assert.ok($('.sr-source-ledger'));
});

await check('Polling failure is visible and Check again resumes the same job',async({setRequest,start,$,fire,calls,changes})=>{
  let tries=0;setRequest(async path=>{if(path==='/api/research/status')return status(true);assert.equal(path,'/api/research/jobs/research-alpha');if(++tries===1)throw Error('Temporary connection failure');return makeJob('completed');});
  await start({...baseReport(),research:makeJob()});assert.match($('.sr-error').textContent,/Temporary connection failure/);fire($('[data-sr-action="reconnect"]'));await settle();assert.equal(changes.at(-1).status,'completed');assert.equal($('.sr-error'),null);assert.ok(calls.every(call=>call.path!='/api/research/start'));
});

await check('A stopped job cannot be resurrected by an older in-flight poll',async({setRequest,start,$,fire,changes,advance})=>{
  const oldPoll=deferred();let polls=0;
  setRequest(async path=>{if(path==='/api/research/status')return status(true);if(path.endsWith('/cancel'))return makeJob('cancelled');if(path==='/api/research/jobs/research-alpha'){polls++;return polls===1?oldPoll.promise:makeJob('cancelled');}throw Error(path);});
  await start({...baseReport(),research:makeJob()});fire($('[data-sr-action="cancel"]'));await settle();assert.equal(changes.at(-1).status,'cancelled');
  oldPoll.resolve(makeJob('running'));await settle();assert.equal(changes.at(-1).status,'cancelled','An old running response must not undo a confirmed stop');assert.equal($('[data-sr-action="cancel"]'),null);await advance(2000);assert.equal(polls,1,'The cancellation receipt must stop future polling');
});

await check('A confirmed stop is saved even when subsequent status reads would fail',async({setRequest,start,$,fire,changes,advance,calls})=>{
  let stopped=false;
  setRequest(async path=>{
    if(path==='/api/research/status')return status(true);
    if(path.endsWith('/cancel')){stopped=true;return makeJob('cancelled');}
    if(stopped)throw Error('Connection lost after stop was accepted');
    return makeJob();
  });
  await start({...baseReport(),research:makeJob()});fire($('[data-sr-action="cancel"]'));await settle();
  assert.equal(changes.at(-1).status,'cancelled');assert.equal($('[data-sr-action="cancel"]'),null);
  await advance(20000);assert.equal(calls.filter(c=>c.path==='/api/research/jobs/research-alpha').length,1);
});

await check('A stop response preserves a run that completed before cancellation arrived',async({setRequest,start,$,fire,changes})=>{
  setRequest(async path=>path==='/api/research/status'?status(true):path.endsWith('/cancel')?makeJob('completed'):makeJob());
  await start({...baseReport(),research:makeJob()});fire($('[data-sr-action="cancel"]'));await settle();
  assert.equal(changes.at(-1).status,'completed');assert.match(changes.at(-1).phases[0].text,/Identity evidence/);
});

await check('An accepted stop is retained after its view closes without rewriting the new view',async({setRequest,start,$,fire,changes,cleanup,container})=>{
  const receipt=deferred();
  setRequest(async path=>path==='/api/research/status'?status(true):path.endsWith('/cancel')?receipt.promise:makeJob());
  await start({...baseReport(),research:makeJob()});fire($('[data-sr-action="cancel"]'));await settle();cleanup();container.textContent='New subject';
  receipt.resolve(makeJob('cancelled'));await settle();
  assert.equal(changes.at(-1).status,'cancelled');assert.equal(container.textContent,'New subject');
});

await check('Keyboard tab selection and focus survive a live evidence update',async({setRequest,start,$,fire,document,advance})=>{
  let polls=0;setRequest(async path=>{if(path==='/api/research/status')return status(true);const job=makeJob();job.phases[0].text='Partial evidence '+(++polls);return job;});
  await start({...baseReport(),research:makeJob()});const first=$('[data-sr-phase="identity"]');fire(first,'keydown',{key:'End'});assert.equal($('[data-sr-phase="ownership"]').getAttribute('aria-selected'),'true');assert.ok(document.activeElement===$('[data-sr-phase="ownership"]'),'Ownership tab focused');
  fire($('[data-sr-phase="ownership"]'),'keydown',{key:'Home'});assert.ok(document.activeElement===$('[data-sr-phase="identity"]'),'Identity tab focused');fire($('[data-sr-phase="identity"]'),'keydown',{key:'ArrowRight'});assert.ok(document.activeElement===$('[data-sr-phase="media"]'),'Media tab focused');
  await advance(1200);assert.equal($('[data-sr-phase="media"]').getAttribute('aria-selected'),'true');assert.ok(document.activeElement===$('[data-sr-phase="media"]'),'Polling must restore the focused phase tab, not leave focus on a detached node');
});

await check('Source trail expansion and focused links survive an evidence update',async({setRequest,start,$,document,advance,fire})=>{
  let polls=0;setRequest(async path=>{if(path==='/api/research/status')return status(true);const job=makeJob();job.phases[0].text='Evidence '+(++polls);job.phases[0].sources=[{url:'https://example.org/evidence',title:'Current source'}];return job;});
  await start({...baseReport(),research:makeJob()});$('.sr-source-ledger').open=true;fire($('[data-sr-show="other"]'));$('.sr-source-ledger a').focus();await advance(1200);
  assert.equal($('.sr-source-ledger').open,true,'Polling must not collapse the source trail the reviewer opened');assert.ok(document.activeElement===$('.sr-source-ledger a'),'Polling must retain the source link focus');
});

await check('Source and citation rendering rejects dangerous links and escapes provider text',async({setRequest,start,$,$$,container})=>{
  const text='<img src=x onerror=alert(1)> Evidence [1]';const job=makeJob('completed');job.phases[0].text=text;job.phases[0].title='<svg onload=alert(1)>';job.phases[0].sources=[{url:'javascript:alert(1)',title:'Bad'},{url:'https://user:pass@example.org/',title:'Credentials'},{url:'https://example.org/real?x=1&y=2',title:'<script>bad</script>'}];job.phases[0].citations=[{url:'javascript:alert(1)',title:'Bad',start:0,end:3},{url:'https://example.org/real?x=1&y=2',title:'" onmouseover="bad',start:37,end:40}];
  setRequest(async()=>status(false));await start({...baseReport(),research:job});assert.equal($('script,img'),null);assert.equal(container.querySelector('svg[onload]'),null);assert.ok($('.sr-research-prose').textContent.includes('<img src=x onerror=alert(1)>'));for(const a of $$('a')){assert.match(a.href,/^https:\/\//);assert.equal(a.getAttribute('rel'),'noopener noreferrer');assert.equal(a.getAttribute('target'),'_blank');assert.equal(a.hasAttribute('onmouseover'),false);}
  assert.equal(uniqueSources(job).length,1);assert.ok(!citedText('hello',[{url:'https://example.org',start:-1,end:2}]).includes('<a'));assert.equal(citedText('<b>',[{url:'data:text/html,bad',start:0,end:3}]),'&lt;b&gt;');
});

await check('A failed job surfaces its service explanation rather than only a generic status',async({setRequest,start,$})=>{
  setRequest(async()=>status(true));await start({...baseReport(),research:makeJob('failed',{error:'This account has no research quota remaining.'})});assert.match($('.sr-workspace').textContent,/This account has no research quota remaining/);
});

await check('Connecting never places the key in report state and clears the field after submission',async({setRequest,start,$,fire,document,changes,calls})=>{
  const submitted=deferred();setRequest(async path=>path==='/api/research/status'?status(false):submitted.promise);await start();fire($('[data-sr-action="connect"]'));
  const field=document.querySelector('#sr-api-key'),model=document.querySelector('#sr-model'),form=document.querySelector('.sr-connect-form');field.value='test-key-private';model.value='test-model';fire(form,'submit');await settle();assert.equal(field.value,'');assert.equal(calls.at(-1).body.apiKey,'test-key-private');assert.equal(changes.length,0);submitted.reject(Error('Credential was not accepted'));await settle();assert.match(document.querySelector('.sr-connect-error').textContent,/Credential was not accepted/);assert.equal(document.querySelector('button[type="submit"]').disabled,false);assert.ok(document.activeElement===field,'API key field focused after failure');assert.equal(document.querySelector('dialog').textContent.includes('test-key-private'),false);
});

await check('Navigation cleanup prevents late polling from touching the next page or report state',async({setRequest,start,container,cleanup,changes,timers})=>{
  const pending=deferred();setRequest(async path=>path==='/api/research/status'?status(true):pending.promise);await start({...baseReport(),research:makeJob()});cleanup();container.innerHTML='<h1>Next page</h1>';pending.resolve(makeJob('completed'));await settle();assert.equal(container.textContent,'Next page');assert.equal(changes.length,0);assert.equal(timers.size,0);
});

await check('A start accepted after navigation saves its job reference for history without redrawing',async({setRequest,start,$,fire,container,cleanup,changes,calls})=>{
  const pending=deferred();setRequest(async path=>path==='/api/research/status'?status(true):pending.promise);await start();fire($('[data-sr-action="start"]'));await settle();cleanup();container.innerHTML='<h1>Next page</h1>';pending.resolve({id:'late-accepted-job'});await settle();assert.equal(container.textContent,'Next page');assert.equal(changes.length,1);assert.equal(changes[0].id,'late-accepted-job');assert.equal(calls.filter(call=>call.path.includes('/jobs/')).length,0);
});



await check('Automatic research starts once only after a configured connection is confirmed',async({setRequest,start,connections,calls,changes,advance})=>{
  setRequest(async path=>path==='/api/research/status'?status(true):path==='/api/research/start'?{id:'research-alpha'}:makeJob('completed'));
  await start(baseReport(),{autoStart:true});await advance(5000);assert.equal(calls.filter(call=>call.path==='/api/research/start').length,1);assert.equal(connections.at(-1).configured,true);assert.equal(changes.at(-1).status,'completed');
});

await check('Automatic research cannot issue paid work when the provider is unconfigured',async({setRequest,start,calls,connections})=>{
  setRequest(async path=>{assert.equal(path,'/api/research/status');return status(false);});await start(baseReport(),{autoStart:true});assert.equal(connections.at(-1).configured,false);assert.equal(calls.length,1);
});

await check('Successful connect and disconnect update parent readiness without leaking the key',async({setRequest,start,$,fire,document,connections,changes})=>{
  setRequest(async path=>path==='/api/research/connect'?status(true):status(false));await start();fire($('[data-sr-action="connect"]'));
  document.querySelector('#sr-api-key').value='private-test-key';document.querySelector('#sr-model').value='test-model';fire(document.querySelector('form'),'submit');await settle();assert.equal(connections.at(-1).configured,true);assert.ok($('[data-sr-action="start"]'));assert.equal(JSON.stringify(changes).includes('private-test-key'),false);
  fire($('[data-sr-action="connect"]'));fire(document.querySelector('[data-sr-disconnect]'));await settle();assert.equal(connections.at(-1).configured,false);assert.equal($('[data-sr-action="start"]'),null);
});

await check('A late accepted job is persisted to its own screening report, not the newer check',async({setRequest,startScreening,$,fire,advance,store,calls})=>{
  const alpha=deferred(),beta=deferred();setRequest(async(path,options)=>{if(path==='/api/research/status')return status(true);if(path==='/api/research/start')return options.body.query.name==='Alpha Individual'?alpha.promise:beta.promise;throw Error(path);});
  await startScreening();assert.match($('.sc-run-button').textContent,/Search/);assert.equal($('.sc-deep-button').disabled,false);
  $('#sc-name').value='Alpha Individual';fire($('#sc-form'),'input');fire($('#sc-form'),'submit',{submitter:$('.sc-deep-button')});await advance(300);assert.equal($('.sc-profile-identity h1').textContent,'Alpha Individual');
  fire($('[data-sc-new]'));await settle();$('#sc-name').value='Beta Individual';fire($('#sc-form'),'input');fire($('#sc-form'),'submit',{submitter:$('.sc-deep-button')});await advance(300);assert.equal($('.sc-profile-identity h1').textContent,'Beta Individual');assert.equal(calls.filter(call=>call.path==='/api/research/start').length,2);
  alpha.resolve({id:'job-alpha'});await settle();const reports=store.get('screening-reports');assert.equal(reports.find(report=>report.query.name==='Alpha Individual').research.id,'job-alpha');assert.equal(reports.find(report=>report.query.name==='Beta Individual').research,undefined);assert.equal($('.sc-profile-identity h1').textContent,'Beta Individual');assert.equal($('.sr-dossier'),null,'Old research cannot appear on the new person');
});


await check('A stale initial status response cannot undo a newly established connection',async({setRequest,start,$,fire,document,connections})=>{
  const initial=deferred();setRequest(async path=>path==='/api/research/status'?initial.promise:status(true));await start();fire($('[data-sr-action="connect"]'));document.querySelector('#sr-api-key').value='test-key';document.querySelector('#sr-model').value='test-model';fire(document.querySelector('form'),'submit');await settle();assert.equal(connections.at(-1).configured,true);
  initial.resolve(status(false));await settle();assert.equal(connections.at(-1).configured,true,'Initial status snapshot must not overwrite a later successful connection');assert.ok($('[data-sr-action="start"]'));
});


await check('Research prose renders headings, bold findings and bullet rows with working citations',async({container,$,$$})=>{
  const text='## **Identity and official records**\n\n- **Registered role** appears in the record [1].\nThe later outcome is reported separately [2].';
  const citations=['[1]','[2]'].map((label,i)=>({url:`https://example.org/source-${i+1}`,title:`Source ${i+1}`,start:text.indexOf(label),end:text.indexOf(label)+label.length}));
  container.innerHTML=researchProse(text,citations);
  assert.equal($('h4 strong').textContent,'Identity and official records');assert.equal($('.sr-prose-bullet strong').textContent,'Registered role');assert.equal($$('.sr-paragraph-gap').length,1);assert.equal($$('a.sr-citation').length,2);assert.equal($$('a.sr-citation')[0].textContent,'[1]');assert.equal($$('a.sr-citation')[1].getAttribute('href'),'https://example.org/source-2');assert.doesNotMatch(container.textContent,/\*\*|##/);
});

await check('Research formatting never interprets provider HTML or citation attribute payloads',async({container,$,$$})=>{
  const text='### **<svg onload="alert(1)">Danger</svg>**\n- <img src=x onerror=alert(1)>\nAn **ordinary & useful** finding [safe] and [bad].';
  const citations=[{url:'https://example.org/source?q=%22%20onmouseover%3D%22bad',title:'\" onclick=\"bad',start:text.indexOf('[safe]'),end:text.indexOf('[safe]')+6},{url:'javascript:alert(1)',title:'Unsafe source',start:text.indexOf('[bad]'),end:text.indexOf('[bad]')+5}];
  container.innerHTML=researchProse(text,citations);
  assert.equal($('svg,img,script'),null);assert.ok($('h4 strong').textContent.includes('<svg'));assert.ok(container.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal($$('a').length,1);const link=$('a');assert.equal(link.hasAttribute('onclick'),false);assert.equal(link.hasAttribute('onmouseover'),false);assert.equal(link.getAttribute('target'),'_blank');assert.equal(link.getAttribute('rel'),'noopener noreferrer');assert.ok(container.textContent.includes('ordinary & useful'));
});

await check('Greek and emoji before a bold source do not shift citation offsets',async({container,$})=>{
  const label='Επίσημη πηγή',text=`## Ταυτότητα 🔎\nΒρέθηκε **${label}** για το συγκεκριμένο πρόσωπο.`;const start=text.indexOf(label);
  container.innerHTML=researchProse(text,[{url:'https://example.org/greek',title:'Official Greek source',start,end:start+label.length}]);
  assert.equal($('h4').textContent,'Ταυτότητα 🔎');assert.equal($('strong a').textContent,label);assert.equal($('strong a').getAttribute('href'),'https://example.org/greek');
});

await check('Completing initial snapshot loading preserves an open connection dialog and the subject draft',async({ctx,setRequest,startScreening,$,fire,document})=>{
  const loaded=deferred(),source=await ctx.loadScreeningData();ctx.loadScreeningData=()=>loaded.promise;setRequest(async()=>status(false));await startScreening();assert.equal($('.sc-run-button').disabled,false);
  $('#sc-name').value='Existing subject draft';fire($('#sc-form'),'input');fire($('[data-sc-connections]'));await settle();fire(document.querySelector('[data-connection-open="openai"]'));const dialog=document.querySelector('dialog'),field=document.querySelector('#sr-api-key');field.value='private-key-still-being-entered';field.focus();
  loaded.resolve(source);await settle();assert.ok(document.querySelector('dialog')===dialog,'The existing connection dialog must remain mounted');assert.ok(document.querySelector('#sr-api-key')===field,'The existing secret field must remain mounted');assert.equal(field.value,'private-key-still-being-entered');assert.ok(document.activeElement===field,'Loading must not steal keyboard focus');assert.equal($('#sc-name').value,'Existing subject draft');assert.equal($('.sc-run-button').disabled,false);assert.match($('.sc-source-strip').textContent,/Official sanctions & export-control sources/);
});

await check('A citation spanning bold display markers remains a clickable source',async({container,$})=>{
  const label='The **official** record',text=`## Sources\n${label} corroborates the listed role.`;const start=text.indexOf(label);
  container.innerHTML=researchProse(text,[{url:'https://example.org/whole-finding',title:'Whole finding',start,end:start+label.length}]);assert.ok($('a.sr-citation'),'Formatting must not silently drop a valid citation crossing bold markers');assert.match($('a.sr-citation').textContent,/official/);
});


await check('Default Search never starts paid research, even with a connected account',async({setRequest,startScreening,$,fire,advance,calls,store})=>{
  setRequest(async path=>path==='/api/research/status'?status(true):path==='/api/screening/start'?{id:'official-only'}:{id:'official-only',mode:'search',status:'completed',phases:[],officialStatus:'completed',officialChecks:['eu','ofac','un','uk','cy'].map(id=>({id,status:'completed',matchCount:0,candidates:[]}))});await startScreening();
  $('#sc-name').value='Example Individual';fire($('#sc-form'),'input');fire($('#sc-form'),'submit');await settle();await advance(300);
  assert.equal(calls.filter(c=>c.path==='/api/research/start').length,0);
  assert.equal(store.get('screening-reports')[0].query.mode,'search');
  assert.equal(calls.filter(c=>c.path==='/api/screening/start').length,1);
  assert.match($('.sc-at-a-glance').textContent,/5\/5 checked/);
  assert.match($('.sc-at-a-glance').textContent,/Not searched/);
});
await check('Source filter gains all nine sources when a new run returns its scope',async({setRequest,startScreening,$,fire,advance})=>{
  const record={id:'ca:fixture',name:'Synthetic Canada candidate',sourceId:'ca',type:'person'};
  const job={id:'nine-source-filter',schemaVersion:6,mode:'search',status:'completed',phases:[],officialStatus:'completed',officialChecks:['eu','ofac','un','uk','cy','bis','au','ca','ch'].map(id=>({id,status:'completed',matchCount:id==='ca'?1:0,candidates:id==='ca'?[{record,score:80}]:[]}))};
  setRequest(async path=>path==='/api/research/status'?status(false):path==='/api/screening/start'?{id:job.id}:job);await startScreening();
  $('#sc-name').value='Synthetic Canada candidate';fire($('#sc-form'),'input');fire($('#sc-form'),'submit');await settle();await advance(300);
  assert.equal($('#sc-source-filter').querySelectorAll('option').length,10);assert.ok($('#sc-source-filter option[value="ca"]'));
  $('#sc-source-filter').value='ca';fire($('#sc-source-filter'),'change');assert.match($('#sc-match-list').textContent,/Synthetic Canada candidate/);
});

await check('Source selection opens linked passages in the shared evidence panel and closes cleanly',async({setRequest,startScreening,$,fire,store,document})=>{
  const job=makeJob('completed');job.phases[0].sources=[{url:'https://example.org/lead',title:'Search-only lead'}];
  store.set('screening-reports',[{...baseReport(),research:job}]);setRequest(async()=>status(false));await startScreening();
  fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();$('.sr-source-ledger').open=true;
  fire($('.sr-source-ledger a'));assert.equal($('.sc-reader').hidden,false);assert.match($('.sc-reader').textContent,/Linked research passages/);assert.match($('.sc-reader').textContent,/Identity evidence/);
  assert.equal($('.sc-reader a').getAttribute('href'),'https://example.org/official-record');
  fire($('[data-sc-close-reader]'));assert.equal($('.sc-reader').hidden,true);assert.equal($('.sc-results-body').classList.contains('has-reader'),false);
  fire($('[data-sr-show="other"]'));fire($('.sr-source-ledger a'));assert.match($('.sc-reader').textContent,/No finding cites this page/);
});
await check('Expired saved runs stop polling, retain evidence and mark unfinished phases interrupted',async({setRequest,start,$,changes,timers})=>{
  const job=makeJob();job.phases[0]={...job.phases[0],status:'completed',text:'Saved evidence',citations:[]};
  setRequest(async path=>{if(path==='/api/research/status')return status(true);const error=Error('Expired');error.status=404;throw error;});await start({...baseReport(),research:job});
  assert.equal(changes.at(-1).status,'interrupted');assert.equal(changes.at(-1).phases[0].text,'Saved evidence');assert.equal(changes.at(-1).phases[1].status,'interrupted');assert.equal($('[data-sr-action="cancel"]'),null);
});
await check('URL tracking variants count once and citations replace raw Markdown labels',async({container,$})=>{
  const url='https://example.org/record';const value=`Finding ([Example](${url}?utm_source=openai)).`;
  const start=value.indexOf('(['),end=value.length-1;
  container.innerHTML=researchProse(value,[{url,title:'Example',start,end}]);
  assert.equal($('a').textContent,'[1]');assert.doesNotMatch(container.textContent,/https:|utm_source|\]\(/);
  const counts=sourceCounts({phases:[{text:value,sources:[{url:url+'?utm_source=openai'},{url:'https://example.org/lead'}],citations:[{url,start,end}]}]});
  assert.equal(counts.cited,1);assert.equal(counts.search,2);assert.equal(counts.uncited,1);
});
await check('Contradictory identities never become a confirmed client match',async()=>{
  const job=makeJob('completed');job.query.dob='1980-01-01';job.phases[0].identity={status:'unresolved',candidate:'Candidate A'};job.phases[1].identity={status:'corroborated',candidate:'Candidate B',anchors:[{field:'dob',value:'1980-01-01',url:'https://example.org/id'}]};
  assert.equal(identitySummary(job).status,'inconsistent');assert.equal(identitySummary(job).humanReviewRequired,true);
  job.phases[1].identity.conflicts=['Birth dates differ'];assert.equal(identitySummary(job).status,'conflicting');
});

await check('Five official checks show actual methods, gaps and counts without upgrading missing checks',async({setRequest,start,$,container})=>{
  const job=makeJob('partial',{officialStatus:'partial',officialChecks:[{id:'eu',status:'completed',method:'official_dataset',matchCount:0},{id:'ofac',status:'failed',error:'Source timeout'},{id:'un',status:'completed',matchCount:0},{id:'uk',status:'completed',matchCount:0},{id:'cy',status:'completed',method:'live_portal',matchCount:2,candidates:[]}]});
  setRequest(async()=>status(false));await start({...baseReport(),research:job});
  assert.match($('.sr-official-checks').textContent,/4\/5 checked/);assert.match(container.textContent,/Live portal search/);assert.match(container.textContent,/Source timeout/);
  assert.equal(officialSummary(job).incomplete,true);assert.equal(officialSummary(job).entries,2);
});
await check('Official candidate selection opens publisher evidence, not an AI quotation or search lead',async({setRequest,startScreening,$,fire,store,document})=>{
  const job=makeJob('partial',{officialStatus:'completed',officialChecks:[{id:'cy',status:'completed',method:'live_portal',checkedAt:'2026-10-12T10:00:00Z',matchCount:1,detail:'Live portal receipt.',candidates:[{record:{id:'cy:123',name:'Example Official Candidate',datesOfBirth:['1971-04-08'],aliases:['Example Alias'],sourceUrl:'https://stratlink.meci.gov.cy/sanction'},score:90,nameMatched:'Example Official Candidate',signals:['Date of birth differs']}]}]});
  store.set('screening-reports',[{...baseReport(),research:job,matches:job.officialChecks[0].candidates,totalMatches:1}]);setRequest(async()=>status(false));await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();
  fire($('[data-sc-match]'));assert.equal($('.sc-reader').hidden,false);assert.match($('.sc-reader').textContent,/Official record/);assert.match($('.sc-reader').textContent,/1971-04-08/);assert.match($('.sc-reader').textContent,/Date of birth differs/);
  assert.doesNotMatch($('.sc-reader').textContent,/Search lead|AI research summaries/);assert.match($('.sc-at-a-glance').textContent,/1 possible entry/);
});
for(const compact of [false,true])await check(`Legacy official candidates remain visible and selectable in ${compact?'compact':'full'} source review`,async({setRequest,start,$,fire,container})=>{
 const candidate={record:{id:'eu:legacy-saved',sourceId:'eu',name:'Legacy Official Candidate',sourceUrl:'https://example.org/official-record',aliases:[],countries:[],datesOfBirth:[]},score:98,nameMatched:'Legacy Official Candidate'};
 const check={id:'eu',name:'European Union',status:'completed',matchCount:1,method:'official_dataset',url:'https://example.org/source',checkedAt:'2026-10-12T10:00:00Z'};
 const report={...baseReport(),matches:[candidate],totalMatches:1,research:makeJob('completed',{mode:'search',officialStatus:'completed',officialChecks:[check],phases:[]})},before=structuredClone(report),selected=[];
 setRequest(async()=>status(false));await start(report,{compact,onViewMatches:id=>selected.push(id),onSource:source=>selected.push(source)});
 assert.doesNotMatch(container.textContent,/0 of 1 entries retrieved/);
 if(compact){const button=$('[data-sr-view-matches="eu"]');assert.equal(button.getAttribute('aria-label'),'View 1 returned entries from European Union');fire(button);assert.deepEqual(selected,['eu']);}
 else{assert.match(container.textContent,/Legacy Official Candidate/);fire($('[data-sr-official="eu:0"]'));assert.equal(selected[0].title,'Legacy Official Candidate');assert.equal(selected[0].url,candidate.record.sourceUrl);assert.match(selected[0].passages[0].text,/eu:legacy-saved/);}
 assert.deepEqual(report,before,'Rendering legacy evidence must not rewrite the original receipts');
});
for(const receipt of [{status:'completed',matchCount:1,candidates:[]},{status:'completed',matchCount:0},{status:'failed',matchCount:1},{status:'failed',matchCount:1,candidates:'supplied'}])await check(`Explicit empty and unfinished checks never recover obsolete source candidates: ${receipt.status}/${receipt.candidates||'absent'}/${receipt.matchCount}`,async({setRequest,start,$,container})=>{
 const candidate={record:{id:'eu:obsolete',sourceId:'eu',name:'Obsolete Candidate'},score:100};
 const check={id:'eu',...receipt,...(receipt.candidates==='supplied'?{candidates:[candidate]}:{})};
 const report={...baseReport(),matches:[candidate],totalMatches:1,research:makeJob('partial',{mode:'search',officialChecks:[check],phases:[]})},before=structuredClone(report);
 setRequest(async()=>status(false));await start(report);
 assert.equal(Boolean($('[data-sr-official]')),false);assert.equal(Boolean($('[data-sr-view-matches]')),false);assert.doesNotMatch(container.textContent,/Obsolete Candidate/);
 if(check.status==='completed'&&check.matchCount===1)assert.match(container.textContent,/0 of 1 entries retrieved/);
 assert.deepEqual(report,before);
});

await check('Expired jobs also mark unfinished official checks interrupted',async({setRequest,start,changes})=>{
  const job=makeJob('running',{officialStatus:'running',officialChecks:[{id:'eu',status:'completed',matchCount:2},{id:'cy',status:'running'}]});
  setRequest(async path=>{if(path==='/api/research/status')return status(true);const e=Error('Expired');e.status=404;throw e;});await start({...baseReport(),research:job});
  assert.equal(changes.at(-1).officialStatus,'interrupted');assert.equal(changes.at(-1).officialChecks[0].status,'completed');assert.equal(changes.at(-1).officialChecks[1].status,'interrupted');
});

await check('A failed Stop request keeps polling so the screen cannot freeze on a running job',async({setRequest,start,$,fire,changes,advance})=>{
  let polls=0;setRequest(async path=>{if(path==='/api/research/status')return status(true);if(path.endsWith('/cancel'))throw Error('Stop request failed');return ++polls===1?makeJob():makeJob('completed');});
  await start({...baseReport(),research:makeJob()});fire($('[data-sr-action="cancel"]'));await settle();
  assert.match($('.sr-error').textContent,/Stop request failed/);await advance(1200);
  assert.equal(changes.at(-1).status,'completed');assert.equal(polls,2);
});
await check('Official candidate expansion and keyboard focus survive polling',async({setRequest,start,$,document,advance})=>{
  let polls=0;const job=()=>makeJob('running',{sourceCount:++polls,officialStatus:'running',officialChecks:[{id:'eu',status:'completed',matchCount:1,candidates:[{record:{id:'eu:1',name:'Example'},score:90}]}]});
  setRequest(async path=>path==='/api/research/status'?status(true):job());await start({...baseReport(),research:job()});
  $('.sr-official-checks').open=true;$('[data-sr-candidates="eu"]').open=true;$('[data-sr-candidates="eu"] summary').focus();
  await advance(1200);assert.equal($('[data-sr-candidates="eu"]').open,true);assert.equal(document.activeElement,$('[data-sr-candidates="eu"] summary'));
  $('[data-sr-official]').focus();await advance(1200);assert.equal(document.activeElement,$('[data-sr-official]'));
  $('.sr-official-checks > summary').focus();await advance(1200);assert.equal(document.activeElement,$('.sr-official-checks > summary'));
});
await check('Deep search can recover unavailable local snapshots without treating them as checked',async({ctx,setRequest,startScreening,$,fire,advance,calls,store})=>{
  ctx.loadScreeningData=async()=>{throw Error('Local snapshots unavailable');};
  setRequest(async path=>path==='/api/research/status'?status(true):path==='/api/research/start'?{id:'research-alpha'}:makeJob());
  await startScreening();assert.equal($('.sc-run-button').disabled,false);assert.equal($('.sc-deep-button').disabled,false);
  $('#sc-name').value='Example Name';fire($('#sc-form'),'submit',{submitter:$('.sc-deep-button')});await settle();await advance(300);
  assert.equal(calls.filter(c=>c.path==='/api/research/start').length,1);
  const saved=store.get('screening-reports')[0];assert.equal(saved.sourceSnapshots.filter(s=>s.status==='available').length,0);assert.match($('.sc-at-a-glance').textContent,/incomplete|progress/i);
});
await check('Starting a new research run closes evidence from the old run',async({store,setRequest,startScreening,$,fire,document,advance})=>{
  store.set('screening-reports',[{...baseReport(),research:makeJob('completed')}]);
  setRequest(async path=>path==='/api/research/status'?status(true):path==='/api/research/start'?{id:'research-beta'}:makeJob('running',{id:'research-beta'}));
  await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();fire($('[data-sr-source]'));assert.equal($('.sc-reader').hidden,false);
  fire($('[data-sr-action="start"]'));await settle();await advance(300);assert.equal($('.sc-reader').hidden,true);assert.equal($('.sc-results-body').classList.contains('has-reader'),false);
});

await check('Choosing Deep search does not start work; the single submit action uses the selected mode',async({setRequest,startScreening,$,fire,calls,advance,store})=>{
  setRequest(async path=>path==='/api/research/status'?status(true):path==='/api/research/start'?{id:'research-alpha'}:makeJob());await startScreening();
  $('#sc-name').value='Example Individual';fire($('#sc-form'),'input');fire($('[data-sc-mode="deep"]'));
  assert.equal($('[data-sc-research]').hidden,true);assert.match($('.sc-run-button').textContent,/Start deep search/);assert.equal(calls.filter(c=>c.path==='/api/research/start').length,0);
  fire($('#sc-form'),'submit',{submitter:$('.sc-run-button')});await advance(300);
  assert.equal(store.get('screening-reports')[0].query.mode,'deep');assert.equal(calls.filter(c=>c.path==='/api/research/start').length,1);assert.equal($('#sc-research').hidden,false);assert.equal($('#sc-findings').hidden,false);
});
await check('Disconnected Deep search opens the connections hub without starting paid work',async({setRequest,startScreening,$,fire,calls,document})=>{
  setRequest(async()=>status(false));await startScreening();fire($('[data-sc-mode="deep"]'));
  assert.equal($('.sc-run-button').disabled,false);assert.equal($('[data-sc-research]').hidden,true);assert.match($('.sc-run-button').textContent,/Connect to search/);fire($('#sc-form'),'submit');await settle();await settle();assert.ok(document.querySelector('[data-connection-open="openai"]'));assert.ok(document.querySelector('[data-connection-open="opensanctions"]'));
  fire($('[data-sc-mode="search"]'));assert.equal($('.sc-run-button').disabled,false);assert.equal($('[data-sc-research]').hidden,true);assert.equal(calls.filter(c=>c.path==='/api/research/start').length,0);
});
await check('Profile sections preserve direct identity evidence, source return and coverage navigation',async({setRequest,startScreening,$,fire,store,document})=>{
  store.set('screening-reports',[{...baseReport(),research:makeJob('completed',{officialChecks:['eu','ofac','un','uk','cy'].map(id=>({id,status:'completed',matchCount:0}))})}]);setRequest(async()=>status(true));
  await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();
  fire($('[data-sc-check-coverage]'));assert.equal($('.sr-official-checks').open,true);assert.equal(document.querySelector('.sc-source-dialog'),null);
  assert.equal($('[data-sc-panel="sources"]').hidden,false);assert.equal($('[data-sc-panel="overview"]').hidden,true);fire($('[data-sc-profile] [data-sc-section="overview"]'));assert.equal($('[data-sc-panel="overview"]').hidden,false);
  fire($('[data-sc-open-finding="identity"]'));assert.match($('.sc-reader').textContent,/What we found/);assert.match($('.sc-reader').textContent,/What to check next/);
  assert.ok($('[data-sc-evidence-source]'));fire($('[data-sc-evidence-source]'));assert.match($('.sc-reader').textContent,/Linked research passages/);
  fire($('[data-sc-reader-back]'));assert.match($('.sc-reader').textContent,/Cited sources/);
  fire($('[data-sc-close-reader]'));assert.equal(document.activeElement,$('[data-sc-open-finding="identity"]'));
});

const procurementFixture=()=>({status:'completed',totalResults:1,candidates:[{score:100,nameMatched:'Example Individual',matchKind:'Exact name',record:{id:'wb:42',sourceId:'wb',name:'Example Individual',type:'person',countries:['Cyprus'],debarmentStatus:'Cross-debarred',listedAt:'2024-01-01',ineligibilityPeriod:'Ongoing',notesReference:'*10',reasons:'Published procurement grounds',sourceUrl:'https://documents.worldbank.org/en/projects-operations/procurement/debarred-firms',notesUrl:'https://thedocs.worldbank.org/notes.pdf'}}]});
const cleanOfficial=()=>['eu','ofac','un','uk','cy','bis','au','ca','ch'].map(id=>({id,status:'completed',matchCount:0,candidates:[]}));
await check('A truncated procurement download shows its recovery action without becoming a negative',async({setRequest,start,container})=>{
  const error='The World Bank download ended before all declared bytes arrived. Retry this source; no negative result is inferred.';
  const job=makeJob('partial',{schemaVersion:7,mode:'search',officialChecks:cleanOfficial(),worldbank:{status:'failed',errorCode:'truncated_response',error},phases:[]});
  const report={...baseReport(),research:job,requiresOfficial:true};
  setRequest(async()=>status(false));await start(report);
  assert.equal(executiveSummary(report).title,'Checks incomplete');
  assert.ok(container.textContent.includes(error));assert.match(container.textContent,/Check incomplete/);
  assert.doesNotMatch(container.textContent,/No name matches in World Bank|0 possible matches|truncated_response/);
});
await check('Procurement candidates stay separate from sanctions and open a readable comparison',async({setRequest,startScreening,$,fire,store,document})=>{
  const job=makeJob('completed',{schemaVersion:7,mode:'search',officialChecks:cleanOfficial(),worldbank:procurementFixture(),phases:[]});
  const report={...baseReport(),research:job,requiresOfficial:true};
  const summary=executiveSummary(report);assert.equal(summary.title,'Procurement matches require review');assert.equal(summary.entries,0);assert.match(summary.next,/procurement conditions/);
  store.set('screening-reports',[report]);setRequest(async()=>status(false));await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();
  fire($('[data-sc-open-finding="procurement"]'));assert.equal($('.sc-procurement-check').open,true);
  fire($('[data-sr-worldbank="0"]'));assert.equal($('.sc-reader').hidden,false);
  for(const value of ['PROCUREMENT DEBARMENT','Cross-debarred','Ongoing','*10','Published procurement grounds','release conditions'])assert.ok($('.sc-reader').textContent.includes(value),value);
  assert.ok($('.sc-reader a[href="https://thedocs.worldbank.org/notes.pdf"]'));
});
await check('Failed, missing and malformed procurement evidence can never render zero matches',async({setRequest,start,container,cleanup})=>{
  setRequest(async()=>status(false));
  for(const worldbank of [undefined,{status:'failed'},{status:'completed'},{status:'completed',totalResults:0,candidates:[procurementFixture().candidates[0]]},{status:'completed',totalResults:1,candidates:[]}]){
    const job=makeJob('completed',{schemaVersion:7,mode:'search',officialChecks:cleanOfficial(),worldbank,phases:[]});
    const report={...baseReport(),research:job};assert.equal(executiveSummary(report).title,'Checks incomplete');
    await start(report);assert.match(container.textContent,/Check incomplete/);assert.doesNotMatch(container.textContent,/No name matches in World Bank|undefined possible|0 possible matches/);cleanup();
  }
  const old=executiveSummary({...baseReport(),research:makeJob('completed',{mode:'search',officialChecks:cleanOfficial(),phases:[]})});
  assert.equal(old.incomplete,false);assert.equal(old.items.some(i=>i.label==='Procurement'),false);
});
await check('Expired procurement lookup is interrupted and keeps previously saved sanctions evidence',async({setRequest,start,changes})=>{
 const job=makeJob('running',{schemaVersion:7,mode:'search',officialChecks:cleanOfficial(),worldbank:{status:'running'},phases:[]});
 setRequest(async path=>{if(path==='/api/research/status')return status(false);const e=Error('Expired');e.status=404;throw e;});await start({...baseReport(),research:job});
 assert.equal(changes.at(-1).worldbank.status,'interrupted');assert.equal(changes.at(-1).officialChecks.length,9);
 assert.equal(executiveSummary({...baseReport(),research:changes.at(-1)}).title,'Checks incomplete');
});

for(const action of ['official','start','header'])await check('Rerun via '+action+' preserves the original report and starts a linked unreviewed report',async({store,setRequest,startScreening,$,fire,document,advance,calls})=>{
  const record={id:'eu-fixture',sourceId:'eu',name:'Example Individual'};
  const original={...baseReport(),query:{...baseReport().query,mode:'search'},notes:'Original reviewer context',decisions:{'eu-fixture':{status:'dismissed',note:'Different verified birth date'}},reviewLog:[{id:'event-one',recordId:'eu-fixture',status:'dismissed',note:'Original decision'}],research:makeJob('completed',{mode:'search',officialChecks:[{id:'eu',status:'completed',matchCount:1,candidates:[{record,score:100}]}]}),matches:[{record,score:100}],totalMatches:1};
  store.set('screening-reports',[original]);
  setRequest(async path=>path==='/api/research/status'?status(true):['/api/screening/start','/api/research/start'].includes(path)?{id:'new-job'}:makeJob('completed',{id:'new-job',mode:action==='start'?'deep':'search'}));
  await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();
  const before=structuredClone(store.get('screening-reports')[0]);
  fire($(action==='header'?'[data-sc-recheck]':'[data-sr-action="'+action+'"]'));await settle();await advance(300);
  const all=store.get('screening-reports');assert.equal(all.length,2);
  const old=all.find(r=>r.id===original.id),fresh=all.find(r=>r.id!==original.id);
  assert.deepEqual(old,{...before,unsaved:false});assert.equal(fresh.previousReportId,old.id);assert.equal(fresh.research.id,'new-job');assert.deepEqual(fresh.decisions,{});assert.ok(!fresh.reviewLog?.length);assert.equal(fresh.notes,'');assert.equal(fresh.query.mode,action==='start'?'deep':'search');
  assert.equal(calls.filter(c=>['/api/screening/start','/api/research/start'].includes(c.path)).length,1);
  fire($('[data-sc-previous-report]'));await settle();assert.equal($('#sc-report-notes').value,'Original reviewer context');assert.ok($('[data-sc-match="eu-fixture"]'));
});
await check('Rerun preserves an original report when a new request fails',async({store,setRequest,startScreening,$,fire,document,advance})=>{
 const original={...baseReport(),query:{...baseReport().query,mode:'search'},notes:'Keep the old evidence',research:makeJob('completed',{mode:'search'})};store.set('screening-reports',[original]);
 setRequest(async path=>{if(path==='/api/research/status')return status(false);throw Error('Fixture: service unavailable');});
 await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();fire($('[data-sr-action="official"]'));await settle();await advance(300);
 assert.equal(store.get('screening-reports').length,2);const old=store.get('screening-reports').find(r=>r.id===original.id);assert.deepEqual(old,{...original,unsaved:false});assert.match($('.sr-error').textContent,/service unavailable/);assert.ok($('[data-sc-previous-report]'));
});
await check('Rerun stops before requests if original cannot be saved or a notes draft exists',async({store,setRequest,startScreening,$,fire,document,advance,ctx,calls,state})=>{
 store.set('screening-reports',[{...baseReport(),query:{...baseReport().query,mode:'search'},research:makeJob('completed',{mode:'search'})}]);setRequest(async()=>status(false));
 await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();$('#sc-report-notes').value='Unsaved draft';fire($('#sc-report-notes'),'input');fire($('[data-sc-recheck]'));await settle();await settle();assert.ok(state.toasts.some(t=>/Save your draft/.test(t)));assert.equal($('#sc-report-notes').value,'Unsaved draft');
 $('#sc-report-notes').value='';fire($('#sc-report-notes'),'input');ctx.storage.set=()=>false;fire($('[data-sr-action="official"]'));await settle();await advance(300);
 assert.ok(state.toasts.some(t=>/could not be saved/.test(t)));assert.equal(store.get('screening-reports').length,1);assert.equal(calls.filter(c=>/\/start$/.test(c.path)).length,0);
});

await check('Passport-input detection leaves ordinary names and numeric company names intact',async()=>{
  for(const name of ['Example Individual','Studio 54','Passport Services 2024 Ltd','Passport Capital Ltd'])assert.equal(screeningInputIssue({name}),null);
  for(const name of ['Example Individual passport number TEST000111','Example Individual, passport no. TEST000111','Example Individual passport # TEST000111']){
    const issue=screeningInputIssue({name});assert.equal(issue.code,'passport_in_name');assert.equal(issue.suggestedName,'Example Individual');assert.doesNotMatch(issue.message,/TEST000111/);
  }
});
await check('Identity gaps name the missing citations and respect the date of birth already supplied',async()=>{
  const query={name:'Example Individual',type:'person',dob:'1970-04-08'};
  const phases=['identity','media','ownership'].map(id=>({id,status:id==='identity'?'partial':'completed',warnings:id==='identity'?['No usable inline source citations were returned for this phase.']:[],identity:{status:'unresolved'}}));
  const report={query,research:{mode:'deep',status:'partial',query,officialChecks:cleanOfficial(),phases}};
  const summary=executiveSummary(report);
  assert.match(summary.note,/All 9 official checks returned no name matches/);
  assert.deepEqual(summary.researchGaps,[{id:'identity',label:'Identity',detail:'No usable source citations were saved.'}]);
  assert.match(summary.next,/Complete Identity research/);assert.match(summary.next,/supplied date of birth/);
  assert.doesNotMatch(summary.next,/Retry.*official|Obtain.*date of birth/);
  const drawer=phaseReadingHTML(report.research,'identity');assert.match(drawer,/supplied date of birth/);assert.match(drawer,/Identity not verified/);assert.match(summary.items.find(v=>v.label==='Identity').text,/No usable sources were cited/);
  phases[0].status='completed';phases[0].warnings=[];
  assert.match(executiveSummary(report).next,/supplied date of birth/);
});
await check('Standalone research cannot submit an identifier embedded in the name',async({start,setRequest,calls,fire,$})=>{
  setRequest(async()=>status(true));
  await start({...baseReport(),query:{...baseReport().query,name:'Example Individual passport number TEST000111'}});
  fire($('[data-sr-action="start"]'));await settle();
  assert.equal(calls.filter(c=>c.path.endsWith('/start')).length,0);
});

await check('Structured passport is sent to the local screening service and stale services are blocked',async({start,setRequest,calls,$,fire,cleanup})=>{
 const report={...baseReport(),query:{...baseReport().query,mode:'search',passportNumber:'TEST 001122'}};
 setRequest(async path=>{if(path==='/api/research/status')return {configured:false,identifierFields:[]};throw Error('Unexpected start');});
 await start(report,{autoStart:true});await settle();assert.equal(calls.filter(c=>c.path.endsWith('/start')).length,0);assert.match($('[role="alert"]').textContent,/updated local service/);cleanup();
 setRequest(async(path,options)=>{if(path==='/api/research/status')return {configured:true,identifierFields:['passportNumber']};if(path==='/api/research/start'){assert.equal(options.body.query.passportNumber,'TEST 001122');return {id:'research-alpha'};}return makeJob('completed');});
 await start(report);fire($('[data-sr-action="start"]'));await settle();assert.equal(calls.filter(c=>c.path==='/api/research/start').length,1);
});

await check('Profile navigation distinguishes unsearched areas and keyboard navigation changes only the visible section',async({setRequest,startScreening,$,$$,fire,store,document,calls})=>{
  const job=makeJob('completed',{mode:'search',officialChecks:cleanOfficial(),phases:[],opensanctions:{status:'completed',candidates:[{id:'os:role',name:'Example Individual',schema:'Person',categories:['Politically exposed person'],birthDates:['1970-04-08'],countries:['Cyprus'],url:'https://www.opensanctions.org/entities/example/'}]}});
  store.set('screening-reports',[{...baseReport(),research:job}]);setRequest(async()=>status(true));await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();
  assert.deepEqual($$('[data-sc-panel]').filter(p=>!p.hidden).map(p=>p.dataset.scPanel),['overview']);
  fire($('[data-sc-profile] [data-sc-section="roles"]'));assert.equal($$('[data-sc-role-content] [data-sr-provider]').length,1);fire($('[data-sc-role-content] [data-sr-provider]'));assert.match($('.sc-reader').textContent,/Photo not supplied/);assert.match($('.sc-reader').textContent,/Compare all identifiers/);assert.equal($$('.sc-reader img').length,0);fire($('[data-sc-close-reader]'));
  fire($('[data-sc-profile] [data-sc-section="media"]'));assert.match($('[data-sc-media-content]').textContent,/Not researched in this check/);assert.doesNotMatch($('[data-sc-media-content]').textContent,/No adverse media/);
  fire($('[data-sc-profile] [data-sc-section="media"]'),'keydown',{key:'ArrowRight'});assert.equal($('[data-sc-panel="connections"]').hidden,false);assert.equal($('[data-sc-panel="media"]').hidden,true);
  fire($('[data-sc-profile] [data-sc-section="connections"]'),'keydown',{key:'Home'});assert.equal($('[data-sc-panel="overview"]').hidden,false);
  assert.equal(calls.filter(c=>c.path.endsWith('/start')).length,0);assert.equal(store.get('screening-reports').length,1);
});
await check('GLEIF parent references remain reachable without wider-web research',async({setRequest,startScreening,$,fire,store,document})=>{
  const record={id:'gleif:test',name:'Example Company',sourceId:'gleif',type:'entity',lei:'12345678901234567890',countries:['Cyprus'],sourceUrl:'https://search.gleif.org/#/record/example',parentLinks:[{kind:'direct-parent',url:'https://api.gleif.org/api/v1/lei-records/example/direct-parent'}]};
  const job=makeJob('completed',{mode:'search',phases:[],officialChecks:cleanOfficial(),gleif:{status:'completed',totalResults:1,candidates:[{record,score:100,nameMatched:'Example Company'}]}});
  store.set('screening-reports',[{...baseReport(),query:{name:'Example Company',type:'entity'},research:job}]);setRequest(async()=>status(true));await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();
  fire($('[data-sc-profile] [data-sc-section="connections"]'));assert.match($('[data-sc-connections-content]').textContent,/Company parent references/);assert.match($('[data-sc-connections-content]').textContent,/do not establish beneficial ownership/);fire($('[data-sc-connections-content] [data-sr-company]'));assert.match($('.sc-reader').textContent,/Parent references & lookup receipt/);assert.match($('.sc-reader').textContent,/Company & LEI status/);
});

await check('Running profile keeps keyboard focus, exposes Stop search and retains completed media findings in Overview',async({setRequest,startScreening,$,fire,store,document,advance,calls})=>{
  const job=makeJob('running',{mode:'deep',officialChecks:cleanOfficial()});job.phases.find(p=>p.id==='media').summary={finding:'A documented proceeding requires source review.'};job.phases.find(p=>p.id==='media').status='completed';let stopped=false;
  store.set('screening-reports',[{...baseReport(),research:job}]);setRequest(async path=>{if(path==='/api/research/status')return status(true);if(path.endsWith('/cancel')){stopped=true;return {status:'cancelled'};}return {...job,status:stopped?'cancelled':'running'};});
  await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();assert.ok($('[data-sc-stop-search]'));assert.match($('[data-sc-panel="overview"]').textContent,/A documented proceeding requires source review/);
  const nav=$('[data-sc-profile] [data-sc-section="media"]');fire(nav);nav.focus();await advance(1500);assert.equal(document.activeElement,$('[data-sc-profile] [data-sc-section="media"]'));assert.equal($('[data-sc-panel="media"]').hidden,false);
  fire($('[data-sc-stop-search]'));await settle();assert.ok(calls.some(c=>c.path.endsWith('/cancel')));assert.equal(store.get('screening-reports')[0].research.status,'cancelled');assert.equal($('[data-sc-stop-search]'),null);
});

await check('Activity separates completed checks, incomplete checks and slow responses without inventing progress',async()=>{
  const now=Date.parse('2026-10-13T10:00:00Z');
  const job=makeJob('running',{startedAt:new Date(now-125000).toISOString(),officialChecks:[{id:'eu',status:'completed'},{id:'ofac',status:'failed'},{id:'cy',name:'Cyprus Stratlink',status:'running'}],opensanctions:{status:'not_configured'},gleif:{status:'not_applicable'},worldbank:{status:'completed'},phases:[]});
  const value=screeningActivity(job,{lastChangeAt:now-92000,lastContactAt:now-1000,state:'connected'},now,9);
  assert.equal(value.title,'Checking Cyprus Stratlink');assert.equal(value.elapsed,'2m 5s');assert.equal(value.groups[0].complete,1);assert.equal(value.groups[0].issues,1);assert.equal(value.groups[0].total,9);assert.equal(value.groups[1].total,1);assert.match(value.health,/No new result for 1m 32s · server responding/);assert.equal(value.disconnected,false);
  const stale=screeningActivity(job,{lastChangeAt:now-92000,lastContactAt:now-20000,state:'connected'},now);
  assert.equal(stale.disconnected,true);assert.equal(stale.canRetry,true);assert.doesNotMatch(stale.health,/server responding/i);
  for(const state of ['completed','partial','failed','cancelled','interrupted'])assert.equal(screeningActivity({...job,status:state},{},now),null);
});

await check('Unchanged polls refresh connection evidence without claiming a new result',async({setRequest,start,advance})=>{
  let timestamp=100000;const previousNow=Date.now,events=[];
  Date.now=()=>timestamp;
  try{
    const job=makeJob();setRequest(async path=>path==='/api/research/status'?status(true):job);
    await start({...baseReport(),research:job},{onProgress:value=>events.push(value)});
    const first=events.at(-1);assert.equal(first.state,'connected');assert.equal(first.lastChangeAt,100000);
    timestamp=105000;await advance(1200);
    assert.equal(events.at(-1).lastContactAt,105000);assert.equal(events.at(-1).lastChangeAt,100000);
  }finally{Date.now=previousNow;}
});

await check('Compact toolbar keeps actions reachable and progress survives tab changes, connection loss and reconnect',async({setRequest,startScreening,$,fire,store,document,advance,timers,cleanup})=>{
  const job=makeJob('running',{mode:'deep',officialChecks:cleanOfficial()});let online=true,stopped=false;
  store.set('screening-reports',[{...baseReport(),research:job}]);
  setRequest(async path=>{if(path==='/api/research/status')return status(true);if(path.endsWith('/cancel')){stopped=true;return {};}if(!online)throw Error('Offline fixture');return {...job,status:stopped?'cancelled':'running'};});
  await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();
  for(const selector of ['[data-sc-new]','[data-sc-save-project]','[data-sc-ask]','[data-sc-export="download"]','[data-sc-history]'])assert.ok($('.sc-studio-head').contains($(selector)));
  assert.equal($('.sc-studio-head [data-sc-sources]'),null);
  assert.equal($('[data-sc-ask]').getAttribute('aria-expanded'),'true');assert.equal($('#sc-ask-panel').hidden,false);
  assert.equal($('.sc-result-heading'),null);assert.equal($('[data-sc-search-activity]').hidden,false);
  fire($('[data-sc-profile] [data-sc-section="media"]'));assert.equal($('[data-sc-search-activity]').hidden,false);
  online=false;await advance(14000);assert.match($('[data-sc-search-activity]').textContent,/Search updates interrupted/);assert.ok($('[data-sc-retry-updates]'));
  online=true;fire($('[data-sc-retry-updates]'));await settle();assert.match($('[data-sc-search-activity]').textContent,/Server responded/);assert.equal($('[data-sc-panel="media"]').hidden,false);
  fire($('[data-sc-stop-search]'));await settle();assert.equal($('[data-sc-search-activity]').hidden,true);cleanup();assert.equal(timers.size,0);
});

await check('The plug opens the correct service forms and connecting OpenAI makes Deep search ready',async({setRequest,startScreening,$,fire,document,calls})=>{
  let connected=false;
  setRequest(async path=>{if(path==='/api/research/status')return status(connected);if(path==='/api/research/connect'){connected=true;return status(true);}throw Error(path);});
  await startScreening();fire($('[data-sc-mode="deep"]'));assert.match($('.sc-run-button').textContent,/Connect to search/);
  fire($('[data-sc-connections]'));await settle();assert.equal(document.querySelectorAll('.sc-connection-service').length,2);
  fire(document.querySelector('[data-connection-open="openai"]'));assert.ok(document.querySelector('#sr-api-key'));assert.equal(document.querySelector('#os-api-key'),null);
  document.querySelector('#sr-api-key').value='fixture-key';fire(document.querySelector('.sr-connect-form'),'submit');await settle();assert.match($('.sc-run-button').textContent,/Start deep search/);
  fire($('[data-sc-connections]'));await settle();assert.match(document.querySelector('[data-connection="openai"]').textContent,/Connected/);fire(document.querySelector('[data-connection-open="opensanctions"]'));assert.ok(document.querySelector('#os-api-key'));assert.equal(document.querySelector('#sr-api-key'),null);
  assert.equal(calls.filter(c=>c.path==='/api/research/start').length,0);assert.equal(document.querySelectorAll('dialog input[value="fixture-key"]').length,0);
});

await check('Source library separates nine official checks from additional sources and keeps official links accurate',async({startScreening,setRequest,$,fire,document})=>{
  setRequest(async()=>status(false));await startScreening();fire($('[data-sc-source-info]'));
  const nav=document.querySelector('.sc-source-library-nav');assert.equal(nav.querySelectorAll('button').length,12);assert.match(nav.querySelector('h3').textContent,/Official checks 9/);
  fire(document.querySelector('[data-source-select="ofac"]'));assert.equal(document.querySelector('.sc-source-website').getAttribute('href'),'https://sanctionssearch.ofac.treas.gov/');assert.match(document.querySelector('[data-source-detail]').textContent,/searched locally/);
  fire(document.querySelector('[data-source-select="cy"]'));assert.match(document.querySelector('[data-source-detail]').textContent,/live Cyprus portal/);
  fire(document.querySelector('[data-source-select="worldbank"]'));assert.match(document.querySelector('[data-source-detail]').textContent,/Table 2 other sanctions.*not included/);
  fire(document.querySelector('[data-source-select="opensanctions"]'));assert.match(document.querySelector('[data-source-detail]').textContent,/API key required/);assert.equal(document.querySelectorAll('[data-source-select][aria-pressed="true"]').length,1);
});


const retryParentFixture=()=>{
 const record={id:'eu-retry-original',sourceId:'eu',name:'Example Individual',type:'person',aliases:[],datesOfBirth:['1960-01-01'],countries:['Cyprus']};
 const checks=cleanOfficial().map(c=>({...c,name:c.id==='cy'?'Cyprus':c.id,checkedAt:'2026-10-13T08:00:00Z',retrievedAt:'2026-10-13T07:30:00Z',...(c.id==='eu'?{matchCount:1,candidates:[{record,score:100,nameMatched:'Example Individual'}]}:{}),...(c.id==='cy'?{status:'failed',matchCount:null,error:'Portal timed out'}:{})}));
 return {...baseReport(),query:{...baseReport().query,mode:'search'},notes:'Previous review notes',decisions:{[record.id]:{status:'dismissed',note:'Different date of birth',reviewer:'Previous reviewer'}},reviewLog:[{id:'old-review-event',recordId:record.id,status:'dismissed',note:'Different date of birth'}],sourceSnapshots:[{id:'eu',status:'available',retrievedAt:'2026-10-13T07:30:00Z',recordCount:1}],matches:[{record,score:100,nameMatched:'Example Individual'}],totalMatches:1,requiresOfficial:true,research:makeJob('partial',{id:'a'.repeat(32),schemaVersion:8,mode:'search',query:{...baseReport().query,mode:'search'},phases:[],officialStatus:'partial',officialChecks:checks,worldbank:{status:'completed',totalResults:0,candidates:[]},gleif:{status:'not_applicable'},opensanctions:{status:'not_configured'}})};
};
const retriedParentJob=(report,extra={})=>({...report.research,id:'b'.repeat(32),retryOf:report.research.id,retrySources:['cy'],retryHistory:[{previousJobId:report.research.id,sourceIds:['cy'],startedAt:'2026-10-13T09:00:00Z'}],startedAt:'2026-10-13T09:00:00Z',status:'completed',officialStatus:'completed',officialChecks:report.research.officialChecks.map(c=>c.id==='cy'?{...c,status:'completed',error:null,matchCount:0,checkedAt:'2026-10-13T09:00:00Z'}:c),...extra});

await check('Selective retry forks the parent report, retains evidence and never carries old decisions forward',async({store,setRequest,startScreening,$,fire,document,advance,calls})=>{
 const original=retryParentFixture(),retried=retriedParentJob(original);store.set('screening-reports',[original]);
 setRequest(async path=>path==='/api/research/status'?{...status(false),retryChecks:true}:path==='/api/screening/retry'?{id:retried.id}:retried);
 await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();
 const before=structuredClone(store.get('screening-reports')[0]),retryButton=$('[data-sr-action="retry"]');fire(retryButton);fire(retryButton);await advance(300);await settle();
 const saved=store.get('screening-reports');assert.equal(saved.length,2);const old=saved.find(v=>v.id===original.id),fresh=saved.find(v=>v.id!==original.id);
 assert.deepEqual(old,{...before,unsaved:false});assert.equal(fresh.previousReportId,original.id);assert.equal(fresh.research.id,retried.id);assert.equal(fresh.research.retryOf,original.research.id);assert.deepEqual(fresh.sourceSnapshots,original.sourceSnapshots);
 assert.deepEqual(fresh.decisions,{});assert.equal(fresh.notes,'');assert.ok(!fresh.reviewLog?.length);
 assert.deepEqual(fresh.research.officialChecks.find(c=>c.id==='eu'),original.research.officialChecks.find(c=>c.id==='eu'));assert.equal(fresh.matches[0].record.id,'eu-retry-original');
 const posts=calls.filter(c=>c.path==='/api/screening/retry');assert.equal(posts.length,1);assert.deepEqual(posts[0].body.sourceIds,['cy']);assert.deepEqual(posts[0].body.research,original.research);assert.equal(calls.filter(c=>/\/start$/.test(c.path)).length,0);
 assert.equal($('[data-sc-panel="sources"]').hidden,false);assert.match($('[data-sr-receipt="retry"]').textContent,/Other source receipts keep their original check dates/);
 fire($('[data-sc-previous-report]'));await settle();assert.equal($('#sc-report-notes').value,'Previous review notes');
});

await check('Selective retry blocks before POST when notes or original storage are not saved',async({store,setRequest,startScreening,$,fire,document,advance,calls,ctx,state})=>{
 store.set('screening-reports',[retryParentFixture()]);setRequest(async()=>({...status(false),retryChecks:true}));
 await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();
 $('#sc-report-notes').value='Unsaved new reasoning';fire($('#sc-report-notes'),'input');fire($('[data-sr-action="retry"]'));await advance(10);
 assert.ok(state.toasts.some(v=>/Save your draft review or notes/.test(v)));assert.equal($('#sc-report-notes').value,'Unsaved new reasoning');assert.equal(calls.filter(c=>c.path==='/api/screening/retry').length,0);
 $('#sc-report-notes').value='Previous review notes';fire($('#sc-report-notes'),'input');ctx.storage.set=()=>false;fire($('[data-sr-action="retry"]'));await advance(10);
 assert.ok(state.toasts.some(v=>/could not be saved/.test(v)));assert.equal(calls.filter(c=>c.path==='/api/screening/retry').length,0);assert.equal(store.get('screening-reports').length,1);
});

await check('A retry whose new report cannot save stays open with evidence and a visible warning',async({store,setRequest,startScreening,$,fire,document,advance,calls,ctx})=>{
 const original=retryParentFixture(),retried=retriedParentJob(original);store.set('screening-reports',[original]);
 setRequest(async path=>path==='/api/research/status'?{...status(false),retryChecks:true}:path==='/api/screening/retry'?{id:retried.id}:retried);
 await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();
 const originalSet=ctx.storage.set;ctx.storage.set=(key,value)=>key==='screening-reports'&&value.some(v=>v.id!==original.id)?false:originalSet(key,value);
 fire($('[data-sr-action="retry"]'));await advance(300);await settle();assert.equal(calls.filter(c=>c.path==='/api/screening/retry').length,1);assert.equal(store.get('screening-reports').length,1);
 assert.equal($('.sc-save-warning').hidden,false);assert.match($('.sc-save-warning').textContent,/Not saved|could not be saved/);assert.equal($('[data-sc-save-retry]').hidden,false);assert.ok($('[data-sc-previous-report]'));assert.match($('[data-sr-receipt="retry"]').textContent,/evidence retained/);assert.equal($('#sc-report-notes').value,'');
 fire($('[data-sc-history]'));await settle();assert.equal(document.querySelectorAll('[data-sc-open-report]').length,1);assert.match(document.querySelector('[data-sc-recover]').textContent,/Retry saving 1 unsaved checks/);ctx.storage.set=originalSet;fire(document.querySelector('[data-sc-recover]'));await advance(20);assert.equal(store.get('screening-reports').length,2);assert.equal(document.querySelectorAll('[data-sc-open-report]').length,2);
});

await check('A Deep search retry exposes the older web-assessment limitation in the main overview',async({store,setRequest,startScreening,$,fire,document,advance})=>{
 const original=retryParentFixture();original.query.mode='deep';original.research={...makeJob('completed'),...original.research,mode:'deep',phases:makeJob('completed').phases};
 const retried=retriedParentJob(original,{status:'partial',researchNeedsRefresh:true,error:'Earlier web findings have not been reassessed against the updated checks.'});store.set('screening-reports',[original]);
 setRequest(async path=>path==='/api/research/status'?{...status(false),retryChecks:true}:path==='/api/screening/retry'?{id:retried.id}:retried);
 await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();fire($('[data-sr-action="retry"]'));await advance(300);await settle();
 fire($('[data-sc-profile] [data-sc-section="overview"]'));const text=$('[data-sc-panel="overview"]').textContent;
 assert.match(text,/Checks incomplete/);assert.match(text,/Earlier web findings have not been reassessed/);assert.match(text,/Rerun Deep search/);
 const fresh=store.get('screening-reports').find(v=>v.id!==original.id);assert.deepEqual(fresh.research.phases,original.research.phases);assert.equal(fresh.research.researchNeedsRefresh,true);
});

await check('Selective retry preserves an unsaved identity-review draft and sends no request',async({store,setRequest,startScreening,$,fire,document,advance,calls,state})=>{
 store.set('screening-reports',[retryParentFixture()]);setRequest(async()=>({...status(false),retryChecks:true}));await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();
 fire($('[data-sc-profile] [data-sc-section="matches"]'));fire($('[data-sc-match="eu-retry-original"]'));fire($('[data-sc-review-identity]'));$('#sc-decision-note').value='Unfinished identity review';fire($('#sc-decision-note'),'input');fire($('[data-sr-action="retry"]'));await advance(10);
 assert.equal(calls.filter(c=>c.path==='/api/screening/retry').length,0);assert.equal($('#sc-decision-note').value,'Unfinished identity review');assert.ok(state.toasts.some(v=>/Save your draft review/.test(v)));assert.equal(store.get('screening-reports').length,1);
});

await check('A late accepted retry saves a linked copy of its original report without replacing a newer view',async({store,setRequest,startScreening,$,fire,document,advance,calls})=>{
 const original=retryParentFixture(),retried=retriedParentJob(original),accepted=deferred();store.set('screening-reports',[original]);
 setRequest(async path=>path==='/api/research/status'?{...status(false),retryChecks:true}:path==='/api/screening/retry'?accepted.promise:retried);
 await startScreening();fire($('[data-sc-history]'));await settle();fire(document.querySelector('[data-sc-open-report]'));await settle();await settle();fire($('[data-sr-action="retry"]'));await advance(20);assert.equal(calls.filter(c=>c.path==='/api/screening/retry').length,1);
 fire($('[data-sc-new]'));assert.ok($('#sc-form'));$('#sc-name').value='New Subject';fire($('#sc-form'),'input');accepted.resolve({id:retried.id,job:retried});await advance(300);await settle();
 assert.ok($('#sc-form'));assert.equal($('#sc-name').value,'New Subject');const records=store.get('screening-reports'),saved=records.find(v=>v.id!==original.id);assert.equal(records.length,2);assert.equal(saved.previousReportId,original.id);assert.equal(saved.query.name,original.query.name);assert.equal(saved.research.id,retried.id);assert.equal(calls.filter(c=>/\/start$/.test(c.path)).length,0);
});

await check('Closing a report during retry capability lookup sends no retry request',async({setRequest,start,$,fire,calls,cleanup})=>{
  const capability=deferred();let reads=0;
  setRequest(async path=>{
    if(path==='/api/research/status')return ++reads===1?status(false):capability.promise;
    throw Error('A closed report must not create a retry');
  });
  await start(retryParentFixture());fire($('[data-sr-action="retry"]'));await settle();cleanup();
  capability.resolve({...status(false),retryChecks:true});await settle();
  assert.equal(calls.filter(c=>c.path==='/api/screening/retry').length,0);
});

console.log(`\n${passed} passed; ${failed} failed. Detached event/content checks only.`);
if(failed)process.exitCode=1;
