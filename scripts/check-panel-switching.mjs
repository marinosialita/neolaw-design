import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {renderChat} from '../chat.js';
import {preparedCaseAnswer} from '../modules/case-research.js';
import {clearComposerDraft} from '../modules/composer-drafts.js';

const sample={kind:'edit',name:'Consultancy agreement · Working copy',rate:'135',changes:{fees:'accepted',liability:'rejected'},showChanges:['fees','liability'],company:'Orion Advisory Ltd',decision:'Approve the revised service terms',language:'both'};
const files=[
 {name:'client-instructions.txt',size:248,type:'text/plain',content:'CLIENT INSTRUCTIONS — LOCAL SHOWCASE\n\nThe client requests an hourly rate of EUR 135. Keep the existing payment period. Confirm whether the agreed liability clause should remain unchanged.\n\nThese instructions are fictional demonstration material.'},
 {name:'meeting-notes.md',size:226,type:'text/markdown',content:'# Meeting notes — local showcase\n\nParticipants discussed the notice period and the scope of the consultancy services. The proposed registered office is 21 Akamantos, Strovolos.\n\nFictional notes for an interface demonstration.'}
];
const answer=preparedCaseAnswer('Find case law on premeditated murder.');
const initial={id:'panel-switching',title:'Document and source switching',tool:'edit',prompt:'',document:sample,documentPanelOpen:true,files,messages:[{role:'assistant',text:'Prepared review note. See clause 7.',html:'<p>Prepared review note.</p><button class="btn" data-clause="liability">Clause 7</button>'},{role:'assistant',text:answer.text,html:answer.html}]};
const clone=value=>JSON.parse(JSON.stringify(value));
let passed=0;
async function check(label,run){
 const globals=['document','window','location','localStorage','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
 const originals=Object.fromEntries(globals.map(key=>[key,globalThis[key]])),saved=new Map(),frames=new Map(),timers=new Map();let frame=0,timer=0,rejected=false;
 clearComposerDraft('chat:panel-switching');const body=new Element('body'),header=new Element('header'),toast=new Element('div',{id:'toast'});body.append(header);body.append(toast);
 globalThis.document={body,activeElement:null,getElementById:id=>body.querySelector('#'+id),createElement:tag=>new Element(tag)};
 globalThis.window={addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:true})};globalThis.location={hash:'#/chat/panel-switching'};
 globalThis.localStorage={getItem:key=>saved.get(key)||null,setItem(key,value){if(rejected&&key==='neolaw.design.chats')throw new Error('Simulated switching save failure');saved.set(key,value)}};
 globalThis.requestAnimationFrame=fn=>{frames.set(++frame,fn);return frame};globalThis.cancelAnimationFrame=id=>frames.delete(id);globalThis.setTimeout=fn=>{timers.set(++timer,fn);return timer};globalThis.clearTimeout=id=>timers.delete(id);
 const paint=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn())};
 const flush=()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());paint()};
 const entry=()=>JSON.parse(localStorage.getItem('neolaw.design.chats'))[0];
 const screens=[];const mount=seed=>{if(seed)localStorage.setItem('neolaw.design.chats',JSON.stringify([{...clone(initial),...clone(seed)}]));const c=new Element('main');body.append(c);const screen={c,cleanup:renderChat(c,{route:['chat','panel-switching'],params:new URLSearchParams(),setHeader(_title,html=''){header.innerHTML=html},refreshSidebar(){}})};screens.push(screen);paint();return screen};
 const leave=screen=>{screen.cleanup();screen.c.remove()};
 try{await run({mount,leave,entry,paint,flush,toast,reject(value){rejected=value}});passed++;console.log('PASS '+label)}finally{for(const screen of screens)screen.cleanup();clearComposerDraft('chat:panel-switching');for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}
const sampleIsIntact=actual=>{for(const key of ['kind','name','rate','company','decision','language'])assert.equal(actual[key],sample[key]);assert.deepEqual(actual.changes,sample.changes);assert.deepEqual(actual.showChanges,sample.showChanges)};

console.log('Document/source switching · actual callback regressions with fictional document fixtures\n');

