import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {renderChat} from '../chat.js';
import {readResolutionDraft,writeResolutionDraft,clearResolutionDraft} from '../modules/resolution-drafts.js';
import {clearComposerDraft} from '../modules/composer-drafts.js';

// Actual chat callbacks with an inert structural DOM double, not native browser focus.
let passed=0,fixture=0;
async function check(label,run){
 const names=['document','window','location','localStorage','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
 const originals=Object.fromEntries(names.map(key=>[key,globalThis[key]])),saved=new Map(),timers=new Map(),screens=new Set(),ids=new Set();
 const previousSelection=Element.prototype.setSelectionRange;Element.prototype.setSelectionRange=function(start,end){this.selectionStart=start;this.selectionEnd=end};
 let nextTimer=0,writes=0,rejectWrites=false;const prefix='resolution-check-'+(++fixture)+'-';
 const body=new Element('body'),header=new Element('header'),toast=new Element('div',{id:'toast'});body.append(header);body.append(toast);
 globalThis.document={body,activeElement:null,getElementById:id=>body.querySelector('#'+id),createElement:tag=>new Element(tag)};
 globalThis.window={innerWidth:1200,matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}};
 globalThis.location={hash:'#/chat'};
 globalThis.localStorage={getItem:key=>saved.get(key)||null,setItem(key,value){if(rejectWrites)throw new Error('Simulated storage rejection');writes++;saved.set(key,value)},removeItem:key=>saved.delete(key)};
 globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.cancelAnimationFrame=()=>{};
 globalThis.setTimeout=(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer};globalThis.clearTimeout=id=>timers.delete(id);
 const chats=()=>JSON.parse(localStorage.getItem('neolaw.design.chats')||'[]');
 const mount=(name='a',extra={})=>{const id=prefix+name;ids.add(id);if(!chats().some(chat=>chat.id===id))localStorage.setItem('neolaw.design.chats',JSON.stringify([...chats(),{id,title:'Resolution fixture',tool:'resolution',prompt:'',messages:[],files:[],...extra}]));
  const container=new Element('main');body.append(container);location.hash='#/chat/'+id;
  const cleanup=renderChat(container,{route:['chat',id],params:new URLSearchParams(),setHeader(_title,html){header.innerHTML=html},refreshSidebar(){}});
  const screen={id,container,cleanup,get:selector=>{const node=container.querySelector(selector);assert.ok(node,'Missing '+selector);return node},entry:()=>chats().find(chat=>chat.id===id)};screens.add(screen);return screen;
 };
 const leave=screen=>{screen.cleanup();screen.container.remove();screens.delete(screen)};
 const fields=screen=>({company:screen.get('#resolution-company').value,decision:screen.get('#resolution-decision').value});
 const edit=(screen,values,emit=true)=>{for(const[field,value]of Object.entries(values)){const input=screen.get('#resolution-'+field);input.value=value;if(emit)input.emit('input')}};
 const send=(screen,text='Please explain this drafting flow')=>{const input=screen.get('#chat-input');input.value=text;input.oninput();screen.get('#chat-form').onsubmit({preventDefault(){}})};
 const reply=()=>{for(const[id,{fn,delay}]of [...timers])if(delay<=500){timers.delete(id);fn()}};
 try{await run({mount,leave,fields,edit,send,reply,toast,writes:()=>writes,reject(value){rejectWrites=value}});passed++;console.log('PASS '+label)}
 finally{for(const screen of screens)screen.cleanup();for(const id of ids){clearResolutionDraft(id);clearComposerDraft('chat:'+id)}if(previousSelection===undefined)delete Element.prototype.setSelectionRange;else Element.prototype.setSelectionRange=previousSelection;for(const[key,value]of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}

console.log('Resolution instructions · page-memory drafts and actual chat callbacks\n');

await check('Edited instructions survive Send and reply completion while retaining field focus, selection and scroll',({mount,fields,edit,send,reply,writes})=>{
 const screen=mount(),initial={company:'Orion & "North" <Ltd>',decision:'Approve office at Akamantos 21'},baseline=writes();edit(screen,initial);
 assert.equal(writes(),baseline);assert.deepEqual(readResolutionDraft(screen.id),initial);assert.ok(!JSON.stringify(screen.entry()).includes(initial.company));
 send(screen);assert.deepEqual(fields(screen),initial);assert.ok(screen.container.querySelector('.thinking'));
 const revised={...initial,decision:'Approve a new director & bank signatory'};edit(screen,{decision:revised.decision});const input=screen.get('#resolution-decision');input.focus();input.setSelectionRange(10,17);screen.get('#chat-flow').scrollTop=287;reply();
 assert.equal(screen.container.querySelector('.thinking'),null);assert.equal(screen.entry().messages.length,2);assert.deepEqual(fields(screen),revised);assert.deepEqual(readResolutionDraft(screen.id),revised);assert.strictEqual(document.activeElement,screen.get('#resolution-decision'));assert.equal(document.activeElement.selectionStart,10);assert.equal(document.activeElement.selectionEnd,17);assert.equal(screen.get('#chat-flow').scrollTop,287);assert.ok(!JSON.stringify(screen.entry()).includes(revised.decision));
});

await check('Route leave and return restore each chat’s own unfinished fields without storage writes',({mount,leave,fields,edit,writes})=>{
 let a=mount('a'),b=mount('b');leave(b);const baseline=writes(),draftA={company:'Company A Ltd',decision:'Approve A instruction'},draftB={company:'Company B LLC',decision:'Approve B instruction'};
 edit(a,draftA);leave(a);b=mount('b');assert.equal(fields(b).company,'Aster Holdings Ltd');edit(b,draftB);leave(b);a=mount('a');assert.deepEqual(fields(a),draftA);leave(a);b=mount('b');assert.deepEqual(fields(b),draftB);leave(b);assert.equal(writes(),baseline);
});

await check('Intentionally empty fields survive redraw and remount without falling back to sample defaults',({mount,leave,fields,edit,send,reply})=>{
 let screen=mount();edit(screen,{company:'',decision:''});send(screen);assert.deepEqual(fields(screen),{company:'',decision:''});reply();assert.deepEqual(fields(screen),{company:'',decision:''});leave(screen);screen=mount();assert.deepEqual(fields(screen),{company:'',decision:''});assert.deepEqual(readResolutionDraft(screen.id),{company:'',decision:''});
});

await check('Whitespace-only company or decision is rejected, focuses the missing field and saves no document',({mount,edit,fields,toast,writes})=>{
 const screen=mount(),baseline=writes();edit(screen,{company:'   ',decision:'Approve a budget'});screen.get('#draft-resolution').click();assert.equal(screen.entry().document,undefined);assert.equal(writes(),baseline);assert.equal(fields(screen).company,'   ');assert.strictEqual(document.activeElement,screen.get('#resolution-company'));assert.equal(document.activeElement.attrs['aria-invalid'],'true');assert.match(toast.textContent,/company name/);
 edit(screen,{company:'  Correct Company Ltd  ',decision:' \t '});assert.equal(screen.get('#resolution-company').attrs['aria-invalid'],undefined);screen.get('#draft-resolution').click();assert.equal(screen.entry().document,undefined);assert.equal(writes(),baseline);assert.strictEqual(document.activeElement,screen.get('#resolution-decision'));assert.match(toast.textContent,/proposed decision/);
 edit(screen,{decision:'  Approve the office  '});screen.get('#draft-resolution').click();assert.equal(screen.entry().document.company,'Correct Company Ltd');assert.equal(screen.entry().document.decision,'Approve the office');assert.equal(readResolutionDraft(screen.id),null);
});

await check('Rejected document save retains instructions and allows one successful creation after remount',({mount,leave,fields,edit,reject,toast})=>{
 let screen=mount();const values={company:'Marinos LLC',decision:'Approve registered office at Akamantos 21'};edit(screen,values);const before=screen.entry(),button=screen.get('#draft-resolution');button.focus();reject(true);button.click();
 assert.deepEqual(screen.entry(),before);assert.deepEqual(fields(screen),values);assert.deepEqual(readResolutionDraft(screen.id),values);assert.strictEqual(document.activeElement,button);assert.match(toast.textContent,/could not be saved/i);leave(screen);reject(false);screen=mount();assert.deepEqual(fields(screen),values);screen.get('#draft-resolution').click();assert.equal(screen.entry().document.company,values.company);assert.equal(screen.entry().document.decision,values.decision);assert.equal(screen.entry().messages.length,1);assert.equal(readResolutionDraft(screen.id),null);
});

await check('A successful document save clears the unfinished state and later cleanup does not recreate it',({mount,leave,edit})=>{
 let screen=mount();edit(screen,{company:'Saved Company Ltd',decision:'Approve saved instruction'});screen.get('#draft-resolution').click();assert.equal(readResolutionDraft(screen.id),null);assert.equal(screen.container.querySelector('#resolution-company'),null);leave(screen);screen=mount();assert.equal(readResolutionDraft(screen.id),null);assert.ok(screen.get('.document-paper').textContent.includes('Saved Company Ltd'));assert.ok(screen.get('.document-paper').textContent.includes('Approve saved instruction'));leave(screen);assert.equal(readResolutionDraft(screen.id),null);
});

await check('Failed chat Send preserves both the resolution instructions and unfinished message for retry',({mount,leave,fields,edit,send,reject})=>{
 let screen=mount();const values={company:'Retry Company Ltd',decision:'Keep this instruction'};edit(screen,values);reject(true);send(screen,'Keep this question');assert.deepEqual(fields(screen),values);assert.equal(screen.entry().messages.length,0);leave(screen);reject(false);screen=mount();assert.deepEqual(fields(screen),values);assert.equal(screen.get('#chat-input').value,'Keep this question');
});

await check('Redraw and disposal capture latest input values even without an input notification',({mount,leave,fields,edit,send,reply})=>{
 let screen=mount();const values={company:'DOM latest Ltd',decision:'Preserve latest field values'};edit(screen,values,false);send(screen);assert.deepEqual(fields(screen),values);reply();edit(screen,{decision:'Captured on route leave'},false);leave(screen);screen=mount();assert.deepEqual(fields(screen),{...values,decision:'Captured on route leave'});
});

await check('Empty instructions stay editable beside a local text preview and sample creation requires their correction',({mount,fields,edit})=>{
 const screen=mount('text',{files:[{name:'notes.txt',content:'Locally attached text',size:22,type:'text/plain'}]});edit(screen,{company:'',decision:''});screen.get('[data-preview-text="0"]').click();assert.equal(screen.entry().document.kind,'text');assert.deepEqual(fields(screen),{company:'',decision:''});screen.get('[data-sample]').click();assert.equal(screen.entry().document.kind,'text');assert.strictEqual(document.activeElement,screen.get('#resolution-company'));
 const corrected={company:'Corrected Company Ltd',decision:'Approve the corrected instruction'};edit(screen,corrected);screen.get('[data-sample]').click();assert.equal(screen.entry().document.kind,'resolution');assert.equal(screen.entry().document.company,corrected.company);assert.equal(screen.entry().document.decision,corrected.decision);assert.equal(readResolutionDraft(screen.id),null);
});

await check('Valid instructions survive a text preview and remount before Open sample uses those same values',({mount,leave,fields,edit})=>{
 let screen=mount('text',{files:[{name:'draft.txt',content:'Supporting local notes',size:20,type:'text/plain'}]});const values={company:'Preview Company Ltd',decision:'Approve a retained decision'};edit(screen,values);screen.get('[data-preview-text="0"]').click();assert.deepEqual(fields(screen),values);leave(screen);screen=mount('text');assert.equal(screen.entry().document.kind,'text');assert.deepEqual(fields(screen),values);screen.get('[data-sample]').click();assert.equal(screen.entry().document.company,values.company);assert.equal(screen.entry().document.decision,values.decision);assert.equal(readResolutionDraft(screen.id),null);
});

await check('Draft reads are isolated copies and a fresh page module starts empty',async({mount})=>{
 const screen=mount();writeResolutionDraft(screen.id,{company:'Private pending company',decision:'Private pending decision'});const copy=readResolutionDraft(screen.id);copy.company='Changed copy';assert.equal(readResolutionDraft(screen.id).company,'Private pending company');const fresh=await import('../modules/resolution-drafts.js?fresh-page-fixture');assert.equal(fresh.readResolutionDraft(screen.id),null);
});

console.log(`\n${passed} resolution draft groups pass. Page refresh/tab close intentionally clears unfinished instructions; native focus, caret and browser rendering remain unverified.`);
