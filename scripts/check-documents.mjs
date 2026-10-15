import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {renderChat,renderHome} from '../chat.js';
import {CASES} from '../modules/case-data.js';

let passed=0;
async function check(label,run){await withDOM(run);passed++;console.log('PASS '+label)}
async function withDOM(run){
 const keys=['localStorage','document','location','window','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
 const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));const saved=new Map(),tasks=new Map();let timer=0,rejectedKey='';
 const body=new Element('body'),header=new Element('header'),toast=new Element('div',{id:'toast'});body.append(header);body.append(toast);
 globalThis.document={body,activeElement:null,getElementById:id=>body.querySelector('#'+id),createElement:tag=>{const el=new Element(tag);if(tag==='dialog'){el.showModal=()=>{};el.close=()=>{el.closed=true}}return el}};
 globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.location={hash:'#/chat/doc-check'};
 globalThis.localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>{if(key===rejectedKey)throw new Error('Simulated storage rejection');saved.set(key,value)}};
 globalThis.setTimeout=fn=>{tasks.set(++timer,fn);return timer};globalThis.clearTimeout=id=>tasks.delete(id);globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.cancelAnimationFrame=()=>{};
 const flush=()=>{const pending=[...tasks.values()];tasks.clear();pending.forEach(fn=>fn())};
 const entry=()=>JSON.parse(localStorage.getItem('neolaw.design.chats'))[0];
 const ctx={route:['chat','doc-check'],params:new URLSearchParams(),refreshes:0,setHeader(title,html=''){ctx.headerTitle=title;header.innerHTML=html},refreshSidebar(){ctx.refreshes++},navigate(value){ctx.destination=value}};
 const mount=(initial)=>{if(initial)localStorage.setItem('neolaw.design.chats',JSON.stringify([{id:'doc-check',title:'Document check',prompt:'',messages:[],files:[],...initial}]));const container=new Element('main');body.append(container);const cleanup=renderChat(container,ctx);return{container,cleanup}};
 const submit=(container,text)=>{const input=container.querySelector('#chat-input');input.value=text;input.oninput();container.querySelector('#chat-form').onsubmit({preventDefault(){}})};
 try{await run({body,header,toast,ctx,flush,tasks,entry,mount,submit,reject:key=>{rejectedKey=key?'neolaw.design.'+key:''}})}finally{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}

console.log('Document showcase callback checks · no live AI, file parsing or browser layout claims\n');

await check('Review accepts, dismisses and undoes while preserving scroll, focus and saved decisions',({mount,entry})=>{
 let screen=mount({tool:'review'});let c=screen.container;c.querySelector('[data-sample]').click();
 assert.equal(c.querySelectorAll('[data-change]').length,4);assert.match(c.querySelector('#document-panel').textContent,/WORKING DOCUMENT/);
 c.querySelector('.document-scroll').scrollTop=275;const accept=c.querySelector('[data-change="liability"][data-decision="accepted"]');accept.focus();accept.click();
 assert.equal(entry().document.changes.liability,'accepted');assert.equal(c.querySelector('.document-scroll').scrollTop,275);assert.strictEqual(document.activeElement,c.querySelector('[data-undo="liability"]'));assert.ok(c.querySelector('#clause-liability').textContent.includes('fees paid during the preceding twelve months'));
 c.querySelector('[data-change="termination"][data-decision="rejected"]').click();assert.equal(entry().document.changes.termination,'rejected');assert.ok(c.querySelector('#clause-termination').textContent.includes('without notice'));
 c.querySelector('[data-undo="liability"]').click();assert.equal(entry().document.changes.liability,undefined);assert.strictEqual(document.activeElement,c.querySelector('[data-change="liability"]'));
 screen.cleanup();c.remove();screen=mount();c=screen.container;assert.equal(c.querySelectorAll('[data-change]').length,2);assert.ok(c.querySelector('[data-undo="termination"]'));screen.cleanup();
});