await check('Open document replaces a case source when the working document was previously closed',({mount,entry,paint})=>{
 const {c}=mount({documentPanelOpen:false});const input=c.querySelector('#chat-input');input.value='Keep this unfinished instruction';assert.ok(c.querySelector('#reopen-doc'));c.querySelector('[data-case-source]').click();paint();assert.equal(c.querySelector('.chat-layout').classList.contains('has-case'),true);
 c.querySelector('#reopen-doc').click();paint();assert.equal(entry().casePanel,null);assert.equal(entry().documentPanelOpen,true);assert.equal(c.querySelector('.chat-layout').classList.contains('has-case'),false);assert.ok(c.querySelector('.document-paper'));assert.equal(c.querySelector('#document-panel').hidden,false);sampleIsIntact(entry().document);assert.equal(input.value,'Keep this unfinished instruction');assert.strictEqual(document.activeElement,c.querySelector('#close-document'));
});

await check('A citation round trip restores the working document scroll and decisions',({mount,entry,paint})=>{
 const {c}=mount({});c.querySelector('.document-scroll').scrollTop=487;const messageCount=entry().messages.length;c.querySelector('[data-case-source]').click();paint();assert.ok(c.querySelector('.cases-panel-content'));c.querySelector('[data-close-case]').click();paint();
 assert.equal(c.querySelector('.document-scroll').scrollTop,487);sampleIsIntact(entry().document);assert.equal(entry().messages.length,messageCount);assert.equal(entry().casePanel,null);assert.equal(c.querySelector('#document-panel').hidden,false);
});

await check('Previewing attached text preserves the edited sample and reopening it restores the same work',({mount,entry})=>{
 const {c}=mount({});const count=entry().messages.length;c.querySelector('[data-preview-text="0"]').click();assert.equal(entry().document.kind,'text');assert.equal(entry().document.name,files[0].name);assert.equal(entry().document.text,files[0].content);sampleIsIntact(entry().sampleDocument);assert.ok(c.querySelector('.document-paper').textContent.includes(files[0].content));
 c.querySelector('[data-sample]').click();sampleIsIntact(entry().document);assert.ok(c.querySelector('#clause-fees').textContent.includes('EUR 135'));assert.ok(c.querySelector('[data-undo="fees"]'));assert.equal(entry().messages.length,count);
});

await check('Repeated Open sample restores existing work without duplicate introductions or reset decisions',({mount,entry})=>{
 const {c}=mount({});const messages=clone(entry().messages);c.querySelector('[data-sample]').click();c.querySelector('[data-sample]').click();sampleIsIntact(entry().document);assert.deepEqual(entry().messages,messages);assert.ok(c.querySelector('[data-undo="fees"]'));assert.ok(c.querySelector('[data-undo="liability"]'));
});

await check('The edited sample survives text preview, leaving the chat and reloading the saved chat',({mount,leave,entry})=>{
 let screen=mount({});const count=entry().messages.length;screen.c.querySelector('[data-preview-text="1"]').click();sampleIsIntact(entry().sampleDocument);leave(screen);screen=mount();assert.equal(entry().document.kind,'text');assert.ok(screen.c.querySelector('.document-paper').textContent.includes(files[1].content));screen.c.querySelector('[data-sample]').click();sampleIsIntact(entry().document);assert.equal(entry().messages.length,count);
});

await check('Two text attachments and the sample retain independent scroll positions when switching',({mount,entry})=>{
 const {c}=mount({});c.querySelector('.document-scroll').scrollTop=412;c.querySelector('[data-preview-text="0"]').click();assert.equal(c.querySelector('.document-scroll').scrollTop,0);c.querySelector('.document-scroll').scrollTop=191;c.querySelector('[data-preview-text="1"]').click();assert.equal(c.querySelector('.document-scroll').scrollTop,0);c.querySelector('.document-scroll').scrollTop=333;
 c.querySelector('[data-preview-text="0"]').click();assert.equal(c.querySelector('.document-scroll').scrollTop,191);assert.equal(entry().document.name,files[0].name);c.querySelector('[data-sample]').click();assert.equal(c.querySelector('.document-scroll').scrollTop,412);sampleIsIntact(entry().document);c.querySelector('[data-preview-text="1"]').click();assert.equal(c.querySelector('.document-scroll').scrollTop,333);assert.equal(entry().document.name,files[1].name);
});

