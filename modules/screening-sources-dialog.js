import {escape as e,icon} from '../core.js';
import {officialPortals,sourceMarks,formatDate,safeURL} from './screening-view-model.js';
import {indexHealth,requestSourceIndex,sourceHealthHTML} from './screening-health.js';

const descriptions={
  eu:['Financial sanctions','EU financial-sanctions names and published identifying details.'],
  ofac:['Sanctions','U.S. Treasury OFAC sanctions records and identifying details.'],
  un:['Sanctions','United Nations Security Council consolidated sanctions list.'],
  uk:['Sanctions','UK sanctions designations and published identifying details.'],
  cy:['Sanctions & export controls','Cyprus Stratlink portal records, including overlapping sanctions and export-control entries.'],
  bis:['Export controls','BIS Entity, Denied Persons, Unverified and Military End User lists via the official Consolidated Screening List download.'],
  au:['Sanctions','Australia DFAT consolidated sanctions list.'],
  ca:['Autonomous sanctions','Canada’s consolidated autonomous sanctions records.'],
  ch:['Sanctions','Swiss SECO sanctions records and published identifiers.']
};
const additional=[
  {id:'worldbank',name:'World Bank',mark:'WB',url:'https://documents.worldbank.org/en/projects-operations/procurement/debarred-firms',category:'Procurement debarment',description:'Table 1 debarred and cross-debarred firms and individuals.',method:'Public list checked in every search.',limit:'Table 2 other sanctions and a complete search of controlled affiliates are not included. Procurement restrictions are separate from sanctions.',access:'No API key'},
  {id:'gleif',name:'GLEIF',mark:'LEI',url:'https://www.gleif.org/en/lei-data/gleif-api/',category:'Company identity',description:'Legal Entity Identifier records, registration details and available parent references.',method:'Company searches query the GLEIF API.',limit:'LEI records and accounting-consolidation parent references do not establish complete beneficial ownership.',access:'No API key'},
  {id:'opensanctions',name:'OpenSanctions',mark:'OS',url:'https://www.opensanctions.org/',category:'Additional screening',description:'Sanctions, PEP and other watchlist candidates from the connected collection.',method:'Included in searches when connected. Provider credits apply.',limit:'Provider matches need identity review. The connected collection is not a guarantee of comprehensive PEP or adverse-media coverage.',access:'API key required'}
];

