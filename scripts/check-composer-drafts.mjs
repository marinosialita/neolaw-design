import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {renderChat,renderHome} from '../chat.js';
import {readComposerDraft,writeComposerDraft,clearComposerDraft} from '../modules/composer-drafts.js';

let passed=0;
async function check(label,run){
 const globals=['document','window','location','localStorage','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame'];
 const originals=Object.fromEntries(globals.map(key=>[key,globalThis[key]])),saved=new Map(),tasks=new Map(),draftKeys=new Set(['home']);let timer=0,writes=0,rejectWrites=false;
 clearComposerDraft('home');const body=new Element('body'),header=new Element('header'),toast=new Element('div',{id:'toast'});body.append(header);body.append(toast);
 globalThis.document={body,activeElement:null,getElementById:id=>body.querySelector('#'+id),createElement:tag=>new Element(tag)};
 globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.location={hash:'#/chat'};
 globalThis.localStorage={getItem:key=>saved.get(key)||null,setItem(key,value){if(rejectWrites)throw new Error('Simulated local-storage rejection');writes++;saved.set(key,value)}};
 globalThis.setTimeout=fn=>{tasks.set(++timer,fn);return timer};globalThis.clearTimeout=id=>tasks.delete(id);globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.cancelAnimationFrame=()=>{};
 const chats=()=>JSON.parse(localStorage.getItem('neolaw.design.chats')||'[]');
 const base={params:new URLSearchParams(),libraryItems:[],storage:{get:(_key,fallback)=>fallback},setHeader(_title,html=''){header.innerHTML=html},refreshSidebar(){},navigate(){}};
 const home=(startChat=()=>true)=>{const c=new Element('main');body.append(c);const cleanup=renderHome(c,{...base,route:['chat'],startChat});return{c,cleanup}};
 const chat=(id,extra={})=>{if(!draftKeys.has('chat:'+id)){clearComposerDraft('chat:'+id);draftKeys.add('chat:'+id)}if(!chats().some(entry=>entry.id===id))localStorage.setItem('neolaw.design.chats',JSON.stringify([...chats(),{id,title:id,tool:'edit',prompt:'',messages:[],files:[],...extra}]));const c=new Element('main');body.append(c);return{c,cleanup:renderChat(c,{...base,route:['chat',id]})}};
 const leave=screen=>{screen.cleanup();screen.c.remove()};
 const type=(screen,text)=>{const input=screen.c.querySelector('#chat-input');input.value=text;input.oninput();return input};
 const submit=screen=>screen.c.querySelector('#chat-form').onsubmit({preventDefault(){}});
 const flush=()=>{const pending=[...tasks.values()];tasks.clear();pending.forEach(fn=>fn())};
 const attach=async(screen,files)=>{const input=screen.c.querySelector('#file-input');input.files=files;await input.onchange({target:input})};
 try{await run({home,chat,chats,leave,type,submit,flush,attach,toast,writes:()=>writes,reject(value){rejectWrites=value}});passed++;console.log('PASS '+label)}finally{for(const key of draftKeys)clearComposerDraft(key);for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}

console.log('Composer draft navigation · page-memory state and callback checks, no browser\n');

await check('Home and each chat restore their own unfinished text without persisting it into history or storage',({home,chat,chats,leave,type,writes})=>{
 let a=chat('draft-a'),b=chat('draft-b');leave(b);const baseline=writes();const text='  Ελληνικό προσχέδιο\nKeep this second line.  ';type(a,text);leave(a);
 b=chat('draft-b');assert.equal(b.c.querySelector('#chat-input').value,'');type(b,'Separate B draft');leave(b);
 let h=home();assert.equal(h.c.querySelector('#chat-input').value,'');type(h,'Unsent home question');leave(h);
 a=chat('draft-a');assert.equal(a.c.querySelector('#chat-input').value,text);assert.equal(a.c.querySelector('.send-button').disabled,false);leave(a);
 b=chat('draft-b');assert.equal(b.c.querySelector('#chat-input').value,'Separate B draft');leave(b);
 h=home();assert.equal(h.c.querySelector('#chat-input').value,'Unsent home question');leave(h);
 assert.equal(writes(),baseline);assert.ok(chats().every(entry=>entry.messages.length===0&&entry.files.length===0));
});

await check('Completed staged attachments return as chips, remain separate from sent files and clear after accepted Send',async({chat,chats,leave,type,attach,submit,flush,writes})=>{
 const prior={name:'already-sent.pdf',size:30,type:'application/pdf'};let screen=chat('draft-files',{files:[prior]});const baseline=writes();type(screen,'Check these notes');await attach(screen,[{name:'draft.txt',size:22,type:'text/plain',text:async()=>'Locally read draft text'},{name:'agreement.pdf',size:50,type:'application/pdf'}]);leave(screen);
 assert.equal(writes(),baseline);assert.deepEqual(chats()[0].files,[prior]);screen=chat('draft-files');assert.equal(screen.c.querySelectorAll('.attached-chip').length,2);assert.equal(screen.c.querySelector('#chat-input').value,'Check these notes');assert.equal(readComposerDraft('chat:draft-files').attachments[0].content,'Locally read draft text');
 submit(screen);assert.equal(chats()[0].files.length,3);assert.equal(chats()[0].files.filter(file=>file.name==='draft.txt').length,1);assert.equal(readComposerDraft('chat:draft-files').attachments.length,0);assert.equal(readComposerDraft('chat:draft-files').text,'');assert.equal(screen.c.querySelectorAll('.attached-chip').length,0);flush();leave(screen);
 screen=chat('draft-files');assert.equal(screen.c.querySelectorAll('.attached-chip').length,0);assert.equal(screen.c.querySelector('#chat-input').value,'');assert.equal(chats()[0].files.length,3);leave(screen);
});

await check('An accepted home Send clears its draft even when navigation cleanup runs synchronously inside startChat',async({home,leave,type,attach,submit})=>{
 let sent,screen;screen=home(options=>{sent=options;leave(screen);return true});type(screen,'Start this new conversation');await attach(screen,[{name:'sample.pdf',size:10,type:'application/pdf'}]);submit(screen);
 assert.equal(sent.prompt,'Start this new conversation');assert.equal(sent.files.length,1);assert.deepEqual(readComposerDraft('home'),{text:'',attachments:[]});screen=home();assert.equal(screen.c.querySelector('#chat-input').value,'');assert.equal(screen.c.querySelectorAll('.attached-chip').length,0);leave(screen);
});

await check('Rejected home and existing-chat sends retain text and staged files across route changes for retry',async({home,chat,chats,leave,type,attach,submit,reject,flush})=>{
 let screen=home(()=>false);type(screen,'Keep failed home draft');await attach(screen,[{name:'home.pdf',size:11,type:'application/pdf'}]);submit(screen);leave(screen);let accepted;
 screen=home(options=>{accepted=options;return true});assert.equal(screen.c.querySelector('#chat-input').value,'Keep failed home draft');assert.equal(screen.c.querySelectorAll('.attached-chip').length,1);submit(screen);assert.equal(accepted.files[0].name,'home.pdf');leave(screen);
 screen=chat('draft-rejection');type(screen,'Keep failed chat draft');await attach(screen,[{name:'chat.pdf',size:12,type:'application/pdf'}]);reject(true);submit(screen);assert.equal(chats()[0].messages.length,0);leave(screen);reject(false);screen=chat('draft-rejection');assert.equal(screen.c.querySelector('#chat-input').value,'Keep failed chat draft');assert.equal(screen.c.querySelectorAll('.attached-chip').length,1);submit(screen);assert.equal(chats()[0].messages.length,1);assert.equal(chats()[0].files[0].name,'chat.pdf');flush();leave(screen);assert.deepEqual(readComposerDraft('chat:draft-rejection'),{text:'',attachments:[]});
});

await check('A draft written while the previous reply is pending returns separately from that persisted message',({chat,chats,leave,type,submit,flush})=>{
 let screen=chat('draft-pending');type(screen,'First sent instruction');submit(screen);type(screen,'Second unfinished question');assert.equal(chats()[0].messages.length,1);assert.equal(chats()[0].pendingReply.text,'First sent instruction');leave(screen);
 screen=chat('draft-pending');assert.equal(screen.c.querySelector('#chat-input').value,'Second unfinished question');assert.equal(screen.c.querySelector('.send-button').disabled,true);submit(screen);assert.equal(chats()[0].messages.length,1);flush();assert.equal(chats()[0].messages.length,2);assert.equal(chats()[0].pendingReply,undefined);assert.equal(screen.c.querySelector('#chat-input').value,'Second unfinished question');assert.equal(screen.c.querySelector('.send-button').disabled,false);leave(screen);
});

await check('Disposed file reads cannot overwrite a newer draft; only already completed attachments are restored',async({chat,chats,leave,type,attach,toast})=>{
 for(const fail of [false,true]){
  const id='draft-read-'+fail;let screen=chat(id),finish;type(screen,'Before leaving');const pending=attach(screen,[{name:'ready.pdf',size:12,type:'application/pdf'},{name:'still-reading.txt',size:20,type:'text/plain',text:()=>new Promise((resolve,reject)=>{finish=fail?reject:resolve})}]);leave(screen);
  screen=chat(id);assert.equal(screen.c.querySelectorAll('.attached-chip').length,1);assert.equal(readComposerDraft('chat:'+id).attachments[0].name,'ready.pdf');type(screen,'Updated after returning');const toastBefore=toast.textContent;finish(fail?new Error('Late read rejection'):'Late file content');await pending;
  assert.equal(screen.c.querySelector('#chat-input').value,'Updated after returning');assert.equal(screen.c.querySelectorAll('.attached-chip').length,1);assert.equal(readComposerDraft('chat:'+id).text,'Updated after returning');assert.equal(readComposerDraft('chat:'+id).attachments.length,1);assert.equal(toast.textContent,toastBefore);assert.ok(chats().every(entry=>entry.files.length===0));leave(screen);
 }
});

await check('Removing staged files and erasing text clears the draft; memory reads do not share mutable file records',async({chat,leave,type,attach})=>{
 let screen=chat('draft-clear');type(screen,'Erase me');await attach(screen,[{name:'temporary.txt',size:10,type:'text/plain',text:async()=>'Temporary text'}]);const copy=readComposerDraft('chat:draft-clear');copy.attachments[0].name='Mutated outside store';copy.attachments.push({name:'extra'});assert.equal(readComposerDraft('chat:draft-clear').attachments[0].name,'temporary.txt');assert.equal(readComposerDraft('chat:draft-clear').attachments.length,1);
 screen.c.querySelector('[data-remove="0"]').click();type(screen,'');leave(screen);assert.deepEqual(readComposerDraft('chat:draft-clear'),{text:'',attachments:[]});screen=chat('draft-clear');assert.equal(screen.c.querySelector('#chat-input').value,'');assert.equal(screen.c.querySelectorAll('.attached-chip').length,0);assert.equal(screen.c.querySelector('.send-button').disabled,true);leave(screen);
});

await check('A fresh page-module instance starts empty, rather than loading draft content from persistent storage',async()=>{
 writeComposerDraft('home',{text:'Memory-only question',attachments:[{name:'private.txt',size:10,type:'text/plain',content:'Memory-only text'}]});const fresh=await import('../modules/composer-drafts.js?fresh-page-fixture');assert.deepEqual(fresh.readComposerDraft('home'),{text:'',attachments:[]});assert.equal(readComposerDraft('home').text,'Memory-only question');
});

console.log(`\n${passed} composer draft checks passed. Refresh/tab close intentionally clears memory drafts; native navigation and file-picker behavior remain unverified.`);