await check('A review-clause link restores the edited sample from a text preview and focuses its actual clause',({mount,entry})=>{
 const {c}=mount({});c.querySelector('[data-preview-text="0"]').click();c.querySelector('[data-clause="liability"]').click();sampleIsIntact(entry().document);const clause=c.querySelector('#clause-liability');assert.ok(clause);assert.equal(clause.scrolled,true);assert.strictEqual(document.activeElement,clause);assert.equal(c.querySelector('.chat-layout').classList.contains('has-case'),false);
});

for(const transition of ['preview-text','restore-sample','switch-text','reopen-from-source']){
 await check(`Rejected ${transition} save preserves the previous panel, state and action for retry`,({mount,entry,reject,paint,toast})=>{
  const {c}=mount({documentPanelOpen:transition!=='reopen-from-source'});
  if(transition==='restore-sample'||transition==='switch-text')c.querySelector('[data-preview-text="0"]').click();
  if(transition==='reopen-from-source'){c.querySelector('[data-case-source]').click();paint()}
  const selector=transition==='preview-text'?'[data-preview-text="0"]':transition==='restore-sample'?'[data-sample]':transition==='switch-text'?'[data-preview-text="1"]':'#reopen-doc';
  const action=c.querySelector(selector),input=c.querySelector('#chat-input');input.value='Keep the next question';action.focus();const before=clone(entry()),panel=c.querySelector('#document-panel'),markup=panel.innerHTML;
  reject(true);action.click();paint();assert.deepEqual(entry(),before);assert.equal(panel.innerHTML,markup);assert.strictEqual(c.querySelector(selector),action);assert.strictEqual(document.activeElement,action);assert.equal(input.value,'Keep the next question');assert.match(toast.textContent,/could not be saved/i);
  reject(false);action.click();paint();assert.equal(input.value,'Keep the next question');if(transition==='preview-text'||transition==='switch-text'){assert.equal(entry().document.kind,'text');assert.equal(entry().document.name,files[transition==='preview-text'?0:1].name);sampleIsIntact(entry().sampleDocument)}else{sampleIsIntact(entry().document);assert.equal(entry().casePanel,null);assert.ok(c.querySelector('.document-paper'))}
 });
}

await check('Rejected citation opening keeps the working document, scroll and focused citation intact until retry',({mount,entry,paint,reject,toast})=>{
 const {c}=mount({}),panel=c.querySelector('#document-panel'),citation=c.querySelector('[data-case-source]'),input=c.querySelector('#chat-input');panel.querySelector('.document-scroll').scrollTop=284;input.value='Keep my unfinished question';citation.focus();const before=clone(entry()),markup=panel.innerHTML;
 reject(true);citation.click();paint();assert.deepEqual(entry(),before);assert.equal(panel.innerHTML,markup);assert.equal(panel.querySelector('.document-scroll').scrollTop,284);assert.equal(c.querySelector('.chat-layout').classList.contains('has-case'),false);assert.strictEqual(document.activeElement,citation);assert.equal(input.value,'Keep my unfinished question');assert.match(toast.textContent,/could not be saved/i);
 reject(false);citation.click();paint();assert.equal(entry().casePanel.caseId,citation.dataset.caseSource);assert.equal(entry().casePanel.block,Number(citation.dataset.sourceBlock)||0);assert.ok(panel.querySelector('.cases-panel-content'));assert.equal(c.querySelector('.chat-layout').classList.contains('has-case'),true);sampleIsIntact(entry().document);assert.equal(input.value,'Keep my unfinished question');
});

await check('Rejected source closing preserves its reader and action; retry restores the previous document position',({mount,entry,paint,reject,toast})=>{
 const {c}=mount({});c.querySelector('.document-scroll').scrollTop=361;c.querySelector('[data-case-source]').click();paint();const panel=c.querySelector('#document-panel'),close=panel.querySelector('[data-close-case]'),reader=panel.querySelector('.cases-panel-content');reader.scrollTop=572;close.focus();const before=clone(entry()),markup=panel.innerHTML;
 reject(true);close.click();paint();assert.deepEqual(entry(),before);assert.equal(panel.innerHTML,markup);assert.strictEqual(panel.querySelector('[data-close-case]'),close);assert.strictEqual(document.activeElement,close);assert.equal(reader.scrollTop,572);assert.equal(c.querySelector('.chat-layout').classList.contains('has-case'),true);assert.match(toast.textContent,/could not be saved/i);
 reject(false);close.click();paint();assert.equal(entry().casePanel,null);assert.equal(c.querySelector('.chat-layout').classList.contains('has-case'),false);assert.equal(c.querySelector('.document-scroll').scrollTop,361);sampleIsIntact(entry().document);assert.strictEqual(document.activeElement,c.querySelector('#close-document'));
});

