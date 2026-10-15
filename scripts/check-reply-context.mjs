import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {renderChat} from '../chat.js';
import {preparedCaseAnswer} from '../modules/case-research.js';
import {CASES} from '../modules/case-data.js';

// Actual renderChat callback tests using local in-memory fixtures. No browser, network or AI calls.
let passed=0,fixture=0;
function check(label,run){
 const names=['document','window','location','localStorage','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
 const original=Object.fromEntries(names.map(name=>[name,globalThis[name]]));
 const saved=new Map(),timers=new Map(),frames=new Map();let task=0,rejected=false,cleanup,container;
 const body=new Element('body'),header=new Element('header');body.append(header);body.append(new Element('div',{id:'toast'}));
 globalThis.document={body,activeElement:null,getElementById:id=>body.querySelector('#'+id),createElement:tag=>new Element(tag)};
 globalThis.window={matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}};
 const id='reply-context-'+(++fixture);globalThis.location={hash:'#/chat/'+id};
 globalThis.localStorage={getItem:key=>saved.get(key)||null,setItem(key,value){if(rejected&&key==='neolaw.design.chats')throw Error('Simulated local save rejection');saved.set(key,value);}};
 globalThis.requestAnimationFrame=callback=>{frames.set(++task,callback);return task;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.setTimeout=(callback,delay=0)=>{timers.set(++task,{callback,delay});return task;};globalThis.clearTimeout=id=>timers.delete(id);
 const flushFrames=()=>{const work=[...frames.values()];frames.clear();work.forEach(callback=>callback());};
 const flushReplies=()=>{const work=[...timers.entries()].filter(([,value])=>value.delay<=5500);for(const [id,{callback}]of work){timers.delete(id);callback();}flushFrames();};
 const ctx={route:['chat',id],params:new URLSearchParams(),setHeader(_title,html){header.innerHTML=html;},refreshSidebar(){},navigate(){}};
 const mount=initial=>{cleanup?.();container?.remove();if(initial)localStorage.setItem('neolaw.design.chats',JSON.stringify([{id,title:'Reply context check',prompt:'',messages:[],files:[],...initial}]));container=new Element('main');body.append(container);cleanup=renderChat(container,ctx);flushFrames();};
 const get=selector=>{const node=container.querySelector(selector);assert.ok(node,'Missing '+selector);return node;};
 const click=selector=>{get(selector).click();flushFrames();};
 const send=text=>{const input=get('#chat-input');input.value=text;input.oninput();get('#chat-form').onsubmit({preventDefault(){}});};
 const entry=()=>JSON.parse(localStorage.getItem('neolaw.design.chats'))[0];
 try{run({mount,get,click,send,entry,flushReplies,reject:value=>{rejected=value;}});passed++;console.log('PASS '+label);}
 finally{cleanup?.();for(const [name,value]of Object.entries(original)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}}
}
const localFile={name:'Matter notes.txt',type:'text/plain',size:20,content:'Local document content to preserve.'};
const sourceAnswer=preparedCaseAnswer('Show all 10 cases on premeditated murder.');

check('A pending rate edit updates its sample while an attached text preview and pending indicator stay in place',({mount,get,click,send,entry,flushReplies})=>{
 mount({tool:'edit',files:[localFile]});click('[data-sample]');send('Change the hourly rate to 120');
 assert.ok(get('.thinking'));click('[data-preview-text="0"]');assert.ok(get('.thinking'));assert.equal(get('.send-button').disabled,true);
 assert.equal(entry().document.kind,'text');assert.ok(get('.document-paper').textContent.includes(localFile.content));
 flushReplies();assert.equal(entry().document.kind,'text');assert.equal(entry().document.text,localFile.content);assert.equal(entry().sampleDocument.rate,'120');assert.equal(entry().pendingReply,undefined);
 assert.ok(get('.document-paper').textContent.includes(localFile.content));assert.match(entry().messages.at(-1).text,/120/);
 click('[data-sample]');assert.equal(entry().document.kind,'edit');assert.equal(entry().document.rate,'120');assert.ok(get('#clause-fees').textContent.includes('EUR 120'));
});
check('A pending case follow-up retains the case sent while a second source and the next question keep their new context',({mount,get,click,send,entry,flushReplies})=>{
 mount({caseResearch:true,messages:[{role:'assistant',...sourceAnswer}]});click('[data-case-source="case-01"]');send('Explain the reasoning.');click('[data-case-source="case-02"]');
 const reader=get('.cases-panel-content');reader.scrollTop=246;flushReplies();
 assert.ok(entry().messages.at(-1).text.includes(CASES[0].displayTitle));assert.equal(entry().casePanel.caseId,'case-02');assert.equal(entry().caseId,'case-02');
 assert.strictEqual(get('.cases-panel-content'),reader);assert.equal(reader.scrollTop,246);
 send('Explain the holding.');flushReplies();assert.ok(entry().messages.at(-1).text.includes(CASES[1].displayTitle));assert.equal(entry().casePanel.caseId,'case-02');
});
check('Pending request context survives a remount with a different document visible and completes once',({mount,get,click,send,entry,flushReplies})=>{
 mount({tool:'edit',files:[localFile]});click('[data-sample]');send('Change the hourly rate to 125');
 const sentCount=entry().messages.length;assert.ok(entry().pendingReply.context);click('[data-preview-text="0"]');mount();
 assert.equal(entry().document.kind,'text');assert.ok(get('.thinking'));flushReplies();
 assert.equal(entry().document.kind,'text');assert.equal(entry().sampleDocument.rate,'125');assert.equal(entry().messages.length,sentCount+1);assert.equal(entry().pendingReply,undefined);
 flushReplies();assert.equal(entry().messages.length,sentCount+1);
});
check('Failed reply save and retry retain original context and review decisions made while waiting',({mount,get,click,send,entry,flushReplies,reject})=>{
 mount({tool:'review',files:[localFile]});click('[data-sample]');send('Change the hourly rate to 135');
 click('[data-change="liability"][data-decision="accepted"]');click('[data-preview-text="0"]');
 reject(true);flushReplies();assert.ok(get('#retry-reply'));assert.equal(entry().document.kind,'text');assert.equal(entry().sampleDocument.changes.liability,'accepted');assert.equal(entry().sampleDocument.rate,undefined);assert.ok(entry().pendingReply.context);
 reject(false);click('[data-sample]');click('[data-change="termination"][data-decision="rejected"]');click('[data-preview-text="0"]');click('#retry-reply');assert.ok(get('.thinking'));flushReplies();
 assert.equal(entry().document.kind,'text');assert.equal(entry().sampleDocument.rate,'135');assert.equal(entry().sampleDocument.changes.liability,'accepted');assert.equal(entry().sampleDocument.changes.termination,'rejected');assert.equal(entry().pendingReply,undefined);
 assert.match(entry().messages.at(-1).text,/135/);
});
check('A request sent from local text never edits a sample opened while the reply is pending',({mount,get,click,send,entry,flushReplies})=>{
 const sample={kind:'edit',name:'Consultancy agreement · Example',rate:'100',changes:{fees:'accepted'},showChanges:['fees'],language:'both'};
 mount({tool:'edit',files:[localFile],document:{kind:'text',name:localFile.name,text:localFile.content,fileIndex:0},documentPanelOpen:true,sampleDocument:sample});
 send('Change the hourly rate to 300');click('[data-sample]');assert.ok(get('.thinking'));flushReplies();
 assert.equal(entry().document.kind,'edit');assert.equal(entry().document.rate,'100');assert.equal(entry().document.changes.fees,'accepted');assert.equal(entry().sampleDocument,null);
 assert.match(entry().messages.at(-1).text,/local text preview|not connected/i);assert.ok(!get('#clause-fees').textContent.includes('300'));
});
console.log(`\n${passed} pending-reply context callback checks passed. Browser timing, native focus and layout remain unverified.`);
