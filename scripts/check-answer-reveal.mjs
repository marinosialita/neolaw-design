import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {revealAnswer} from '../modules/answer-reveal.js';
import {preparedCaseAnswer} from '../modules/case-research.js';
import {Element} from './dom-double.mjs';
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
let passed=0;
function check(label,run){
 const oldSet=setTimeout,oldClear=clearTimeout,oldNow=Date.now;
 let now=100000,id=0;const timers=new Map();
 globalThis.setTimeout=(fn,delay=0)=>{timers.set(++id,{fn,at:now+delay});return id};
 globalThis.clearTimeout=key=>timers.delete(key);Date.now=()=>now;
 const advance=ms=>{const target=now+ms;let safety=0;while(true){const task=[...timers].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!task)break;assert.ok(++safety<1000);now=task[1].at;timers.delete(task[0]);task[1].fn()}now=target};
 const {document,window}=parseHTML('<html><body><div id="scroll"><div id="answer"></div></div></body></html>');
 const body=document.getElementById('answer'),scroller=document.getElementById('scroll');
 Object.assign(scroller,{scrollTop:100,scrollHeight:500,clientHeight:400});
 const event=(type,properties={})=>{const e=new window.Event(type,{bubbles:true});Object.assign(e,properties);scroller.dispatchEvent(e)};
 try{run({body,document,scroller,event,advance,timers});passed++;console.log('PASS '+label)}
 finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;Date.now=oldNow}
}
const prose='Η προμελέτη πρέπει να αποδεικνύεται χωριστά από την πρόθεση θανάτωσης. Το δικαστήριο εξετάζει την κάθε συγκεκριμένη περίπτωση προσεκτικά. ';
check('Words appear progressively and the exact rich DOM returns after completion',({body,advance,timers})=>{
 body.innerHTML=`<p>${prose.repeat(3)}<strong>Νομική αρχή.</strong></p><h3 style="display:block;color:teal">Σχετικά άρθρα</h3><p>Άρθρο 203.</p>`;
 const original=body.innerHTML,nodes=[...body.querySelectorAll('*')];let done=0;
 revealAnswer(body,{onDone(){done++}});
 assert.equal(body.getAttribute('aria-busy'),'true');assert.equal(body.querySelector('h3').hidden,true);
 assert.ok(body.textContent.length<prose.length);assert.match(body.textContent,/Η /);
 const first=body.textContent.length;advance(1000);assert.ok(body.textContent.length>first);assert.ok(body.classList.contains('answer-revealing'));
 advance(9000);assert.equal(body.innerHTML,original);assert.equal(body.getAttribute('aria-busy'),null);assert.equal(done,1);assert.equal(timers.size,0);
 assert.deepEqual([...body.querySelectorAll('*')],nodes);
});
check('Citation buttons reveal atomically without replacement or lost listeners',({body,advance})=>{
 body.innerHTML=`<p>${prose}<button data-source="203"><span>Άρθρο 203</span><svg aria-hidden="true"></svg></button> ${prose.repeat(3)}</p>`;
 const citation=body.querySelector('button');let clicks=0;citation.addEventListener('click',()=>clicks++);
 const html=citation.innerHTML;revealAnswer(body);assert.equal(citation.hidden,true);assert.equal(citation.innerHTML,html);
 advance(1100);assert.equal(citation.hidden,false);assert.equal(citation.innerHTML,html);citation.click();assert.equal(clicks,1);
 advance(9000);assert.strictEqual(body.querySelector('button'),citation);citation.click();assert.equal(clicks,2);
});

check('Cursor never becomes an extra source-grid or flex item and returns for prose',({body,advance})=>{
 body.innerHTML=`<p>Intro <button class="chat-citation">203</button></p><div class="chat-source-grid"><button class="chat-source-card">First full case source</button><button class="chat-source-card">Second full case source</button></div><div style="display:flex"><span>${prose.repeat(2)}</span><button>Open source</button></div><p>${prose.repeat(3)}</p>`;
 const grid=body.querySelector('.chat-source-grid'),flex=body.querySelector('[style="display:flex"]');
 const reveal=revealAnswer(body);let sawGrid=false,sawFinalProse=false;
 for(let elapsed=0;elapsed<9000;elapsed+=40){
  advance(40);const cursor=body.querySelector('.answer-reveal-cursor');
  assert.notStrictEqual(cursor?.parentNode,grid);assert.notStrictEqual(cursor?.parentNode,flex);
  if([...grid.children].some(n=>!n.hidden))sawGrid=true;
  if(cursor?.parentNode===body.lastElementChild)sawFinalProse=true;
 }
 assert.ok(sawGrid);assert.ok(sawFinalProse);assert.equal(grid.children.length,2);reveal.dispose();
});
check('Direct prose in a flex container does not get an extra caret item',({body,advance})=>{
 body.innerHTML=`<div style="display:flex">${prose.repeat(3)}<button>Action</button></div><p>${prose}</p>`;
 const flex=body.firstElementChild;const reveal=revealAnswer(body);advance(400);
 assert.equal(flex.querySelector('.answer-reveal-cursor'),null);assert.equal(flex.children.length,1);reveal.dispose();
});

