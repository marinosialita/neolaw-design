import {escape as esc,icon,storage,prefersReducedMotion} from '../core.js';
import {contractItems} from './contract-library.js';
import {ndaParagraphs} from './nda-demo-document.js';
import {ndaDemoResponse} from './nda-demo-response.js';
import {CONTRACT_REVEAL_MS,CONTRACT_REVEAL_EXIT_MS,CONTRACT_PAGE_SETTLE_MS,contractRevealMarkup} from './contract-reveal.js';

// The five questions observed in the MyNomosAI NDA flow on 15 October 2026.
// This is a local presentation, using the supplied reviewed document, with no API calls.
export const ndaQuestions=[
  {id:'disclosure',question:'Will the confidentiality obligations be mutual or one-way?',hint:'Choose who may disclose Confidential Information.',options:['Mutual','One-way: one party discloses','One-way: [Disclosing Party] discloses']},
  {id:'purpose',question:'What is the permitted purpose for disclosure and use?',hint:'This determines the permitted use and authorised representatives.',options:['Evaluating an investment','Evaluating an acquisition','Evaluating a business collaboration','Evaluating or providing services','Other: [purpose]']},
  {id:'duration',question:'How long should confidentiality obligations continue, excluding trade secrets?',hint:'Trade secrets remain protected while they remain trade secrets.',options:['1 year','2 years','3 years','5 years','Indefinitely']},
  {id:'starts',question:'When should the non-trade-secret protection period begin?',hint:'Information disclosed before signing will be covered in all cases.',options:['From each disclosure','From the end of discussions','From termination of the relationship','From signing']},
  {id:'damages',question:'Should the Agreement include a predetermined amount for breach?',hint:'If included, it operates as a ceiling on recoverable damages under section 74 of Cap. 149.',options:['No predetermined amount','Yes: [amount]']}
];

export const newContractDraftState=()=>({phase:'reading',index:0,answers:{},other:{},collapsed:false,visibleChars:0,panelOpen:false,notes:[],revealElapsed:0,openingElapsed:0,pausedFrom:null});
const heading=text=>/^(?:\d+\. )?[Α-ΩΆΈΉΊΌΎΏA-Z\s]+$/u.test(text);
export function documentBlocks(paragraphs,limit=Infinity){
  let remaining=limit;
  return paragraphs.flatMap((text,index)=>{
    if(remaining<=0)return [];
    const shown=text.slice(0,remaining);remaining-=text.length+1;
    const tag=index===0?'h1':heading(text)?'h2':'p';
    return [{tag,text:shown,complete:shown.length===text.length}];
  });
}

