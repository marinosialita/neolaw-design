import {escape as e,icon} from '../core.js';

// Only this report is sent to the local service. Office notes, files, photos,
// review free-text and all other saved reports are deliberately left out.
export function chatReport(report={}){
  return {id:report.id,createdAt:report.createdAt,query:{...report.query},matches:report.matches||[],sourceSnapshots:report.sourceSnapshots||[],
    research:report.research||null,decisions:Object.fromEntries(Object.entries(report.decisions||{}).map(([id,d])=>[id,{status:d.status,at:d.at}]))};
}
export async function requestChat(path,{body,signal,onWaiting=()=>{}}){
  const deadline=Date.now()+60000;
  while(true){
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    let value;try{value=await response.json();}catch{throw Error('The answer could not be read. Please try again.');}
    // A busy-slot rejection has not reached the model. Wait for the slot;
    // never retry an accepted provider request or any other kind of error.
    if(response.status===409&&value.error==='Another screening answer is still finishing. Please retry shortly.'&&Date.now()<deadline){
      onWaiting(true);
      await new Promise((resolve,reject)=>{
        const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(new DOMException('Stopped','AbortError'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},1800);
        signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
      });
      continue;
    }
    onWaiting(false);
    if(!response.ok){const error=Error(value.error||'The answer could not be prepared. Please try again.');error.status=response.status;throw error;}
    return value;
  }
}
function suggestedQuestions(report={}){
  const research=report.research||{},questions=['Give me a complete reviewer brief','What should I verify next?'];
  const candidates=research.opensanctions?.candidates||[];
  if((report.matches||[]).length||candidates.length)questions.splice(1,0,'Explain the strongest candidate match');
  if(candidates.some(candidate=>JSON.stringify([candidate.categories,candidate.topics,candidate.datasets,candidate.positions]).toLowerCase().includes('pep')))questions.push('Why is this candidate shown as a PEP?');
  if((research.phases||[]).some(phase=>phase.id==='media'&&phase.status!=='not_run'))questions.push('Separate the media allegations, proceedings and findings');
  if((research.phases||[]).some(phase=>phase.id==='ownership'&&phase.status!=='not_run')||candidates.some(candidate=>candidate.relationships))questions.push('Explain the ownership and public connections');
  return [...new Set(questions)].slice(0,5);
}
function answerText(answer={}){
  return answer.message||(answer.points||[]).map(point=>`${point.heading?point.heading+': ':''}${point.text}`).join('\n');
}
function continuationQuestions(report={},answer={}){
  const topics=(answer.points||[]).map(point=>`${point.heading||''} ${point.text||''}`).join(' ').toLowerCase(),questions=[];
  if(/identity|candidate|match/.test(topics))questions.push('Which identifiers support or conflict with the candidate?');
  if(/sanction|pep|politically exposed/.test(topics))questions.push('Does the report record a current sanctions designation?');
  if(/media|allegation|proceeding|litigation|investigat/.test(topics))questions.push('Which reported matters have a final outcome?');
  if(/ownership|connection|affiliate|company/.test(topics))questions.push('Which connections are directly supported by public filings?');
  questions.push('What should the reviewer verify next?');
  return [...new Set(questions)].slice(0,3);
}
export function mountScreeningChat(host,{getReport,trigger,sessions=new Map(),request=requestChat,onOpen=()=>{},onEvidence=()=>{},onConnect=()=>{}}){
  let alive=true,opened=false,controller=null,serial=0,state,key,reportId;
  function sync(){
    const report=chatReport(getReport()),next=JSON.stringify(report);
    if(next===key)return report;
    const previous=state;
    serial++;controller?.abort();controller=null;key=next;reportId=report.id;
    state=sessions.get(reportId);
    if(!state||state.key!==key){state={key,messages:[],draft:'',notice:previous?.messages.length&&reportId===previous.id?'The report changed. Ask again using the updated evidence.':'',id:reportId};sessions.set(reportId,state);}
    state.busy=false;
    if(sessions.size>12)sessions.delete(sessions.keys().next().value);
    return report;
  }
  function hide(focus=false){opened=false;host.hidden=true;trigger?.setAttribute('aria-expanded','false');if(focus)trigger?.focus({preventScroll:true});}
  function draw(){
    if(!alive)return;
    const refs=[];
    host.hidden=!opened;
    const report=getReport(),welcome=suggestedQuestions(report),latestAnswer=[...state.messages].reverse().find(message=>message.role==='assistant')?.answer,followUps=continuationQuestions(report,latestAnswer);
    host.innerHTML=`<header class="sc-ask-head"><span class="sc-ask-mark">${icon('sparkles',16)}</span><div><h2>Screening analyst</h2><span>${e(report?.query?.name||'Current report')}</span></div><button class="icon-btn" data-ask-clear aria-label="Start new screening conversation" title="New conversation" ${state.busy?'disabled':''}>${icon('plus',16)}</button><button class="icon-btn" data-ask-close aria-label="Close screening chat">${icon('x',17)}</button></header>
      <div class="sc-ask-thread" role="log" aria-label="Screening conversation" aria-live="polite" aria-busy="${!!state.busy}">
      ${!state.messages.length?`<div class="sc-ask-welcome"><span>REPORT ANALYST</span><h3>Ask the report, not the web</h3><p>Review identity, sanctions, PEP status, media, connections, gaps and next actions.</p><div>${welcome.map(q=>`<button data-ask-suggestion="${e(q)}">${e(q)} ${icon('arrow',13)}</button>`).join('')}</div></div>`:state.messages.map(message=>message.role==='user'?`<div class="sc-ask-user">${e(message.text)}</div>`:`<article class="sc-ask-answer"><small>NEOLAW · REPORT EVIDENCE</small>${message.answer.status==='not_in_report'?`<p>${e(message.answer.message)}</p>`:(message.answer.points||[]).map(p=>`<section class="sc-ask-point"><h4>${e(p.heading||'Finding')}</h4><p>${e(p.text)}</p><div class="sc-ask-citations">${(p.evidence||[]).map(ref=>{const index=refs.push(ref)-1;return `<button data-ask-evidence="${index}" title="${e(ref.quote)}">${icon('file',12)}${e(ref.title)}</button>`;}).join('')}</div></section>`).join('')}</article>`).join('')}
      ${!state.busy&&state.messages.at(-1)?.role==='assistant'&&followUps.length?`<div class="sc-ask-followups"><span>Continue the review</span>${followUps.map(q=>`<button data-ask-suggestion="${e(q)}">${e(q)} ${icon('arrow',12)}</button>`).join('')}</div>`:''}
      ${state.busy?`<p class="sc-ask-thinking" role="status"><i></i>${state.waiting?'Waiting for your report answer…':'Reading this report…'}</p>`:''}
      ${state.notice?`<div class="sc-ask-notice" role="status">${e(state.notice)}${state.needsConnection?'<button type="button" data-ask-connect>Connect OpenAI</button>':''}</div>`:''}</div>
      <form class="sc-ask-compose"><label class="sc-profile-sr-only" for="sc-ask-question">Question about this screening</label><textarea id="sc-ask-question" rows="2" maxlength="1600" placeholder="Ask about this result…" ${state.busy?'disabled':''}>${e(state.draft)}</textarea><div><span>This report only · No web search</span>${state.busy?`<button type="button" data-ask-stop aria-label="Stop waiting for answer"><span class="sc-ask-stop-icon" aria-hidden="true"></span></button>`:`<button type="submit" aria-label="Send screening question" ${!state.draft.trim()?'disabled':''}>${icon('arrow',16)}</button>`}</div></form><details class="sc-ask-privacy"><summary>What is shared?</summary><p>Your question and this report’s screening evidence go to the connected OpenAI Luna model. Stored passport values are redacted. Office notes, files and other reports are not added. This conversation stays in page memory and is separate from the report. AI explanations still need review.</p></details>`;
    host.querySelector('[data-ask-close]').onclick=()=>hide(true);
    host.querySelector('[data-ask-clear]').onclick=()=>{serial++;controller?.abort();state.messages=[];state.draft='';state.notice='';state.needsConnection=false;state.busy=false;draw();host.querySelector('textarea')?.focus({preventScroll:true});};
    host.querySelector('[data-ask-connect]')?.addEventListener('click',()=>{hide();onConnect();});
    const input=host.querySelector('textarea');
    input.oninput=()=>{state.draft=input.value;host.querySelector('[type="submit"]').disabled=!input.value.trim();};
    input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();send();}};
    host.querySelector('form').onsubmit=event=>{event.preventDefault();send();};
    host.querySelectorAll('[data-ask-suggestion]').forEach(button=>button.onclick=()=>{state.draft=button.dataset.askSuggestion;send();});
    host.querySelectorAll('[data-ask-evidence]').forEach(button=>button.onclick=()=>{hide();onEvidence(refs[Number(button.dataset.askEvidence)]);});
    host.querySelector('[data-ask-stop]')?.addEventListener('click',()=>{serial++;controller?.abort();controller=null;state.busy=false;state.notice='Stopped waiting. The provider request may still finish and incur usage.';draw();});
    const thread=host.querySelector('.sc-ask-thread'),answers=host.querySelectorAll('.sc-ask-answer'),latest=answers[answers.length-1];thread.scrollTop=!state.busy&&state.messages.at(-1)?.role==='assistant'&&latest?Math.max(0,(latest.offsetTop||0)-16):thread.scrollHeight;
  }
  async function send(){
    const draft=state.draft.trim();if(state.busy||!draft)return;
    const report=sync();state.draft=draft;
    if(!report?.id){state.notice='Open a screening result first.';draw();return;}
    const history=state.messages.filter(m=>!m.failed).slice(-8).map(m=>({role:m.role,text:m.role==='user'?m.text:answerText(m.answer)}));
    const requestId=++serial,snapshotKey=key,requestState=state;
    const questionMessage={role:'user',text:draft};state.messages.push(questionMessage);state.draft='';state.notice='';state.needsConnection=false;state.waiting=false;state.busy=true;
    controller=new AbortController();const abort=controller,timer=setTimeout(()=>abort.abort(),130000);draw();
    try{
      const answer=await request('/api/screening/chat',{body:{report,question:draft,history},signal:abort.signal,onWaiting:waiting=>{if(alive&&requestId===serial&&state.waiting!==waiting){state.waiting=waiting;draw();}}});
      if(!alive||requestId!==serial)return;
      if(JSON.stringify(chatReport(getReport()))!==snapshotKey){sync();draw();return;}
      if(answer.reportId!==report.id||!['answered','not_in_report'].includes(answer.status))throw Error('The answer did not belong to this screening. Please ask again.');
      state.messages.push({role:'assistant',answer});
    }catch(error){questionMessage.failed=true;if(alive&&requestId===serial){state.needsConnection=error.status===401;state.notice=error.name==='AbortError'?'The answer timed out. Try again; the report is unchanged.':error.message||'The answer could not be prepared.';state.draft=draft;}}
    finally{clearTimeout(timer);requestState.busy=false;if(alive&&requestId===serial){controller=null;draw();host.querySelector('textarea')?.focus({preventScroll:true});}}
  }
  function open(focus=true){sync();onOpen();opened=true;trigger?.setAttribute('aria-expanded','true');draw();if(focus)host.querySelector('textarea')?.focus({preventScroll:true});}
  function keydown(event){if(event.key==='Escape'&&opened){event.preventDefault();event.stopPropagation();hide(true);}}
  host.addEventListener('keydown',keydown);sync();draw();
  return {open,toggle:()=>opened?hide(true):open(),hide,update:()=>{const before=key;sync();if(before!==key)draw();},destroy:()=>{alive=false;serial++;controller?.abort();if(state)state.busy=false;host.removeEventListener('keydown',keydown);host.innerHTML='';}};
}