check('Real prepared research preserves source cards, article links, and Greek Unicode',({body,advance})=>{
 const answer=preparedCaseAnswer('Βρες νομολογία για φόνο εκ προμελέτης.');body.innerHTML=answer.html;
 const original=body.innerHTML,buttons=[...body.querySelectorAll('button')],refs=buttons.map(b=>[b.getAttribute('data-case-source'),b.getAttribute('data-article-source')]);
 revealAnswer(body);advance(4000);assert.ok(body.classList.contains('answer-revealing'));advance(6000);
 assert.equal(body.innerHTML,original);assert.doesNotMatch(body.textContent,/Προετοιμασμένη απάντηση/);assert.match(body.textContent,/Σχετικά άρθρα του Ποινικού Κώδικα/);
 assert.deepEqual([...body.querySelectorAll('button')],buttons);assert.deepEqual(buttons.map(b=>[b.getAttribute('data-case-source'),b.getAttribute('data-article-source')]),refs);
});
check('Finish restores untouched visibility and style, cancels timers, and calls completion once',({body,advance,timers})=>{
 body.innerHTML=`<p>${prose.repeat(5)}</p><p hidden="until-found" style="color:red">Previously hidden</p><p style="display:inline-block">Final paragraph</p>`;
 const original=body.innerHTML;body.setAttribute('aria-busy','false');let done=0;
 const reveal=revealAnswer(body,{onDone(){done++}});advance(280);reveal.finish();reveal.finish();reveal.dispose();advance(10000);
 assert.equal(body.innerHTML,original);assert.equal(body.getAttribute('aria-busy'),'false');assert.equal(done,1);assert.equal(timers.size,0);
});
check('Dispose restores the full answer silently and never steals focus',({body,document,advance,timers})=>{
 body.innerHTML=`<p>${prose.repeat(6)}</p>`;const original=body.innerHTML;let done=0,focusCalls=0;
 for(const node of [body,document.body,...body.querySelectorAll('*')])node.focus=()=>focusCalls++;
 const reveal=revealAnswer(body,{onDone(){done++}});advance(120);reveal.dispose();advance(12000);
 assert.equal(body.innerHTML,original);assert.equal(done,0);assert.equal(focusCalls,0);assert.equal(timers.size,0);
});
check('Reduced motion and simplified DOM fixtures complete immediately without scheduling',({body,timers})=>{
 body.innerHTML=`<p>${prose}</p>`;const original=body.innerHTML;let done=0;
 const reduced=revealAnswer(body,{reducedMotion:true,onDone(){done++}});assert.equal(body.innerHTML,original);assert.equal(timers.size,0);assert.equal(done,1);reduced.finish();assert.equal(done,1);
 const simple=new Element('div');simple.innerHTML='<p>Ready answer</p>';revealAnswer(simple,{onDone(){done++}});assert.equal(done,2);assert.equal(simple.textContent,'Ready answer');assert.equal(timers.size,0);
});
check('Auto-follow stops when the user scrolls up and finish preserves their position',({body,scroller,event,advance})=>{
 body.innerHTML=`<p>${prose.repeat(12)}</p>`;const reveal=revealAnswer(body,{scroller});
 assert.equal(scroller.scrollTop,scroller.scrollHeight);scroller.scrollHeight=700;advance(200);assert.equal(scroller.scrollTop,700);
 scroller.scrollTop=300;event('scroll');scroller.scrollHeight=900;advance(200);assert.equal(scroller.scrollTop,300);reveal.finish();assert.equal(scroller.scrollTop,300);
});
check('Explicit no-follow, upward wheel, and keyboard navigation stop auto-scroll',({body,scroller,event,advance})=>{
 body.innerHTML=`<p>${prose.repeat(12)}</p>`;
 let reveal=revealAnswer(body,{scroller,followScroll:false});advance(300);assert.equal(scroller.scrollTop,100);reveal.dispose();
 reveal=revealAnswer(body,{scroller,followScroll:true});event('wheel',{deltaY:-30});scroller.scrollTop=240;scroller.scrollHeight=850;advance(200);assert.equal(scroller.scrollTop,240);reveal.dispose();
 reveal=revealAnswer(body,{scroller,followScroll:true});event('keydown',{key:'PageUp'});scroller.scrollTop=220;scroller.scrollHeight=950;advance(200);assert.equal(scroller.scrollTop,220);reveal.dispose();
});
check('Starting a second reveal cancels and restores the first before collecting new text',({body,advance,timers})=>{
 body.innerHTML=`<p>${prose.repeat(6)}</p>`;const original=body.innerHTML;let first=0,second=0;
 revealAnswer(body,{onDone(){first++}});advance(240);const last=revealAnswer(body,{onDone(){second++}});assert.equal(timers.size,1);advance(10000);assert.equal(body.innerHTML,original);assert.equal(first,0);assert.equal(second,1);last.finish();assert.equal(second,1);
});
console.log(`\n${passed} rich-answer reveal callback groups passed. Inert DOM timing and interaction checks; browser animation remains unverified.`);