for(const decision of ['accepted','rejected']){
 await check(`A failed ${decision==='accepted'?'Accept':'Dismiss'} save keeps the proposal, action, scroll and draft for retry`,({mount,entry,reject,toast})=>{
  const screen=mount({tool:'review'}),c=screen.container;c.querySelector('[data-sample]').click();
  const input=c.querySelector('#chat-input'),flow=c.querySelector('#chat-flow'),reader=c.querySelector('.document-scroll');input.value='Keep my unfinished instructions';flow.scrollTop=111;reader.scrollTop=278;
  const action=c.querySelector(`[data-change="liability"][data-decision="${decision}"]`);action.focus();const prior=entry(),paper=c.querySelector('.document-paper').innerHTML;
  reject('chats');action.click();assert.deepEqual(entry(),prior);assert.equal(c.querySelector('.document-paper').innerHTML,paper);assert.strictEqual(c.querySelector(`[data-change="liability"][data-decision="${decision}"]`),action);assert.strictEqual(document.activeElement,action);assert.equal(reader.scrollTop,278);assert.equal(flow.scrollTop,111);assert.equal(input.value,'Keep my unfinished instructions');assert.match(toast.textContent,/could not be saved/i);assert.doesNotMatch(toast.textContent,/Change accepted|Original wording kept/);
  reject('');c.querySelector('[data-change="termination"][data-decision="accepted"]').click();assert.equal(entry().document.changes.liability,undefined);assert.equal(entry().document.changes.termination,'accepted');assert.ok(c.querySelector('[data-change="liability"]'));
  c.querySelector(`[data-change="liability"][data-decision="${decision}"]`).click();assert.equal(entry().document.changes.liability,decision);assert.equal(c.querySelector('.document-scroll').scrollTop,278);assert.equal(input.value,'Keep my unfinished instructions');assert.strictEqual(document.activeElement,c.querySelector('[data-undo="liability"]'));assert.equal(toast.textContent,decision==='accepted'?'Change accepted':'Original wording kept');screen.cleanup();
 });
}

await check('Failed Undo retains the accepted clause and retry button without leaking an unsaved reversal',({mount,entry,reject,toast})=>{
 const screen=mount({tool:'review'}),c=screen.container;c.querySelector('[data-sample]').click();c.querySelector('[data-change="liability"][data-decision="accepted"]').click();
 const input=c.querySelector('#chat-input'),reader=c.querySelector('.document-scroll');input.value='Keep the current draft';reader.scrollTop=310;const undo=c.querySelector('[data-undo="liability"]');undo.focus();const prior=entry(),clause=c.querySelector('#clause-liability').innerHTML;
 reject('chats');undo.click();assert.deepEqual(entry(),prior);assert.equal(c.querySelector('#clause-liability').innerHTML,clause);assert.strictEqual(c.querySelector('[data-undo="liability"]'),undo);assert.strictEqual(document.activeElement,undo);assert.equal(reader.scrollTop,310);assert.equal(input.value,'Keep the current draft');assert.match(toast.textContent,/could not be saved/i);
 reject('');c.querySelector('[data-change="termination"][data-decision="rejected"]').click();assert.equal(entry().document.changes.liability,'accepted');c.querySelector('[data-undo="liability"]').click();assert.equal(entry().document.changes.liability,undefined);assert.ok(c.querySelector('[data-change="liability"]'));assert.strictEqual(document.activeElement,c.querySelector('[data-change="liability"]'));assert.equal(c.querySelector('.document-scroll').scrollTop,310);assert.equal(input.value,'Keep the current draft');screen.cleanup();
});

