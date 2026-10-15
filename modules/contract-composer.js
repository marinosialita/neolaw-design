import {escape as esc,icon} from '../core.js';

export function mountContractChip(slot,contract,onRemove){
  slot.hidden=!contract;
  slot.innerHTML=contract?`<div class="contract-command"><button type="button" class="contract-command-label" aria-label="${esc(contract.title)} · @${esc(contract.kind)} — information" aria-expanded="false"><span aria-hidden="true">@</span><span>${esc(contract.title)}</span></button><button type="button" class="contract-command-remove" aria-label="Remove @${esc(contract.kind)}" title="Remove the agreement">${icon('x',13)}</button></div><div class="contract-command-info" role="note" hidden><strong>${esc(contract.title)}</strong><span>${esc(contract.description)}</span></div>`:'';
  if(!contract)return;
  const trigger=slot.querySelector('.contract-command-label'),info=slot.querySelector('.contract-command-info');
  trigger.onclick=()=>{info.hidden=!info.hidden;trigger.setAttribute('aria-expanded',String(!info.hidden))};
  slot.onkeydown=event=>{if(event.key==='Escape'&&!info.hidden){info.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus()}};
  slot.querySelector('.contract-command-remove').onclick=onRemove;
}
