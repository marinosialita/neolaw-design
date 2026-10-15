import {escape as e,icon} from '../core.js';

export function openScreeningConnections(ctx,{research,provider}){
  return ctx.modal({title:'Connections',body:`<div class="sc-connections"><p class="sc-connections-intro">Manage your screening services.</p>${[
    ['openai','sparkles','OpenAI','Deep search & report chat'],
    ['opensanctions','shield','OpenSanctions','Sanctions, PEP & watchlists']
  ].map(([id,symbol,name,description])=>`<section class="sc-connection-service" data-connection="${id}"><span class="sc-connection-symbol">${icon(symbol,21)}</span><div><h3>${name}</h3><p>${description}</p><span class="sc-connection-state" role="status">Checking…</span></div><button type="button" data-connection-open="${id}" disabled>Connect ${icon('chevron',13)}</button></section>`).join('')}<p class="sc-connections-footnote">${icon('lock',12)} Keys stay in this local server’s memory.</p></div>`,onMount(root,close){
    root.classList.add('sc-connections-modal');
    const controllers={openai:research,opensanctions:provider};
    async function refresh(id){
      const row=root.querySelector(`[data-connection="${id}"]`),button=row.querySelector('button'),state=row.querySelector('[role="status"]');
      button.disabled=true;state.textContent='Checking…';
      let status;try{status=await controllers[id]?.refreshConnection?.();}catch(error){status={error:error.message};}
      if(!root.isConnected)return;
      const failed=!status||status.error;
      state.textContent=failed?'Connection unavailable':status.configured?'Connected':'Not connected';
      state.classList.toggle('is-connected',!!status?.configured&&!failed);
      button.innerHTML=`${failed?'Retry':status.configured?'Manage':'Connect'} ${icon('chevron',13)}`;button.disabled=false;
      button.onclick=failed?()=>refresh(id):()=>{close();controllers[id]?.openConnection?.();};
    }
    refresh('openai');refresh('opensanctions');
  }});
}
