import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Element} from './dom-double.mjs';
import {renderChat} from '../chat.js';
import {preparedCaseAnswer} from '../modules/case-research.js';
import {messagePlainText,conversationPlainText} from '../modules/chat-export.js';
import {ARTICLES} from '../modules/article-data.js';
import {CASES} from '../modules/case-data.js';
import {clearComposerDraft} from '../modules/composer-drafts.js';

// Actual application callbacks against a structural DOM double. Linkedom is used
// only as a detached HTML parser for copy/export; no browser or network runs.
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
const parserDocument=parseHTML('<html><body></body></html>').document;
const prompt='Βρες νομολογία για φόνο εκ προμελέτης. Εξήγησε τις βασικές αρχές και τις πραγματικές εκβάσεις με παραπομπές.';
const answer=preparedCaseAnswer(prompt);
const message={role:'assistant',...answer};
const clone=value=>JSON.parse(JSON.stringify(value));
const sample={kind:'edit',name:'Consultancy agreement · Working copy',rate:'135',changes:{fees:'accepted',liability:'rejected'},showChanges:['fees','liability'],language:'both'};
let passed=0,fixture=0;

async function check(label,run,{width=1200}={}){
  const globals=['document','window','location','localStorage','navigator','matchMedia','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
  const originals=Object.fromEntries(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const originalGet=Object.getOwnPropertyDescriptor(Element.prototype,'getAttribute');
  Element.prototype.getAttribute=function(name){return Object.hasOwn(this.attrs,name)?this.attrs[name]:null};
  const saved=new Map(),frames=new Map(),timers=new Map(),screens=[];let task=0,rejected=false,copied='';
  const id='article-chat-'+(++fixture),draftKey='chat:'+id;
  clearComposerDraft(draftKey);
  const body=new Element('body'),header=new Element('header'),toast=new Element('div',{id:'toast'});body.append(header);body.append(toast);
  const install=(key,value)=>Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  const media=query=>({matches:/max-width\s*:\s*(\d+)/.test(query)?width<=Number(query.match(/max-width\s*:\s*(\d+)/)[1]):false,addEventListener(){},removeEventListener(){}});
  install('document',{body,activeElement:null,getElementById:id=>body.querySelector('#'+id),createElement:tag=>tag==='template'?parserDocument.createElement('template'):new Element(tag)});
  install('window',{innerWidth:width,matchMedia:media,addEventListener(){},removeEventListener(){}});install('matchMedia',media);
  install('location',{hash:'#/chat/'+id});
  install('localStorage',{getItem:key=>saved.get(key)||null,setItem(key,value){if(rejected&&key==='neolaw.design.chats')throw Error('Simulated article state save failure');saved.set(key,value)},removeItem:key=>saved.delete(key)});
  install('navigator',{clipboard:{async writeText(value){copied=value}}});
  install('requestAnimationFrame',fn=>{frames.set(++task,fn);return task});install('cancelAnimationFrame',id=>frames.delete(id));
  install('setTimeout',(fn,delay)=>{timers.set(++task,{fn,delay});return task});install('clearTimeout',id=>timers.delete(id));
  const paint=()=>{const next=[...frames.values()];frames.clear();next.forEach(fn=>fn())};
  const flushReply=()=>{for(const[key,value]of [...timers])if(value.delay<=5500){timers.delete(key);value.fn()}paint()};
  const entry=()=>JSON.parse(localStorage.getItem('neolaw.design.chats'))[0];
  const mount=seed=>{
    if(seed!==undefined)localStorage.setItem('neolaw.design.chats',JSON.stringify([{id,title:'Premeditation research',tool:'',prompt:'',caseResearch:true,files:[],messages:[clone(message)],...clone(seed)}]));
    const c=new Element('main');body.append(c);
    const cleanup=renderChat(c,{route:['chat',id],params:new URLSearchParams(),setHeader(_title,html=''){header.innerHTML=html},refreshSidebar(){}});
    const screen={c,cleanup};screens.push(screen);paint();return screen;
  };
  const get=(screen,selector)=>{const node=screen.c.querySelector(selector);assert.ok(node,'Missing '+selector);return node};
  const click=(screen,selector)=>{const node=get(screen,selector);node.focus();node.click();paint();return node};
  const leave=screen=>{screen.cleanup();screen.c.remove()};
  const draft=(screen,text)=>{const input=get(screen,'#chat-input');input.value=text;input.oninput();return input};
  const send=(screen,text)=>{draft(screen,text);get(screen,'#chat-form').onsubmit({preventDefault(){}})};
  try{await run({mount,get,click,leave,draft,send,paint,flushReply,entry,toast,copied:()=>copied,reject(value){rejected=value}});passed++;console.log('PASS '+label)}
  finally{for(const screen of screens)screen.cleanup();clearComposerDraft(draftKey);if(originalGet)Object.defineProperty(Element.prototype,'getAttribute',originalGet);else delete Element.prototype.getAttribute;for(const[key,descriptor]of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
}

console.log('Chat legislation integration · actual renderChat callbacks\n');

await check('Prepared Greek answer exposes all three verified statutory citations',({mount,get})=>{
  const screen=mount({});
  for(const article of ARTICLES){assert.ok(answer.text.includes(article.number));const chip=get(screen,`[data-article-source="${article.id}"]`);assert.ok(chip.textContent.includes(article.number))}
  assert.equal(screen.c.querySelectorAll('[data-article-source]').length,3);
  assert.doesNotMatch(get(screen,'.chat-research').textContent,/Επίδειξη|προετοιμασμένη|προεπισκόπηση/i);
});

await check('Opening an article preserves the chat, draft, conversation scroll and route',({mount,get,click,draft,entry})=>{
  const screen=mount({}),input=draft(screen,'Keep this unfinished instruction'),flow=get(screen,'#chat-flow'),route=location.hash,markup=flow.innerHTML;flow.scrollTop=318;
  click(screen,'[data-article-source="cap154-203"]');
  assert.equal(entry().articlePanel.articleId,'cap154-203');assert.equal(entry().casePanel,null);
  assert.equal(get(screen,'#document-panel').hidden,false);assert.equal(get(screen,'#chat-flow'),flow);assert.equal(flow.innerHTML,markup);assert.equal(flow.scrollTop,318);assert.equal(get(screen,'#chat-input'),input);assert.equal(input.value,'Keep this unfinished instruction');assert.equal(location.hash,route);
  assert.match(get(screen,'.cases-panel-heading h2').textContent,/Άρθρο 203/);assert.equal(document.activeElement,get(screen,'.cases-panel-heading h2'));
});

await check('Article tabs retain independent scroll positions and persist their selected view across remount',({mount,get,click,entry,leave})=>{
  let screen=mount({});click(screen,'[data-article-source="cap154-203"]');get(screen,'.cases-panel-content').scrollTop=111;
  click(screen,'[data-article-view="history"]');assert.equal(entry().articlePanel.view,'history');get(screen,'.cases-panel-content').scrollTop=222;
  const links=screen.c.querySelectorAll('.article-history__list a');assert.equal(links.length,2);assert.ok(links.every(link=>link.getAttribute('href').startsWith('https://www.cylaw.org/nomoi/arith/')));assert.match(get(screen,'.article-history__scope').textContent,/Δεν εμφανίζεται πλήρης/);
  click(screen,'[data-article-view="article"]');assert.equal(get(screen,'.cases-panel-content').scrollTop,111);click(screen,'[data-article-view="history"]');assert.equal(get(screen,'.cases-panel-content').scrollTop,222);
  leave(screen);screen=mount();assert.equal(get(screen,'[data-article-view="history"]').getAttribute('aria-selected'),'true');assert.ok(get(screen,'.article-history'));
});

await check('Article keyboard tabs support arrows, Home and End with selected focus',({mount,get,click,paint})=>{
  const screen=mount({});click(screen,'[data-article-source="cap154-204"]');
  for(const[key,next]of [['ArrowRight','history'],['End','cases'],['Home','article'],['ArrowLeft','cases']]){
    const tab=get(screen,'[role="tab"][aria-selected="true"]');tab.emit('keydown',{key});paint();const current=get(screen,`[data-article-view="${next}"]`);assert.equal(current.getAttribute('aria-selected'),'true');assert.equal(current.getAttribute('tabindex'),'0');assert.equal(document.activeElement,current);
  }
});

await check('Related case opens the exact statutory passage and returns to the article before closing',({mount,get,click,entry})=>{
  const screen=mount({}),chip=click(screen,'[data-article-source="cap154-204"]');click(screen,'[data-article-view="cases"]');
  const relation=ARTICLES.find(a=>a.number==='204').relatedCases[0];click(screen,'[data-article-case="0"]');
  assert.equal(entry().casePanel.caseId,relation.caseId);assert.equal(entry().casePanel.block,relation.block);assert.equal(entry().casePanel.view,'decision');assert.equal(entry().articlePanel.articleId,'cap154-204');
  const block=get(screen,'#chat-source-'+relation.block);assert.ok(block.classList.contains('is-focused'));assert.equal(block.scrolled,true);assert.equal(document.activeElement,block);
  click(screen,'[data-back-article]');assert.equal(entry().casePanel,null);assert.equal(entry().articlePanel.view,'cases');assert.ok(get(screen,'.article-related'));
  click(screen,'[data-close-article]');assert.equal(entry().articlePanel,null);assert.equal(get(screen,'#document-panel').hidden,true);assert.equal(document.activeElement,chip);
});

await check('A direct conversation case citation clears the previous article back route',({mount,get,click,entry})=>{
  const screen=mount({});click(screen,'[data-article-source="cap154-203"]');const citation=click(screen,'[data-case-source]');assert.equal(entry().articlePanel,null);assert.ok(entry().casePanel);assert.equal(screen.c.querySelector('[data-back-article]'),null);click(screen,'[data-close-case]');assert.equal(document.activeElement,citation);assert.equal(get(screen,'#document-panel').hidden,true);
});

await check('A follow-up answer keeps the article DOM, its scroll and a newly typed draft',({mount,get,click,send,draft,flushReply,entry})=>{
  const screen=mount({});click(screen,'[data-article-source="cap154-205"]');click(screen,'[data-article-view="history"]');const reader=get(screen,'.cases-panel-content');reader.scrollTop=234;
  send(screen,'Explain the distinction for premeditated murder');const input=draft(screen,'Next question still being written');input.focus();assert.ok(get(screen,'.thinking'));flushReply();
  assert.equal(entry().messages.filter(m=>m.role==='assistant').length,2);assert.equal(screen.c.querySelector('.thinking'),null);assert.equal(screen.c.querySelector('.reply-recovery'),null);assert.equal(get(screen,'.cases-panel-content'),reader);assert.equal(reader.scrollTop,234);assert.equal(input.value,'Next question still being written');assert.equal(document.activeElement,input);
});

for(const transition of ['open','tab','related','back','close'])await check(`Failed ${transition} save preserves panel, selection and focus until retry`,({mount,get,click,entry,paint,reject,toast})=>{
  const screen=mount({});
  if(transition!=='open')click(screen,'[data-article-source="cap154-203"]');
  if(transition==='related'||transition==='back'){click(screen,'[data-article-view="cases"]');if(transition==='back')click(screen,'[data-article-case="0"]')}
  const selector={open:'[data-article-source="cap154-203"]',tab:'[data-article-view="history"]',related:'[data-article-case="0"]',back:'[data-back-article]',close:'[data-close-article]'}[transition];
  const trigger=get(screen,selector),panel=get(screen,'#document-panel'),previous=clone(entry()),html=panel.innerHTML;trigger.focus();reject(true);trigger.click();paint();
  assert.deepEqual(entry(),previous);assert.equal(panel.innerHTML,html);assert.equal(get(screen,selector),trigger);assert.equal(document.activeElement,trigger);assert.match(toast.textContent,/could not be saved/i);
  reject(false);trigger.click();paint();assert.notDeepEqual(entry(),previous,'Retry must commit the requested state change');
});

await check('Closing legislation restores the edited document, decisions and reading position',({mount,get,click,entry})=>{
  const screen=mount({tool:'edit',document:sample,documentPanelOpen:true});get(screen,'.document-scroll').scrollTop=437;click(screen,'[data-article-source="cap154-203"]');click(screen,'[data-close-article]');assert.deepEqual(entry().document,sample);assert.equal(get(screen,'.document-scroll').scrollTop,437);assert.ok(get(screen,'[data-undo="fees"]'));assert.ok(get(screen,'[data-undo="liability"]'));
});

await check('On a narrow layout closing legislation focuses the restored visible document',({mount,get,click})=>{
  const screen=mount({tool:'edit',document:sample,documentPanelOpen:true});click(screen,'[data-article-source="cap154-203"]');click(screen,'[data-close-article]');assert.equal(document.activeElement,get(screen,'#close-document'));assert.equal(get(screen,'#document-panel').hidden,false);
},{width:600});

await check('Copy response and conversation export retain article identities, URLs and source capture dates',async({mount,get,copied})=>{
  const screen=mount({});get(screen,'.copy-message').click();await Promise.resolve();
  const copy=copied(),exported=conversationPlainText([{role:'user',text:prompt},message]);
  for(const text of [copy,exported,messagePlainText(message)])for(const article of ARTICLES){assert.ok(text.includes(`Άρθρο ${article.number}`));assert.ok(text.includes(article.sourceUrl));assert.ok(text.includes(`Έλεγχος πηγής: ${article.verifiedOn}`))}
  assert.ok(copy.includes(CASES[0].sourceUrl));assert.ok(exported.includes('NEOLAW · CONVERSATION'));assert.ok(!copy.includes('data-article-source'));
});

console.log(`\n${passed} chat/article integration groups passed. CSS geometry, native focus and browser animation remain unverified.`);
