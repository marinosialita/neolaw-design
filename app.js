import {createWorkflowPreview} from './modules/workflow-samples.js';
import {icon,escape,storage,toast,modal,download} from './core.js';
import {render as renderProjects,ensureProjects} from './modules/projects.js';
import {render as renderCases} from './modules/cases.js';
import {render as renderLibrary,libraryItems} from './modules/library.js';
import {render as renderMatrix} from './modules/matrix.js';
import {render as renderScreening} from './modules/screening.js';
import {renderHome,renderChat} from './chat.js';
import {hasLegacyScreeningHistory,prepareWorkspaceStorage} from './modules/workspace-storage.js';

let cleanup, newSearchAction=null;
const main=document.getElementById('main');
const titles={chat:'Chat With NeoLaw',projects:'Projects',cases:'Case Law',screening:'Screening',library:'Library',matrix:'Document review'};
const mark=`<img class="brand-symbol" src="./assets/neolaw-mark.svg" width="28" height="32" alt="" aria-hidden="true">`;
const navigation=[['chat','chat','Chat With NeoLaw'],['cases','scale','Case Law'],['screening','shield','Screening'],['projects','folder','Projects'],['library','library','Library'],['matrix','compare','Document review']];
function renderSidebar(route){
 const newSearch=['cases','screening'].includes(route),newPath=newSearch?'/'+route:'/chat',newLabel=newSearch?'New search':'New chat';
 const projectCount=storage.get('projects',[]).length;
 const projects=storage.get('projects',[]).slice().sort((a,b)=>Number(b.pinned)-Number(a.pinned)).slice(0,3);
 const chats=storage.get('chats',[]).slice().sort((a,b)=>Number(b.pinned)-Number(a.pinned)).slice(0,3);
 document.getElementById('sidebar').innerHTML=`<div class="sidebar-brand"><a href="#/chat" class="brand-lockup" aria-label="NeoLaw home">${mark}<img class="brand-word" src="./assets/neolaw-word.svg" width="82" height="18" alt="" aria-hidden="true"></a><button class="icon-btn" id="rail-toggle" aria-label="${document.body.classList.contains('rail')?'Pin':'Collapse'} navigation">${icon('panel',16)}</button></div><button class="new-chat" data-nav="${newPath}" aria-label="${newLabel}" title="${newLabel}" aria-keyshortcuts="Meta+Shift+O Control+Shift+O">${icon('plus',18)}<span class="nav-text">${newLabel}</span><kbd aria-hidden="true">⌘ ⇧ O</kbd></button><nav class="nav-group" aria-label="Workspace">${navigation.map(([id,i,name])=>`<button class="nav-link ${route===id?'active':''}" data-nav="/${id}" ${route===id?'aria-current="page"':''} title="${name}">${icon(i,18)}<span class="nav-text">${name}</span>${id==='projects'?`<span class="tiny-count">${projectCount}</span>`:''}</button>`).join('')}</nav><p class="nav-caption">YOUR MATTERS</p><div class="nav-group sidebar-projects">${(projects.length?projects:[{id:'aster',name:'Aster · Acquisition',color:'teal'},{id:'meridian',name:'Meridian · Employment',color:'sand'},{id:'criminal',name:'Criminal appeal',color:'lilac'}]).map((p,i)=>`<button class="nav-link" data-nav="/projects/${escape(p.id)}" title="${escape(p.name)}"><span class="matter-dot ${i===1?'sand':i===2?'lilac':''}"></span><span class="nav-text">${escape(p.name)}</span></button>`).join('')}</div><p class="nav-caption">RECENT CHATS</p><div class="nav-group recent-links">${chats.length?chats.map(c=>`<button class="nav-link" data-nav="/chat/${escape(c.id)}" title="${escape(c.title)}">${icon(c.pinned?'pin':'chat',16)}<span class="nav-text">${escape(c.title)}</span></button>`).join(''):`<button class="nav-link" data-nav="/cases">${icon('scale',16)}<span class="nav-text">Premeditation · Case research</span></button><button class="nav-link" data-tool="review">${icon('shield',16)}<span class="nav-text">Review an agreement</span></button>`}</div><div class="sidebar-bottom"><button class="nav-link" id="command-open" title="Search workspace">${icon('search',18)}<span class="nav-text">Search workspace</span><span class="tiny-count">⌘ K</span></button><div class="profile-row"><span class="avatar">MS</span><span class="profile-text">Marinos Sialita<small>NeoLaw workspace</small></span><button class="icon-btn" id="workspace-info" aria-label="About NeoLaw">${icon('more',17)}</button></div></div>`;
 document.getElementById('rail-toggle').onclick=()=>{if(document.body.classList.contains('mobile-nav')){setMobileNavigation(false,true);return}document.body.classList.toggle('rail');storage.set('rail',document.body.classList.contains('rail'));document.getElementById('rail-toggle').setAttribute('aria-label',document.body.classList.contains('rail')?'Pin navigation':'Collapse navigation')};
 document.getElementById('command-open').onclick=openCommand;
 document.getElementById('workspace-info').onclick=showInfo;
}
function showInfo(){modal({title:'About NeoLaw',body:`<p>Your workspace for legal research, documents and matters.</p><p style="margin-top:12px">Your projects, conversations and document changes are saved in this browser. Files stay on this device. Case sources link directly to CyLaw.</p><div class="modal-actions"><a class="btn" href="assets/storage-health.html" target="_blank" rel="noopener">Storage &amp; backups</a><button class="btn primary" id="info-done">Got it</button></div>`,onMount(el,close){el.querySelector('#info-done').onclick=close}})}
function setMobileNavigation(open,restoreFocus=false){
 document.body.classList.toggle('mobile-nav',open);
 const trigger=document.querySelector('.mobile-menu'),inside=document.getElementById('rail-toggle'),sidebar=document.getElementById('sidebar');
 document.getElementById('workspace').inert=open;
 document.querySelector('.skip-link').inert=open;
 document.getElementById('navigation-backdrop').hidden=!open;
 if(open){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true')}else{sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal')}
 trigger?.setAttribute('aria-expanded',String(open));trigger?.setAttribute('aria-label',open?'Close navigation':'Open navigation');
 if(inside){inside.setAttribute('aria-label',open?'Close navigation':document.body.classList.contains('rail')?'Pin navigation':'Collapse navigation');inside.innerHTML=icon(open?'x':'panel',16)}
 if(open)document.querySelector('#sidebar .new-chat')?.focus({preventScroll:true});else if(restoreFocus)trigger?.focus({preventScroll:true});
}
function setHeader(title,actionsHTML=''){
 // Page content owns its heading. Keep only essential floating controls, without a header strip.
 main.setAttribute('aria-label',title);
 document.getElementById('topbar').innerHTML=`<button class="icon-btn mobile-menu" aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">${icon('panel',18)}</button><div id="header-actions">${actionsHTML}</div>`;
 document.querySelector('.mobile-menu').onclick=()=>setMobileNavigation(!document.body.classList.contains('mobile-nav'),true);
}
function navigate(path){if(location.hash==='#'+path){route()}else location.hash=path;setMobileNavigation(false)}
function startChat(options={}){
 if(options.tool==='screening'){navigate('/screening'+(options.projectId?'?project='+encodeURIComponent(options.projectId):''));return true}
 if(options.tool==='matrix'){navigate('/matrix');return}
 const id='c'+Date.now().toString(36);const entry={id,title:options.title||options.prompt?.slice(0,55)||'New conversation',tool:options.tool||'',caseId:options.caseId||'',projectId:options.projectId||'',prompt:options.prompt||'',pinned:false,messages:[],files:options.files||[],updatedAt:new Date().toISOString()};
 if(options.researchPreview===true)entry.researchPreview=true;
 if(options.contractId&&libraryItems.some(item=>item.type==='contracts'&&item.id===options.contractId))entry.contractId=options.contractId;
 if(options.prompt)entry.messages.push({role:'user',text:options.prompt});
 if(options.workflowId){const preview=createWorkflowPreview(options.workflowId);if(preview){entry.workflowId=options.workflowId;entry.document=preview.document;entry.documentPanelOpen=true;entry.messages.push(preview.message)}}
 const previousChats=storage.get('chats',[]);const chats=[entry,...previousChats];if(!storage.set('chats',chats))return false;
 if(options.projectId){const ps=storage.get('projects',[]);const p=ps.find(x=>x.id===options.projectId);if(p){p.chats.unshift({id,title:entry.title,prompt:options.prompt||'',preview:options.prompt||'',pinned:false,updatedAt:entry.updatedAt});p.updatedAt=entry.updatedAt;if(!storage.set('projects',ps)){storage.set('chats',previousChats);return false}}}
 navigate('/chat/'+id+(options.projectId?'?project='+encodeURIComponent(options.projectId):''));return true;
}
function openCommand(){
 const projects=storage.get('projects',[]),storedPrompts=storage.get('library-custom-prompts',[]),seen=new Set(libraryItems.map(item=>item.id));
 const customPrompts=(Array.isArray(storedPrompts)?storedPrompts:[]).filter(item=>{
  if(!item||typeof item.id!=='string'||typeof item.title!=='string'||typeof item.prompt!=='string'||item.type!=='prompts'||item.deletedAt||seen.has(item.id))return false;
  seen.add(item.id);return true;
 });
 const entries=[{title:'Chat With NeoLaw · New chat',type:'Workspace',icon:'chat',path:'/chat'},{title:'Projects',type:'Workspace',icon:'folder',path:'/projects'},{title:'Case Law · Search court decisions',type:'10 real judgments',icon:'scale',path:'/cases'},{title:'Screening · Check a person or company',type:'Workspace',icon:'shield',path:'/screening'},{title:'Library',type:'Skills & workflows',icon:'library',path:'/library'},...projects.map(p=>({title:p.name,type:'Project',icon:'folder',path:'/projects/'+p.id})),...libraryItems.map(i=>({title:i.title,type:i.type,icon:i.icon||'file',item:i})),...customPrompts.map(item=>({title:item.title,type:'prompts',icon:'message-square',path:'/library?tab=prompts&item='+encodeURIComponent(item.id)}))];
 modal({title:'Search your workspace',body:`<div class="palette-search">${icon('search',20)}<input id="palette-input" placeholder="A project, contract, tool or prompt…" aria-label="Search workspace" autocomplete="off"><kbd class="muted">esc</kbd></div><div id="palette-results"></div>`,onMount(el,close){const input=el.querySelector('input');const output=el.querySelector('#palette-results');function draw(){const q=input.value.toLowerCase();const found=entries.filter(e=>(e.title+' '+e.type).toLowerCase().includes(q)).slice(0,9);output.innerHTML=found.length?found.map((e,i)=>`<button class="palette-row" data-pick="${i}">${icon(e.icon,18)}<span>${escape(e.title)}</span><small>${escape(e.type)}</small></button>`).join(''):'<div class="empty-state">No matches. Try “contract” or “project”.</div>';output.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const e=found[Number(b.dataset.pick)];close();if(e.path)navigate(e.path);else if(['workflows','contracts'].includes(e.item.type))navigate('/library?tab='+e.item.type+'&item='+encodeURIComponent(e.item.id));else startChat({tool:e.item.type==='prompts'?'':e.item.tool||e.item.id,prompt:e.item.prompt,title:e.item.title})})}input.oninput=draw;input.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();output.querySelector('button')?.focus()}if(e.key==='Enter'){output.querySelector('button')?.click()}};output.onkeydown=e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();const bs=[...output.querySelectorAll('button')];let i=bs.indexOf(document.activeElement);bs[(i+(e.key==='ArrowDown'?1:bs.length-1))%bs.length]?.focus()};draw();input.focus()}});
}
function route(){
 cleanup?.();cleanup=null;newSearchAction=null;document.querySelectorAll('dialog[open]').forEach(d=>d.dispatchEvent(new Event('cancel',{cancelable:true})));const hash=location.hash.slice(1)||'/chat';const [path,query='']=hash.split('?');const parts=path.split('/').filter(Boolean).map(p=>{try{return decodeURIComponent(p)}catch{return p}});const page=parts[0]||'chat';const params=new URLSearchParams(query);
 main.innerHTML='';main.className='';setMobileNavigation(false);renderSidebar(page);setHeader(titles[page]||'NeoLaw');
 const ctx={route:parts,params,icon,escape,storage,toast,modal,download,navigate,startChat,setHeader,libraryItems,refreshSidebar:()=>renderSidebar(page),setNewSearchAction:action=>{newSearchAction=action;}};
 try{if(page==='projects')cleanup=renderProjects(main,ctx);else if(page==='cases')cleanup=renderCases(main,ctx);else if(page==='screening')cleanup=renderScreening(main,ctx);else if(page==='library')cleanup=renderLibrary(main,ctx);else if(page==='matrix')cleanup=renderMatrix(main,ctx);else if(page==='chat'&&parts[1])cleanup=renderChat(main,ctx);else cleanup=renderHome(main,ctx)}catch(e){console.error(e);main.innerHTML='<div class="empty-state"><h3>This view could not open</h3><p>Return to the workspace and try again.</p><button class="btn" data-nav="/chat">New chat</button></div>'}
 window.scrollTo(0,0);document.title=`${titles[page]||'Workspace'} · NeoLaw`;
}
document.getElementById('navigation-backdrop').onclick=()=>setMobileNavigation(false,true);
function containNavigationFocus(event){
 if(event.key!=='Tab'||!document.body.classList.contains('mobile-nav')||document.querySelector('dialog[open]'))return;
 const sidebar=document.getElementById('sidebar');
 const controls=[...sidebar.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(el=>!el.disabled&&!el.matches('[tabindex="-1"]')&&el.getClientRects().length);
 const first=controls[0],last=controls.at(-1),active=document.activeElement;
 if(!first)return;
 if(!sidebar.contains(active)||(event.shiftKey?active===first:active===last)){event.preventDefault();(event.shiftKey?last:first).focus({preventScroll:true})}
}
document.querySelector('.skip-link').addEventListener('click',e=>{e.preventDefault();main.focus()});
document.addEventListener('click',e=>{const n=e.target.closest('[data-nav]');if(n){e.preventDefault();if(n.classList.contains('new-chat')&&newSearchAction){setMobileNavigation(false);newSearchAction();return;}navigate(n.dataset.nav)}const t=e.target.closest('[data-tool]');if(t){startChat({tool:t.dataset.tool,title:t.dataset.title})}});
document.addEventListener('keydown',e=>{containNavigationFocus(e);if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!document.querySelector('dialog[open]'))openCommand()}if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==='o'){e.preventDefault();document.querySelector('#sidebar .new-chat')?.click()}if(e.key==='Escape'&&document.body.classList.contains('mobile-nav')&&!document.querySelector('dialog[open]')){e.preventDefault();setMobileNavigation(false,true)}});
window.addEventListener('resize',()=>{if(document.body.classList.contains('mobile-nav')&&window.matchMedia?.('(min-width: 601px)')?.matches)setMobileNavigation(false)});
function initializeWorkspace(){ensureProjects(storage);document.body.classList.toggle('rail',storage.get('rail',false));window.addEventListener('hashchange',route);route()}
if(hasLegacyScreeningHistory()){
 main.innerHTML='<p role="status" style="padding:32px">Preparing your saved workspace…</p>';
 prepareWorkspaceStorage().then(initializeWorkspace,()=>{initializeWorkspace();toast('The storage upgrade could not finish. Your original history is preserved; open Storage & backups from About NeoLaw to inspect it.')});
}else initializeWorkspace();
