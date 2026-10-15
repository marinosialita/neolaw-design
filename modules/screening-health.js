import {escape as e} from '../core.js';
import {formatDate,officialPortals} from './screening-view-model.js';

const preparedIds=officialPortals.filter(s=>s.id!=='cy').map(s=>s.id);
const incomplete=new Set(['failed','partial','cancelled','interrupted','pending']);

// Operational availability is separate from the receipts saved in a subject report.
export function indexHealth(index={},now=Date.now()){
  const sources=preparedIds.map(id=>{
    const source=(index.sources||[]).find(s=>s.id===id)||{id};
    const verified=Date.parse(source.verifiedAt||source.retrievedAt),age=now-verified;
    const ready=source.status==='available'&&source.indexReady!==false&&Number.isFinite(age)&&age>=0&&age<=3600000;
    return {...source,ready};
  });
  return {sources,ready:sources.filter(s=>s.ready).length,total:preparedIds.length,refreshing:sources.filter(s=>s.refreshing).length};
}
export function recoveredSources(job,index,now=Date.now()){
  if(!job||job.status==='running')return [];
  const ready=new Set(indexHealth(index,now).sources.filter(s=>s.ready).map(s=>s.id));
  return (job.officialChecks||[]).filter(s=>incomplete.has(s.status)&&ready.has(s.id)).map(s=>s.id);
}
export async function requestSourceIndex(ctx={},refresh=false,sourceIds){
  if(ctx.screeningIndexRequest)return ctx.screeningIndexRequest(refresh,sourceIds);
  if(!refresh&&ctx.loadScreeningData)return ctx.loadScreeningData();
  const response=await fetch('/api/screening/index'+(refresh?'/refresh':''),{
    cache:'no-store',signal:globalThis.AbortSignal?.timeout?.(12000),
    ...(refresh?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sourceIds?{sourceIds}:{})}:{})
  });
  const value=await response.json();
  if(!response.ok)throw new Error(value.error||'Live source availability could not be checked. Saved evidence is unchanged.');
  return value;
}
export function sourceHealthHTML(source){
  if(!source)return '<p>Live availability is not known.</p>';
  const health=source.refreshHealth||{},failure=source.refreshFailure;
  const label=source.ready?(source.refreshing?'Ready for screening · refreshing in background':'Ready for screening'):source.refreshing?'Refreshing · not ready':'Not ready · coverage incomplete';
  return `<div class="sc-source-health ${source.ready?'ready':'attention'}"><strong>${e(label)}</strong><dl><div><dt>Last verified</dt><dd>${e(formatDate(source.verifiedAt||source.retrievedAt,true))}</dd></div>${health.nextRefreshAt?`<div><dt>Next refresh</dt><dd>${e(formatDate(health.nextRefreshAt,true))}</dd></div>`:''}${Number.isFinite(health.lastDurationMs)?`<div><dt>Last refresh duration</dt><dd>${(health.lastDurationMs/1000).toFixed(1)}s</dd></div>`:''}</dl>${failure?`<p>${e(failure.error||'The last refresh failed.')}</p>`:''}${health.recentEvents?.length?`<details><summary>Recent refresh activity</summary><ol>${health.recentEvents.slice(-5).reverse().map(event=>`<li>${e(formatDate(event.attemptedAt||event.at,true))} · ${e(event.status||event.outcome||'Refresh')}${(event.category||event.diagnostic?.category)?` · ${e(event.category||event.diagnostic.category)}`:''}</li>`).join('')}</ol></details>`:''}<small>Live list availability does not change a saved report. Retry a failed check to create updated evidence.</small></div>`;
}
export function mountSourceRecovery(container,{ctx={},getJob=()=>null,onRetry=()=>{},onInspect=()=>{},start=false}={}){
  let active=true,timer=null,index=null,requestSequence=0;
  async function update(){
    clearTimeout(timer);
    if(!active)return;
    // A retry can request a fresh status while the background read is pending.
    // Only the newest request may paint availability or schedule another poll.
    const sequence=++requestSequence;
    try{
      const next=await requestSourceIndex(ctx);if(!active||sequence!==requestSequence)return;index=next;
      const health=indexHealth(index),job=getJob(),recovered=recoveredSources(job,index);
      const message=recovered.length?`${recovered.length} previously incomplete ${recovered.length===1?'list is':'lists are'} ready to retry.`:start&&health.ready<health.total?`${health.ready}/${health.total} prepared lists ready. ${health.refreshing?'Lists are refreshing.':'Some sources need attention.'}`:'';
      container.hidden=!message;
      container.innerHTML=message?`<div class="sc-source-recovery" role="status"><span><strong>${e(message)}</strong><small>${recovered.length?'Your saved result remains incomplete until those checks are retried.':'Unavailable lists will remain incomplete; they cannot rule out matches.'}</small></span><button class="sc-quiet-button" data-health-action>${recovered.length?'Retry ready checks':'View sources'}</button></div>`:'';
      container.querySelector('[data-health-action]')?.addEventListener('click',async event=>{
        if(!active)return;
        const current=recoveredSources(getJob(),index);
        if(recovered.length&&!current.length){void update();return;}
        const button=event.currentTarget;button.disabled=true;
        try{await (current.length?onRetry(current):onInspect());}
        catch(error){if(active)ctx.toast?.(error.message||'The checks could not be retried.');}
        finally{if(active){button.disabled=false;void update();}}
      });
    }catch{if(active&&sequence===requestSequence){container.hidden=false;container.innerHTML='<p class="sc-source-recovery" role="status">Live source availability is unavailable. Saved results have not changed.</p>';}}
    if(active&&sequence===requestSequence)timer=setTimeout(update,30000);
  }
  void update();
  return ()=>{active=false;clearTimeout(timer);};
}
