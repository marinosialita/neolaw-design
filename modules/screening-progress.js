import {escape as e, icon} from '../core.js';

const unfinished = status => ['pending','running'].includes(status);
const duration = ms => {const s=Math.max(0,Math.floor(ms/1000));return s<60?`${s}s`:`${Math.floor(s/60)}m ${s%60}s`;};
const phaseNames = {identity:'identity & official records',media:'media & proceedings',ownership:'ownership & public roles'};

// Completion counts describe received checks, never a risk score or clearance.
export function screeningActivity(job, transport={}, now=Date.now(), expectedSources=9){
  const running=job?.status==='running', starting=transport.starting&&!job;
  if(!running&&!starting)return null;
  const official=job?.officialChecks||[], additional=['opensanctions','worldbank','gleif'].map(id=>({id,...job?.[id]})).filter(c=>c.status&&!['not_configured','not_applicable'].includes(c.status)), phases=job?.phases||[];
  const groups=[['Official lists',official,Math.max(official.length,expectedSources)],['Additional checks',additional,additional.length],['Web research',phases,phases.length]].filter(([, ,total])=>total).map(([label,items,total])=>({label,total,complete:items.filter(c=>c.status==='completed').length,issues:items.filter(c=>c.status&&!unfinished(c.status)&&c.status!=='completed').length}));
  const current=[...official.filter(c=>c.status==='running').map(c=>c.name||c.id),...additional.filter(c=>c.status==='running').map(c=>({opensanctions:'OpenSanctions',worldbank:'World Bank',gleif:'GLEIF'}[c.id]))];
  if(job?.opensanctions?.relationshipStatus==='running')current.push('provider relationships');
  if(job?.opensanctions?.profileStatus==='running')current.push('provider profile sources');
  const phase=phases.find(p=>p.status==='running');
  const age=transport.lastChangeAt?now-transport.lastChangeAt:0, contactAge=transport.lastContactAt?now-transport.lastContactAt:null;
  const disconnected=transport.state==='interrupted'||contactAge!==null&&contactAge>15000;
  let title=starting?'Starting search':phase?`Researching ${phaseNames[phase.id]||phase.title||'public sources'}`:current.length?`Checking ${current.slice(0,2).join(' + ')}${current.length>2?` + ${current.length-2} more`:''}`:'Preparing the next checks';
  let health=transport.lastContactAt?`Server responded ${duration(contactAge)} ago`:'Connecting to search updates…';
  if(disconnected){title='Search updates interrupted';health=transport.retrying?'Trying to reconnect · saved results are safe':'Reconnect to check the run · saved results are safe';}
  else if(age>=90000){health=`No new result for ${duration(age)} · ${transport.lastContactAt?'server responding':'checking connection'}`;}
  else if(transport.lastChangeAt&&age>=1000){health+=` · last result ${duration(age)} ago`;}
  if(transport.cancelling)title='Stopping search…';
  if(!disconnected&&!transport.cancelling&&job?.timing?.preparedChecksMs!==undefined){
    const seconds=(job.timing.preparedChecksMs/1000).toFixed(2);
    const ready=official.filter(c=>c.id!=='cy'&&c.status==='completed').length;
    health=`${ready}/8 prepared lists checked in ${seconds}s · ${health}`;
    if(ready)title=phase?`Initial results ready · ${phaseNames[phase.id]||'research'} in progress`:'Initial results ready · live checks continue';
  }
  const started=Date.parse(job?.startedAt)||transport.startedAt||now;
  return {title,health,elapsed:duration(now-started),groups,disconnected,waiting:age>=90000,canRetry:disconnected&&!transport.retrying,cancelling:!!transport.cancelling};
}

export function mountScreeningProgress(host,{getJob,expectedSources=9,onInspect=()=>{},onRetry=()=>{}}){
  let transport={},signature='',active=true;
  function draw(){
    if(!active)return;
    const value=screeningActivity(getJob(),transport,Date.now(),expectedSources);
    host.hidden=!value;
    if(!value){host.innerHTML='';signature='';return;}
    const next=JSON.stringify([value.title,value.groups,value.disconnected,value.waiting,value.canRetry,value.cancelling]);
    if(next!==signature){
      signature=next;
      host.innerHTML=`<section class="sc-search-live ${value.disconnected?'is-disconnected':''}" aria-label="Live search progress"><span class="sc-search-spinner" aria-hidden="true"></span><div class="sc-search-live-main"><div class="sc-search-live-title"><strong role="status" aria-live="polite">${e(value.title)}</strong><span data-sc-search-elapsed></span></div><div class="sc-search-counts">${value.groups.map(g=>`<span>${e(g.label)} <b>${g.complete}/${g.total}</b>${g.issues?` <em>${g.issues} incomplete</em>`:''}</span>`).join('')}</div><p data-sc-search-health></p></div><div class="sc-search-live-actions">${value.canRetry?'<button type="button" data-sc-retry-updates>Reconnect</button>':''}<button type="button" data-sc-progress-details aria-label="View search progress details">Details ${icon('chevron',12)}</button></div></section>`;
      host.querySelector('[data-sc-progress-details]').onclick=onInspect;
      host.querySelector('[data-sc-retry-updates]')?.addEventListener('click',onRetry);
    }
    host.querySelector('[data-sc-search-elapsed]').textContent=value.elapsed;
    host.querySelector('[data-sc-search-health]').textContent=value.health;
  }
  const timer=setInterval(draw,1000);draw();
  return {update:next=>{transport=next;draw();},destroy:()=>{active=false;clearInterval(timer);host.innerHTML='';}};
}