for(const transition of ['decision-tab','brief-tab','source-block']){
 await check(`Rejected ${transition} transition keeps the source reader consistent and retries the same action`,({mount,entry,paint,reject,toast})=>{
  const {c}=mount({});c.querySelector('[data-case-source]').click();paint();const panel=c.querySelector('#document-panel');
  panel.querySelector('[data-case-view="'+(transition==='brief-tab'?'decision':'brief')+'"]').click();paint();
  const selector=transition==='source-block'?'[data-source-block]':'[data-case-view="'+(transition==='brief-tab'?'brief':'decision')+'"]';
  const action=panel.querySelector(selector),nextBlock=Number(action.dataset.sourceBlock)||0,reader=panel.querySelector('.cases-panel-content');assert.ok(action);reader.scrollTop=188;action.focus();const before=clone(entry()),markup=panel.innerHTML;
  reject(true);action.click();paint();assert.deepEqual(entry(),before);assert.equal(panel.innerHTML,markup);assert.strictEqual(panel.querySelector(selector),action);assert.strictEqual(document.activeElement,action);assert.equal(reader.scrollTop,188);assert.equal(panel.querySelector('[aria-selected="true"]').dataset.caseView,before.casePanel.view);assert.match(toast.textContent,/could not be saved/i);
  reject(false);action.click();paint();const expectedView=transition==='brief-tab'?'brief':'decision';assert.equal(entry().casePanel.view,expectedView);assert.equal(entry().casePanel.block,nextBlock);assert.equal(panel.querySelector('[aria-selected="true"]').dataset.caseView,expectedView);assert.equal(panel.querySelector('#chat-case-content').attrs['aria-labelledby'],'chat-case-tab-'+expectedView);sampleIsIntact(entry().document);
  if(nextBlock){const target=panel.querySelector('#chat-source-'+nextBlock);assert.deepEqual(entry().casePanel.blocks,[nextBlock]);assert.equal(target.classList.contains('is-focused'),true);assert.equal(target.scrolled,true);assert.strictEqual(document.activeElement,target)}else assert.strictEqual(document.activeElement,panel.querySelector('#chat-case-tab-'+expectedView));
 });
}

await check('An empty text attachment is previewable and its follow-up truthfully describes the local file',({mount,entry,flush})=>{
 const empty={name:'empty-instructions.txt',size:0,type:'text/plain',content:''},{c}=mount({files:[empty]});assert.match(c.querySelector('#chat-flow').textContent,/Text content is available to preview/);assert.doesNotMatch(c.querySelector('#chat-flow').textContent,/This prototype does not parse PDF or Word/);assert.ok(c.querySelector('[data-preview-text="0"]'));c.querySelector('[data-preview-text="0"]').click();assert.equal(entry().document.kind,'text');assert.equal(entry().document.text,'');assert.equal(entry().document.name,empty.name);sampleIsIntact(entry().sampleDocument);assert.match(c.querySelector('.document-footer').textContent,/^DOCUMENT/);assert.doesNotMatch(c.querySelector('.document-footer').textContent,/WORKING DOCUMENT/);
 const count=entry().messages.length,input=c.querySelector('#chat-input');input.value='Can you edit this file?';input.oninput();c.querySelector('#chat-form').onsubmit({preventDefault(){}});flush();assert.equal(entry().messages.length,count+2);const reply=entry().messages.at(-1);assert.equal(reply.role,'assistant');assert.match(reply.text,/local text preview/);assert.match(reply.text,/analysis and editing are not connected/);assert.doesNotMatch(reply.text,/prepared example/);assert.ok(reply.html.includes(empty.name));assert.ok(reply.html.includes('Return to document'));assert.equal(entry().document.kind,'text');assert.equal(entry().document.text,'');sampleIsIntact(entry().sampleDocument);
 const restore=c.querySelector('[data-message-index="'+(entry().messages.length-1)+'"] [data-sample]');assert.ok(restore);restore.click();sampleIsIntact(entry().document);assert.equal(entry().messages.length,count+2);
});

console.log(`\n${passed} panel-switching checks passed. Browser geometry, native scrolling and physical focus remain unverified.`);
