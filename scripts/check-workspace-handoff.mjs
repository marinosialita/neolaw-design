import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Element} from './dom-double.mjs';
import {CASES} from '../modules/case-data.js';
import {libraryItems} from '../modules/library.js';
import {clearComposerDraft} from '../modules/composer-drafts.js';

// Actual app callbacks with explicitly delivered route events. This does not
// establish native browser event ordering, file selection, rendering or focus.
const template=readFileSync(new URL('../index.html',import.meta.url),'utf8').split('<body>')[1].split('</body>')[0];
const clone=value=>JSON.parse(JSON.stringify(value));
const existing={id:'handoff-existing',title:'Existing matter notes',tool:'',prompt:'',messages:[{role:'assistant',text:'Existing conversation.'}],files:[{name:'original-note.txt',type:'text/plain',size:9,content:'ORIGINAL MATTER'}]};
const custom={id:'custom-handoff',type:'prompts',title:'Orion weekly client update',description:'A reusable update',prompt:'Explain only the approved actions.\nPreserve the client deadline and exact instructions.',tool:'',custom:true,category:'Your prompts',icon:'message-square'};
const newFile={name:'new-matter.txt',size:20,type:'text/plain',content:'NEW MATTER CONTEXT'};
const originalValue=Object.getOwnPropertyDescriptor(Element.prototype,'value');
Object.defineProperty(Element.prototype,'value',{get(){return this._value??(this.tagName==='textarea'?this.textContent:originalValue.get.call(this))},set(value){originalValue.set.call(this,value)}});
const priorValidity=Element.prototype.setCustomValidity,priorReport=Element.prototype.reportValidity,priorDispatch=Element.prototype.dispatchEvent;
Element.prototype.setCustomValidity=function(value){this.validationMessage=value};
Element.prototype.reportValidity=function(){return !this.validationMessage};
Element.prototype.dispatchEvent=function(event){return this.emit(event.type)};
let passed=0,instance=0;
async function check(label,run,{prompts=[custom]}={}){
 const keys=['document','window','history','location','localStorage','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
 const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
 const body=new Element('body');body.innerHTML=template;const records=new Map(),listeners={},frames=new Map(),timers=new Map();let frame=0,timer=0,reject=false,hash='#/chat';
 records.set('neolaw.design.chats',JSON.stringify([existing]));records.set('neolaw.design.library-custom-prompts',JSON.stringify(prompts));
 clearComposerDraft('home');clearComposerDraft('chat:'+existing.id);
 globalThis.localStorage={getItem:key=>records.get(key)||null,setItem(key,value){if(reject&&key==='neolaw.design.chats')throw Error('Simulated chat save failure');records.set(key,value)}};
 globalThis.document={body,activeElement:body,title:'',getElementById:id=>body.querySelector('#'+id),querySelector:selector=>body.querySelector(selector),querySelectorAll:selector=>body.querySelectorAll(selector),addEventListener:(...args)=>body.addEventListener(...args),removeEventListener:(...args)=>body.removeEventListener(...args),createElement(tag){const el=new Element(tag);if(tag==='dialog'){el.showModal=()=>el.setAttribute('open','');el.close=()=>el.removeAttribute('open')}return el}};
 globalThis.window={addEventListener:(type,fn)=>{listeners[type]=fn},removeEventListener(type,fn){if(listeners[type]===fn)delete listeners[type]},scrollTo(){},matchMedia:()=>({matches:false})};
 globalThis.location={get hash(){return hash},set hash(value){hash=value.startsWith('#')?value:'#'+value},pathname:'/',search:''};
 globalThis.history={pushState(_state,_title,url){location.hash=url},replaceState(_state,_title,url){location.hash=url}};
 globalThis.requestAnimationFrame=fn=>{frames.set(++frame,fn);return frame};globalThis.cancelAnimationFrame=id=>frames.delete(id);globalThis.setTimeout=fn=>{timers.set(++timer,fn);return timer};globalThis.clearTimeout=id=>timers.delete(id);
 const paint=()=>{const work=[...frames.values()];frames.clear();work.forEach(fn=>fn())};
 const flush=()=>{const work=[...timers.values()];timers.clear();work.forEach(fn=>fn());paint()};
 const route=path=>{if(path)location.hash=path;listeners.hashchange();paint()};
 const chats=()=>JSON.parse(records.get('neolaw.design.chats'));
 const palette=query=>{document.getElementById('command-open').click();const dialog=body.querySelector('dialog');const input=dialog.querySelector('#palette-input');input.value=query;input.emit('input');return dialog};
 const send=text=>{const input=document.getElementById('chat-input');input.value=text;input.oninput();document.getElementById('chat-form').onsubmit({preventDefault(){}})};
 const attach=async()=>{const picker=document.getElementById('file-input');await picker.onchange({target:Object.assign(picker,{files:[{...newFile,text:async()=>newFile.content}]})})};
 try{await import('../app.js?workspace-handoff='+ ++instance);paint();await run({body,records,route,paint,flush,chats,palette,send,attach,reject(value){reject=value}});passed++;console.log('PASS '+label)}finally{clearComposerDraft('home');for(const entry of chats())clearComposerDraft('chat:'+entry.id);for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}

try{
 console.log('Workspace launch handoff · actual app callbacks, no browser or network\n');
 await check('A typed home research question opens its own conversation and retains clickable case sources',({body,chats,send,route,flush})=>{
  assert.equal(body.querySelector('#research-starter'),null);const prompt='Βρες νομολογία για φόνο εκ προμελέτης';send(prompt);
  const entry=chats()[0];assert.equal(entry.researchPreview,undefined);assert.equal(entry.prompt,prompt);assert.deepEqual(entry.messages,[{role:'user',text:prompt}]);assert.equal(location.hash,'#/chat/'+entry.id);
  route();flush();const saved=chats()[0];assert.equal(saved.caseResearch,true);assert.equal(saved.messages.length,2);assert.ok(body.querySelector('#chat-flow [data-case-source]'));assert.ok(saved.messages[1].text.includes(CASES[0].sourceUrl));
 });
 await check('Palette includes active saved prompts once and excludes deleted, malformed and static-ID collisions',({palette})=>{
  const dialog=palette('Orion'),rows=dialog.querySelectorAll('.palette-row');assert.equal(rows.length,1);assert.match(rows[0].textContent,/Orion weekly client update/);assert.match(rows[0].textContent,/prompts/);const input=dialog.querySelector('#palette-input');
  for(const title of ['Deleted private prompt','Malformed prompt without body','Wrong stored type','Static collision']){input.value=title;input.emit('input');assert.equal(dialog.querySelectorAll('.palette-row').length,0,title+' must not launch a different item')}
 },{prompts:[custom,{...custom},{...custom,id:'deleted-prompt',title:'Deleted private prompt',deletedAt:'2026-10-12'},null,{id:'missing',type:'prompts',title:'Malformed prompt without body'},{...custom,id:'wrong-type',title:'Wrong stored type',type:'workflows'},{...custom,id:libraryItems[0].id,title:'Static collision'}]});

 await check('Malformed saved-prompt storage does not break static palette navigation',({palette})=>{
  const dialog=palette('Case Law');assert.equal(dialog.querySelectorAll('.palette-row').length,1);dialog.querySelector('.palette-row').click();assert.equal(location.hash,'#/cases');
 },{prompts:{invalid:'not an array'}});

 await check('Contract palette selection opens its Contracts detail without creating an AI conversation',({palette,route,chats,body})=>{
  const item=libraryItems.find(item=>item.id==='contract-nda'),before=clone(chats());
  const paletteDialog=palette(item.title),rows=paletteDialog.querySelectorAll('.palette-row');
  assert.equal(rows.length,1);assert.match(rows[0].textContent,/contracts/);
  rows[0].click();assert.equal(location.hash,'#/library?tab=contracts&item='+item.id);assert.deepEqual(chats(),before);
  route();const detail=body.querySelector('dialog');
  assert.equal(body.querySelector('[aria-selected="true"]').dataset.libraryTab,'contracts');
  assert.equal(detail.querySelector('[data-contract-open]'),null);
  assert.equal(detail.querySelectorAll('a').length,0);
  assert.match(detail.textContent,/Cyprus law/);
  assert.match(detail.querySelector('.library-contract-empty').textContent,/Reviewed NDA example/);
  assert.equal(detail.querySelectorAll('.library-contract-perspective').length,2);
  assert.equal(detail.querySelector('[data-detail-launch]'),null);assert.equal(detail.querySelector('#library-prompt-input'),null);
  assert.deepEqual(chats(),before);
  assert.equal(location.hash,'#/library?tab=contracts&item='+item.id);
 });

 await check('Saved prompt opens editable instructions; its customized launch becomes the correct new chat',({palette,route,chats,records,body})=>{
  const before=clone(chats());palette(custom.title).querySelector('.palette-row').click();assert.equal(location.hash,'#/library?tab=prompts&item='+custom.id);assert.deepEqual(chats(),before);route();
  const dialog=body.querySelector('dialog'),field=dialog.querySelector('#library-prompt-input');assert.equal(field.value,custom.prompt);field.value=custom.prompt+'\nFor Orion only: keep the 16 October deadline.';const submitted=field.value;dialog.querySelector('[data-detail-launch]').click();const entry=chats()[0];assert.equal(entry.title,custom.title);assert.equal(entry.prompt,submitted);assert.equal(entry.tool,'');assert.deepEqual(entry.messages,[{role:'user',text:submitted}]);assert.equal(JSON.parse(records.get('neolaw.design.library-custom-prompts'))[0].prompt,custom.prompt);assert.equal(location.hash,'#/chat/'+entry.id);route();assert.ok(document.getElementById('chat-flow').textContent.includes(submitted));
 });

 await check('Rejected custom-prompt launch retains edited instructions and retries without duplicate chats',({palette,route,chats,body,reject})=>{
  palette(custom.title).querySelector('.palette-row').click();route();const dialog=body.querySelector('dialog'),field=dialog.querySelector('#library-prompt-input');field.value='Keep this launch-specific instruction exactly.';const before=clone(chats()),path=location.hash;reject(true);dialog.querySelector('[data-detail-launch]').click();assert.deepEqual(chats(),before);assert.equal(location.hash,path);assert.strictEqual(body.querySelector('dialog'),dialog);assert.equal(field.value,'Keep this launch-specific instruction exactly.');
  reject(false);dialog.querySelector('[data-detail-launch]').click();assert.equal(chats().length,before.length+1);assert.equal(chats()[0].prompt,field.value);assert.equal(body.querySelector('dialog'),null);
 });

 await check('Delayed new-file navigation cannot replace another conversation’s saved attachment',async({attach,send,chats,body,route})=>{
  await attach();send('Read this new matter file');const created=clone(chats()[0]);assert.deepEqual(created.files,[newFile]);body.querySelector('[data-nav="/chat/'+existing.id+'"]').click();route();assert.equal(location.hash,'#/chat/'+existing.id);const flow=document.getElementById('chat-flow');assert.ok(flow.textContent.includes(existing.files[0].name));assert.ok(!flow.textContent.includes(newFile.name));body.querySelector('[data-preview-text="0"]').click();const opened=chats().find(entry=>entry.id===existing.id);assert.deepEqual(opened.files,existing.files);assert.equal(opened.document.text,existing.files[0].content);assert.deepEqual(chats().find(entry=>entry.id===created.id),created);
 });

 await check('Delayed case-chat navigation cannot inject a case into an unrelated conversation',({body,route,chats})=>{
  route('/cases?q=murder');const button=body.querySelector('[data-action="chat"]'),caseId=button.dataset.id;button.click();const created=clone(chats()[0]);assert.equal(created.caseId,caseId);assert.equal(created.tool,'case-law');body.querySelector('[data-nav="/chat/'+existing.id+'"]').click();route();body.querySelector('[data-preview-text="0"]').click();const opened=chats().find(entry=>entry.id===existing.id);assert.equal(opened.caseId,'');assert.equal(opened.caseResearch,undefined);assert.deepEqual(opened.files,existing.files);assert.deepEqual(chats().find(entry=>entry.id===created.id),created);
 });

 await check('Normal attachment launch reads its persisted file after route delivery and prepares one local-file reply',async({attach,send,chats,route,flush,body})=>{
  await attach();send('Read this new matter file');const id=chats()[0].id;route();assert.equal(location.hash,'#/chat/'+id);assert.ok(document.getElementById('chat-flow').textContent.includes(newFile.name));flush();const entry=chats().find(item=>item.id===id);assert.deepEqual(entry.files,[newFile]);assert.equal(entry.messages.length,2);assert.equal(entry.messages.at(-1).role,'assistant');assert.match(entry.messages.at(-1).text,/Your files are attached\. Automatic document analysis is currently unavailable\./);body.querySelector('[data-preview-text="0"]').click();assert.equal(chats().find(item=>item.id===id).document.text,newFile.content);
 });

 await check('Normal case launch retains its exact selected judgment and source-linked response',({body,route,chats,flush})=>{
  route('/cases?q=murder');const buttons=body.querySelectorAll('[data-action="chat"]'),button=buttons[1],caseId=button.dataset.id;button.click();const id=chats()[0].id;route();flush();const entry=chats().find(item=>item.id===id);assert.equal(entry.caseId,caseId);assert.equal(entry.caseResearch,true);assert.equal(entry.messages.length,2);assert.ok(document.getElementById('chat-flow').textContent.includes(CASES.find(item=>item.id===caseId).displayTitle));assert.ok(body.querySelector('[data-case-source="'+caseId+'"]'));
 });

 await check('Static prompt palette selections preserve their existing direct-chat launch behavior',({palette,chats})=>{
  const item=libraryItems.find(item=>item.type==='prompts');palette(item.title).querySelector('.palette-row').click();const entry=chats()[0];assert.equal(entry.title,item.title);assert.equal(entry.prompt,item.prompt);assert.equal(entry.tool,'');assert.equal(location.hash,'#/chat/'+entry.id);
 });
 console.log(`\n${passed} workspace-handoff checks passed. Native route event ordering, physical focus and browser rendering remain unverified.`);
}finally{
 Object.defineProperty(Element.prototype,'value',originalValue);
 for(const [key,value] of Object.entries({setCustomValidity:priorValidity,reportValidity:priorReport,dispatchEvent:priorDispatch})){if(value===undefined)delete Element.prototype[key];else Element.prototype[key]=value}
}