await check('Rejected translation selection restores its saved option, source text and focus, then retries',({mount,entry,reject,toast})=>{
 const screen=mount({tool:'translate'}),c=screen.container;c.querySelector('[data-sample]').click();const input=c.querySelector('#chat-input'),reader=c.querySelector('.document-scroll'),select=c.querySelector('#language-view');input.value='Keep this translation note';reader.scrollTop=188;select.focus();const prior=entry(),paper=c.querySelector('.document-paper').innerHTML;
 reject('chats');select.value='el';select.emit('change');assert.deepEqual(entry(),prior);assert.equal(select.value,'both');assert.equal(c.querySelector('.document-paper').innerHTML,paper);assert.strictEqual(document.activeElement,select);assert.equal(reader.scrollTop,188);assert.equal(input.value,'Keep this translation note');assert.match(toast.textContent,/could not be saved/i);
 reject('');c.querySelector('#close-document').click();assert.equal(entry().document.language,'both');c.querySelector('#reopen-doc').click();const restored=c.querySelector('#language-view');restored.focus();restored.value='el';restored.emit('change');assert.equal(entry().document.language,'el');assert.strictEqual(document.activeElement,restored);assert.ok(c.querySelector('.document-paper').textContent.includes('Αμοιβή'));assert.ok(!c.querySelector('.document-paper').textContent.includes('Fees and payment'));assert.equal(input.value,'Keep this translation note');screen.cleanup();
});

await check('A failed document close leaves the reader open and focused for retry, preserving conversation and draft',({mount,entry,reject,toast})=>{
 const screen=mount({tool:'review'}),c=screen.container;c.querySelector('[data-sample]').click();const close=c.querySelector('#close-document'),input=c.querySelector('#chat-input'),flow=c.querySelector('#chat-flow'),reader=c.querySelector('.document-scroll');input.value='Keep this draft';flow.scrollTop=95;reader.scrollTop=226;close.focus();const before=entry(),messages=flow.innerHTML;
 reject('chats');close.click();assert.deepEqual(entry(),before);assert.equal(c.querySelector('#document-panel').hidden,false);assert.strictEqual(c.querySelector('#close-document'),close);assert.strictEqual(document.activeElement,close);assert.equal(reader.scrollTop,226);assert.equal(flow.scrollTop,95);assert.equal(flow.innerHTML,messages);assert.equal(input.value,'Keep this draft');assert.match(toast.textContent,/could not be saved/i);
 reject('');c.querySelector('[data-change="liability"][data-decision="accepted"]').click();assert.equal(entry().documentPanelOpen,true);c.querySelector('#close-document').click();assert.equal(entry().documentPanelOpen,false);assert.equal(c.querySelector('#document-panel').hidden,true);assert.strictEqual(document.activeElement,input);assert.equal(input.value,'Keep this draft');screen.cleanup();
});

await check('Document close state survives reopening and review links restore the document',({mount,entry})=>{
 let screen=mount({tool:'review'}),c=screen.container;c.querySelector('[data-sample]').click();c.querySelector('#close-document').click();
 assert.equal(entry().documentPanelOpen,false);assert.equal(c.querySelector('#document-panel').hidden,true);assert.strictEqual(document.activeElement,c.querySelector('#chat-input'));
 screen.cleanup();c.remove();screen=mount();c=screen.container;assert.equal(c.querySelector('#document-panel').hidden,true);assert.ok(c.querySelector('#reopen-doc'));
 c.querySelector('[data-clause="liability"]').click();assert.equal(c.querySelector('#document-panel').hidden,false);assert.equal(entry().documentPanelOpen,true);assert.strictEqual(document.activeElement,c.querySelector('#clause-liability'));assert.equal(c.querySelector('#clause-liability').scrolled,true);screen.cleanup();
});

await check('Rapid sends retain the next draft; an interrupted follow-up resumes once on return',({mount,entry,submit,flush})=>{
 let screen=mount({tool:'edit'}),c=screen.container;c.querySelector('[data-sample]').click();const before=entry().messages.length;
 submit(c,'Change the hourly rate to 120');assert.equal(entry().messages.length,before+1);assert.equal(c.querySelector('.send-button').disabled,true);assert.ok(c.querySelector('[role="status"]'));
 submit(c,'Change the hourly rate to 130');assert.equal(entry().messages.length,before+1);assert.equal(c.querySelector('#chat-input').value,'Change the hourly rate to 130');assert.equal(entry().pendingReply.text,'Change the hourly rate to 120');
 screen.cleanup();c.remove();flush();assert.equal(entry().messages.length,before+1);
 screen=mount();c=screen.container;assert.equal(c.querySelector('.send-button').disabled,true);flush();assert.equal(entry().messages.length,before+2);assert.equal(entry().pendingReply,undefined);assert.equal(entry().document.rate,'120');assert.ok(c.querySelector('#clause-fees').textContent.includes('EUR 120'));
 flush();assert.equal(entry().messages.length,before+2);submit(c,'Change the hourly rate to 130');flush();assert.equal(entry().document.rate,'130');screen.cleanup();
});

