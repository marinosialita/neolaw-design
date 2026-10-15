import {icon,escape as esc,storage,toast,modal,download,prefersReducedMotion} from './core.js';
import {CASES} from './modules/case-data.js';
import {workflowDocumentHTML} from './modules/workflow-samples.js';
import {openLibraryDialog} from './modules/library-dialog.js';
import {contractItems} from './modules/contract-library.js';
import {mountContractChip} from './modules/contract-composer.js';
import {renderContractDraft} from './modules/contract-drafting.js';

import {preparedCaseAnswer,mentionedCases,isCaseResearch,isLegacyCaseReference} from './modules/case-research.js';
import {mountCasePanel} from './modules/chat-case-panel.js';
import {messagePlainText,conversationPlainText,documentExportFile} from './modules/chat-export.js';
import {readComposerDraft,writeComposerDraft,clearComposerDraft} from './modules/composer-drafts.js';
import {readResolutionDraft,writeResolutionDraft,clearResolutionDraft} from './modules/resolution-drafts.js';
import {mountResearchProgress} from './modules/research-progress.js';
import {revealAnswer} from './modules/answer-reveal.js';
import {cleanAnswerCopy} from './modules/answer-copy.js';
import {answerBrand} from './modules/answer-brand.js';
import {ARTICLES} from './modules/article-data.js';
import {mountArticlePanel} from './modules/chat-article-panel.js';
const researchAction=(label,prompt)=>`<button class="btn small" data-research-prompt="${esc(prompt)}">${esc(label)} ${icon('arrow-right',13)}</button>`;

