import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {renderChat} from '../chat.js';
import {preparedCaseAnswer} from '../modules/case-research.js';
import {CASES} from '../modules/case-data.js';

// Focus requests and DOM identity only. This double does not implement CSS or native keyboard focus.
let passed=0,fixture=0;
function check(label,width,initial,run){
  const names=['document','window','location','localStorage','matchMedia','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
  const originals=Object.fromEntries(names.map(key=>[key,globalThis[key]]));
  const saved=new Map(),frames=new Map(),timers=new Map(),windowListeners=new Map();let task=0,cleanup;
  const body=new Element('body'),header=new Element('header'),container=new Element('main');body.append(header);body.append(container);body.append(new Element('div',{id:'toast'}));
  globalThis.document={body,activeElement:null,getElementById:id=>body.querySelector('#'+id),createElement:tag=>new Element(tag)};
  const matchMedia=query=>({matches:/max-width\s*:\s*(\d+)/.test(query)?width<=Number(query.match(/max-width\s*:\s*(\d+)/)[1]):false,addEventListener(){},removeEventListener(){}});
  globalThis.matchMedia=matchMedia;
  globalThis.window={innerWidth:width,matchMedia,addEventListener(type,fn){if(!windowListeners.has(type))windowListeners.set(type,new Set());windowListeners.get(type).add(fn);},removeEventListener(type,fn){windowListeners.get(type)?.delete(fn);}};
  const id='panel-focus-'+(++fixture);globalThis.location={hash:'#/chat/'+id};
  globalThis.localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  globalThis.requestAnimationFrame=fn=>{frames.set(++task,fn);return task;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  globalThis.setTimeout=(fn,delay)=>{timers.set(++task,{fn,delay});return task;};globalThis.clearTimeout=id=>timers.delete(id);
  localStorage.setItem('neolaw.design.chats',JSON.stringify([{id,title:'Panel focus fixture',tool:'',prompt:'',messages:[],files:[],...initial}]));
  const get=selector=>{const node=container.querySelector(selector);assert.ok(node,`Missing ${selector}`);return node;};
  const flushFrames=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
  const click=selector=>{get(selector).click();flushFrames();};
  const flushReplies=()=>{const pending=[...timers.entries()].filter(([,timer])=>timer.delay<=500);for(const[id,{fn}]of pending){timers.delete(id);fn();}flushFrames();};
  const send=text=>{const input=get('#chat-input');input.value=text;input.oninput();get('#chat-form').onsubmit({preventDefault(){}});};
  const expectVisibleFocus=()=>{const target=document.activeElement;assert.ok(target?.isConnected,'Focus target must still be connected');const hiddenChat=width<=840&&get('.chat-layout').classList.contains('has-document');assert.ok(!hiddenChat||!get('.chat-column').contains(target),'Narrow-layout focus must not target the hidden chat column');};
  try{
    cleanup=renderChat(container,{route:['chat',id],params:new URLSearchParams(),setHeader(_title,html){header.innerHTML=html;},refreshSidebar(){}});flushFrames();
    run({container,get,click,flushFrames,flushReplies,send,expectVisibleFocus,resize(next){width=next;window.innerWidth=next;for(const fn of windowListeners.get('resize')||[])fn();flushFrames();}});
    passed++;console.log('PASS '+label);
  }finally{cleanup?.();for(const[key,value]of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
}

const storedDocument={kind:'review',name:'Existing working document',changes:{},showChanges:['liability','termination'],language:'both'};
const answer=preparedCaseAnswer('Show all 10 cases on premeditated murder.');
const sourceMessages=[{role:'assistant',...answer}];
console.log('Chat/source/document focus transitions · DOM callback checks\n');

for(const tool of ['review','resolution'])check(`${tool} opening moves narrow-layout focus into its sample document`,600,{tool},({get,click,expectVisibleFocus})=>{
  const selector=tool==='resolution'?'#draft-resolution':'[data-sample]';get(selector).focus();click(selector);assert.equal(get('#document-panel').hidden,false);assert.strictEqual(document.activeElement,get('#close-document'));expectVisibleFocus();
});

check('Local text preview receives focus when it replaces the narrow conversation',600,{files:[{name:'Notes.txt',type:'text/plain',size:12,content:'Local text'}]},({get,click,expectVisibleFocus})=>{
  get('[data-preview-text="0"]').focus();click('[data-preview-text="0"]');assert.ok(get('.document-paper').textContent.includes('Local text'));assert.strictEqual(document.activeElement,get('#close-document'));expectVisibleFocus();
});

check('Reopening a closed document focuses the visible reader control',600,{document:storedDocument,documentPanelOpen:false},({get,click,expectVisibleFocus})=>{
  assert.equal(get('#document-panel').hidden,true);get('#reopen-doc').focus();click('#reopen-doc');assert.equal(get('#document-panel').hidden,false);assert.strictEqual(document.activeElement,get('#close-document'));expectVisibleFocus();
});

check('Closing a source over an existing open document focuses that visible document',600,{document:storedDocument,documentPanelOpen:true,casePanel:{caseId:CASES[0].id,view:'brief',block:0},messages:sourceMessages},({get,click,expectVisibleFocus})=>{
  click('[data-close-case]');assert.equal(get('#document-panel').hidden,false);assert.equal(get('.chat-layout').classList.contains('has-case'),false);assert.strictEqual(document.activeElement,get('#close-document'));expectVisibleFocus();
});

check('Desktop source close returns to its original citation trigger',1200,{messages:sourceMessages},({get,click,flushFrames,expectVisibleFocus})=>{
  const trigger=get('[data-case-source]');trigger.focus();trigger.click();flushFrames();assert.equal(get('#document-panel').hidden,false);click('[data-close-case]');assert.equal(get('#document-panel').hidden,true);assert.strictEqual(document.activeElement,trigger);expectVisibleFocus();
});

check('Narrow source close without an underlying document returns focus to the visible chat',600,{messages:sourceMessages},({get,click,flushFrames,expectVisibleFocus})=>{
  const trigger=get('[data-case-source]');trigger.focus();trigger.click();flushFrames();click('[data-close-case]');assert.equal(get('#document-panel').hidden,true);assert.equal(get('.chat-layout').classList.contains('has-document'),false);assert.ok(get('.chat-column').contains(document.activeElement));expectVisibleFocus();
});

check('Closing a source after desktop-to-narrow resize avoids the newly hidden chat',1200,{document:storedDocument,documentPanelOpen:true,messages:sourceMessages},({get,click,flushFrames,resize,expectVisibleFocus})=>{
  const trigger=get('[data-case-source]');trigger.focus();trigger.click();flushFrames();resize(600);click('[data-close-case]');assert.equal(get('#document-panel').hidden,false);assert.strictEqual(document.activeElement,get('#close-document'));expectVisibleFocus();
});

check('Reply completion leaves an unchanged source mounted and preserves its scroll and composer focus',1200,{messages:sourceMessages},({get,container,flushFrames,flushReplies,send,expectVisibleFocus})=>{
  const card=[...container.querySelectorAll('[data-case-source]')].find(button=>!button.dataset.sourceBlock);assert.ok(card);card.click();flushFrames();
  const panelContent=get('.cases-panel-content'),input=get('#chat-input');panelContent.scrollTop=321;input.focus();send('Please explain the legal issue');assert.strictEqual(get('.cases-panel-content'),panelContent);assert.ok(container.querySelector('.thinking'));flushReplies();
  assert.equal(container.querySelector('.thinking'),null);assert.equal(container.querySelector('.reply-recovery'),null);assert.equal(container.querySelectorAll('.message.assistant').length,2,'The prepared follow-up must actually complete');
  assert.strictEqual(get('.cases-panel-content'),panelContent,'Unchanged source DOM must not be reconstructed after a reply');assert.equal(panelContent.scrollTop,321);assert.strictEqual(document.activeElement,input);expectVisibleFocus();
});

console.log(`\n${passed} chat-panel focus groups pass. CSS visibility is checked against the known breakpoint rule; native focus, geometry and browser rendering remain unverified.`);