await check('Composer respects IME composition and Shift+Enter, and submits plain Enter once',({mount,entry,flush})=>{
 const screen=mount({tool:'edit'}),c=screen.container,input=c.querySelector('#chat-input'),form=c.querySelector('#chat-form');let submissions=0;
 form.requestSubmit=()=>{submissions++;form.onsubmit({preventDefault(){}})};input.value='A short message';input.oninput();
 for(const options of [{isComposing:true},{keyCode:229},{shiftKey:true}]){let prevented=false;input.onkeydown({key:'Enter',preventDefault(){prevented=true},...options});assert.equal(prevented,false)}
 assert.equal(submissions,0);input.onkeydown({key:'Enter',preventDefault(){}});input.onkeydown({key:'Enter',preventDefault(){}});assert.equal(submissions,1);assert.equal(entry().messages.length,1);flush();screen.cleanup();
});

await check('Files stay staged until sending, survive sample opening and support separate local text previews',async({mount,entry,flush})=>{
 const sent={name:'existing.pdf',size:100,type:'application/pdf'},screen=mount({tool:'review',files:[sent]}),c=screen.container,fileInput=c.querySelector('#file-input');
 fileInput.files=[{name:'notes.txt',size:40,type:'text/plain',text:async()=>'<draft> Contract notes'},{name:'more.md',size:20,type:'text/markdown',text:async()=>'# More notes'}];await fileInput.onchange({target:fileInput});
 assert.deepEqual(entry().files,[sent]);assert.equal(c.querySelectorAll('.attached-chip').length,2);c.querySelector('#chat-form').onsubmit({preventDefault(){}});flush();assert.equal(entry().files.length,3);assert.match(entry().messages.at(-1).text,/Automatic document analysis is currently unavailable/);
 const previews=c.querySelectorAll('[data-preview-text]');assert.equal(previews.length,2);previews[1].click();assert.equal(entry().document.name,'more.md');assert.ok(c.querySelector('.document-paper').textContent.includes('# More notes'));assert.match(c.querySelector('.document-footer').textContent,/^DOCUMENT/);assert.doesNotMatch(c.querySelector('.document-footer').textContent,/WORKING DOCUMENT/);
 c.querySelector('[data-sample]').click();assert.equal(entry().files.length,3);assert.equal(entry().document.kind,'review');assert.match(c.querySelector('.document-footer').textContent,/WORKING DOCUMENT/);
 c.querySelector('[data-preview-text="1"]').click();assert.ok(c.querySelector('.document-paper').textContent.includes('<draft>'));assert.equal(c.querySelector('.document-paper').querySelector('draft'),null);screen.cleanup();
});

await check('Removing a staged file never removes a previously sent file',async({mount,entry})=>{
 const sent={name:'existing.pdf',size:100,type:'application/pdf'},screen=mount({tool:'edit',files:[sent]}),c=screen.container,fileInput=c.querySelector('#file-input');fileInput.files=[{name:'second.pdf',size:100,type:'application/pdf'}];await fileInput.onchange({target:fileInput});c.querySelector('[data-remove="0"]').click();assert.equal(c.querySelectorAll('.attached-chip').length,0);assert.deepEqual(entry().files,[sent]);assert.equal(c.querySelector('.send-button').disabled,true);screen.cleanup();
});