const tools=[
 {id:'review',title:'Review a contract',description:'Risks, clauses & recommendations',icon:'shield',question:'What are we reviewing today?',intro:'Bring an agreement. We’ll keep the conversation here and the document beside it.'},
 {id:'edit',title:'Edit a document',description:'Precise changes, in context',icon:'edit',question:'Let’s work on your document.',intro:'Make changes in the conversation. Review each suggestion alongside the original wording.'},
 {id:'resolution',title:'Draft a resolution',description:'From instructions to first draft',icon:'building',question:'What is the board deciding?',intro:'Start with the company and the decision. Your draft will open beside this conversation.'},
 {id:'compare',title:'Compare documents',description:'See what changed & why it matters',icon:'compare',question:'Let’s find what changed.',intro:'Compare two versions side by side, with the changes that matter brought into focus.'},
 {id:'translate',title:'Translate a document',description:'Legal language, carefully carried',icon:'language',question:'Which language do you need?',intro:'Review the source and translation together, in English and Greek.'},
 {id:'pleading',title:'Check a pleading',description:'Structure, consistency & gaps',icon:'checklist',question:'Let’s give your pleading a second look.',intro:'Keep the statement of claim in view while you work through the issues.'}
];
const generic={id:'draft',title:'Draft from your template',icon:'file',question:'Let’s build a useful first draft.',intro:'Start from a document, add the matter details and review the result beside the conversation.'};
function composer(placeholder='Ask a legal question, or bring a document…'){return `<form class="composer" id="chat-form"><div class="contract-command-slot" id="contract-command" hidden></div><div class="attached-files" id="attachments"></div><textarea id="chat-input" aria-label="Message NeoLaw" placeholder="${esc(placeholder)}" rows="2"></textarea><div class="composer-controls"><div class="composer-left"><button class="icon-btn" type="button" id="attach" aria-label="Attach files">${icon('attach',17)}</button><button type="button" class="context-button" id="add-context">${icon('folder',14)}Add context</button></div><div style="display:flex;align-items:center"><button type="button" class="model-button" id="mode-select">${icon('sparkles',13)}Auto${icon('chevron-down',12)}</button><button class="send-button" type="submit" aria-label="Send message" disabled>${icon('send',17)}</button></div></div><input type="file" id="file-input" hidden multiple accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg"></form><p class="composer-contract-note" id="contract-hint" hidden>Add the facts and press Enter. NeoLaw asks what is still open, then writes the agreement.</p>`}
function wireComposer(container,ctx,onSend,draftKey='home'){
 const draft=readComposerDraft(draftKey);let selectedContract=contractItems.find(item=>item.id===draft.contractId)||null;let attachments=draft.attachments,busy=false,reading=false,blocked=false,disposed=false;const form=container.querySelector('#chat-form'),input=container.querySelector('#chat-input');input.value=draft.text;
 const saveDraft=()=>{if(!disposed)writeComposerDraft(draftKey,{text:input.value,attachments,...(selectedContract?{contractId:selectedContract.id}:{})})};
 const resize=()=>{input.style.height='auto';if(input.value)input.style.height=Math.min(input.scrollHeight,180)+'px'};
 const paint=()=>{if(disposed||!form.isConnected)return;form.querySelector('#attachments').innerHTML=attachments.map((f,i)=>`<span class="attached-chip">${icon('file',12)}${esc(f.name)}<button type="button" data-remove="${i}" aria-label="Remove ${esc(f.name)}">${icon('x',12)}</button></span>`).join('');form.querySelector('[type="submit"]').disabled=busy||blocked||reading||(!input.value.trim()&&!attachments.length&&!selectedContract);form.querySelector('#attach').disabled=reading;form.setAttribute('aria-busy',busy||reading)};
 input.oninput=()=>{if(disposed)return;resize();saveDraft();paint()};
 input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();if(!form.querySelector('[type="submit"]').disabled)form.requestSubmit()}};
 form.onsubmit=e=>{e.preventDefault();const text=input.value.trim();if(disposed||busy||blocked||reading||(!text&&!attachments.length&&!selectedContract))return;if(onSend(text,attachments,selectedContract)===false){saveDraft();return}clearComposerDraft(draftKey);selectedContract=null;input.value='';input.style.height='auto';attachments=[];paintContract();paint()};
 form.querySelector('#attach').onclick=()=>form.querySelector('#file-input').click();
 form.querySelector('#file-input').onchange=async e=>{if(disposed||reading)return;const selected=[...e.target.files];reading=true;paint();try{if(selected.length>5-attachments.length)toast('Attach up to 5 files per message.');for(const file of selected.slice(0,5-attachments.length)){if(file.size>50*1024*1024){toast(file.name+' exceeds 50 MB.');continue}const f={name:file.name,size:file.size,type:file.type};try{if(/\.(txt|md)$/i.test(file.name)&&file.size<200000)f.content=await file.text()}catch{if(disposed)return;toast('Could not read '+file.name+'. Please choose it again.');continue}if(disposed||!form.isConnected)return;attachments.push(f);saveDraft()}}finally{reading=false;e.target.value='';paint()}};
 form.querySelector('#attachments').onclick=e=>{if(disposed)return;const b=e.target.closest('[data-remove]');if(b){attachments.splice(Number(b.dataset.remove),1);saveDraft();paint()}};
 form.querySelector('#mode-select').onclick=()=>modal({title:'Response mode',body:`<p>Choose a response mode.</p><div class="options-menu" style="margin-top:14px">${['Auto','Local','Cloud'].map((x,i)=>`<button data-mode="${x}">${icon(i===1?'lock':i===2?'globe':'sparkles',18)}<span><strong>${x}</strong><small style="display:block;color:var(--muted);margin-top:3px">${i===0?'Choose per task':i===1?'Private infrastructure':'Cloud model'}</small></span></button>`).join('')}</div>`,onMount(el,close){el.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{form.querySelector('#mode-select').innerHTML=icon('sparkles',13)+esc(b.dataset.mode)+icon('chevron-down',12);close()})}});
 form.querySelector('#add-context').onclick=()=>modal({title:'Add matter context',body:`<p>Choose a project to continue with its chats and documents.</p><div class="options-menu" style="margin-top:12px"><button data-nav="/projects">${icon('folder',18)}Browse projects</button><button id="context-demo">${icon('scale',18)}Explore case law</button></div>`,onMount(el,close){el.querySelector('[data-nav]').onclick=close;el.querySelector('#context-demo').onclick=()=>{close();ctx.navigate('/cases')}}});
 const defaultPlaceholder=input.getAttribute?.('placeholder')||'Ask a legal question, or bring a document…';
 const paintContract=()=>{mountContractChip(form.querySelector('#contract-command'),selectedContract,()=>{selectedContract=null;saveDraft();paintContract();paint();input.focus()});input.setAttribute('placeholder',selectedContract?.hint||defaultPlaceholder);form.classList.toggle('has-contract',!!selectedContract);form.querySelector('#mode-select').hidden=!!selectedContract;container.querySelector('#contract-hint').hidden=!selectedContract};
 resize();paintContract();paint();return {input,selectContract(item){selectedContract=item;saveDraft();paintContract();paint();input.focus()},setBusy(value){busy=value;paint()},setBlocked(value){blocked=value;paint()},dispose(){if(disposed)return;saveDraft();disposed=true}};
}
export function renderHome(container,ctx){
 ctx.setHeader('Chat With NeoLaw');let tab='tools',closeLibrary=null;
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Nicosia',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
 const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
 container.innerHTML=`<section class="home"><div class="home-intro"><p class="eyebrow">YOUR LEGAL WORKSPACE</p><h1>${greeting}, <em>Marinos.</em></h1><p>A clearer path from question to conclusion.</p></div>${composer()}<div class="home-tabs" role="tablist" aria-label="Quick actions">${[['tools','grid','Tools'],['contracts','file','Contracts'],['skills','sparkles','Skills'],['prompts','chat','Prompts'],['workflows','workflow','Workflows']].map(([id,i,name])=>`<button class="home-tab ${id===tab?'active':''}" id="tab-${id}" data-tab="${id}" role="tab" aria-controls="home-actions" tabindex="${id===tab?0:-1}" aria-selected="${id===tab}">${icon(i,13)}${name}</button>`).join('')}</div><div class="tool-grid" id="home-actions" role="tabpanel" aria-labelledby="tab-tools"></div><button class="home-library-link" id="browse-library">Explore the library ${icon('arrow',12)}</button></section>`;
 const homeTools=[...tools,...ctx.libraryItems.filter(item=>item.type==='tools'&&['opinion','draft','screening'].includes(item.tool))].slice(0,9);
 const draw=()=>{const collection=ctx.libraryItems.filter(i=>i.type===tab);const items=tab==='tools'?homeTools:tab==='contracts'?collection:collection.slice(0,9);container.querySelector('#home-actions').innerHTML=items.map((i,n)=>`<button class="tool-card" data-item="${n}"><span class="tool-symbol">${icon(i.icon||'file',20)}</span><span class="tool-card-copy"><strong>${esc(i.title)}</strong><small>${esc(i.description)}</small></span>${icon('chevron',14)}</button>`).join('');container.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>{const item=items[Number(b.dataset.item)];if(tab==='contracts'){composerState.selectContract(item)}else if(tab==='workflows'){ctx.navigate('/library?tab='+tab+'&item='+encodeURIComponent(item.id))}else ctx.startChat({tool:tab==='prompts'?'':(item.tool||item.id),prompt:tab==='tools'?'':item.prompt,title:item.title})})};draw();
 container.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;container.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',x===b);x.tabIndex=x===b?0:-1});container.querySelector('#home-actions').setAttribute('aria-labelledby','tab-'+tab);draw()});
 container.querySelector('.home-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=[...container.querySelectorAll('[data-tab]')];const current=tabs.indexOf(e.target);if(current<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(current+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[next].click();tabs[next].focus()});
 container.querySelector('#browse-library').onclick=()=>{closeLibrary?.();closeLibrary=openLibraryDialog(ctx,{tab})};
 const composerState=wireComposer(container,ctx,(prompt,files,contract)=>ctx.startChat(contract?{tool:'contract',contractId:contract.id,prompt:contract.ask+(prompt?' '+prompt:''),files,title:'Prepare a '+contract.title}:{prompt:prompt||'Help me with these documents.',files,title:prompt.slice(0,55)||files[0]?.name}));
 const requestedContract=contractItems.find(item=>item.id===ctx.params?.get('contract'));if(requestedContract)composerState.selectContract(requestedContract);
 return()=>{closeLibrary?.();composerState.dispose()};
}
const sampleClauses=[
 {id:'fees',title:'4. Fees and payment',original:'The Client shall pay a fee of EUR 80 per hour. Invoices are payable within 30 days of their date.',proposed:'The Client shall pay a fee of EUR 100 per hour. Invoices are payable within 30 days of their date.',reason:'Requested fee change'},
 {id:'liability',title:'7. Limitation of liability',original:'The Consultant’s liability shall be unlimited for all claims arising from this Agreement.',proposed:'The Consultant’s aggregate liability under this Agreement shall not exceed the fees paid during the preceding twelve months, except in the case of fraud or wilful misconduct.',reason:'Commercial risk · liability cap'},
 {id:'termination',title:'9. Termination',original:'The Client may terminate this Agreement at any time without notice.',proposed:'Either party may terminate this Agreement by giving 30 days’ written notice. Fees accrued before termination remain payable.',reason:'Commercial risk · notice period'}
];
function savedEntry(ctx){const id=ctx.route[1];let entry=storage.get('chats',[]).find(c=>c.id===id);if(!entry){const project=storage.get('projects',[]).find(p=>p.id===ctx.params.get('project'));const pchat=project?.chats.find(c=>c.id===id);entry={id,title:pchat?.title||'Matter conversation',projectId:project?.id||'',pinned:!!pchat?.pinned,updatedAt:pchat?.updatedAt||new Date().toISOString(),tool:'project',prompt:pchat?.prompt||'',messages:pchat?[{role:'user',text:pchat.prompt||pchat.title},{role:'assistant',text:'Your files and working notes are available on the project home.'}]:[]};const cs=storage.get('chats',[]);cs.push(entry);storage.set('chats',cs)}return entry}
export function renderChat(container,ctx){
 const entry=savedEntry(ctx);if(entry.contractId)return renderContractDraft(container,ctx,entry);let active=true,timer,researchProgress,answerReveal,revealingReply=false;const id=entry.id;const tool=tools.find(x=>x.id===entry.tool)||(['opinion','draft','chronology'].includes(entry.tool)?{...generic,id:entry.tool,title:entry.title}:null);
 let resolutionDraft=readResolutionDraft(id)||{company:'Aster Holdings Ltd',decision:'Approve a new registered office'};
 const initialCase=CASES.find(item=>item.id===(entry.caseId||ctx.pending?.caseId))||mentionedCases(`${entry.title} ${entry.prompt}`)[0];
 entry.caseId=initialCase?.id||'';
 if(entry.casePanel&&!CASES.some(item=>item.id===entry.casePanel.caseId))entry.casePanel=null;
 if(entry.articlePanel&&!ARTICLES.some(item=>item.id===entry.articlePanel.articleId))entry.articlePanel=null;
 if(entry.tool==='case-law'||initialCase||isCaseResearch(entry.prompt))entry.caseResearch=true;
 let docState=entry.document||null;let panelOpen=!!docState&&entry.documentPanelOpen!==false;let replyPending=false,replyFailure=false,collectingReply=false,replyFailureReason='save';let files=ctx.pending?.files||entry.files||[];
 let casePanelState=entry.casePanel&&CASES.some(item=>item.id===entry.casePanel.caseId)?entry.casePanel:null;let casePanelCleanup,sourceTrigger,renderedCaseState=null,renderedDocumentKey=null;
 let articlePanelState=entry.articlePanel||null;
 const documentPositions=new Map();
 function changePanel(update){const before=stateSnapshot();update();if(persist())return true;restoreState(before);return false}
 function openCaseSource(caseId,block=0,trigger,blocks=[],fromArticle=false){const item=CASES.find(item=>item.id===caseId);if(!item)return;if(!changePanel(()=>{casePanelState={caseId,view:block?'decision':'brief',block:Number(block),blocks};entry.caseId=caseId;entry.caseResearch=true;entry.casePanel=casePanelState;if(!fromArticle){articlePanelState=null;entry.articlePanel=null}}))return;if(!fromArticle)sourceTrigger=trigger;drawDocument(true);}
 function openArticleSource(articleId,trigger){if(!ARTICLES.some(item=>item.id===articleId))return;if(!changePanel(()=>{articlePanelState={articleId,view:'article'};entry.articlePanel=articlePanelState;casePanelState=null;entry.casePanel=null}))return;sourceTrigger=trigger;drawDocument(true);}

 function persist(){const all=storage.get('chats',[]);const index=all.findIndex(c=>c.id===id);entry.document=docState;entry.documentPanelOpen=panelOpen;entry.files=files;if(index>=0)all[index]=entry;else all.unshift(entry);return storage.set('chats',all)}
 function saveDocumentState(nextDocument,nextPanelOpen=panelOpen,{clearCase=false}={}){
  const all=storage.get('chats',[]),index=all.findIndex(chat=>chat.id===id);
  const sampleDocument=nextDocument?.kind==='text'?(docState&&docState.kind!=='text'?docState:entry.sampleDocument||null):null;
  const nextEntry={...entry,document:nextDocument,documentPanelOpen:nextPanelOpen,sampleDocument,casePanel:clearCase?null:casePanelState,articlePanel:clearCase?null:articlePanelState,files};
  if(index>=0)all[index]=nextEntry;else all.unshift(nextEntry);
  if(!storage.set('chats',all))return false;
  docState=nextDocument;panelOpen=nextPanelOpen;casePanelState=nextEntry.casePanel;articlePanelState=nextEntry.articlePanel;Object.assign(entry,nextEntry);return true;
 }
 function workingDocument(){return docState&&docState.kind!=='text'?docState:entry.sampleDocument||null}
 function showDocument(nextDocument){if(!nextDocument||!saveDocumentState(nextDocument,true,{clearCase:true}))return false;drawDocument();draw(true);container.querySelector('#close-document')?.focus({preventScroll:true});return true}
 function header(){const p=storage.get('projects',[]).find(p=>p.id===entry.projectId);ctx.setHeader((p?p.name+' / ':'')+entry.title,`<button class="icon-btn" id="chat-options" aria-label="Chat options">${icon('more',18)}</button>`);document.getElementById('chat-options').onclick=chatOptions}
 function saveChatOrganisation(changes,updateProjects){
  const previousChats=storage.get('chats',[]),projects=storage.get('projects',[]),beforeProjects=JSON.stringify(projects);
  const nextEntry={...entry,...changes,document:docState,documentPanelOpen:panelOpen,files};
  const nextChats=previousChats.some(chat=>chat.id===id)?previousChats.map(chat=>chat.id===id?nextEntry:chat):[nextEntry,...previousChats];
  updateProjects(projects);
  if(!storage.set('chats',nextChats))return false;
  if(JSON.stringify(projects)!==beforeProjects&&!storage.set('projects',projects)){
   if(!storage.set('chats',previousChats))toast('The change could not be completed or restored. Keep this dialog open and retry.');
   return false;
  }
  Object.assign(entry,changes);return true;
 }
 function chatOptions(){modal({title:entry.title,body:`<div class="options-menu"><button id="rename-chat">${icon('edit',17)}Rename chat</button><button id="pin-chat">${icon('pin',17)}${entry.pinned?'Unpin':'Pin'} chat</button><button id="move-chat">${icon('folder',17)}Move to project</button><button id="export-chat">${icon('download',17)}Export conversation</button></div>`,onMount(el,close){
  el.querySelector('#rename-chat').onclick=()=>{close();modal({title:'Rename chat',body:`<label for="chat-name">Name</label><input class="field" id="chat-name" value="${esc(entry.title)}" maxlength="100"><div class="modal-actions"><button class="btn primary" id="save-name">Save name</button></div>`,onMount(d,done){d.querySelector('#save-name').onclick=()=>{
   const name=d.querySelector('input').value.trim();if(!name)return;
   if(!saveChatOrganisation({title:name},ps=>ps.forEach(p=>p.chats.forEach(c=>{if(c.id===id)c.title=name}))))return;
   header();ctx.refreshSidebar();done();
  }}})};
  el.querySelector('#pin-chat').onclick=()=>{
   const pinned=!entry.pinned;
   if(!saveChatOrganisation({pinned},ps=>ps.forEach(p=>p.chats.forEach(c=>{if(c.id===id)c.pinned=pinned}))))return;
   close();ctx.refreshSidebar();toast(pinned?'Chat pinned':'Chat unpinned');
  };
  el.querySelector('#export-chat').onclick=()=>{download('neolaw-conversation.txt',conversationPlainText(entry.messages));close()};
  el.querySelector('#move-chat').onclick=()=>{close();const ps=storage.get('projects',[]);modal({title:'Move to a project',body:ps.length?`<div class="options-menu">${ps.map(p=>`<button data-project="${esc(p.id)}">${icon('folder',18)}${esc(p.name)}</button>`).join('')}</div>`:'<p>Create your first project to organise this conversation.</p><div class="modal-actions"><button class="btn primary" data-nav="/projects">Projects</button></div>',onMount(d,done){
   d.querySelector('[data-nav]')?.addEventListener('click',done);d.querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>{
    const target=storage.get('projects',[]).find(p=>p.id===b.dataset.project);if(!target){toast('This project is no longer available. Choose another project.');return}
    if(!saveChatOrganisation({projectId:target.id},projects=>{projects.forEach(p=>{p.chats=p.chats.filter(c=>c.id!==id)});projects.find(p=>p.id===target.id).chats.unshift({id,title:entry.title,preview:entry.prompt,prompt:entry.prompt,pinned:entry.pinned,updatedAt:new Date().toISOString()})}))return;
    header();ctx.refreshSidebar();done();toast('Moved to '+target.name);
   });
  }})};
 }})}
 header();container.innerHTML=`<div class="chat-layout"><section class="chat-column" aria-label="Conversation"><div class="chat-flow" id="chat-flow"></div><div class="chat-bottom">${composer(tool?'Tell me what you’d like to change…':'Ask a follow-up question…')}<p class="chat-subnote">Your work stays in this browser.</p></div></section><aside class="document-panel" id="document-panel" aria-label="Document workspace" hidden></aside></div>`;
 const flow=container.querySelector('#chat-flow');
 function captureResolutionDraft(){
  if(!active||tool?.id!=='resolution')return;
  const company=flow.querySelector('#resolution-company'),decision=flow.querySelector('#resolution-decision');
  if(!company||!decision)return;
  resolutionDraft={company:company.value,decision:decision.value};writeResolutionDraft(id,resolutionDraft);
 }
 function assistant(content,index){return `<article class="message assistant"${Number.isInteger(index)?` data-message-index="${index}"`:''}><div class="assistant-label">${answerBrand()}</div><div class="assistant-body">${content}</div><div class="message-actions"><button class="icon-btn copy-message" aria-label="${content.includes('class="chat-research"')?'Αντιγραφή απάντησης':'Copy response'}">${icon('copy',13)}</button></div></article>`}
 function draw(preserveScroll=false){answerReveal?.finish();const previousScroll=flow.scrollTop,pendingIndicator=flow.querySelector('.thinking'),focusedField=flow.querySelector('.resolution-fields')?.contains(document.activeElement)?{id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;captureResolutionDraft();flow.innerHTML='';if(tool&&(!docState||(tool.id==='resolution'&&!workingDocument()))){flow.innerHTML=assistant(`<div class="tool-welcome"><span class="tool-welcome-icon">${icon(tool.icon,21)}</span><h2>${esc(tool.question)}</h2><p>${esc(tool.intro)}</p>${tool.id==='resolution'?`<div class="resolution-fields"><label>Company name<input class="field" id="resolution-company" value="${esc(resolutionDraft.company)}" maxlength="100" required></label><label>Proposed decision<input class="field" id="resolution-decision" value="${esc(resolutionDraft.decision)}" maxlength="160" required></label></div><button class="btn primary" id="draft-resolution">${icon('sparkles',15)}Create draft</button>`:`<div class="sample-actions"><button class="btn primary" id="welcome-upload">${icon('upload',15)}Choose document${tool.id==='compare'?'s':''}</button><button class="btn" data-sample>Open template ${icon('arrow',14)}</button></div>`}</div>`)}
 entry.messages.forEach((m,index)=>{const display=m.role==='assistant'?{...m,text:cleanAnswerCopy(m.text),html:m.html?cleanAnswerCopy(m.html):m.html}:m;const legacy=m.role==='assistant'&&isLegacyCaseReference(`${m.text} ${m.html||''}`);const body=legacy?`<p>The sources for this archived response are no longer available. Open the current case collection to continue with linked sources.</p>${researchAction('Research judgments','Show all 10 cases on premeditated murder.')}`:display.html||`<p>${esc(display.text).replace(/\n/g,'<br>')}</p>`;flow.insertAdjacentHTML('beforeend',m.role==='user'?`<article class="message user"><div class="user-bubble">${esc(m.text)}</div></article>`:assistant(body,index))});
 if(docState&&!panelOpen)flow.insertAdjacentHTML('beforeend','<button class="btn small" id="reopen-doc">'+icon('file',14)+'Open document</button>');flow.querySelector('#reopen-doc')?.addEventListener('click',()=>showDocument(docState));
 if(files.length)flow.insertAdjacentHTML('beforeend',assistant(`<p>${files.map(f=>`<span class="chip">${icon('file',12)}${esc(f.name)}</span>`).join(' ')}</p><p>Your file is attached. ${files.some(f=>f.content!==undefined)?'Text content is available to preview.':'PDF and Word reading is currently unavailable.'}</p><button class="btn" data-sample>${workingDocument()?'Return to document':'Open document template'} ${icon('arrow',14)}</button>${files.map((f,index)=>f.content!==undefined?`<button class="btn ghost" data-preview-text="${index}">Preview ${esc(f.name)}</button>`:'').join('')}`));
 flow.querySelector('#welcome-upload')?.addEventListener('click',()=>container.querySelector('#file-input').click());flow.querySelector('#draft-resolution')?.addEventListener('click',()=>openSample({company:flow.querySelector('#resolution-company').value,decision:flow.querySelector('#resolution-decision').value}));
 flow.querySelectorAll('.resolution-fields input').forEach(input=>input.addEventListener('input',()=>{captureResolutionDraft();if(input.value.trim())input.removeAttribute('aria-invalid')}));
 flow.querySelectorAll('[data-preview-text]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.previewText),f=files[index];if(f?.content===undefined)return;showDocument({kind:'text',text:f.content,name:f.name,fileIndex:index})});
 flow.querySelectorAll('.copy-message').forEach(b=>b.onclick=()=>{const article=b.closest('.message'),body=article.querySelector('.assistant-body');const message=article.dataset.messageIndex!==undefined?entry.messages[Number(article.dataset.messageIndex)]:{role:'assistant',html:body.innerHTML};copy(messagePlainText(message))});
 flow.querySelectorAll('[data-sample]').forEach(b=>b.onclick=()=>openSample());
 flow.querySelectorAll('[data-research-prompt]').forEach(button=>button.onclick=()=>sendMessage(button.dataset.researchPrompt,[]));
 flow.querySelectorAll('[data-case-source]').forEach(button=>button.onclick=()=>openCaseSource(button.dataset.caseSource,Number(button.dataset.sourceBlock)||0,button,(button.dataset.sourceBlocks||'').split(',').map(Number).filter(Boolean)));
 flow.querySelectorAll('[data-article-source]').forEach(button=>button.onclick=()=>openArticleSource(button.dataset.articleSource,button));
 flow.querySelectorAll('[data-clause]').forEach(b=>b.onclick=()=>{if(!showDocument(workingDocument()))return;const c=container.querySelector('#clause-'+b.dataset.clause);c?.scrollIntoView({behavior:prefersReducedMotion()?'auto':'smooth',block:'center'});if(c){c.setAttribute('tabindex','-1');c.focus({preventScroll:true});if(!prefersReducedMotion())c.animate?.([{background:'#dceff0'},{background:'transparent'}],{duration:1100})}});
 if(replyFailure){flow.insertAdjacentHTML('beforeend','<div class="reply-recovery" role="alert"><p>'+(replyFailureReason==='save'?'The answer could not be saved. Your message is kept; retry when local storage is available.':'The answer could not be completed. Your message is kept; you can retry it.')+'</p><button class="btn small" id="retry-reply">Retry answer '+icon('history',13)+'</button></div>');flow.querySelector('#retry-reply').onclick=()=>scheduleReply(entry.pendingReply.text,entry.pendingReply.attached||[])}
 if(replyPending&&pendingIndicator)flow.append(pendingIndicator);
 flow.scrollTop=preserveScroll||focusedField?previousScroll:flow.scrollHeight;
 if(focusedField){const input=flow.querySelector('#'+focusedField.id);input?.focus({preventScroll:true});if(Number.isInteger(focusedField.start))input?.setSelectionRange?.(focusedField.start,focusedField.end)}
 }
 function revealReply(index,followScroll){
  const article=flow.querySelector(`[data-message-index="${index}"]`),body=article?.querySelector('.assistant-body');
  if(!body)return;
  const skip=document.createElement('button');skip.type='button';skip.className='answer-reveal-skip';skip.textContent=body.querySelector('.chat-research')?'Πλήρης απάντηση':'Show full answer';
  article.querySelector('.assistant-label').append(skip);revealingReply=true;composerState.setBusy(true);
  skip.onclick=()=>answerReveal?.finish();
  const controller=revealAnswer(body,{scroller:flow,followScroll,reducedMotion:prefersReducedMotion(),onDone(){
   const restoreFocus=document.activeElement===skip;answerReveal=null;revealingReply=false;skip.remove();if(active){composerState.setBusy(replyPending);if(restoreFocus)composerState.input.focus({preventScroll:true})}
  }});
  // Reduced motion and empty answers may finish synchronously.
  if(revealingReply)answerReveal=controller;else controller.dispose();
 }
 async function copy(t){try{await navigator.clipboard.writeText(t);toast('Copied')}catch{download('neolaw-copy.txt',t);toast('Downloaded as text')}}
 function stateSnapshot(){return JSON.parse(JSON.stringify({entry,docState,panelOpen,files,casePanelState,articlePanelState}))}
 function restoreState(before){for(const key of Object.keys(entry))delete entry[key];Object.assign(entry,before.entry);docState=before.docState;panelOpen=before.panelOpen;files=before.files;casePanelState=before.casePanelState;articlePanelState=before.articlePanelState}
 function append(text,html){entry.messages.push({role:'assistant',text,html});if(collectingReply)return;const saved=persist();draw();if(saved)revealReply(entry.messages.length-1,true)}
 function openSample(opts={}){const existing=workingDocument();if(existing)return showDocument(existing);captureResolutionDraft();const kind=tool?.id||'edit',company=kind==='resolution'?(opts.company??resolutionDraft.company).trim():opts.company||'Aster Holdings Ltd',decision=kind==='resolution'?(opts.decision??resolutionDraft.decision).trim():opts.decision||'Approve a new registered office';
 if(kind==='resolution'&&(!company||!decision)){for(const[field,value]of [['company',company],['decision',decision]]){const input=flow.querySelector('#resolution-'+field);if(!value)input?.setAttribute('aria-invalid','true');else input?.removeAttribute('aria-invalid')}toast(!company?'Enter the company name before creating the draft.':'Enter the proposed decision before creating the draft.');flow.querySelector('#resolution-'+(!company?'company':'decision'))?.focus({preventScroll:true});return false}
 const before=stateSnapshot();collectingReply=true;casePanelState=null;entry.casePanel=null;articlePanelState=null;entry.articlePanel=null;panelOpen=true;docState={kind,name:kind==='resolution'?'Board resolution · Aster':kind==='pleading'?'Statement of claim':'Consultancy agreement',changes:{},company,decision,showChanges:kind==='review'?['liability','termination']:kind==='edit'?['fees']:[],language:'both'};
 if(kind==='resolution'){docState.name='Board resolution · '+docState.company;append('A first draft is ready beside the chat.',`<p>A first draft for <strong>${esc(docState.company)}</strong> is ready beside the chat.</p><p>I’ve left the meeting date, attendees and registered-office address as visible placeholders.</p><div class="risk-summary"><span>${icon('file',12)}1 draft</span><span>3 details to complete</span></div>`)}
 else if(kind==='review'){append('The review identifies two commercial points.',`<p>I’ve reviewed the <strong>consultancy agreement</strong> from the Consultant’s perspective.</p><div class="risk-summary"><span class="risk-high">1 high risk</span><span>1 to negotiate</span><span>3 clauses checked</span></div><div class="review-finding"><header>Uncapped liability <small>HIGH</small></header><p>The agreement has no liability cap. Consider a negotiated cap with appropriate exceptions.</p><button class="btn ghost small" data-clause="liability">Clause 7 ${icon('arrow',12)}</button></div><div class="review-finding"><header>Termination without notice <small>NEGOTIATE</small></header><p>The current wording gives the Client an immediate exit without a notice period.</p><button class="btn ghost small" data-clause="termination">Clause 9 ${icon('arrow',12)}</button></div><p>You can accept or dismiss each proposed change in the document.</p>`)}
 else if(kind==='compare'){append('The two versions differ in fees and notice.',`<p>The versions differ in <strong>two places</strong>: the hourly rate and the notice period.</p><div class="review-finding"><header>Fees <small>CHANGED</small></header><p>EUR 80 → EUR 100 per hour.</p></div><div class="review-finding"><header>Termination <small>CHANGED</small></header><p>Immediate termination → 30 days’ written notice.</p></div><p>The differences are highlighted beside the chat.</p>`)}
 else if(kind==='translate'){append('The Greek translation is open.',`<p>The Greek translation is open next to the English source.</p><p>Clause numbers and amounts stay aligned. Switch the reader between the source, translation or both.</p>`)}
 else if(kind==='pleading'){append('The pleading has three items to complete.',`<p>Three things need attention in this <strong>pleading</strong>.</p><div class="review-finding"><header>Particulars of loss <small>MISSING</small></header><p>The amount claimed needs an itemised schedule and supporting documents.</p></div><div class="review-finding"><header>Internal reference <small>CHECK</small></header><p>Paragraph 8 refers to paragraph 12, which is not present.</p></div><div class="review-finding"><header>Service details <small>TO COMPLETE</small></header><p>The defendant’s address remains a placeholder.</p></div>`)}
 else if(kind==='edit'){append('The document is open with the proposed fee change.',`<p>The document is open beside us. I’ve marked the change from <strong>EUR 80 to EUR 100</strong> per hour.</p><p>Accept or dismiss the change, or try asking <strong>“Change the hourly rate to 120”</strong>.</p>`)}
 else{append('Your document is open beside the conversation.','<p>Your <strong>'+esc(kind==='chronology'?'chronology':kind==='opinion'?'legal opinion':'template draft')+'</strong> is open beside the conversation.</p>')}
 collectingReply=false;entry.sampleDocument=null;if(!persist()){restoreState(before);return false}draw();if(kind==='resolution')clearResolutionDraft(id);drawDocument();revealReply(entry.messages.length-1,true);container.querySelector('#close-document')?.focus({preventScroll:true});return true;}
 function exportPaper(panel){const paper=panel.querySelector('.document-paper').cloneNode(true);paper.querySelectorAll('.clause-actions').forEach(n=>n.remove());paper.querySelectorAll('del').forEach(n=>{n.textContent='[ORIGINAL] '+n.textContent});paper.querySelectorAll('ins').forEach(n=>{n.textContent='[PROPOSED / TO COMPLETE] '+n.textContent});paper.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));paper.querySelectorAll('h2,h3,p,.doc-eyebrow,.doc-subtitle').forEach(n=>n.append('\n\n'));return paper.textContent.trim()}
 function proposed(c){return c.id==='fees'&&docState.rate?`The Client shall pay a fee of EUR ${docState.rate} per hour. Invoices are payable within 30 days of their date.`:c.proposed}
 function drawDocument(forceCase=false){
 if(collectingReply)return;
 const panel=container.querySelector('#document-panel'),previousReader=panel.querySelector('.document-scroll');
 if(renderedDocumentKey!==null&&previousReader)documentPositions.set(renderedDocumentKey,previousReader.scrollTop);
 const caseSignature=casePanelState||articlePanelState?JSON.stringify({casePanelState,articlePanelState}):null;
 // A reply must not recreate a source the user is reading or steal composer focus.
 if((casePanelState||articlePanelState)&&casePanelCleanup&&renderedCaseState===caseSignature&&!forceCase)return;
 casePanelCleanup?.();casePanelCleanup=null;renderedCaseState=null;renderedDocumentKey=null;
 const hasSource=!!(casePanelState||articlePanelState);
 panel.classList.toggle('chat-case-panel',hasSource);panel.classList.toggle('cases-module',hasSource);container.querySelector('.chat-layout').classList.toggle('has-case',hasSource);
 function closeSource(){
  if(!changePanel(()=>{casePanelState=null;entry.casePanel=null;articlePanelState=null;entry.articlePanel=null}))return;
  drawDocument();
  const documentVisible=docState&&panelOpen&&window.matchMedia?.('(max-width: 840px)')?.matches;
  (documentVisible?panel.querySelector('#close-document'):sourceTrigger?.isConnected?sourceTrigger:container.querySelector('#chat-input'))?.focus({preventScroll:true});
 }
 if(casePanelState){const item=CASES.find(item=>item.id===casePanelState.caseId);panel.hidden=false;container.querySelector('.chat-layout').classList.add('has-document');renderedCaseState=caseSignature;casePanelCleanup=mountCasePanel(panel,item,{...casePanelState,onClose:closeSource,backLabel:articlePanelState?'Άρθρο '+ARTICLES.find(article=>article.id===articlePanelState.articleId).number:'',onBack:articlePanelState?()=>{if(!changePanel(()=>{casePanelState=null;entry.casePanel=null}))return;drawDocument(true)}:null,onState(state){
  if(!changePanel(()=>{casePanelState={...casePanelState,...state};entry.casePanel=casePanelState}))return false;
  renderedCaseState=JSON.stringify({casePanelState,articlePanelState});return true;
 }});return;}
 if(articlePanelState){const item=ARTICLES.find(article=>article.id===articlePanelState.articleId);panel.hidden=false;container.querySelector('.chat-layout').classList.add('has-document');renderedCaseState=caseSignature;casePanelCleanup=mountArticlePanel(panel,item,{...articlePanelState,onClose:closeSource,onState(state){if(!changePanel(()=>{articlePanelState={...articlePanelState,...state};entry.articlePanel=articlePanelState}))return false;renderedCaseState=JSON.stringify({casePanelState,articlePanelState});return true},onCase(caseId,block,trigger){openCaseSource(caseId,block,trigger,block?[block]:[],true)}});return;}
 panel.setAttribute('aria-label','Document workspace');panel.hidden=!docState||!panelOpen;container.querySelector('.chat-layout').classList.toggle('has-document',!!docState&&panelOpen);if(!docState||!panelOpen)return;const pending=docState.showChanges?.filter(id=>!docState.changes[id]).length||0;
 panel.innerHTML=`<header class="document-toolbar">${icon('file',15)}<span class="doc-filename">${esc(docState.kind==='text'?docState.name:cleanAnswerCopy(docState.name))}</span><button class="btn" id="export-document">${icon('download',13)}Export</button><button class="icon-btn" id="close-document" aria-label="Close document panel">${icon('x',17)}</button></header><div class="document-tabs"><span class="doc-status"><i></i>${pending?pending+' proposed changes':(docState.kind==='text'?'Attached document':'Document')}</span>${docState.kind==='translate'?`<select class="field" id="language-view" style="width:auto;padding:3px;font-size:11px" aria-label="Translation view"><option value="both">Source + translation</option><option value="en">English</option><option value="el">Greek</option></select>`:`<span>${pending?'Review each change':'Saved in this browser'}</span>`}</div><div class="document-scroll"><div class="document-paper">${paperHTML()}</div></div><footer class="document-footer"><span>${docState.kind==='text'?'DOCUMENT':'WORKING DOCUMENT'}</span><span>${pending?pending+' to review':'Saved on this device'}</span></footer>`;
 renderedDocumentKey=docState.kind==='text'?'text:'+(docState.fileIndex??docState.name):'sample:'+docState.kind;
 panel.querySelector('.document-scroll').scrollTop=documentPositions.get(renderedDocumentKey)||0;
 panel.querySelector('#close-document').onclick=()=>{if(!saveDocumentState(docState,false))return;drawDocument();draw(true);container.querySelector('#chat-input')?.focus({preventScroll:true})};
 panel.querySelector('#export-document').onclick=()=>{const file=documentExportFile(docState,docState.kind==='text'?'':exportPaper(panel));download(file.name,file.text);toast('Plain-text download started')};
 if(panel.querySelector('#language-view'))panel.querySelector('#language-view').value=docState.language;
 panel.querySelector('#language-view')?.addEventListener('change',e=>{if(!saveDocumentState({...docState,language:e.target.value})){e.target.value=docState.language;return}panel.querySelector('.document-paper').innerHTML=paperHTML()});
 panel.querySelectorAll('[data-change]').forEach(b=>b.onclick=()=>{if(!saveDocumentState({...docState,changes:{...docState.changes,[b.dataset.change]:b.dataset.decision}}))return;drawDocument();panel.querySelector('[data-undo="'+b.dataset.change+'"]')?.focus({preventScroll:true});toast(b.dataset.decision==='accepted'?'Change accepted':'Original wording kept')});
 panel.querySelectorAll('[data-undo]').forEach(b=>b.onclick=()=>{const changes={...docState.changes};delete changes[b.dataset.undo];if(!saveDocumentState({...docState,changes}))return;drawDocument();panel.querySelector('[data-change="'+b.dataset.undo+'"]')?.focus({preventScroll:true})});
 }
 function paperHTML(){
 if(docState.kind==='workflow')return workflowDocumentHTML(docState.workflowId);
 if(docState.kind==='text')return `<div class="doc-eyebrow">DOCUMENT</div><h2>${esc(docState.name)}</h2><p style="white-space:pre-wrap">${esc(docState.text)}</p>`;
 if(docState.kind==='resolution')return `<div class="doc-eyebrow">CORPORATE · DRAFT</div><h2>${esc(docState.company)}</h2><div class="doc-subtitle">Written resolution of the board of directors</div><p><strong>Date:</strong> [to be completed]</p><p><strong>Directors:</strong> [to be completed]</p><h3>Proposed decision</h3><p>${esc(docState.decision)}</p><h3>IT IS RESOLVED THAT</h3><p>The proposed decision set out above is approved, subject to the company’s constitutional documents and completion of the necessary formalities.</p><p>The registered-office address shall be <ins>[address to be completed]</ins>.</p><h3>Authority to act</h3><p>The directors authorise the appropriate officer to prepare the required documents and arrange the relevant filings.</p><p style="margin-top:55px">________________________<br>Director</p><p>________________________<br>Director</p>`;
 if(['chronology','opinion','draft'].includes(docState.kind))return `<div class="doc-eyebrow">${esc(docState.kind.toUpperCase())}</div><h2>${docState.kind==='chronology'?'Matter chronology':docState.kind==='opinion'?'Working legal opinion':'Draft from a template'}</h2><div class="doc-subtitle">Aster / Meridian</div>${docState.kind==='chronology'?'<h3>3 February 2026</h3><p>Initial agreement circulated. Source: Email A.</p><h3>10 February 2026</h3><p>The Client requests a revised payment schedule. Source: Email B.</p><h3>14 February 2026</h3><p>Version 2 circulated for review. Source: Email C.</p><h3>Open question</h3><p>An undated file note records a telephone discussion. Its date remains unconfirmed.</p>':docState.kind==='opinion'?'<h3>Question for advice</h3><p>What additional facts are needed to assess the proposed termination of the consultancy agreement?</p><h3>Available material</h3><p>The agreement and correspondence form the working record. Legal authorities remain to be added.</p><h3>Analysis to complete</h3><p>Confirm the applicable termination clause, the alleged breach, the notice history and any agreed variation. Assess the evidence against verified law before forming a conclusion.</p><h3>Provisional position</h3><p>The missing instructions and authorities must be obtained before a legal opinion can be finalised.</p>':'<h3>1. Parties</h3><p>[Company legal name] and [Consultant legal name].</p><h3>2. Services</h3><p>[Describe the agreed scope, deliverables and service schedule.]</p><h3>3. Fees</h3><p>[Insert the agreed fees, currency and payment arrangements.]</p><h3>4. Next instructions</h3><p>Confirm the party details and commercial terms before using this working template.</p>'}`;
 if(docState.kind==='pleading')return `<div class="doc-eyebrow">LITIGATION · DRAFT</div><h2>Statement of claim</h2><div class="doc-subtitle">Aster Holdings Ltd v Meridian Advisory Ltd</div><h3>Parties</h3><p>1. The Claimant is Aster Holdings Ltd.</p><p>2. The Defendant’s address is <ins>[address to be completed]</ins>.</p><h3>Background</h3><p>3. The parties entered into a consultancy agreement on the date stated in the agreement.</p><p>4. The Claimant alleges that the agreed deliverables were not provided.</p><h3>Loss</h3><p>5. The Claimant seeks damages of <ins>[amount to be particularised]</ins>.</p><h3>Relief</h3><p>8. The Claimant relies on the documents identified at <del>paragraph 12</del> <ins>[reference to be confirmed]</ins>.</p>`;
 if(docState.kind==='translate')return `<div class="doc-eyebrow">TRANSLATION</div><h2>Consultancy agreement</h2><div class="doc-subtitle">English → Ελληνικά</div>${docState.language!=='el'?'<h3>4. Fees and payment · EN</h3><p>The Client shall pay a fee of EUR 80 per hour. Invoices are payable within 30 days of their date.</p>':''}${docState.language!=='en'?'<h3>4. Αμοιβή και πληρωμή · EL</h3><p>Ο Πελάτης καταβάλλει αμοιβή 80 ευρώ ανά ώρα. Τα τιμολόγια εξοφλούνται εντός 30 ημερών από την ημερομηνία έκδοσής τους.</p>':''}${docState.language!=='el'?'<h3>9. Termination · EN</h3><p>Either party may terminate this Agreement by giving 30 days’ written notice.</p>':''}${docState.language!=='en'?'<h3>9. Τερματισμός · EL</h3><p>Κάθε μέρος δύναται να τερματίσει την παρούσα Συμφωνία με γραπτή προειδοποίηση 30 ημερών.</p>':''}`;
 if(docState.kind==='compare')return `<div class="doc-eyebrow">VERSION COMPARISON</div><h2>What changed.</h2><div class="doc-subtitle">Consultancy agreement · Version 1 → Version 2</div><div class="compare-columns"><section><h3>ORIGINAL · V1</h3><p>4. The fee is <del>EUR 80</del> per hour.</p><p>9. The Client may terminate <del>at any time without notice</del>.</p></section><section><h3>REVISED · V2</h3><p>4. The fee is <ins>EUR 100</ins> per hour.</p><p>9. Either party may terminate <ins>with 30 days’ written notice</ins>.</p></section></div><h3>Unchanged</h3><p>The payment period remains 30 days. The named parties and description of the services are unchanged in these versions.</p>`;
 return `<div class="doc-eyebrow">CONSULTANCY · WORKING COPY</div><h2>Consultancy agreement</h2><div class="doc-subtitle">Aster Holdings Ltd & Meridian Advisory Ltd</div><p>This agreement records the appointment of Meridian Advisory Ltd (the “Consultant”) by Aster Holdings Ltd (the “Client”).</p><h3>1. Services</h3><p>The Consultant will provide the advisory services described in Schedule A. Any additional scope will be agreed in writing.</p>${sampleClauses.map(c=>{const review=docState.showChanges.includes(c.id);const decision=docState.changes[c.id];return `<section id="clause-${c.id}" class="doc-clause ${review&&!decision?'pending':''}"><h3>${c.title}</h3><p>${review&&!decision?`<del>${esc(c.original)}</del><br><ins>${esc(proposed(c))}</ins>`:esc(decision==='accepted'?proposed(c):c.original)}</p>${review?`<div class="clause-actions">${decision?`<span class="chip">${icon('check',11)}${decision==='accepted'?'Accepted':'Original kept'}</span><button class="btn ghost small" data-undo="${c.id}">Undo</button>`:`<button class="btn small primary" data-change="${c.id}" data-decision="accepted">${icon('check',12)}Accept</button><button class="btn small" data-change="${c.id}" data-decision="rejected">Dismiss</button>`}<span class="clause-badge">${esc(c.reason)}</span></div>`:''}</section>`}).join('')}<h3>12. Governing law</h3><p>This agreement refers to the laws of the Republic of Cyprus.</p><p style="margin-top:40px">________________________<br>For and on behalf of the Client</p>`;
 }
 function replyContext(){return {document:docState?{kind:docState.kind,name:docState.name}:null,caseId:entry.caseId||'',caseResearch:!!entry.caseResearch}}
 function isResearchReply(text,context){return isCaseResearch(text)||isLegacyCaseReference(text)||mentionedCases(text).length>0||(context.caseResearch&&!tool&&!context.document)}
 function scheduleReply(text,attached=[],delay=350){
  const context=entry.pendingReply?.context||replyContext();
  replyPending=true;replyFailure=false;replyFailureReason='save';flow.querySelector('.reply-recovery')?.remove();composerState.setBlocked(false);composerState.setBusy(true);
  researchProgress?.dispose();researchProgress=null;
  let thinking;
  if(!attached.length&&isResearchReply(text,context)){
   const duration=5500,now=Date.now();
   let started=entry.pendingReply?.previewStartedAt;
   if(!Number.isFinite(started)||started>now){started=now;if(entry.pendingReply){entry.pendingReply.previewStartedAt=started;persist()}}
   const elapsed=Math.min(duration,Math.max(0,now-started));delay=duration-elapsed;
   if(delay>0){researchProgress=mountResearchProgress(flow,{duration,elapsed,onArticle(articleId,trigger){openArticleSource(articleId,trigger)},onCase(caseId,block,trigger){openCaseSource(caseId,block,trigger,block?[block]:[])}});thinking=researchProgress.element}
  }else{thinking=document.createElement('div');thinking.className='thinking';thinking.setAttribute('role','status');thinking.innerHTML='<i></i><i></i><i></i>Preparing answer';flow.append(thinking)}
  flow.scrollTop=flow.scrollHeight;
  timer=setTimeout(()=>{
   if(!active)return;const followScroll=flow.scrollHeight-flow.scrollTop-flow.clientHeight<96;
   researchProgress?.dispose();researchProgress=null;thinking?.remove();
   const before=stateSnapshot();let saved=false;
   try{collectingReply=true;respond(text,attached,context);delete entry.pendingReply;saved=persist()}
   catch{replyFailureReason='prepare';toast('The answer could not be completed. You can retry it.')}
   finally{collectingReply=false}
   if(!saved){restoreState(before);replyFailure=true}
   replyPending=false;composerState.setBlocked(replyFailure);composerState.setBusy(false);draw(!followScroll);drawDocument();
   if(saved&&entry.messages.length>before.entry.messages.length)revealReply(entry.messages.length-1,followScroll);
  },delay)
 }
 function sendMessage(text,attached=[]){if(replyPending||replyFailure)return false;answerReveal?.finish();const previousFiles=files;const previousPending=entry.pendingReply;if(attached.length)files=[...files,...attached];entry.messages.push({role:'user',text:text||'Attached '+attached.map(f=>f.name).join(', ')});entry.pendingReply={text,attached,context:replyContext()};if(!persist()){entry.messages.pop();files=previousFiles;entry.pendingReply=previousPending;return false}draw();scheduleReply(text,attached);return true}
 const composerState=wireComposer(container,ctx,sendMessage,'chat:'+id);
 function respond(text,attached,context){
 if(attached.length){append('Your files are attached. Automatic document analysis is currently unavailable.','<p>Your files are attached. Automatic document analysis is currently unavailable.</p><p>Open a document template to work with the review and editing controls.</p><button class="btn" data-sample>Open document template '+icon('arrow',13)+'</button>');return}
 const working=workingDocument();
 if(context.document&&['review','edit'].includes(context.document.kind)&&working?.kind===context.document.kind&&/\b(\d{1,4})(?:[.,]\d{1,2})?\b/.test(text)&&/rate|fee|hour|ευρω|ευρώ|ωρ|αμοιβ/i.test(text)){
  const rate=text.match(/(?:\bto|σε)\s*(?:EUR\s*|€\s*)?(\d{1,4}(?:[.,]\d{1,2})?)/i)?.[1]||[...text.matchAll(/\b(\d{1,4}(?:[.,]\d{1,2})?)\b/g)].at(-1)[1];
  const updated={...working,rate,changes:{...working.changes},showChanges:[...new Set([...(working.showChanges||[]),'fees'])]};delete updated.changes.fees;
  if(docState?.kind==='text')entry.sampleDocument=updated;else docState=updated;
  append('The proposed rate is EUR '+rate+' per hour.',`<p>I’ve marked the hourly rate as <strong>EUR ${esc(rate)}</strong>. The 30-day payment period is unchanged.</p><p>Review the change in clause 4 before accepting it.</p><button class="btn ghost small" data-clause="fees">Review clause 4 ${icon('arrow',12)}</button>`);return;
 }
 if(isResearchReply(text,context)){
  const answer=preparedCaseAnswer(text,context.caseId);
  entry.caseResearch=true;
  if(entry.caseId===context.caseId)entry.caseId=answer.caseId||'';
  append(answer.text,answer.html);
  return;
 }
 if(context.document&&['review','edit'].includes(context.document.kind)){append('You can review the marked changes in the document.',`<p>You can <strong>accept, dismiss or undo</strong> the marked changes in the panel.</p><p>To update the rate, write <strong>“Change the hourly rate to 120”</strong>. Other editing instructions are currently unavailable.</p>`);return}
 if(context.document?.kind==='text'){append('Your file is open as a local text preview. AI analysis and editing are not connected.',`<p><strong>${esc(context.document.name)}</strong> is available as a local text preview. You can read or export its original contents.</p><p>Automatic analysis and editing of uploaded files are currently unavailable.</p>${workingDocument()?'<button class="btn" data-sample>Return to document '+icon('arrow',13)+'</button>':''}`);return}
 if(context.document){append('The document is open beside the conversation.','<p>Use the document controls to inspect or export it. Automatic editing for this document type is currently unavailable.</p>');return}
 append('Choose a starting point: review a contract, edit a document, or research the premeditation case collection.',`<p>Start with a document task, or explore the premeditation case collection with source-linked answers.</p><div class="sample-actions"><button class="btn" data-tool="review">${icon('shield',15)}Review a contract</button><button class="btn" data-tool="edit">${icon('edit',15)}Edit a document</button>${researchAction('Research premeditation cases','Find case law on premeditated murder and explain the key evidence issues.')}</div>`)
 }
 draw();drawDocument();if(entry.pendingReply){scheduleReply(entry.pendingReply.text,entry.pendingReply.attached||[],500)}else if(!tool&&!entry.messages.length&&entry.prompt){entry.messages.push({role:'user',text:entry.prompt});entry.pendingReply={text:entry.prompt,attached:files,context:replyContext()};persist();draw();scheduleReply(entry.prompt,files,500)}else if(!tool&&entry.messages.length===1&&entry.messages[0].role==='user'){const prompt=entry.prompt||entry.messages[0].text;entry.pendingReply={text:prompt,attached:files,context:replyContext()};persist();scheduleReply(prompt,files,500)}
 return ()=>{captureResolutionDraft();composerState.dispose();active=false;clearTimeout(timer);researchProgress?.dispose();answerReveal?.dispose();casePanelCleanup?.()};
}
