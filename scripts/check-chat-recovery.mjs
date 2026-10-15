import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {renderChat} from '../chat.js';

let passed=0;
function check(label,run){
 const globals=['document','window','location','localStorage','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame'];
 const originals=Object.fromEntries(globals.map(key=>[key,globalThis[key]]));
 const saved=new Map(),tasks=new Map();let timer=0,rejectWrites=false,onWrite=()=>{};
 const body=new Element('body'),header=new Element('header'),toast=new Element('div',{id:'toast'});body.append(header);body.append(toast);
 globalThis.document={body,activeElement:null,getElementById:id=>body.querySelector('#'+id),createElement:tag=>new Element(tag)};
 globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.location={hash:'#/chat/recovery-check'};
 globalThis.localStorage={getItem:key=>saved.get(key)||null,setItem(key,value){onWrite(key,value);if(rejectWrites&&key==='neolaw.design.chats')throw new Error('Simulated response save failure');saved.set(key,value)}};
 globalThis.setTimeout=fn=>{tasks.set(++timer,fn);return timer};globalThis.clearTimeout=id=>tasks.delete(id);globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.cancelAnimationFrame=()=>{};
 const key='neolaw.design.chats',entry=()=>JSON.parse(localStorage.getItem(key))[0];
 const ctx={route:['chat','recovery-check'],params:new URLSearchParams(),setHeader(_title,html=''){header.innerHTML=html},refreshSidebar(){}};
 const mount=initial=>{if(initial)localStorage.setItem(key,JSON.stringify([{id:'recovery-check',title:'Response recovery',tool:'edit',prompt:'',messages:[],files:[],...initial}]));const container=new Element('main');body.append(container);return{container,cleanup:renderChat(container,ctx)}};
 const flush=()=>{const pending=[...tasks.values()];tasks.clear();pending.forEach(fn=>fn())};
 const send=(container,text)=>{const input=container.querySelector('#chat-input');input.value=text;input.oninput();container.querySelector('#chat-form').onsubmit({preventDefault(){}})};
 const setup=()=>{const screen=mount({});screen.container.querySelector('[data-sample]').click();screen.container.querySelector('[data-change="fees"][data-decision="accepted"]').click();return screen};
 try{run({mount,setup,entry,send,flush,tasks,toast,reject(value){rejectWrites=value},onWrite(callback){onWrite=callback}});passed++;console.log('PASS '+label)}finally{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}

console.log('Prepared reply recovery · structural callbacks only, no browser or live AI\n');

check('A failed reply save retains the saved document and pending message without rendering its proposed edit',({setup,entry,send,flush,reject,onWrite,toast})=>{
 const screen=setup(),c=screen.container;const documentBefore=entry().document,paperBefore=c.querySelector('.document-paper').innerHTML,answerCount=entry().messages.filter(m=>m.role==='assistant').length;
 send(c,'Change the hourly rate to 120');const sent=entry();assert.equal(sent.pendingReply.text,'Change the hourly rate to 120');assert.equal(c.querySelector('.send-button').disabled,true);
 let checkedBeforeWrite=false,uncommittedRender=false;onWrite((key,value)=>{if(key!=='neolaw.design.chats')return;const next=JSON.parse(value)[0];if(next.document.rate==='120'){checkedBeforeWrite=true;uncommittedRender=c.querySelector('.document-paper').innerHTML!==paperBefore}});reject(true);flush();
 assert.equal(checkedBeforeWrite,true);assert.equal(uncommittedRender,false,'The uncommitted document must not be drawn before storage succeeds');assert.deepEqual(entry(),sent);assert.deepEqual(entry().document,documentBefore);assert.equal(c.querySelector('.document-paper').innerHTML,paperBefore);assert.equal(entry().messages.filter(m=>m.role==='assistant').length,answerCount);assert.ok(c.querySelector('#retry-reply'));assert.match(c.querySelector('[role="alert"]').textContent,/could not be saved/);assert.equal(c.querySelector('.send-button').disabled,true);assert.ok(!c.querySelector('#chat-flow').textContent.includes('sample hourly rate as'));assert.match(toast.textContent,/could not be saved/i);screen.cleanup();
});

check('Retry saves exactly one answer and document edit, clears recovery and permits the next message',({setup,entry,send,flush,reject})=>{
 const screen=setup(),c=screen.container;send(c,'Change the hourly rate to 120');const before=entry();reject(true);flush();reject(false);c.querySelector('#retry-reply').click();assert.equal(c.querySelector('#retry-reply'),null);assert.equal(c.querySelector('.send-button').disabled,true);flush();
 assert.equal(entry().messages.length,before.messages.length+1);assert.equal(entry().messages.at(-1).role,'assistant');assert.match(entry().messages.at(-1).text,/EUR 120/);assert.equal(entry().document.rate,'120');assert.equal(entry().document.changes.fees,undefined);assert.equal(entry().pendingReply,undefined);assert.ok(c.querySelector('#clause-fees').textContent.includes('EUR 120'));assert.equal(c.querySelector('#retry-reply'),null);assert.equal(c.querySelector('[role="alert"]'),null);
 flush();assert.equal(entry().messages.length,before.messages.length+1);const input=c.querySelector('#chat-input');input.value='Next instruction';input.oninput();assert.equal(c.querySelector('.send-button').disabled,false);screen.cleanup();
});

check('Leaving a failed reply and reopening resumes that message once, without duplicating its user turn',({setup,mount,entry,send,flush,reject})=>{
 let screen=setup(),c=screen.container;send(c,'Change the hourly rate to 125');reject(true);flush();const pending=entry();screen.cleanup();c.remove();flush();assert.deepEqual(entry(),pending);
 reject(false);screen=mount();c=screen.container;assert.equal(c.querySelector('.send-button').disabled,true);assert.ok(c.querySelector('[role="status"]'));flush();assert.equal(entry().messages.length,pending.messages.length+1);assert.equal(entry().messages.filter(m=>m.role==='user'&&m.text==='Change the hourly rate to 125').length,1);assert.equal(entry().messages.filter(m=>m.role==='assistant'&&m.text.includes('EUR 125')).length,1);assert.equal(entry().document.rate,'125');assert.equal(entry().pendingReply,undefined);flush();assert.equal(entry().messages.length,pending.messages.length+1);
 screen.cleanup();c.remove();screen=mount();assert.equal(screen.container.querySelector('[role="status"]'),null);assert.equal(screen.container.querySelector('#retry-reply'),null);assert.equal(entry().messages.length,pending.messages.length+1);screen.cleanup();
});

check('The next draft survives failure and retry; blocked/busy Enter and IME do not send duplicate messages',({setup,entry,send,flush,reject})=>{
 const screen=setup(),c=screen.container,input=c.querySelector('#chat-input'),form=c.querySelector('#chat-form');let nativeSubmits=0;form.requestSubmit=()=>{nativeSubmits++;form.onsubmit({preventDefault(){}})};
 send(c,'Change the hourly rate to 120');const sentCount=entry().messages.length;input.value='Change the hourly rate to 135';input.oninput();input.onkeydown({key:'Enter',preventDefault(){}});assert.equal(nativeSubmits,0);assert.equal(entry().messages.length,sentCount);
 reject(true);flush();assert.equal(input.value,'Change the hourly rate to 135');input.oninput();assert.equal(c.querySelector('.send-button').disabled,true);form.onsubmit({preventDefault(){}});assert.equal(input.value,'Change the hourly rate to 135');assert.equal(entry().messages.length,sentCount);
 for(const flags of [{isComposing:true},{keyCode:229},{shiftKey:true}]){let prevented=false;input.onkeydown({key:'Enter',preventDefault(){prevented=true},...flags});assert.equal(prevented,false)}assert.equal(nativeSubmits,0);
 reject(false);c.querySelector('#retry-reply').click();assert.equal(input.value,'Change the hourly rate to 135');input.onkeydown({key:'Enter',preventDefault(){}});assert.equal(nativeSubmits,0);flush();assert.equal(input.value,'Change the hourly rate to 135');assert.equal(c.querySelector('.send-button').disabled,false);
 input.onkeydown({key:'Enter',preventDefault(){}});input.onkeydown({key:'Enter',preventDefault(){}});assert.equal(nativeSubmits,1);assert.equal(input.value,'');assert.equal(entry().messages.length,sentCount+2);flush();assert.equal(entry().document.rate,'135');assert.equal(entry().messages.length,sentCount+3);screen.cleanup();
});

check('Failed resolution creation keeps company and decision fields intact; one retry creates one saved draft',({mount,entry,reject,onWrite,toast})=>{
 const screen=mount({tool:'resolution'}),c=screen.container,company=c.querySelector('#resolution-company'),decision=c.querySelector('#resolution-decision'),button=c.querySelector('#draft-resolution');
 company.value='Orion & Partners Ltd';decision.value='Approve the registered office at 21 Akamantos, Strovolos';const prior=entry(),flowBefore=c.querySelector('#chat-flow').innerHTML;button.focus();let checkedBeforeWrite=false,earlyDocument=false;
 onWrite((key,value)=>{if(key!=='neolaw.design.chats')return;if(JSON.parse(value)[0].document?.kind==='resolution'){checkedBeforeWrite=true;earlyDocument=!c.querySelector('#document-panel').hidden}});reject(true);button.click();
 assert.equal(checkedBeforeWrite,true);assert.equal(earlyDocument,false);assert.deepEqual(entry(),prior);assert.equal(c.querySelector('#document-panel').hidden,true);assert.equal(c.querySelector('#chat-flow').innerHTML,flowBefore);assert.strictEqual(c.querySelector('#resolution-company'),company);assert.strictEqual(c.querySelector('#resolution-decision'),decision);assert.equal(company.value,'Orion & Partners Ltd');assert.equal(decision.value,'Approve the registered office at 21 Akamantos, Strovolos');assert.strictEqual(document.activeElement,button);assert.match(toast.textContent,/could not be saved/i);
 reject(false);button.click();assert.equal(entry().messages.length,prior.messages.length+1);assert.equal(entry().messages.at(-1).role,'assistant');assert.equal(entry().document.kind,'resolution');assert.equal(entry().document.company,company.value);assert.equal(entry().document.decision,decision.value);assert.equal(c.querySelector('#document-panel').hidden,false);assert.ok(c.querySelector('.document-paper').textContent.includes(company.value));assert.ok(c.querySelector('.document-paper').textContent.includes(decision.value));assert.equal(c.querySelector('#draft-resolution'),null);screen.cleanup();
});

console.log(`\n${passed} prepared-reply recovery checks passed. Rendering, physical focus and browser storage behavior remain unverified.`);
