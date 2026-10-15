import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {renderHome,renderChat} from '../chat.js';
import {clearComposerDraft} from '../modules/composer-drafts.js';
import {ARTICLES} from '../modules/article-data.js';
Element.prototype.getAttribute=function(name){return Object.hasOwn(this.attrs,name)?this.attrs[name]:null};

// Deterministic clock and actual chat callbacks; not a native-browser visual test.
let passed=0;
function check(label,run){
 const keys=['document','window','location','localStorage','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame'];
 const before=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),realNow=Date.now;
 let now=100000,next=0,reject=false,cleanup,root;
 const tasks=new Map(),records=new Map(),body=new Element('body'),header=new Element('header');body.append(header);
 const toast=new Element('div',{id:'toast'});body.append(toast);
 globalThis.document={body,activeElement:body,getElementById:id=>body.querySelector('#'+id),createElement(tag){const node=new Element(tag);node.style.setProperty=(key,value)=>{node.style[key]=value};return node}};
 globalThis.window={addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})};
 globalThis.location={hash:'#/chat'};
 globalThis.localStorage={getItem:key=>records.get(key)||null,setItem(key,value){if(reject&&key==='neolaw.design.chats')throw Error('Simulated write failure');records.set(key,value)}};
 globalThis.setTimeout=(fn,delay=0)=>{tasks.set(++next,{fn,at:now+delay});return next};globalThis.clearTimeout=id=>tasks.delete(id);
 globalThis.requestAnimationFrame=fn=>{fn();return 0};globalThis.cancelAnimationFrame=()=>{};Date.now=()=>now;
 const advance=ms=>{const target=now+ms;let safety=0;while(true){const task=[...tasks].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!task)break;assert.ok(++safety<100);now=task[1].at;tasks.delete(task[0]);task[1].fn()}now=target};
 const entry=()=>JSON.parse(records.get('neolaw.design.chats'))[0];
 const seed=(preview=true,prompt='Find case law on premeditated murder')=>{records.set('neolaw.design.chats',JSON.stringify([{id:'research-delay',title:'Research preview',prompt,researchPreview:preview,messages:[{role:'user',text:prompt}],files:[]}]))};
 const unmount=()=>{cleanup?.();cleanup=null;root?.remove()};
 const mount=()=>{unmount();root=new Element('main');body.append(root);location.hash='#/chat/research-delay';cleanup=renderChat(root,{route:['chat','research-delay'],params:new URLSearchParams(),setHeader(_title,html){header.innerHTML=html},refreshSidebar(){}});return root};
 clearComposerDraft('home');clearComposerDraft('chat:research-delay');
 try{run({body,entry,seed,mount,unmount,advance,tasks,records,reject(value){reject=value}});passed++;console.log('PASS '+label)}
 finally{unmount();Date.now=realNow;clearComposerDraft('home');clearComposerDraft('chat:research-delay');for(const[key,value]of Object.entries(before)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}

check('Home accepts a typed research question without a shortcut and preserves it after a failed launch',({body})=>{
 const home=new Element('main');body.append(home);let reject=true;const requests=[];
 const cleanup=renderHome(home,{libraryItems:[],setHeader(){},startChat(options){requests.push(options);return !reject}});
 assert.equal(home.querySelector('#research-starter'),null);assert.doesNotMatch(home.textContent,/Try a research answer with clickable citations/);
 const prompt='Βρες νομολογία για φόνο εκ προμελέτης',input=home.querySelector('#chat-input'),form=home.querySelector('#chat-form');
 input.value=prompt;input.oninput();form.onsubmit({preventDefault(){}});assert.equal(input.value,prompt);assert.equal(home.querySelector('.send-button').disabled,false);
 reject=false;form.onsubmit({preventDefault(){}});form.onsubmit({preventDefault(){}});
 assert.equal(requests.length,2);assert.equal(requests[1].researchPreview,undefined);assert.equal(requests[1].prompt,prompt);assert.equal(input.value,'');assert.equal(home.querySelector('.send-button').disabled,true);cleanup();home.remove();
});

check('Research demo waits 5.5 seconds, progresses through stages, then reveals usable citations once',({seed,mount,advance,entry})=>{
 seed(false);const root=mount(),flow=root.querySelector('#chat-flow');assert.equal(entry().messages.length,1);assert.ok(root.querySelector('.research-progress'));
 assert.doesNotMatch(root.querySelector('.research-progress').textContent,/Προετοιμασμένο παράδειγμα/);assert.match(root.querySelector('[data-research-title]').textContent,/φόνο εκ προμελέτης/);
 advance(1400);assert.match(root.querySelector('[data-research-title]').textContent,/άρθρ/);assert.equal(entry().messages.length,1);
 advance(1600);assert.match(root.querySelector('[data-research-title]').textContent,/νομολογία/);advance(1400);assert.match(root.querySelector('[data-research-title]').textContent,/παραπομπές/);advance(1099);assert.equal(entry().messages.length,1);
 const input=root.querySelector('#chat-input');input.value='Keep my next question';input.oninput();root.querySelector('#chat-form').onsubmit({preventDefault(){}});assert.equal(entry().messages.length,1);
 advance(1);assert.equal(entry().messages.length,2);assert.equal(root.querySelector('.research-progress'),null);assert.equal(input.value,'Keep my next question');
 const citation=flow.querySelector('[data-source-block]');assert.ok(citation);flow.scrollTop=99;citation.click();assert.equal(root.querySelector('#document-panel').hidden,false);assert.equal(flow.scrollTop,99);assert.equal(location.hash,'#/chat/research-delay');
 advance(20000);assert.equal(entry().messages.length,2);
});

check('Leaving cancels timers; reopening resumes the remaining delay without a duplicate prompt or answer',({seed,mount,unmount,advance,entry,tasks})=>{
 seed();mount();advance(2800);unmount();assert.equal(tasks.size,0);advance(1200);const root=mount();assert.match(root.querySelector('[data-research-title]').textContent,/νομολογία/);
 advance(1499);assert.equal(entry().messages.length,1);advance(1);assert.equal(entry().messages.length,2);unmount();mount();assert.equal(tasks.size,0);assert.equal(entry().messages.length,2);
});

check('An elapsed demo completes immediately when reopened and never restarts a 5.5-second wait',({seed,mount,unmount,advance,entry})=>{
 seed();mount();advance(1000);unmount();advance(4500);const root=mount();assert.equal(root.querySelector('.research-progress'),null);advance(0);assert.equal(entry().messages.length,2);
});

check('A failed save retains the pending prompt and retry produces one answer without replaying the wait',({seed,mount,advance,entry,reject})=>{
 seed();const root=mount();reject(true);advance(5500);assert.equal(entry().messages.length,1);assert.ok(root.querySelector('#retry-reply'));assert.equal(root.querySelector('.research-progress'),null);
 reject(false);root.querySelector('#retry-reply').click();advance(0);assert.equal(entry().messages.length,2);assert.equal(entry().pendingReply,undefined);assert.equal(root.querySelector('#retry-reply'),null);
});

check('Article sources can open during the walkthrough and stay mounted when the answer appears',({seed,mount,advance,entry})=>{
 seed();const root=mount();advance(2500);const source=root.querySelector('[data-research-article="cap154-203"]');assert.ok(source);source.click();
 const reader=root.querySelector('.article-reader');assert.ok(reader);assert.ok(reader.textContent.includes(ARTICLES[0].text[0]));const content=root.querySelector('.cases-panel-content');content.scrollTop=91;
 advance(3000);assert.equal(entry().messages.length,2);assert.strictEqual(root.querySelector('.article-reader'),reader);assert.equal(content.scrollTop,91);assert.equal(root.querySelector('.research-progress'),null);
 root.querySelector('[data-close-article]').click();assert.strictEqual(document.activeElement,root.querySelector('#chat-input'));
});

check('Judgment links work during the walkthrough and preserve the exact source until answer completion',({seed,mount,advance,entry})=>{
 seed();const root=mount();advance(3000);const source=root.querySelector('[data-research-case]');assert.ok(source);source.click();
 const panel=root.querySelector('#document-panel'),reader=panel.querySelector('.cases-source-document');assert.ok(reader);const focused=panel.querySelector('.cases-source-paragraph.is-focused');assert.ok(focused);panel.querySelector('.cases-panel-content').scrollTop=126;
 advance(2500);assert.equal(entry().messages.length,2);assert.strictEqual(panel.querySelector('.cases-source-document'),reader);assert.equal(panel.querySelector('.cases-panel-content').scrollTop,126);
 root.querySelector('[data-close-case]').click();assert.strictEqual(document.activeElement,root.querySelector('#chat-input'));
});

check('Other chats keep their existing response timing',({seed,mount,advance,entry})=>{
 seed(false,'Help me choose a document task');const root=mount();assert.equal(root.querySelector('.research-progress'),null);advance(499);assert.equal(entry().messages.length,1);advance(1);assert.equal(entry().messages.length,2);
});

console.log(`\n${passed} timed research callback groups passed. Browser appearance and real animation remain unverified.`);