await check('Unreadable and oversized files do not silently attach; a pending read blocks premature Send',async({mount,entry,submit,toast})=>{
 const screen=mount({tool:'edit'}),c=screen.container,fileInput=c.querySelector('#file-input');let complete;
 fileInput.files=[{name:'waiting.txt',size:25,type:'text/plain',text:()=>new Promise(resolve=>{complete=resolve})}];const reading=fileInput.onchange({target:fileInput});submit(c,'Please inspect');assert.equal(entry().messages.length,0);assert.equal(c.querySelector('#chat-input').value,'Please inspect');assert.equal(c.querySelector('.send-button').disabled,true);complete('Ready');await reading;assert.equal(c.querySelector('.send-button').disabled,false);
 c.querySelector('[data-remove="0"]').click();fileInput.files=[{name:'unreadable.txt',size:20,type:'text/plain',text:async()=>{throw new Error('Read failed')}}];await fileInput.onchange({target:fileInput});assert.equal(c.querySelectorAll('.attached-chip').length,0);assert.match(toast.textContent,/Could not read/);
 fileInput.files=[{name:'large.pdf',size:51*1024*1024,type:'application/pdf'}];await fileInput.onchange({target:fileInput});assert.equal(c.querySelectorAll('.attached-chip').length,0);assert.match(toast.textContent,/exceeds 50 MB/);screen.cleanup();
});

await check('Opening attached text replaces the source reader without inventing a document analysis',({mount,entry})=>{
 const screen=mount({tool:'edit',files:[{name:'my-notes.txt',size:4,type:'text/plain',content:'Private local text'}],casePanel:{caseId:CASES[0].id,view:'brief',block:0}}),c=screen.container;assert.equal(c.querySelector('.chat-layout').classList.contains('has-case'),true);c.querySelector('[data-preview-text]').click();assert.equal(entry().casePanel,null);assert.equal(c.querySelector('.chat-layout').classList.contains('has-case'),false);assert.equal(c.querySelector('#document-panel').hidden,false);assert.ok(c.querySelector('.document-paper').textContent.includes('Private local text'));assert.equal(entry().messages.length,0);screen.cleanup();
});

await check('Translation view is persisted, and all prepared document tools open their own labelled document',({mount,entry})=>{
 for(const tool of ['review','edit','compare','translate','pleading','opinion','chronology','draft']){const screen=mount({tool}),c=screen.container;c.querySelector('[data-sample]').click();assert.equal(entry().document.kind,tool);assert.equal(c.querySelector('#document-panel').hidden,false);assert.ok(c.querySelector('.document-footer').textContent.includes('WORKING DOCUMENT'));if(tool==='translate'){const select=c.querySelector('#language-view');select.value='el';select.emit('change');assert.equal(entry().document.language,'el');assert.ok(c.querySelector('.document-paper').textContent.includes('Αμοιβή'));assert.ok(!c.querySelector('.document-paper').textContent.includes('Fees and payment'));screen.cleanup();c.remove();const restored=mount();assert.equal(restored.container.querySelector('#language-view').value,'el');restored.cleanup();restored.container.remove()}else{screen.cleanup();c.remove()}}
 const screen=mount({tool:'resolution'}),c=screen.container;c.querySelector('#resolution-company').value='Sample & Co';c.querySelector('#draft-resolution').click();assert.equal(entry().document.company,'Sample & Co');assert.equal(entry().document.kind,'resolution');assert.ok(c.querySelector('.document-paper').textContent.includes('Sample & Co'));screen.cleanup();
});

await check('Home workflow cards link directly to the selected workflow preview',({body,ctx})=>{
 const c=new Element('main');body.append(c);ctx.storage={get:()=>[]};ctx.libraryItems=[{id:'diligence',type:'workflows',title:'Due diligence',description:'Prepared workflow',icon:'file'}];renderHome(c,ctx);c.querySelector('[data-tab="workflows"]').click();c.querySelector('[data-item="0"]').click();assert.equal(ctx.destination,'/library?tab=workflows&item=diligence');
});

