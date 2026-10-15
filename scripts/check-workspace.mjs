import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Element} from './dom-double.mjs';
import {modal} from '../core.js';

// Source/callback verification only. This does not create or drive a browser.
const body=new Element('body');
body.innerHTML=readFileSync(new URL('../index.html',import.meta.url),'utf8').split('<body>')[1].split('</body>')[0];
const data=new Map(),listeners={},windowListeners=new Map(),timers=new Map();let timer=0,checks=0;
globalThis.localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
globalThis.document={body,activeElement:body,title:'',getElementById:id=>body.querySelector('#'+id),querySelector:selector=>body.querySelector(selector),querySelectorAll:selector=>body.querySelectorAll(selector),addEventListener:(...args)=>body.addEventListener(...args),removeEventListener:(...args)=>body.removeEventListener(...args),createElement(tag){const element=new Element(tag);if(tag==='dialog'){element.showModal=()=>element.setAttribute('open','');element.close=()=>element.removeAttribute('open')}return element}};
globalThis.window={addEventListener(type,fn){if(!windowListeners.has(type))windowListeners.set(type,new Set());windowListeners.get(type).add(fn);listeners[type]=(...args)=>[...windowListeners.get(type)].forEach(callback=>callback(...args))},removeEventListener(type,fn){windowListeners.get(type)?.delete(fn)},scrollTo(){}};
globalThis.location={hash:'#/chat'};
globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.cancelAnimationFrame=()=>{};
globalThis.setTimeout=fn=>{timers.set(++timer,fn);return timer};globalThis.clearTimeout=id=>timers.delete(id);