export function renderContractDraft(container,ctx,entry){
  const contract=contractItems.find(item=>item.id===entry.contractId)||contractItems.find(item=>item.kind==='nda');
  const isNda=contract.kind==='nda';
  const questions=isNda?ndaQuestions:[
    {id:'parties',question:'Who are the parties to the agreement?',hint:contract.hint,options:['Leave the parties as placeholders']},
    {id:'instructions',question:'What should the first draft cover?',hint:'Add the instructions you would like the agreement to reflect.',options:['Use the instructions in my request','Leave the open terms as placeholders']}
  ];
  let active=true,timer=null,showAll=false,revealStartedAt=null,openingStartedAt=null;
  let state={...newContractDraftState(),...entry.contractDraft};
  if(!['reading','questions','preparing','opening','writing','paused','complete'].includes(state.phase))state=newContractDraftState();
  state.index=Math.max(0,Math.min(questions.length-1,Number(state.index)||0));
  state.answers=state.answers&&typeof state.answers==='object'?state.answers:{};
  state.other=state.other&&typeof state.other==='object'?state.other:{};
  state.notes=Array.isArray(state.notes)?state.notes:[];
  state.revealElapsed=Math.max(0,Math.min(CONTRACT_REVEAL_MS-CONTRACT_REVEAL_EXIT_MS,Number(state.revealElapsed)||0));
  state.openingElapsed=Math.max(0,Math.min(CONTRACT_REVEAL_EXIT_MS+CONTRACT_PAGE_SETTLE_MS,Number(state.openingElapsed)||0));
  const paragraphs=isNda?ndaParagraphs:[contract.title,'PARTIES','[PARTY A] and [PARTY B]','INSTRUCTIONS',entry.prompt||contract.ask,'TERMS TO COMPLETE',contract.hint,'SIGNATURES','[Authorised signatories]'];
  const total=paragraphs.reduce((sum,text)=>sum+text.length+1,0);
  state.visibleChars=Math.min(total,Math.max(0,Number(state.visibleChars)||0));
  const fileTitle=isNda?'Συμφωνία Εμπιστευτικότητας':contract.title;
  const busy=()=>['reading','preparing','opening','writing'].includes(state.phase);
  const answerOf=q=>state.answers[q.id]==='other'?(state.other[q.id]||'').trim():q.options[Number(state.answers[q.id])]||'';
  function save(){
    entry.contractDraft=JSON.parse(JSON.stringify(state));entry.updatedAt=new Date().toISOString();
    const chats=storage.get('chats',[]),next=chats.some(item=>item.id===entry.id)?chats.map(item=>item.id===entry.id?entry:item):[entry,...chats];
    const saved=storage.set('chats',next);
    const note=container.querySelector('.contract-save-note');if(note)note.hidden=saved!==false;
    return saved!==false;
  }
  function later(fn,delay){clearTimeout(timer);timer=setTimeout(()=>{if(active)fn()},delay)}
  function cancelTimer(){clearTimeout(timer);timer=null}
  ctx.setHeader('Prepare a '+contract.title);
  container.innerHTML=`<div class="contract-demo-layout"><section class="contract-conversation" aria-label="Agreement conversation"><header class="contract-chat-heading"><h1>${esc(entry.title||contract.title)}</h1><span class="contract-demo-badge">Presentation</span><button type="button" class="icon-btn" id="restart-contract" aria-label="Restart presentation" title="Restart presentation">${icon('history',16)}</button></header><div class="contract-chat-scroll" id="contract-messages" aria-live="polite"></div><div class="contract-dock"><div id="contract-questions"></div><form class="composer contract-followup" id="contract-followup"><textarea id="contract-followup-text" rows="2" aria-label="Agreement instructions" placeholder="Ask about the agreement…"></textarea><div class="composer-controls"><span class="contract-followup-caption">${icon('file',15)} ${esc(contract.title)}</span><button type="submit" class="send-button" id="contract-send" aria-label="Send instructions">${icon('send',17)}</button></div></form><p class="contract-save-note" role="alert" hidden>Your latest changes could not be saved. Keep this page open and retry.</p><p class="contract-demo-note">Presentation example · ${isNda?'Uses your reviewed NDA':'Agreement outline'}</p></div></section><div class="contract-divider" role="separator" aria-label="Document width" aria-orientation="vertical" tabindex="0" aria-valuemin="35" aria-valuemax="70" aria-valuenow="55" hidden></div><aside class="contract-document" aria-label="Agreement document" hidden><header class="contract-document-toolbar"><span class="contract-word-icon" aria-hidden="true">W</span><div class="contract-document-name"><strong>${esc(fileTitle)}${isNda?'.docx':''}</strong><small>${isNda?'Reviewed example · Greek':'Draft outline'}</small></div><span class="contract-document-status"></span>${isNda?'<a class="contract-word-download" href="assets/nda-reviewed-demo.docx" download="Συμφωνία Εμπιστευτικότητας-reviewed.docx">'+icon('download',14)+' Word</a>':''}<button type="button" class="icon-btn" id="close-contract-document" aria-label="Close document">${icon('panel',16)}</button></header><div class="contract-document-stage"><div class="contract-reveal" role="status" aria-label="Preparing your agreement" hidden></div><div class="contract-document-scroll"><article class="contract-document-paper" lang="${isNda?'el':'en'}"></article></div></div><footer class="contract-document-footer"><span class="contract-writing-state" role="status"></span><button type="button" class="contract-show-full" id="contract-show-full">Show full draft</button></footer></aside></div>`;
  const layout=container.querySelector('.contract-demo-layout'),messages=container.querySelector('#contract-messages'),sheet=container.querySelector('#contract-questions');
  const panel=container.querySelector('.contract-document'),paper=container.querySelector('.contract-document-paper'),scroller=container.querySelector('.contract-document-scroll');
  const form=container.querySelector('#contract-followup'),input=container.querySelector('#contract-followup-text'),send=container.querySelector('#contract-send'),divider=container.querySelector('.contract-divider');
  const reveal=container.querySelector('.contract-reveal');
  const inOpening=()=>state.phase==='opening'||(state.phase==='paused'&&state.pausedFrom==='opening');
  const inReveal=()=>state.phase==='preparing'||(state.phase==='paused'&&state.pausedFrom==='preparing')||inOpening();
  function resetReveal(){
    reveal.innerHTML=contractRevealMarkup(contract.title);
    reveal.setAttribute('style',`--reveal-duration:${CONTRACT_REVEAL_MS}ms;--reveal-offset:-${state.revealElapsed}ms;--reveal-exit-duration:${CONTRACT_REVEAL_EXIT_MS}ms;--reveal-exit-offset:-${state.openingElapsed}ms`);
  }
  function recordRevealTime(){
    if(revealStartedAt!==null){state.revealElapsed=Math.min(CONTRACT_REVEAL_MS-CONTRACT_REVEAL_EXIT_MS,state.revealElapsed+Date.now()-revealStartedAt);revealStartedAt=null}
    if(openingStartedAt!==null){state.openingElapsed=Math.min(CONTRACT_REVEAL_EXIT_MS+CONTRACT_PAGE_SETTLE_MS,state.openingElapsed+Date.now()-openingStartedAt);openingStartedAt=null}
  }
  resetReveal();
  let followDocument=true,lastSavedChars=state.visibleChars;
  scroller.addEventListener('scroll',()=>{followDocument=scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop<90});
  function messageHTML(){
    const request=`<article class="contract-message user"><div>${esc(entry.prompt||contract.ask)}</div></article>`;
    if(state.phase==='reading')return request+`<article class="contract-message assistant"><div class="contract-progress"><span class="contract-progress-mark is-active">${icon('sparkles',17)}</span><span>Reading the request…</span></div></article>`;
    const intro=`<article class="contract-message assistant"><div class="contract-progress"><span class="contract-progress-mark">${icon('check',17)}</span><span>Completed</span></div><p>I am preparing a ${esc(contract.title)}.</p></article>`;
    if(state.phase==='questions')return request+intro;
    const answers=questions.filter(q=>answerOf(q));
    const summary=answers.length?`<article class="contract-message user"><dl class="contract-answer-summary">${answers.map(q=>`<dt>${esc(q.question)}</dt><dd>${esc(answerOf(q))}</dd>`).join('')}</dl></article>`:'';
    const status=['preparing','opening'].includes(state.phase)?'Preparing the agreement…':state.phase==='writing'?'Writing the document…':state.phase==='paused'?'Drafting paused':isNda?'Ολοκληρώθηκε':'Draft ready';
    const completed=state.phase==='complete';
    return request+intro+summary+`<article class="contract-message assistant ${completed?'contract-completion':''}"><div class="contract-progress"><span class="contract-progress-mark ${busy()?'is-active':''}">${icon(completed?'check':'file',17)}</span><span>${status}</span></div>${completed?completionHTML():state.phase==='paused'?'<button class="btn small" type="button" id="resume-contract">Resume drafting</button>':''}</article>`+state.notes.map(note=>`<article class="contract-message user"><div>${esc(note)}</div></article><article class="contract-message assistant"><p>Your instruction is noted. ${isNda?'The reviewed NDA':'The outline'} remains the document used in this presentation.</p></article>`).join('');
  }
  function completionHTML(){
    const card=`<button class="contract-document-card" id="open-contract-document"><span class="contract-word-icon">W</span><span><strong>${esc(fileTitle)}${isNda?'.docx':''}</strong><small>${isNda?'Σχέδιο · Άνοιγμα':'Draft · Open beside the chat'}</small></span>${icon('arrow-right',16)}</button>`;
    const response=isNda?`<div class="contract-completion-response" lang="el"><p class="contract-completion-summary">${esc(ndaDemoResponse.summary)}</p><section aria-labelledby="nda-legal-basis"><h2 id="nda-legal-basis">Βάση στον νόμο</h2><ul class="contract-legal-basis">${ndaDemoResponse.legalBasis.map(row=>`<li><strong>${esc(row.article)} · ${esc(row.law)}:</strong> ${esc(row.explanation)} <span class="contract-clause-quote">(«${esc(row.clause)}»)</span></li>`).join('')}</ul></section><section aria-labelledby="nda-drafting-notes"><h2 id="nda-drafting-notes">Σημειώσεις</h2><ul class="contract-drafting-notes">${ndaDemoResponse.notes.map(note=>`<li>${esc(note)}</li>`).join('')}</ul></section><p class="contract-fields-to-complete"><strong>Προς συμπλήρωση:</strong> ${esc(ndaDemoResponse.toComplete)}</p><p class="contract-guide">${icon('book',15)}<span>${esc(ndaDemoResponse.guide)}</span></p></div>`:'<p>Your agreement outline is ready beside the conversation.</p>';
    return card+response+`<div class="contract-complete-actions"><button type="button" id="review-contract-answers">Review answers</button><button type="button" id="replay-contract">Replay drafting</button></div>`;
  }
  function paintMessages(){
    messages.innerHTML=messageHTML();
    messages.querySelector('#open-contract-document')?.addEventListener('click',()=>{state.panelOpen=true;save();paintPanel();panel.querySelector('#close-contract-document').focus()});
    messages.querySelector('#resume-contract')?.addEventListener('click',()=>{
      if(state.pausedFrom==='preparing'){beginReveal();return}
      if(state.pausedFrom==='opening'){beginOpening();return}
      state.phase='writing';state.pausedFrom=null;state.panelOpen=true;save();paint();writeNext();
    });
    messages.querySelector('#review-contract-answers')?.addEventListener('click',()=>{cancelTimer();state.phase='questions';state.index=0;state.panelOpen=false;state.collapsed=false;save();paint();focusQuestion()});
    messages.querySelector('#replay-contract')?.addEventListener('click',startDraft);
    const completion=messages.querySelector('.contract-completion');
    messages.scrollTop=messages.scrollHeight;
    if(completion&&!state.notes.length)requestAnimationFrame(()=>{
      if(active&&completion.isConnected)messages.scrollTop=Math.max(0,(completion.offsetTop||0)-18);
    });
  }
  function focusQuestion(){sheet.querySelector('.contract-question')?.focus({preventScroll:true})}
  function paintQuestions(){
    if(state.phase!=='questions'){sheet.innerHTML='';return}
    const q=questions[state.index],last=state.index===questions.length-1;
    sheet.innerHTML=`<section class="contract-question-sheet ${state.collapsed?'is-collapsed':''}" role="group" aria-label="Questions before drafting"><header><button type="button" class="contract-sheet-icon" id="toggle-contract-questions" aria-label="${state.collapsed?'Show':'Hide'} questions" aria-expanded="${!state.collapsed}">${icon(state.collapsed?'chevron':'chevron-down',15)}</button><span>Questions</span><span class="contract-question-count">${state.index+1} of ${questions.length}</span><button type="button" class="contract-sheet-icon" id="previous-contract-question" aria-label="Previous question" ${state.index===0?'disabled':''}>${icon('chevron-left',15)}</button><button type="button" class="contract-sheet-icon" id="next-contract-question" aria-label="Next question" ${last?'disabled':''}>${icon('chevron',15)}</button><button type="button" class="contract-sheet-icon" id="skip-contract-questions" aria-label="Skip the questions and draft" title="Skip the questions and draft">${icon('x',15)}</button></header>${state.collapsed?'':`<div class="contract-question-body"><p class="contract-question" id="contract-question-title" tabindex="-1">${esc(q.question)}</p><p class="contract-question-hint">${esc(q.hint)}</p><div class="contract-options" role="radiogroup" aria-labelledby="contract-question-title">${q.options.map((option,index)=>`<button type="button" class="contract-option ${state.answers[q.id]===String(index)?'is-on':''}" role="radio" aria-checked="${state.answers[q.id]===String(index)}" data-contract-option="${index}"><span aria-hidden="true"></span>${esc(option)}</button>`).join('')}<button type="button" class="contract-option is-other ${state.answers[q.id]==='other'?'is-on':''}" role="radio" aria-checked="${state.answers[q.id]==='other'}" data-contract-option="other"><span aria-hidden="true"></span>Something else…</button>${state.answers[q.id]==='other'?`<input class="contract-other-answer" aria-label="Write your answer" placeholder="Write your answer" value="${esc(state.other[q.id]||'')}" maxlength="1000">`:''}</div><footer><button type="button" class="contract-question-skip" id="skip-contract-question">Skip</button><button type="button" class="contract-question-go" id="continue-contract-question" ${answerOf(q)?'':'disabled'}>${last?'Draft':'Continue'}</button></footer></div>`}</section>`;
    sheet.querySelector('#toggle-contract-questions').onclick=()=>{state.collapsed=!state.collapsed;save();paintQuestions()};
    const move=delta=>{state.index=Math.max(0,Math.min(questions.length-1,state.index+delta));save();paintQuestions();focusQuestion()};
    sheet.querySelector('#previous-contract-question').onclick=()=>move(-1);
    sheet.querySelector('#next-contract-question').onclick=()=>move(1);
    sheet.querySelector('#skip-contract-questions').onclick=startDraft;
    if(state.collapsed)return;
    const next=()=>last?startDraft():move(1);
    sheet.querySelector('#skip-contract-question').onclick=next;
    sheet.querySelector('#continue-contract-question').onclick=next;
    sheet.querySelectorAll('[data-contract-option]').forEach(button=>{
      button.onclick=()=>{state.answers[q.id]=button.dataset.contractOption;save();paintQuestions();const target=sheet.querySelector(state.answers[q.id]==='other'?'.contract-other-answer':`[data-contract-option="${state.answers[q.id]}"]`);target?.focus({preventScroll:true})};
      button.onkeydown=event=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const current=button.dataset.contractOption==='other'?q.options.length:Number(button.dataset.contractOption);const direction=['ArrowDown','ArrowRight'].includes(event.key)?1:-1;const index=(current+direction+q.options.length+1)%(q.options.length+1);sheet.querySelector(`[data-contract-option="${index===q.options.length?'other':index}"]`)?.click()};
    });
    const other=sheet.querySelector('.contract-other-answer');
    if(other){other.oninput=()=>{state.other[q.id]=other.value;save();sheet.querySelector('#continue-contract-question').disabled=!answerOf(q)};other.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing&&answerOf(q)){event.preventDefault();next()}}}
  }
  function paintPanel(){
    panel.hidden=!state.panelOpen;divider.hidden=!state.panelOpen;layout.classList.toggle('has-document',!!state.panelOpen);
    const revealing=inReveal();
    reveal.hidden=!revealing;scroller.hidden=revealing&&!inOpening();
    reveal.classList.toggle('is-exiting',inOpening());
    scroller.classList.toggle('is-opening',inOpening());
    reveal.classList.toggle('is-paused',state.phase==='paused');
    panel.classList.toggle('is-revealing',revealing);
    const limit=state.phase==='complete'?Infinity:state.visibleChars;
    paper.innerHTML=documentBlocks(paragraphs,limit).map(block=>`<${block.tag}>${esc(block.text)}</${block.tag}>`).join('')+(state.phase==='writing'?'<span class="contract-writing-caret" aria-hidden="true"></span>':'');
    container.querySelector('.contract-document-status').textContent=state.phase==='complete'?'Draft':state.phase==='paused'?'Paused':revealing?'Preparing':'Writing';
    container.querySelector('.contract-writing-state').textContent=state.phase==='complete'?(isNda?'Reviewed NDA · Presentation example':'Presentation outline'):state.phase==='paused'?'Drafting paused':revealing?'Preparing your document…':'NeoLaw is writing…';
    const download=container.querySelector('.contract-word-download');
    if(download){download.setAttribute('aria-disabled',String(state.phase!=='complete'));download.tabIndex=state.phase==='complete'?0:-1;download.onclick=event=>{if(state.phase!=='complete')event.preventDefault()}}
    const shortcut=container.querySelector('#contract-show-full');
    shortcut.hidden=state.phase==='complete';shortcut.textContent=revealing?'Start writing now':'Show full draft';
    if(followDocument&&state.phase==='writing')scroller.scrollTop=scroller.scrollHeight;
  }
  function paintComposer(){
    send.type=busy()?'button':'submit';send.setAttribute('aria-label',busy()?'Stop drafting':'Send instructions');
    send.innerHTML=icon(busy()?'square':'send',17);send.classList.toggle('is-stop',busy());
    send.disabled=!busy()&&!input.value.trim();input.disabled=busy();
    input.placeholder=state.phase==='questions'?'Add any other instructions…':'Ask about the agreement…';
    send.onclick=busy()?()=>{recordRevealTime();cancelTimer();state.pausedFrom=state.phase;state.phase=state.phase==='reading'?'questions':'paused';save();paint()}:null;
  }
  function paint(){paintMessages();paintQuestions();paintPanel();paintComposer()}
  function finish(){
    cancelTimer();revealStartedAt=null;openingStartedAt=null;state.pausedFrom=null;state.phase='complete';state.visibleChars=total;state.panelOpen=true;save();paint();scroller.scrollTop=0;ctx.refreshSidebar?.();
  }
  function writeNext(){
    if(!active||state.phase!=='writing')return;
    if(showAll||prefersReducedMotion())return finish();
    const chunk=Math.min(Math.max(48,Math.ceil(total/210)),Math.max(1,Math.ceil(state.visibleChars/10)));
    state.visibleChars=Math.min(total,state.visibleChars+chunk);
    paintPanel();
    if(state.visibleChars-lastSavedChars>1500){save();lastSavedChars=state.visibleChars}
    if(state.visibleChars>=total)return finish();
    later(writeNext,55);
  }
  function startWriting(){
    cancelTimer();revealStartedAt=null;openingStartedAt=null;state.pausedFrom=null;state.phase='writing';state.panelOpen=true;save();paint();scroller.scrollTop=0;
    if(prefersReducedMotion())finish();else later(writeNext,70);
  }
  function beginOpening(){
    revealStartedAt=null;openingStartedAt=Date.now();state.phase='opening';state.pausedFrom=null;state.panelOpen=true;save();paint();
    later(startWriting,Math.max(0,CONTRACT_REVEAL_EXIT_MS+CONTRACT_PAGE_SETTLE_MS-state.openingElapsed));
  }
  function beginReveal(){
    state.phase='preparing';state.pausedFrom=null;state.panelOpen=true;revealStartedAt=Date.now();save();paint();
    later(prefersReducedMotion()?startWriting:beginOpening,prefersReducedMotion()?0:Math.max(0,CONTRACT_REVEAL_MS-CONTRACT_REVEAL_EXIT_MS-state.revealElapsed));
  }
  function startDraft(){
    cancelTimer();showAll=false;state.visibleChars=0;state.revealElapsed=0;state.openingElapsed=0;lastSavedChars=0;followDocument=true;
    resetReveal();beginReveal();
  }
  container.querySelector('#restart-contract').onclick=()=>{cancelTimer();revealStartedAt=null;openingStartedAt=null;state=newContractDraftState();showAll=false;input.value='';save();paint();later(()=>{state.phase='questions';save();paint();focusQuestion()},prefersReducedMotion()?0:1200)};
  container.querySelector('#close-contract-document').onclick=()=>{state.panelOpen=false;save();paintPanel();messages.querySelector('#open-contract-document')?.focus()};
  container.querySelector('#contract-show-full').onclick=()=>{if(inReveal()){startWriting();return}showAll=true;finish()};
  form.onsubmit=event=>{
    event.preventDefault();const text=input.value.trim();if(!text||busy())return;
    if(state.phase==='questions'){
      const q=questions[state.index];state.answers[q.id]='other';state.other[q.id]=text;input.value='';save();
      if(state.index===questions.length-1)startDraft();else{state.index++;save();paintQuestions();paintComposer();focusQuestion()}
    }else{state.notes.push(text);input.value='';save();paintMessages();paintComposer()}
  };
  input.oninput=paintComposer;
  input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!send.disabled)form.requestSubmit()}};
  const setWidth=value=>{const next=Math.max(35,Math.min(70,value));layout.style.setProperty('--contract-document-width',next+'%');divider.setAttribute('aria-valuenow',String(Math.round(next)))};
  divider.onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();setWidth(Number(divider.getAttribute('aria-valuenow'))+(event.key==='ArrowLeft'?2:-2))};
  divider.onpointerdown=event=>{if(event.button!==0)return;divider.setPointerCapture?.(event.pointerId);const move=event=>{const rect=layout.getBoundingClientRect();setWidth((rect.right-event.clientX)/rect.width*100)};divider.onpointermove=move;divider.onpointerup=()=>{divider.onpointermove=null;divider.onpointerup=null}};
  paint();
  if(state.phase==='reading')later(()=>{state.phase='questions';save();paint();focusQuestion()},prefersReducedMotion()?0:1200);
  else if(state.phase==='preparing')beginReveal();
  else if(state.phase==='opening')beginOpening();
  else if(state.phase==='writing')later(writeNext,80);
  return()=>{active=false;recordRevealTime();cancelTimer();save();divider.onpointermove=null};
}
