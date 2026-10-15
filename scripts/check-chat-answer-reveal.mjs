import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {renderChat} from '../chat.js';
import {preparedCaseAnswer} from '../modules/case-research.js';
import {messagePlainText} from '../modules/chat-export.js';
import {clearComposerDraft} from '../modules/composer-drafts.js';
import {ARTICLES} from '../modules/article-data.js';
import {cleanAnswerCopy} from '../modules/answer-copy.js';

// Detached DOM only: actual renderChat callbacks and Text nodes, no browser,
// navigation, network or layout engine. Geometry below is intentionally fixed.
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
const prompt='Βρες νομολογία για φόνο εκ προμελέτης. Εξήγησε τις βασικές αρχές και τις πραγματικές εκβάσεις με παραπομπές.';
const answer=preparedCaseAnswer(prompt);
let passed=0,sequence=0;
const html=value=>{const node=document.createElement('div');node.innerHTML=value;return node.innerHTML};
const visibleText=node=>node.nodeType===3?node.nodeValue:node.nodeType===1&&(node.hidden||node.style.display==='none')?'':[...node.childNodes].map(visibleText).join('');

async function check(label,run,{reducedMotion=false}={}){
 const globals=['document','window','location','localStorage','navigator','matchMedia','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
 const descriptors=Object.fromEntries(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const nowBefore=Date.now,{document,window}=parseHTML('<html><body><header></header><main></main><div id="toast"></div></body></html>');
 const records=new Map(),tasks=new Map();let now=100000,task=0,cleanup,copied='',rejected=false,activeElement=document.body;
 const id='answer-reveal-'+(++sequence),draftKey='chat:'+id,root=document.querySelector('main'),header=document.querySelector('header');
 const proto=window.HTMLElement.prototype;
 const prototypeBefore=Object.fromEntries(['focus','scrollIntoView','scrollHeight','clientHeight','scrollTop'].map(key=>[key,Object.getOwnPropertyDescriptor(proto,key)]));
 Object.defineProperties(proto,{
  focus:{configurable:true,value(){activeElement=this}},
  scrollIntoView:{configurable:true,value(){this.dataset.scrolled='true'}},
  scrollHeight:{configurable:true,get(){return 1200}},
  clientHeight:{configurable:true,get(){return 400}},
  scrollTop:{configurable:true,get(){return this._testScrollTop||0},set(value){this._testScrollTop=value}}
 });
 Object.defineProperty(document,'activeElement',{configurable:true,get:()=>activeElement});
 const install=(key,value)=>Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 const media=query=>({matches:query.includes('prefers-reduced-motion')&&reducedMotion,addEventListener(){},removeEventListener(){}});
 install('document',document);install('window',{matchMedia:media,addEventListener(){},removeEventListener(){}});install('matchMedia',media);
 install('location',{hash:'#/chat/'+id});install('navigator',{clipboard:{async writeText(value){copied=value}}});
 install('localStorage',{getItem:key=>records.get(key)||null,setItem(key,value){if(rejected&&key==='neolaw.design.chats')throw Error('Simulated storage failure');records.set(key,value)}});
 install('setTimeout',(fn,delay=0)=>{tasks.set(++task,{fn,at:now+delay});return task});install('clearTimeout',id=>tasks.delete(id));
 install('requestAnimationFrame',fn=>{tasks.set(++task,{fn,at:now+16});return task});install('cancelAnimationFrame',id=>tasks.delete(id));Date.now=()=>now;
 const advance=ms=>{const end=now+ms;let budget=2000;while(true){const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;assert.ok(--budget>0,'Timer loop did not settle');now=next[1].at;tasks.delete(next[0]);next[1].fn()}now=end};
 const entry=()=>JSON.parse(records.get('neolaw.design.chats'))[0];
 const get=selector=>{const node=root.querySelector(selector);assert.ok(node,'Missing '+selector);return node};
 const click=selector=>{const node=get(selector);node.click();advance(16);return node};
 const leave=()=>{cleanup?.();cleanup=null;root.innerHTML=''};
 const mount=seed=>{leave();if(seed!==undefined)records.set('neolaw.design.chats',JSON.stringify([{id,title:'Premeditation research',tool:'',prompt,messages:[{role:'user',text:prompt}],files:[],...seed}]));cleanup=renderChat(root,{route:['chat',id],params:new URLSearchParams(),setHeader(_title,html=''){header.innerHTML=html},refreshSidebar(){}});return root};
 const draft=text=>{const input=get('#chat-input');input.value=text;input.oninput();return input};
 const send=text=>{draft(text);get('#chat-form').onsubmit({preventDefault(){}})};
 clearComposerDraft(draftKey);
 try{await run({root,mount,leave,get,click,draft,send,advance,entry,tasks,copied:()=>copied,reject(value){rejected=value}});passed++;console.log('PASS '+label)}
 finally{leave();clearComposerDraft(draftKey);Date.now=nowBefore;for(const[key,value]of Object.entries(prototypeBefore)){if(value)Object.defineProperty(proto,key,value);else delete proto[key]}for(const[key,value]of Object.entries(descriptors)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
}

await check('New answer persists in full while presentation reveals words; skip restores the full rich answer',({mount,advance,get,entry,draft,click})=>{
 mount({});advance(5500);const body=get('.assistant-body'),saved=entry().messages.at(-1),full=document.createElement('div');full.innerHTML=saved.html;
 assert.equal(saved.html,answer.html);assert.equal(entry().pendingReply,undefined);assert.equal(body.getAttribute('aria-busy'),'true');assert.ok(visibleText(body).length<visibleText(full).length);
 assert.equal(get('.answer-brand').getAttribute('aria-label'),'NeoLaw');assert.doesNotMatch(get('.assistant-label').textContent,/Demo answer/);assert.equal(get('.answer-brand .brand-symbol').getAttribute('src'),'assets/neolaw-mark.svg');
 const start=visibleText(body).length,input=draft('A further question');advance(1000);assert.ok(visibleText(body).length>start);assert.ok(get('.send-button').disabled);assert.equal(input.value,'A further question');
 get('.answer-reveal-skip').focus();click('.answer-reveal-skip');assert.equal(body.innerHTML,html(cleanAnswerCopy(saved.html)));assert.equal(body.hasAttribute('aria-busy'),false);assert.equal(rootContains(body,'.answer-reveal-cursor'),false);assert.equal(get('.send-button').disabled,false);assert.equal(entry().messages.length,2);assert.equal(document.activeElement,input);
});

function rootContains(node,selector){return !!node.querySelector(selector)}

await check('Copy during typing uses complete persisted content and all source URLs',async({mount,advance,get,copied,entry})=>{
 mount({});advance(5500);assert.equal(get('.assistant-body').getAttribute('aria-busy'),'true');get('.copy-message').click();await Promise.resolve();
 assert.equal(copied(),messagePlainText(entry().messages.at(-1)));for(const article of ARTICLES)assert.ok(copied().includes(article.sourceUrl));assert.ok(copied().includes('https://www.cylaw.org/'));
});

await check('5.5-second walkthrough hands off to typing and preserves the article already being read',({mount,advance,get,click,entry,draft})=>{
 mount({researchPreview:true});advance(2500);click('[data-research-article="cap154-203"]');const reader=get('.article-reader'),content=get('.cases-panel-content');content.scrollTop=114;
 const input=draft('Keep this draft');input.focus();advance(2983);assert.equal(entry().messages.length,1);advance(1);
 assert.equal(entry().messages.length,2);assert.equal(get('.assistant-body').getAttribute('aria-busy'),'true');assert.equal(get('.article-reader'),reader);assert.equal(content.scrollTop,114);assert.equal(input.value,'Keep this draft');assert.equal(document.activeElement,input);
 advance(10000);assert.equal(get('.assistant-body').hasAttribute('aria-busy'),false);assert.equal(get('.send-button').disabled,false);assert.equal(entry().messages.length,2);
});

await check('Article and case citations retain their handlers while answer revelation continues',({mount,advance,get,click,entry})=>{
 mount({});advance(10500);const article=get('[data-article-source="cap154-203"]');assert.equal(article.closest('[hidden]'),null);click('[data-article-source="cap154-203"]');assert.ok(get('.article-reader'));assert.equal(entry().articlePanel.articleId,'cap154-203');
 click('.answer-reveal-skip');const citation=click('[data-case-source]');assert.equal(entry().casePanel.caseId,citation.dataset.caseSource);assert.ok(get('.cases-panel-content'));assert.equal(entry().articlePanel,null);click('[data-close-case]');assert.equal(get('#document-panel').hidden,true);
});

await check('Leaving during typing cancels timers; reopening shows saved history immediately without replay',({mount,advance,get,leave,tasks,entry,root})=>{
 mount({});advance(6000);const saved=entry().messages.at(-1);assert.equal(get('.assistant-body').getAttribute('aria-busy'),'true');leave();assert.equal(tasks.size,0);advance(20000);assert.equal(root.innerHTML,'');
 mount();assert.equal(get('.assistant-body').innerHTML,html(cleanAnswerCopy(saved.html)));assert.equal(root.querySelector('.answer-reveal-skip'),null);assert.equal(root.querySelector('.answer-reveal-cursor'),null);assert.equal(tasks.size,0);assert.equal(entry().messages.length,2);
});

await check('Reduced motion presents complete new answer immediately after its existing response delay',({mount,advance,get,entry,root})=>{
 mount({});advance(5499);assert.equal(entry().messages.length,1);advance(1);assert.equal(get('.assistant-body').innerHTML,html(cleanAnswerCopy(entry().messages.at(-1).html)));assert.equal(root.querySelector('.answer-reveal-skip'),null);assert.equal(root.querySelector('.answer-reveal-cursor'),null);assert.equal(get('#chat-form').getAttribute('aria-busy'),'false');
},{reducedMotion:true});

await check('Follow-up only animates the new answer, keeps history complete and blocks duplicate composer submission',({mount,advance,get,entry,send,draft,root})=>{
 mount({messages:[{role:'user',text:prompt},{role:'assistant',...answer}]});assert.equal(get('.assistant-body').innerHTML,html(cleanAnswerCopy(answer.html)));send('Explain premeditation again');advance(5500);
 const bodies=root.querySelectorAll('.assistant-body');assert.equal(bodies.length,2);assert.equal(bodies[0].innerHTML,html(cleanAnswerCopy(answer.html)));assert.equal(bodies[1].getAttribute('aria-busy'),'true');draft('Save my next question');get('#chat-form').onsubmit({preventDefault(){}});assert.equal(entry().messages.length,4);assert.equal(get('#chat-input').value,'Save my next question');
 advance(10000);assert.equal(bodies[1].innerHTML,html(cleanAnswerCopy(entry().messages.at(-1).html)));assert.equal(get('.send-button').disabled,false);
});

await check('Sample contract review answer reveals while document decisions remain interactive',({mount,get,click,advance,entry})=>{
 mount({tool:'review',prompt:'',messages:[]});click('[data-sample]');const body=get('[data-message-index="0"] .assistant-body');assert.equal(body.getAttribute('aria-busy'),'true');assert.equal(entry().messages.length,1);assert.match(entry().messages[0].html,/Uncapped liability/);
 click('[data-change="liability"][data-decision="accepted"]');assert.equal(entry().document.changes.liability,'accepted');assert.equal(get('[data-message-index="0"] .assistant-body'),body);assert.equal(body.getAttribute('aria-busy'),'true');
 advance(10000);assert.equal(body.innerHTML,html(entry().messages[0].html));assert.ok(get('[data-undo="liability"]'));
});

await check('Failed answer persistence creates no reveal; retry commits and reveals one answer',({mount,advance,get,entry,reject,click,root})=>{
 mount({});reject(true);advance(5500);assert.equal(entry().messages.length,1);assert.equal(root.querySelector('.answer-reveal-skip'),null);assert.ok(get('#retry-reply'));
 reject(false);click('#retry-reply');advance(350);assert.equal(entry().messages.length,2);assert.equal(get('.assistant-body').getAttribute('aria-busy'),'true');click('.answer-reveal-skip');assert.equal(entry().messages.length,2);
});

await check('Saved answer loses only retired interface copy; user text, stored content and citations survive',({mount,get,click,entry})=>{
 const introduction='Προετοιμασμένη απάντηση από 10 πραγματικές αποφάσεις. Πατήστε μια παραπομπή για να διαβάσετε την πηγή δίπλα στη συζήτηση.';
 const original={role:'assistant',text:introduction+'\n\n'+answer.text,html:'<p class="chat-research-note">'+introduction+'</p>'+answer.html};
 mount({prompt:'',messages:[{role:'user',text:introduction},original]});
 assert.equal(get('.user-bubble').textContent,introduction);
 assert.equal(get('.assistant-body').innerHTML,html(cleanAnswerCopy(answer.html)));
 assert.deepEqual(entry().messages[1],original,'Presentation cleanup must not rewrite saved content');
 click('[data-article-source="cap154-203"]');assert.equal(get('#document-panel').hidden,false);
 assert.ok(get('#document-panel').textContent.includes('203'));
});

await check('Existing English mock renders in Greek without altering history or source links',({mount,get,entry})=>{
 const previous=preparedCaseAnswer('MURDER','',{language:'en'});
 const original={role:'assistant',...previous};
 mount({prompt:'MURDER',messages:[{role:'user',text:'MURDER'},original]});
 const body=get('.assistant-body');
 assert.equal(get('.chat-research').getAttribute('lang'),'el');
 assert.match(body.textContent,/Σχετικά άρθρα του Ποινικού Κώδικα/);
 assert.doesNotMatch(body.textContent,/Premeditation must|Relevant Criminal|Open beside|Article 20|What the judgments|Sources/);
 assert.equal(get('.user-bubble').textContent,'MURDER');
 assert.deepEqual(entry().messages[1],original);
 assert.equal(body.querySelectorAll('[data-article-source]').length,3);
 assert.equal(get('.answer-brand .brand-word').getAttribute('src'),'assets/neolaw-word.svg');
});

console.log(`\n${passed} rich-DOM chat answer reveal integration groups passed. Native layout and animation remain unverified.`);