await import('../app.js');
function check(label,run){run();checks++;console.log('PASS '+label)}
check('Every workspace page removes the global title/badge strip while preserving page identity and mobile navigation',()=>{
 for(const[path,title]of[['/cases','Case Law'],['/projects','Projects'],['/library','Library'],['/matrix','Review table'],['/chat','Chat With NeoLaw']]){
  location.hash='#'+path;listeners.hashchange();const header=document.getElementById('topbar');
  assert.equal(document.getElementById('main').attrs['aria-label'],title);
  assert.equal(header.querySelector('#header-title'),null);assert.equal(header.querySelector('[data-command]'),null);assert.equal(header.querySelector('[data-info]'),null);
  assert.doesNotMatch(header.textContent,/Workspace|Design preview|CyLaw judgments/);assert.equal(header.querySelectorAll('button').length,1);
  assert.ok(header.querySelector('.mobile-menu'));assert.ok(document.getElementById('command-open'));assert.ok(document.getElementById('workspace-info'));
 }
});
check('A saved chat keeps its compact options control and pin action after global-bar removal',()=>{
 const previous=localStorage.getItem('neolaw.design.chats');
 localStorage.setItem('neolaw.design.chats',JSON.stringify([{id:'chrome-check',title:'A saved conversation',pinned:false,files:[],messages:[{role:'user',text:'A fixture'},{role:'assistant',text:'Prepared response',html:'<p>Prepared response</p>'}]}]));
 location.hash='#/chat/chrome-check';listeners.hashchange();
 assert.equal(document.getElementById('main').attrs['aria-label'],'A saved conversation');assert.ok(document.getElementById('chat-options'));
 document.getElementById('chat-options').click();document.querySelector('#pin-chat').click();
 assert.equal(JSON.parse(localStorage.getItem('neolaw.design.chats'))[0].pinned,true);assert.ok(document.getElementById('chat-options'));assert.equal(document.querySelector('#header-title'),null);
 if(previous)localStorage.setItem('neolaw.design.chats',previous);else localStorage.setItem('neolaw.design.chats','[]');
 location.hash='#/chat';listeners.hashchange();
});
check('Each command-palette workflow opens its specific library preview without creating a chat',()=>{
 for(const [title,id] of [['Contract first pass','workflow-contract'],['Litigation briefing','workflow-litigation'],['Closing pack','workflow-closing'],['Document chronology','workflow-chronology'],['Version reconciliation','workflow-versions']]){
  const before=localStorage.getItem('neolaw.design.chats');
  document.getElementById('command-open').click();const dialog=body.querySelector('dialog');
  const input=dialog.querySelector('#palette-input');input.value=title;input.emit('input');
  const pick=dialog.querySelector('.palette-row');assert.ok(pick?.textContent.includes(title));pick.click();
  assert.equal(location.hash,`/library?tab=workflows&item=${id}`);
  assert.equal(localStorage.getItem('neolaw.design.chats'),before);
  assert.equal(body.querySelector('dialog'),null);
 }
});
check('Palette search supports keyboard selection and empty-result navigation',()=>{
 document.getElementById('command-open').click();const dialog=body.querySelector('dialog');
 const input=dialog.querySelector('#palette-input'),output=dialog.querySelector('#palette-results');
 input.value='zz-no-match';input.emit('input');assert.ok(output.textContent.includes('No matches'));
 input.emit('keydown',{key:'ArrowDown'});output.emit('keydown',{key:'ArrowUp'});
 input.value='Closing pack';input.emit('input');input.emit('keydown',{key:'ArrowDown'});assert.strictEqual(document.activeElement,output.querySelector('button'));
 input.emit('keydown',{key:'Enter'});assert.equal(location.hash,'/library?tab=workflows&item=workflow-closing');
});
check('Closing a dialog restores its connected trigger without requesting a scroll',()=>{
 const trigger=document.getElementById('command-open');let options;trigger.focus=value=>{document.activeElement=trigger;options=value};trigger.focus();
 const close=modal({title:'Keyboard test',body:'<p>Prepared callback fixture</p>'});close();
 assert.strictEqual(document.activeElement,trigger);assert.deepEqual(options,{preventScroll:true});assert.equal(body.querySelector('dialog'),null);
});
check('Closing after a trigger is replaced focuses the workspace instead of a detached control',()=>{
 const oldTrigger=new Element('button');body.append(oldTrigger);oldTrigger.focus();
 const main=document.getElementById('main');let options;main.focus=value=>{document.activeElement=main;options=value};
 const close=modal({title:'Replaced trigger',body:'<p>Prepared callback fixture</p>'});oldTrigger.remove();close();
 assert.strictEqual(document.activeElement,main);assert.deepEqual(options,{preventScroll:true});
});
check('Mobile navigation has an internal close button and restores trigger focus without changing the rail preference',()=>{
 const trigger=document.querySelector('.mobile-menu'),inside=document.getElementById('rail-toggle');const rail=body.classList.contains('rail');
 trigger.click();assert.equal(body.classList.contains('mobile-nav'),true);assert.equal(trigger.attrs['aria-expanded'],'true');assert.equal(inside.attrs['aria-label'],'Close navigation');assert.strictEqual(document.activeElement,document.querySelector('#sidebar .new-chat'));
 inside.click();assert.equal(body.classList.contains('mobile-nav'),false);assert.equal(trigger.attrs['aria-expanded'],'false');assert.equal(body.classList.contains('rail'),rail);assert.strictEqual(document.activeElement,trigger);
 trigger.click();body.emit('keydown',{key:'Escape'});assert.equal(body.classList.contains('mobile-nav'),false);assert.strictEqual(document.activeElement,trigger);
 trigger.click();const close=modal({title:'Nested dialog',body:'<p>Fixture</p>'});body.emit('keydown',{key:'Escape'});assert.equal(body.classList.contains('mobile-nav'),true);close();body.emit('keydown',{key:'Escape'});assert.equal(body.classList.contains('mobile-nav'),false);
 trigger.click();window.matchMedia=()=>({matches:true});listeners.resize();delete window.matchMedia;assert.equal(body.classList.contains('mobile-nav'),false);assert.equal(trigger.attrs['aria-expanded'],'false');
});
check('Mobile drawer isolates the workspace and exposes a dismissible backdrop',()=>{
 const trigger=document.querySelector('.mobile-menu'),sidebar=document.getElementById('sidebar'),workspace=document.getElementById('workspace'),backdrop=document.getElementById('navigation-backdrop'),skip=document.querySelector('.skip-link');
 trigger.click();assert.equal(workspace.inert,true);assert.equal(skip.inert,true);assert.equal(backdrop.hidden,false);assert.equal(sidebar.attrs.role,'dialog');assert.equal(sidebar.attrs['aria-modal'],'true');
 backdrop.click();assert.equal(workspace.inert,false);assert.equal(skip.inert,false);assert.equal(backdrop.hidden,true);assert.equal(sidebar.attrs.role,undefined);assert.equal(sidebar.attrs['aria-modal'],undefined);assert.strictEqual(document.activeElement,trigger);
});
check('Mobile drawer wraps keyboard focus while nested dialogs keep their own Tab handling',()=>{
 const trigger=document.querySelector('.mobile-menu');trigger.click();const sidebar=document.getElementById('sidebar');
 const controls=sidebar.querySelectorAll('button,a[href],input,select,textarea,[tabindex]');const first=controls[0],last=controls.at(-1);
 last.focus();assert.equal(last.emit('keydown',{key:'Tab'}).defaultPrevented,true);assert.strictEqual(document.activeElement,first);
 first.focus();assert.equal(first.emit('keydown',{key:'Tab',shiftKey:true}).defaultPrevented,true);assert.strictEqual(document.activeElement,last);
 document.getElementById('main').focus();body.emit('keydown',{key:'Tab'});assert.strictEqual(document.activeElement,first);
 const close=modal({title:'Nested focus test',body:'<button id="nested-button">Inside dialog</button>'}),nested=body.querySelector('#nested-button');nested.focus();assert.equal(nested.emit('keydown',{key:'Tab'}).defaultPrevented,undefined);assert.strictEqual(document.activeElement,nested);close();
 document.getElementById('rail-toggle').click();assert.equal(body.classList.contains('mobile-nav'),false);
});
check('Navigation and desktop resize release mobile workspace isolation',()=>{
 document.querySelector('.mobile-menu').click();document.querySelector('#sidebar [data-nav="/cases"]').click();
 assert.equal(location.hash,'/cases');assert.equal(document.getElementById('workspace').inert,false);assert.equal(document.getElementById('navigation-backdrop').hidden,true);
 document.querySelector('.mobile-menu').click();window.matchMedia=()=>({matches:true});listeners.resize();delete window.matchMedia;
 assert.equal(document.getElementById('workspace').inert,false);assert.equal(document.getElementById('navigation-backdrop').hidden,true);assert.equal(document.querySelector('.skip-link').inert,false);
});
check('Starting a project chat rolls back a partial save and keeps the composer route on failure',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=source.slice(source.indexOf('function startChat('),source.indexOf('function openCommand('));
 const originalChats=[{id:'existing-chat',title:'Existing conversation',messages:[]}];
 const originalProjects=[{id:'matter',name:'A matter',chats:[],files:[]}];
 let saved={chats:structuredClone(originalChats),projects:structuredClone(originalProjects)},rejectProject=true;
 const storage={get:key=>structuredClone(saved[key]),set:(key,value)=>{if(key==='projects'&&rejectProject)return false;saved[key]=structuredClone(value);return true}};
 const routes=[];
 const call=new Function('storage','navigate','options',`let pendingChat=null;${start};return startChat(options);`);
 assert.equal(call(storage,path=>routes.push(path),{projectId:'matter',prompt:'Preserve my draft'}),false);
 assert.deepEqual(saved.chats,originalChats);assert.deepEqual(saved.projects,originalProjects);assert.deepEqual(routes,[]);
 rejectProject=false;assert.equal(call(storage,path=>routes.push(path),{projectId:'matter',prompt:'Preserve my draft'}),true);
 assert.equal(saved.chats.length,2);assert.equal(saved.projects[0].chats.length,1);assert.equal(saved.chats[0].id,saved.projects[0].chats[0].id);assert.equal(routes.length,1);
});
check('Screening entrypoints navigate without creating a chat or modifying project data',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=source.slice(source.indexOf('function startChat('),source.indexOf('function openCommand('));
 const routes=[];
 const storage={get(){throw new Error('Screening navigation must not read chat storage')},set(){throw new Error('Screening navigation must not write chat storage')}};
 const call=new Function('storage','navigate','options',`${start};return startChat(options);`);
 assert.equal(call(storage,path=>routes.push(path),{tool:'screening'}),true);
 assert.equal(call(storage,path=>routes.push(path),{tool:'screening',projectId:'client & matter'}),true);
 assert.deepEqual(routes,['/screening','/screening?project=client%20%26%20matter']);
 const navigation=source.slice(source.indexOf('const navigation='),source.indexOf('function renderSidebar'));
 assert.ok(navigation.indexOf("['cases'")<navigation.indexOf("['screening'"));
 assert.ok(navigation.indexOf("['screening'")<navigation.indexOf("['projects'"));
 assert.match(source,/page==='screening'\)cleanup=renderScreening\(main,ctx\)/);
 location.hash='#/chat';listeners.hashchange();
 document.getElementById('command-open').click();const dialog=body.querySelector('dialog'),input=dialog.querySelector('#palette-input');
 input.value='Screen a client';input.emit('input');dialog.querySelector('.palette-row').click();
 assert.equal(location.hash,'/screening');assert.equal(body.querySelector('dialog'),null);
});
console.log(`\n${checks} workspace checks passed. Browser rendering and native focus/scroll behavior remain unverified.`);
