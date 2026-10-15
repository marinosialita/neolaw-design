import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {indexHealth,recoveredSources,requestSourceIndex,sourceHealthHTML,mountSourceRecovery} from '../modules/screening-health.js';
import {openSourcesDialog} from '../modules/screening-sources-dialog.js';
import {officialPortals} from '../modules/screening-view-model.js';

// Detached DOM and injected API receipts only. No real network or credentials.
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
const ids=officialPortals.filter(s=>s.id!=='cy').map(s=>s.id);
const fresh=(id='un',at=Date.now())=>({id,status:'available',indexReady:true,verifiedAt:new Date(at).toISOString()});
const allReady=()=>({schemaVersion:1,sources:ids.map(id=>fresh(id)),records:[]});
const job=(checks=[{id:'un',status:'failed',error:'Prior timeout'}])=>({id:'saved-report',status:'partial',officialChecks:checks});
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
let passed=0,failed=0;
async function check(label,run){
  const globals=['document','window','fetch','setTimeout','clearTimeout'];
  const previous=Object.fromEntries(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const previousNow=Date.now;
  const {document,window}=parseHTML('<html><body><main id="health"></main></body></html>');
  const container=document.querySelector('#health');
  let clock=Date.UTC(2026,9,14,9,0,0),next=0;
  const timers=new Map(),disposals=[],calls=[];
  Date.now=()=>clock;
  const override={document,window,
    fetch:()=>{throw Error('Unexpected network request in source-health test');},
    setTimeout:(fn,delay=0)=>{const id=++next;timers.set(id,{fn,at:clock+delay});return id;},
    clearTimeout:id=>timers.delete(id)};
  for(const [key,value] of Object.entries(override))Object.defineProperty(globalThis,key,{configurable:true,value,writable:true});
  const advance=async ms=>{const end=clock+ms;let turns=0;while(true){const queued=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!queued)break;assert.ok(++turns<100);const [id,timer]=queued;timers.delete(id);clock=timer.at;timer.fn();await settle();}clock=end;await settle();};
  const click=element=>{assert.ok(element,'Expected a clickable control');element.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));};
  const start=async(options={})=>{const dispose=mountSourceRecovery(container,options);disposals.push(dispose);await settle();return dispose;};
  const ctx={screeningIndexRequest:async(refresh,sourceIds)=>{calls.push({refresh,sourceIds});return allReady();},modal({body,onMount}){const root=document.createElement('dialog');root.innerHTML=body;document.body.append(root);const close=()=>root.remove();disposals.push(close);onMount(root,close);return close;}};
  try{await run({document,window,container,ctx,calls,timers,start,advance,click,setClock:value=>{clock=value;}});passed++;console.log('PASS '+label);}
  catch(error){failed++;console.error('FAIL '+label+'\n'+error.stack);}
  finally{for(const dispose of disposals)dispose();Date.now=previousNow;for(const [key,value] of Object.entries(previous)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
}

await check('Prepared coverage has exactly eight fixed lists and excludes the live Cyprus portal',async()=>{
 const input=allReady();input.sources.push(fresh('cy'),fresh('unknown'));const before=structuredClone(input);
 const result=indexHealth(input);assert.equal(result.total,8);assert.equal(result.ready,8);assert.ok(!result.sources.some(s=>s.id==='cy'));assert.deepEqual(input,before);
 assert.equal(indexHealth({}).ready,0);assert.equal(indexHealth({}).sources.length,8);
});
await check('One-hour readiness is independently validated, including future and malformed timestamps',async()=>{
 const now=Date.now();
 for(const [stamp,expected] of [[now,true],[now-3600000,true],[now-3600001,false],[now+1,false],['invalid',false]]){
   const receipt=fresh();receipt.verifiedAt=typeof stamp==='number'?new Date(stamp).toISOString():stamp;
   assert.equal(indexHealth({sources:[receipt]},now).sources.find(s=>s.id==='un').ready,expected);
 }
 for(const override of [{status:'unavailable'},{indexReady:false},{verifiedAt:'' ,retrievedAt:''}])assert.equal(indexHealth({sources:[{...fresh(),...override}]}).ready,0);
 assert.equal(indexHealth({sources:[{...fresh(),verifiedAt:undefined,retrievedAt:new Date(now).toISOString()}]}).ready,1);
});
await check('Saved incomplete checks are selected only when their matching prepared source is ready',async()=>{
 const checks=ids.map((id,i)=>({id,status:['failed','partial','cancelled','interrupted','pending','completed','failed','failed'][i]}));
 checks.push({id:'cy',status:'failed'},{id:'opensanctions',status:'failed'},{id:'worldbank',status:'failed'});
 const sourceIndex=allReady();sourceIndex.sources.find(s=>s.id===ids.at(-1)).verifiedAt='2000-01-01T00:00:00Z';
 const before=structuredClone(checks);assert.deepEqual(recoveredSources(job(checks),sourceIndex),ids.slice(0,5).concat(ids[6]));assert.deepEqual(checks,before);
 assert.deepEqual(recoveredSources({...job(checks),status:'running'},sourceIndex),[]);assert.deepEqual(recoveredSources(null,sourceIndex),[]);
});
await check('Current readiness keeps the last refresh error visible and does not rewrite saved evidence',async()=>{
 const source={...fresh(),ready:true,refreshFailure:{error:'DNS lookup failed'},refreshHealth:{lastDurationMs:1000,recentEvents:[{attemptedAt:new Date().toISOString(),outcome:'failed',diagnostic:{category:'dns'}}]}};
 const html=sourceHealthHTML(source);assert.match(html,/Ready for screening/);assert.match(html,/DNS lookup failed/);assert.match(html,/does not change a saved report/);assert.match(html,/1\.0s/);assert.match(html,/dns/);
 assert.match(sourceHealthHTML({...source,ready:false,refreshing:true}),/Refreshing · not ready/);
 assert.match(sourceHealthHTML({...source,ready:false,refreshing:false}),/coverage incomplete/);
});
await check('Source errors and event fields are escaped before rendering',async()=>{
 const html=sourceHealthHTML({ready:false,refreshFailure:{error:'<img src=x onerror=alert(1)>'},refreshHealth:{recentEvents:[{outcome:'<script>bad</script>',diagnostic:{category:'<b>bad</b>'}}]}});
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.match(html,/&lt;img/);assert.match(html,/&lt;b&gt;/);
});
await check('Injected requests receive refresh intent and fixed IDs without requiring fetch',async()=>{
 const calls=[],result={sources:[]};const ctx={screeningIndexRequest:async(...args)=>{calls.push(args);return result;}};
 assert.equal(await requestSourceIndex(ctx),result);assert.equal(await requestSourceIndex(ctx,true,['un']),result);assert.deepEqual(calls,[[false,undefined],[true,['un']]]);
});
await check('Default GET is uncached and POST uses the refresh endpoint and sourceIds contract',async()=>{
 const calls=[],response={...allReady(),refreshRequest:{accepted:true,sourceIds:['un']}};
 globalThis.fetch=async(...args)=>{calls.push(args);return {ok:true,json:async()=>response};};
 assert.equal(await requestSourceIndex(),response);assert.equal(calls[0][0],'/api/screening/index');assert.equal(calls[0][1].cache,'no-store');
 assert.equal(await requestSourceIndex({},true,['un']),response);
 assert.equal(calls[1][0],'/api/screening/index/refresh');assert.equal(calls[1][1].method,'POST');assert.equal(calls[1][1].headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(calls[1][1].body),{sourceIds:['un']});
 await requestSourceIndex({},true);assert.deepEqual(JSON.parse(calls[2][1].body),{});
});
await check('The existing loader is used only for status; refresh still goes to POST',async()=>{
 let loads=0,posts=0;const ctx={loadScreeningData:async()=>{loads++;return allReady();}};
 globalThis.fetch=async(url,options)=>{posts++;assert.equal(options.method,'POST');return {ok:true,json:async()=>allReady()};};
 await requestSourceIndex(ctx);await requestSourceIndex(ctx,true);assert.equal(loads,1);assert.equal(posts,1);
});
await check('HTTP failures keep the service explanation without pretending lists are ready',async()=>{
 globalThis.fetch=async()=>({ok:false,json:async()=>({error:'List service unavailable'})});await assert.rejects(()=>requestSourceIndex(),/List service unavailable/);
 globalThis.fetch=async()=>({ok:false,json:async()=>({})});await assert.rejects(()=>requestSourceIndex(),/Saved evidence is unchanged/);
});
await check('Recovery banner retries only ready failed checks and preserves the original report',async({ctx,container,start,click,calls})=>{
 const report=job([{id:'un',status:'failed',error:'Earlier failure'},{id:'cy',status:'failed'},{id:'uk',status:'completed'}]),before=structuredClone(report),retries=[];
 await start({ctx,getJob:()=>report,onRetry:ids=>retries.push(ids)});
 assert.equal(container.hidden,false);assert.match(container.textContent,/1 previously incomplete list is ready/);assert.match(container.textContent,/saved result remains incomplete/);
 click(container.querySelector('[data-health-action]'));await settle();assert.deepEqual(retries,[['un']]);assert.deepEqual(report,before);assert.ok(calls.length>=1);assert.ok(calls.every(call=>call.refresh===false&&call.sourceIds===undefined));
});
await check('A running report never advertises retry and fully ready start state is quiet',async({ctx,container,start})=>{
 const dispose=await start({ctx,getJob:()=>({...job(),status:'running'})});assert.equal(container.hidden,true);dispose();
 await start({ctx,start:true});assert.equal(container.hidden,true);
});
await check('Missing startup coverage explains incompleteness and opens sources',async({ctx,container,start,click})=>{
 let inspections=0;ctx.screeningIndexRequest=async()=>({sources:[{...fresh(),refreshing:true}]});
 await start({ctx,start:true,onInspect:()=>inspections++});assert.equal(container.hidden,false);assert.match(container.textContent,/1\/8 prepared lists ready/);assert.match(container.textContent,/cannot rule out matches/);
 click(container.querySelector('[data-health-action]'));assert.equal(inspections,1);
});
await check('Availability failure retains the saved error and polling can recover without a new subject search',async({ctx,container,start,advance})=>{
 const report=job(),before=structuredClone(report);let count=0;
 ctx.screeningIndexRequest=async()=>{if(++count===1)throw new Error('fixture unavailable');return allReady();};
 await start({ctx,getJob:()=>report});assert.match(container.textContent,/Saved results have not changed/);assert.equal(container.querySelector('button'),null);
 await advance(30000);assert.match(container.textContent,/ready to retry/);assert.deepEqual(report,before);assert.equal(count,2);
});
await check('Disposing a pending availability request prevents late DOM writes and future polling',async({ctx,container,start,timers,advance})=>{
 const pending=deferred();let calls=0;ctx.screeningIndexRequest=()=>{calls++;return pending.promise;};
 container.textContent='Existing report';const dispose=await start({ctx,getJob:()=>job()});dispose();pending.resolve(allReady());await settle();
 assert.equal(container.textContent,'Existing report');assert.equal(timers.size,0);await advance(60000);assert.equal(calls,1);
});
await check('Disposed recovery controls cannot start a retry',async({ctx,container,start,click})=>{
 let retries=0;const dispose=await start({ctx,getJob:()=>job(),onRetry:()=>retries++});const button=container.querySelector('button');dispose();click(button);await settle();assert.equal(retries,0);
});
await check('Recovery click rechecks current job state before starting a retry',async({ctx,container,start,click})=>{
 let current=job(),retries=0;await start({ctx,getJob:()=>current,onRetry:()=>retries++});current={...current,status:'running'};click(container.querySelector('button'));await settle();assert.equal(retries,0);
});
await check('An expired prepared list cannot be retried through a stale ready banner',async({ctx,container,start,click,setClock})=>{
 let retries=0;await start({ctx,getJob:()=>job(),onRetry:()=>retries++});setClock(Date.now()+3600001);click(container.querySelector('button'));await settle();assert.equal(retries,0);
});
await check('An asynchronous retry disables its control and a rejected retry keeps saved evidence',async({ctx,container,start,click})=>{
 const pending=deferred(),report=job(),before=structuredClone(report),messages=[];ctx.toast=message=>messages.push(message);
 await start({ctx,getJob:()=>report,onRetry:()=>pending.promise});const button=container.querySelector('button');click(button);await settle();assert.equal(button.disabled,true);
 pending.reject(Error('Fixture retry unavailable'));await settle();assert.deepEqual(messages,['Fixture retry unavailable']);assert.deepEqual(report,before);assert.equal(container.querySelector('button').disabled,false);
});
await check('Disposed asynchronous retry completion cannot update a newly opened view',async({ctx,container,start,click,calls})=>{
 const pending=deferred(),messages=[];ctx.toast=message=>messages.push(message);const dispose=await start({ctx,getJob:()=>job(),onRetry:()=>pending.promise});
 click(container.querySelector('button'));await settle();dispose();container.textContent='Different open report';const before=calls.length;
 pending.reject(Error('Fixture late retry failure'));await settle();assert.equal(container.textContent,'Different open report');assert.deepEqual(messages,[]);assert.equal(calls.length,before);
});
await check('Sources dialog handles first availability failure without a permanent loading claim',async({ctx,document})=>{
 ctx.screeningIndexRequest=async()=>{throw Error('Fixture service unavailable');};openSourcesDialog(ctx);await settle();const dialog=document.querySelector('dialog');assert.match(dialog.textContent,/Fixture service unavailable/);assert.ok(!dialog.textContent.includes('Checking source availability…'));
});
await check('Sources dialog sends public-list refresh and accepts index plus refreshRequest metadata',async({ctx,document,click,advance})=>{
 const calls=[];ctx.screeningIndexRequest=async(refresh,sourceIds)=>{calls.push({refresh,sourceIds});return {...allReady(),refreshRequest:refresh?{accepted:true,sourceIds:ids}:undefined};};
 openSourcesDialog(ctx);await settle();click(document.querySelector('[data-source-health-refresh]'));await settle();assert.deepEqual(calls.slice(0,2),[{refresh:false,sourceIds:undefined},{refresh:true,sourceIds:undefined}]);assert.match(document.querySelector('dialog').textContent,/Ready for screening/);
 await advance(1500);assert.equal(calls.length,3);assert.equal(calls[2].refresh,false);
});
await check('Closing sources dialog prevents late updates and follow-up status requests',async({ctx,document,click,advance})=>{
 const pending=deferred();let count=0;ctx.screeningIndexRequest=async refresh=>{count++;return refresh?pending.promise:allReady();};
 const close=openSourcesDialog(ctx);await settle();click(document.querySelector('[data-source-health-refresh]'));await settle();close();pending.resolve(allReady());await settle();await advance(2000);assert.equal(count,2);assert.equal(document.querySelector('dialog'),null);
});
await check('Manual refresh polls while work runs, preserves open details, and stops when receipts finish',async({ctx,document,click,advance,timers})=>{
 let count=0;const calls=[];
 ctx.screeningIndexRequest=async refresh=>{count++;calls.push(refresh);const receipt=allReady();if(count===2||count===3)receipt.sources.find(s=>s.id==='ofac').refreshing=true;return {...receipt,...(refresh?{refreshRequest:{accepted:true,sourceIds:ids,alreadyRefreshing:[],rateLimited:[]}}:{})};};
 openSourcesDialog(ctx);await settle();document.querySelector('.sc-live-source').open=true;
 click(document.querySelector('[data-source-health-refresh]'));await settle();assert.match(document.querySelector('dialog').textContent,/Public-list refresh requested/);assert.equal(document.querySelector('.sc-live-source').open,true);
 await advance(1500);assert.equal(count,3);assert.equal(document.querySelector('.sc-live-source').open,true);assert.ok(!document.querySelector('dialog').textContent.includes('Refresh finished.'));
 await advance(1500);assert.equal(count,4);assert.match(document.querySelector('dialog').textContent,/Refresh finished\. Review each source/);assert.equal(document.querySelector('.sc-live-source').open,true);assert.equal(timers.size,0);
 await advance(60000);assert.equal(count,4);assert.deepEqual(calls,[false,true,false,false]);
});
await check('Two-minute polling limit leaves ongoing refresh labelled as background work, never finished',async({ctx,document,click,advance,timers})=>{
 let count=0,posts=0;
 ctx.screeningIndexRequest=async refresh=>{count++;if(refresh)posts++;const receipt=allReady();receipt.sources.find(s=>s.id==='eu').refreshing=count>1;return {...receipt,...(refresh?{refreshRequest:{accepted:true,sourceIds:ids,alreadyRefreshing:[],rateLimited:[]}}:{})};};
 openSourcesDialog(ctx);await settle();click(document.querySelector('[data-source-health-refresh]'));await settle();await advance(120000);
 const content=document.querySelector('dialog').textContent;assert.match(content,/Refresh continues in the background/);assert.ok(!content.includes('Refresh finished.'));assert.match(document.querySelector('.sc-live-source summary').textContent,/Refreshing/);assert.equal(timers.size,0);assert.equal(posts,1);assert.ok(count<=82,'Polling stays bounded');
 const stopped=count;await advance(120000);assert.equal(count,stopped);
});
await check('Rate-limited refresh clearly explains cooldown without claiming a new refresh was queued',async({ctx,document,click,advance,timers})=>{
 let posts=0,gets=0;
 ctx.screeningIndexRequest=async refresh=>{if(refresh)posts++;else gets++;return {...allReady(),...(refresh?{refreshRequest:{accepted:false,sourceIds:[],alreadyRefreshing:[],rateLimited:ids,retryAfterSeconds:60}}:{})};};
 openSourcesDialog(ctx);await settle();click(document.querySelector('[data-source-health-refresh]'));await settle();assert.match(document.querySelector('dialog').textContent,/Wait a minute before requesting again/);assert.ok(!document.querySelector('dialog').textContent.includes('Public-list refresh requested.'));
 await advance(1500);assert.match(document.querySelector('dialog').textContent,/Wait a minute before requesting again/);assert.equal(posts,1);assert.equal(gets,2);assert.equal(timers.size,0);await advance(60000);assert.equal(gets,2);
});
for(const fail of [false,true])await check(`A superseded availability ${fail?'failure':'response'} cannot overwrite a newer result`,async({ctx,container,start,click,advance,timers})=>{
 const retry=deferred(),older=deferred();let reads=0;
 ctx.screeningIndexRequest=async()=>++reads===2?older.promise:allReady();
 await start({ctx,getJob:()=>job(),onRetry:()=>retry.promise});
 click(container.querySelector('button'));await settle();
 await advance(30000);assert.equal(reads,2);
 retry.resolve();await settle();assert.equal(reads,3);assert.match(container.textContent,/ready to retry/);
 if(fail)older.reject(Error('Older availability failure'));else older.resolve({sources:[]});
 await settle();assert.equal(container.hidden,false);assert.match(container.textContent,/ready to retry/);
 assert.equal(timers.size,1,'Only the newest request schedules further availability polling');
});
console.log(`\n${passed} passed; ${failed} failed.`);if(failed)process.exitCode=1;