export function openSourcesDialog(ctx,{sources=[],focusId,canReload=false,onReload=()=>{}}={}){
  const items=[...officialPortals.map(p=>({...p,mark:sourceMarks[p.id],category:descriptions[p.id][0],description:descriptions[p.id][1],method:p.id==='cy'?'The supplied name is queried in the live Cyprus portal.':'The publisher dataset is verified or refreshed, then searched locally.',limit:p.id==='bis'?'Export-control restrictions are separate from asset freezes. Review the current entry and applicable controls.':p.id==='cy'?'Records can overlap other lists. Related entities and similar names require separate identity review.':'A possible name match requires identifier comparison. No name matches is not clearance.',access:'No API key'})),...additional];
  let selected=items.some(s=>s.id===focusId)?focusId:'eu',liveIndex=null,healthError='',refreshing=false,refreshMessage='',refreshUntil=0;
  const row=s=>`<button type="button" data-source-select="${e(s.id)}" aria-pressed="${s.id===selected}"><span class="sc-source-token-mark">${e(s.mark)}</span><span>${e(s.name)}</span>${icon('chevron',12)}</button>`;
  return ctx.modal({title:'Screening sources',body:`<div class="sc-source-library"><nav class="sc-source-library-nav" aria-label="Screening source library"><h3>Official checks <span>${officialPortals.length}</span></h3>${items.slice(0,officialPortals.length).map(row).join('')}<h3>Additional sources <span>${additional.length}</span></h3>${additional.map(row).join('')}</nav><section class="sc-source-library-detail" data-source-detail aria-live="polite"></section></div><footer class="sc-source-library-footer"><span>Coverage and methods. Your result keeps each check’s receipt.</span>${canReload?`<button type="button" data-sc-reload>${icon('history',13)}Reload snapshots</button>`:''}</footer>`,onMount(root,close){
    root.classList.add('sc-source-library-modal');
    async function loadHealth(refresh=false){
      if(!root.isConnected)return;
      refreshing=true;healthError='';draw();
      try{liveIndex=await requestSourceIndex({...ctx,loadScreeningData:undefined},refresh);if(refresh){const request=liveIndex.refreshRequest;refreshMessage=request?.rateLimited?.length?'A refresh was recently requested. Wait a minute before requesting again.':request?.accepted?'Public-list refresh requested. Status will update here.':'Public-list refresh is already in progress.';refreshUntil=request?.accepted||request?.alreadyRefreshing?.length?Date.now()+120000:0;}}catch(error){healthError=error.message;}
      if(!root.isConnected)return;
      refreshing=false;draw();
      if(refresh||(Date.now()<refreshUntil&&indexHealth(liveIndex||{}).refreshing))setTimeout(()=>{if(root.isConnected)void loadHealth();},1500);else if(refreshUntil&&!healthError){refreshUntil=0;refreshMessage=indexHealth(liveIndex||{}).refreshing?'Refresh continues in the background. Check status for the latest receipt.':'Refresh finished. Review each source’s latest receipt.';draw();}
    }
    function draw(){
      const healthOpen=root.querySelector('.sc-live-source')?.open;
      const item=items.find(s=>s.id===selected),snapshot=sources.find(s=>s.id===selected),url=safeURL(item.url);
      const snapshotDetails=snapshot?`<details class="sc-source-snapshot"><summary>Saved snapshot details ${icon('chevron-down',13)}</summary><p>This is stored source data, not a new subject check.</p><dl><div><dt>Status</dt><dd>${snapshot.status==='available'?'Stored snapshot':'Snapshot unavailable'}</dd></div><div><dt>Records</dt><dd>${Number.isSafeInteger(snapshot.recordCount)?e(snapshot.recordCount.toLocaleString('en-GB')):'Not supplied'}</dd></div><div><dt>Retrieved</dt><dd>${e(formatDate(snapshot.retrievedAt,true))}</dd></div><div><dt>Published / updated</dt><dd>${e(formatDate(snapshot.publishedAt))}</dd></div></dl>${snapshot.error?`<p class="sc-source-snapshot-error">${e(snapshot.error)}</p>`:''}</details>`:'';
      root.querySelector('[data-source-detail]').innerHTML=`<div class="sc-source-detail-heading"><span class="sc-source-detail-mark">${e(item.mark)}</span><span>${e(item.category)}</span></div><h3>${e(item.name)}</h3><p class="sc-source-library-description">${e(item.description)}</p><div class="sc-source-method"><span>How it is checked</span><p>${e(item.method)}</p><small>${e(item.access)}</small></div>${url?`<a class="sc-source-website" href="${e(url)}" target="_blank" rel="noopener noreferrer">${selected==='opensanctions'?'Open provider website':'Open official website'} ${icon('external',14)}</a>`:''}<div class="sc-source-library-limit">${icon('info',14)}<p>${e(item.limit)}</p></div>${snapshotDetails}`;
      if(!['cy',...additional.map(s=>s.id)].includes(selected)){
        const detail=root.querySelector('[data-source-detail]');
        const live=liveIndex&&!healthError&&indexHealth(liveIndex).sources.find(s=>s.id===selected),ready=live?.ready;
        detail.querySelector('.sc-source-method').insertAdjacentHTML('beforebegin',`<details class="sc-live-source"><summary>Live availability <strong>${healthError?'Unknown':refreshing?'Checking…':live?.refreshing?'Refreshing':ready?'Ready':'Needs attention'}</strong></summary>${healthError?'<p>Live availability is not known. Check status again.</p>':liveIndex?sourceHealthHTML(indexHealth(liveIndex).sources.find(s=>s.id===selected)):'<p>Checking source availability…</p>'}${healthError?`<p role="alert">${e(healthError)}</p>`:''}${refreshMessage?`<p role="status">${e(refreshMessage)}</p>`:''}<div class="sc-source-health-actions"><button class="btn small" data-source-health-refresh ${refreshing?'disabled':''}>${refreshing?'Checking…':'Refresh lists'}</button><button class="btn small" data-source-health-status ${refreshing?'disabled':''}>Check status</button></div><small>Public lists only. No paid providers or subject searches are run.</small></details>`);
        root.querySelector('.sc-live-source').open=!!healthOpen;
        root.querySelector('[data-source-health-refresh]').onclick=()=>loadHealth(true);
        root.querySelector('[data-source-health-status]').onclick=()=>loadHealth();
      }
      root.querySelectorAll('[data-source-select]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.sourceSelect===selected)));
    }
    root.querySelectorAll('[data-source-select]').forEach(button=>button.onclick=()=>{selected=button.dataset.sourceSelect;draw();});
    root.querySelector('[data-sc-reload]')?.addEventListener('click',()=>{close();onReload();});draw();void loadHealth();
  }});
}