for(const rejectedStore of ['chats','projects']){
 await check(`Chat rename preserves its draft and both records when ${rejectedStore} storage rejects the save`,({body,header,mount,entry,ctx,reject})=>{
  const projects=[{id:'first',name:'First matter',chats:[{id:'doc-check',title:'Original title',pinned:false}],files:[]}];localStorage.setItem('neolaw.design.projects',JSON.stringify(projects));const screen=mount({tool:'edit',title:'Original title',projectId:'first',pinned:false});
  header.querySelector('#chat-options').click();body.querySelector('#rename-chat').click();const dialog=body.querySelector('dialog'),input=dialog.querySelector('#chat-name');input.value='Renamed chat';reject(rejectedStore);dialog.querySelector('#save-name').click();
  assert.equal(dialog.isConnected,true);assert.equal(input.value,'Renamed chat');assert.equal(entry().title,'Original title');assert.deepEqual(JSON.parse(localStorage.getItem('neolaw.design.projects')),projects);assert.equal(ctx.headerTitle,'First matter / Original title');assert.equal(ctx.refreshes,0);
  reject('');dialog.querySelector('#save-name').click();assert.equal(dialog.isConnected,false);assert.equal(entry().title,'Renamed chat');assert.equal(JSON.parse(localStorage.getItem('neolaw.design.projects'))[0].chats[0].title,'Renamed chat');assert.equal(ctx.headerTitle,'First matter / Renamed chat');assert.equal(ctx.refreshes,1);screen.cleanup();
 });
 await check(`Chat pin leaves the menu and records unchanged when ${rejectedStore} storage rejects the save`,({body,header,mount,entry,ctx,reject,toast})=>{
  const projects=[{id:'first',name:'First matter',chats:[{id:'doc-check',title:'Original title',pinned:false}],files:[]}];localStorage.setItem('neolaw.design.projects',JSON.stringify(projects));const screen=mount({tool:'edit',title:'Original title',projectId:'first',pinned:false});
  header.querySelector('#chat-options').click();const dialog=body.querySelector('dialog');reject(rejectedStore);dialog.querySelector('#pin-chat').click();assert.equal(dialog.isConnected,true);assert.equal(entry().pinned,false);assert.deepEqual(JSON.parse(localStorage.getItem('neolaw.design.projects')),projects);assert.equal(ctx.refreshes,0);assert.doesNotMatch(toast.textContent,/Chat pinned/);
  reject('');dialog.querySelector('#pin-chat').click();assert.equal(dialog.isConnected,false);assert.equal(entry().pinned,true);assert.equal(JSON.parse(localStorage.getItem('neolaw.design.projects'))[0].chats[0].pinned,true);assert.equal(ctx.refreshes,1);assert.equal(toast.textContent,'Chat pinned');screen.cleanup();
 });
 await check(`Moving a chat retains its original project and open picker when ${rejectedStore} storage rejects the save`,({body,header,mount,entry,ctx,reject,toast})=>{
  const projects=[{id:'first',name:'First matter',chats:[{id:'doc-check',title:'Original title',pinned:false}],files:[]},{id:'second',name:'Second matter',chats:[],files:[]}];localStorage.setItem('neolaw.design.projects',JSON.stringify(projects));const screen=mount({tool:'edit',title:'Original title',projectId:'first',pinned:false});
  header.querySelector('#chat-options').click();body.querySelector('#move-chat').click();const dialog=body.querySelector('dialog');reject(rejectedStore);dialog.querySelector('[data-project="second"]').click();assert.equal(dialog.isConnected,true);assert.equal(entry().projectId,'first');assert.deepEqual(JSON.parse(localStorage.getItem('neolaw.design.projects')),projects);assert.equal(ctx.headerTitle,'First matter / Original title');assert.equal(ctx.refreshes,0);assert.doesNotMatch(toast.textContent,/Moved to/);
  reject('');dialog.querySelector('[data-project="second"]').click();assert.equal(dialog.isConnected,false);assert.equal(entry().projectId,'second');const saved=JSON.parse(localStorage.getItem('neolaw.design.projects'));assert.equal(saved[0].chats.length,0);assert.equal(saved[1].chats.length,1);assert.equal(saved[1].chats[0].id,'doc-check');assert.equal(ctx.headerTitle,'Second matter / Original title');assert.equal(ctx.refreshes,1);assert.equal(toast.textContent,'Moved to Second matter');screen.cleanup();
 });
}

console.log(`\n${passed} targeted document/chat checks passed. Browser layout and screenshots remain unverified.`);
