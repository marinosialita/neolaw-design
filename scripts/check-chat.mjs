import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {mountCasePanel} from '../modules/chat-case-panel.js';
import {renderChat} from '../chat.js';
import {CASES} from '../modules/case-data.js';
import {preparedCaseAnswer,mentionedCases,isCaseResearch,casePath,caseCitation} from '../modules/case-research.js';

// Prepared-answer and callback checks; no browser, network, or live model.
const source=readFileSync(new URL('../chat.js',import.meta.url),'utf8');
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name)}
const sourceButtons=html=>[...html.matchAll(/<button\b([^>]*data-case-source="([^"]+)"[^>]*)>/g)].map(match=>({id:match[2],block:Number(match[1].match(/data-source-block="([^"]+)"/)?.[1])||null,attrs:match[1]}));
function verifyCitations(answer){
 const buttons=sourceButtons(answer.html);assert.ok(buttons.length,'Source buttons present');
 for(const button of buttons){const item=CASES.find(c=>c.id===button.id);assert.ok(item,button.id);if(button.block)assert.ok(item.paragraphs.some(p=>p.n===button.block),`${item.id}: source block ${button.block}`);for(const n of (button.attrs.match(/data-source-blocks="([^"]*)"/)?.[1]||'').split(',').filter(Boolean).map(Number))assert.ok(item.paragraphs.some(p=>p.n===n),`${item.id}: supporting block ${n}`);assert.ok(!button.attrs.includes('data-nav='),'Citation must open beside chat, not navigate away');}
 return buttons;
}
console.log('Chat With NeoLaw real-judgment checks · source and callback verification');
console.log('Prepared answers and captured legal data are tested; no live AI or browser rendering is claimed.\n');

check('English and accented Greek legal research queries are detected',()=>{
 for(const value of ['murder','premeditated murder','ΠΡΟΜΕΛΕΤΗ','φόνος','Βρες νομολογία'])assert.ok(isCaseResearch(value),value);
 assert.equal(isCaseResearch('Please edit this showcase contract.'),false);
});
check('Broad answer includes every real case and uses inline source buttons',()=>{
 const answer=preparedCaseAnswer('Find case law on premeditated murder');
 assert.match(answer.html,/Τι προκύπτει από τη νομολογία/);assert.doesNotMatch(answer.html,/fictional|DEMO \d/);
 const buttons=verifyCitations(answer);
 for(const item of CASES){assert.ok(buttons.some(button=>button.id===item.id),item.id);assert.ok(answer.text.includes(item.code));assert.ok(answer.text.includes(item.displayTitle));assert.ok(answer.text.includes(item.result));assert.ok(answer.text.includes(item.sourceUrl));}
});
check('Greek research has Greek framing and all ten real sources',()=>{
 const answer=preparedCaseAnswer('Βρες νομολογία για φόνο με προμελέτη');
 assert.match(answer.html,/lang="el"/);assert.match(answer.html,/Τι προκύπτει από τη νομολογία/);
 const buttons=verifyCitations(answer);for(const item of CASES)assert.ok(buttons.some(button=>button.id===item.id));
});
check('Every selected case answers from its own facts, issue, holding and actual outcome',()=>{
 for(const item of CASES){
  const answer=preparedCaseAnswer(`Ανάλυσε τη δικαστική απόφαση «${item.displayTitle}».`,item.id);assert.equal(answer.caseId,item.id);
  for(const field of [item.facts[0],item.issue,item.holding,item.result])assert.ok(answer.text.includes(field),item.id+' '+field);
  assert.ok(answer.text.includes(item.sourceUrl));assert.ok(verifyCitations(answer).some(button=>item.sectionRefs.holding.includes(button.block)));if(item.dateNote)assert.ok(answer.html.includes(item.dateNote));
 }
});
check('Every evidence answer preserves real reasoning and valid source anchors',()=>{
 for(const item of CASES){const answer=preparedCaseAnswer('Map the evidence',item.id);assert.equal(answer.caseId,item.id);for(const field of [...item.facts,...item.reasoning,item.result])assert.ok(answer.text.includes(field),item.id);verifyCitations(answer);}
});
check('Comparison respects requested real-case order and both actual outcomes',()=>{
 const left=CASES[7],right=CASES[3],answer=preparedCaseAnswer(`Compare ${left.displayTitle} with ${right.displayTitle}`);
 assert.equal(answer.caseId,left.id);assert.ok(answer.text.indexOf(left.displayTitle)<answer.text.indexOf(right.displayTitle));for(const item of [left,right]){assert.ok(answer.text.includes(item.holding));assert.ok(answer.text.includes(item.result));}verifyCitations(answer);
});
check('Case names, citations and short references select matching real records',()=>{
 for(const item of CASES){assert.equal(mentionedCases(item.displayTitle)[0]?.id,item.id);assert.equal(mentionedCases(item.code)[0]?.id,item.id);assert.equal(mentionedCases(`case ${item.rank}`)[0]?.id,item.id);}
 const item=CASES[4],answer=preparedCaseAnswer(`Create a research note for ${item.displayTitle}`);assert.equal(answer.caseId,item.id);assert.match(answer.html,/Research note|Σημείωμα έρευνας/);assert.ok(answer.text.includes(item.facts[0]));
 assert.equal(casePath(item),`/cases?q=murder&case=${item.id}`);const block=item.sectionRefs.result[0];assert.equal(casePath(item,block),`/cases?q=murder&case=${item.id}&view=decision&paragraph=${block}`);
});
check('An explicit all-cases follow-up exits individual case context',()=>{
 const answer=preparedCaseAnswer('Show all 10 cases on premeditated murder.',CASES[0].id);assert.equal(answer.caseId,'');for(const item of CASES)assert.ok(sourceButtons(answer.html).some(button=>button.id===item.id));
});
check('Invalid source blocks cannot generate citations; raw user HTML is not echoed',()=>{
 assert.equal(caseCitation(CASES[0],-1),'');assert.equal(caseCitation(CASES[0],999999),'');assert.doesNotMatch(preparedCaseAnswer('<img src=x onerror=alert(1)> murder').html,/<img|onerror/);
});
check('Chat With NeoLaw branding and document actions remain available',()=>{
 assert.ok(source.includes("ctx.setHeader('Chat With NeoLaw')"));assert.ok(source.includes('<h1>${greeting}, <em>Marinos.</em></h1>'));assert.ok(source.includes("timeZone:'Asia/Nicosia'"));
 for(const id of ['review','edit','resolution','compare','translate','pleading'])assert.ok(source.includes(id));assert.ok(source.includes('data-change'));assert.ok(source.includes('exportPaper'));
});

function withDOM(run){
 const keys=['localStorage','document','location','history','window','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
 const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));const saved=new Map(),tasks=new Map();let timer=0;
 const body=new Element('body');globalThis.document={body,activeElement:null,getElementById:id=>body.querySelector('#'+id),createElement:tag=>new Element(tag)};
 globalThis.window={addEventListener(){},removeEventListener(){}};
 globalThis.location={hash:'#/chat/qa-chat'};globalThis.history={pushState(){throw new Error('Case citation must not change navigation')}};
 globalThis.localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
 globalThis.setTimeout=fn=>{tasks.set(++timer,fn);return timer};globalThis.clearTimeout=id=>tasks.delete(id);globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.cancelAnimationFrame=()=>{};
 const flush=()=>{const pending=[...tasks.values()];tasks.clear();pending.forEach(fn=>fn())};
 try{run({body,flush,tasks});}finally{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}
check('Standalone inline reader opens real text, follows source blocks, changes tabs and closes',()=>withDOM(({body})=>{
 for(const item of CASES){
  const panel=new Element('aside');body.append(panel);const updates=[];let closed=false;const cleanup=mountCasePanel(panel,item,{onState:s=>updates.push(s),onClose:()=>{closed=true}});
  assert.ok(panel.textContent.includes(item.holding));assert.ok(panel.textContent.includes(item.result));assert.equal(panel.querySelector('.cases-original-link').attrs.href,item.sourceUrl);
  const n=item.sectionRefs.principle[0];panel.querySelector(`[data-source-block="${n}"]`).click();assert.equal(updates.at(-1).view,'decision');assert.equal(updates.at(-1).block,n);assert.ok(panel.querySelector(`#chat-source-${n}`).classList.contains('is-focused'));assert.equal(panel.querySelectorAll('.cases-source-paragraph').length,item.paragraphs.length);assert.ok(panel.textContent.includes('not the judgment’s paragraph numbering'));assert.ok(panel.textContent.includes(item.paragraphs.find(p=>p.n===n).text));if(item.dateNote)assert.ok(panel.textContent.includes(item.dateNote));
  panel.querySelector('[data-case-view="brief"]').click();assert.equal(updates.at(-1).view,'brief');panel.querySelector('[data-close-case]').click();assert.equal(closed,true);cleanup();panel.remove();
 }
}));
check('Reader tabs retain keyboard focus after the next animation frame',()=>withDOM(({body})=>{
 const frames=new Map();let nextFrame=0;
 globalThis.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame};
 globalThis.cancelAnimationFrame=id=>frames.delete(id);
 const paint=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn())};
 const panel=new Element('aside');body.append(panel);const cleanup=mountCasePanel(panel,CASES[0]);paint();
 panel.querySelector('[data-case-view="decision"]').click();paint();assert.strictEqual(document.activeElement,panel.querySelector('[data-case-view="decision"]'));
 panel.querySelector('[data-case-view="brief"]').click();paint();assert.strictEqual(document.activeElement,panel.querySelector('[data-case-view="brief"]'));
 cleanup();panel.remove();
}));
check('Actual chat citation opens the right panel without changing URL, conversation, composer or chat scroll',()=>withDOM(({body,flush,tasks})=>{
 const key='neolaw.design.chats',initial={id:'qa-chat',title:'Premeditation · Case research',tool:'',caseId:'',prompt:'Find case law on premeditated murder',messages:[{role:'user',text:'Find case law on premeditated murder'}],files:[]};localStorage.setItem(key,JSON.stringify([initial]));
 const header=new Element('header');body.append(header);const navigations=[];
 const ctx={route:['chat','qa-chat'],params:new URLSearchParams(),setHeader(_title,html){header.innerHTML=html},refreshSidebar(){},navigate:value=>navigations.push(value)};
 let container=new Element('main');body.append(container);let cleanup=renderChat(container,ctx);flush();
 let entry=JSON.parse(localStorage.getItem(key))[0];assert.equal(entry.messages.length,2);assert.equal(entry.caseResearch,true);assert.ok(entry.messages[1].text.includes(CASES[0].sourceUrl));
 const flow=container.querySelector('#chat-flow'),input=container.querySelector('#chat-input');input.value='Do not lose my draft';flow.scrollTop=177;const contentBefore=flow.innerHTML,hashBefore=location.hash;
 const citation=flow.querySelectorAll('[data-source-block]').find(button=>(button.dataset.sourceBlocks||'').split(',').length>1)||flow.querySelector('[data-source-block]');assert.ok(citation);const selected=CASES.find(c=>c.id===citation.dataset.caseSource);const n=Number(citation.dataset.sourceBlock);citation.click();
 assert.equal(location.hash,hashBefore);assert.equal(navigations.length,0);assert.strictEqual(container.querySelector('#chat-flow'),flow);assert.strictEqual(container.querySelector('#chat-input'),input);assert.equal(flow.innerHTML,contentBefore);assert.equal(flow.scrollTop,177);assert.equal(input.value,'Do not lose my draft');assert.equal(container.querySelector('#document-panel').hidden,false);assert.ok(container.querySelector(`#chat-source-${n}`).classList.contains('is-focused'));assert.ok(container.querySelector('.chat-layout').classList.contains('has-case'));const supporting=(citation.dataset.sourceBlocks||String(n)).split(',').map(Number);for(const block of supporting)assert.ok(container.querySelector(`#chat-source-${block}`).classList.contains('is-focused'));const jumps=container.querySelectorAll('[data-source-jump]');assert.equal(jumps.length,supporting.length);if(jumps.length>1){jumps.at(-1).click();assert.strictEqual(document.activeElement,container.querySelector(`#chat-source-${supporting.at(-1)}`));assert.equal(flow.innerHTML,contentBefore);assert.equal(flow.scrollTop,177);}
 entry=JSON.parse(localStorage.getItem(key))[0];assert.equal(entry.casePanel.caseId,selected.id);assert.equal(entry.casePanel.block,supporting.at(-1));assert.equal(entry.caseId,selected.id);assert.equal(entry.messages.length,2);
 container.querySelector('[data-close-case]').click();assert.equal(container.querySelector('#document-panel').hidden,true);assert.strictEqual(document.activeElement,citation);assert.equal(flow.scrollTop,177);assert.equal(input.value,'Do not lose my draft');assert.equal(location.hash,hashBefore);
 const card=flow.querySelectorAll('[data-case-source]').find(b=>!b.dataset.sourceBlock&&b.dataset.caseSource===CASES[4].id);assert.ok(card);card.click();entry=JSON.parse(localStorage.getItem(key))[0];assert.equal(entry.casePanel.caseId,CASES[4].id);assert.equal(entry.casePanel.view,'brief');
 cleanup();container.remove();container=new Element('main');body.append(container);cleanup=renderChat(container,ctx);assert.equal(tasks.size,0);assert.equal(container.querySelector('#document-panel').hidden,false);assert.ok(container.querySelector('#document-panel').textContent.includes(CASES[4].holding));assert.equal(location.hash,hashBefore);
 const activeTrigger=container.querySelector('#chat-flow').querySelectorAll('[data-case-source]').find(button=>button.dataset.caseSource===CASES[4].id);assert.ok(activeTrigger);activeTrigger.click();assert.equal(activeTrigger.isConnected,true);
 container.querySelector('#chat-input').value='Map the evidence';container.querySelector('#chat-form').onsubmit({preventDefault(){}});flush();entry=JSON.parse(localStorage.getItem(key))[0];assert.equal(entry.caseId,CASES[4].id);assert.equal(entry.messages.length,4);assert.ok(entry.messages.at(-1).text.includes(CASES[4].reasoning[0]));assert.ok(entry.messages.at(-1).text.includes(CASES[4].result));assert.equal(activeTrigger.isConnected,false);container.querySelector('[data-close-case]').click();assert.strictEqual(document.activeElement,container.querySelector('#chat-input'));assert.equal(container.querySelector('#document-panel').hidden,true);
 const allAction=container.querySelector('#chat-flow').querySelectorAll('[data-research-prompt]').find(button=>/Δείξε όλες τις υποθέσεις/.test(button.dataset.researchPrompt));assert.ok(allAction);allAction.click();flush();entry=JSON.parse(localStorage.getItem(key))[0];assert.equal(entry.caseId,'');assert.equal(entry.messages.length,6);assert.ok(entry.messages.at(-1).text.includes(CASES[9].displayTitle));cleanup();
}));
check('Normal non-research chat retains its starting-point response without missing helpers',()=>withDOM(({body,flush})=>{
 const prompt='Hello, help me get started';localStorage.setItem('neolaw.design.chats',JSON.stringify([{id:'general-chat',title:'Hello',prompt,messages:[{role:'user',text:prompt}],files:[]}]));const header=new Element('header');body.append(header);const container=new Element('main');body.append(container);const cleanup=renderChat(container,{route:['chat','general-chat'],params:new URLSearchParams(),setHeader(_title,html){header.innerHTML=html},refreshSidebar(){}});flush();assert.ok(container.querySelector('#chat-flow').textContent.includes('Start with a document task'));assert.ok(container.querySelector('[data-research-prompt]'));cleanup();
}));
check('Explicit retired DEMO requests never silently select a real judgment',()=>{
 for(const prompt of ['Compare DEMO 01 with DEMO 02','Σύγκρινε demo-08 με demo-04']){const answer=preparedCaseAnswer(prompt,CASES[0].id);assert.equal(answer.caseId,'');assert.equal(sourceButtons(answer.html).length,0);assert.ok(!answer.text.includes(CASES[0].holding));assert.ok(answer.html.includes('data-research-prompt'));assert.match(answer.text,/no longer available|δεν είναι διαθέσιμη/i);}
});
check('Saved fictional answers remain intact while retired citations become a real-research invitation',()=>withDOM(({body,flush,tasks})=>{
 const key='neolaw.design.chats',user={role:'user',text:'Tell me about DEMO 01'},oldAnswer={role:'assistant',text:'DEMO 01 — Fictional scenario. Invented outcome.',html:'<p>DEMO 01 — Fictional scenario.</p><button class="chat-citation" data-nav="/cases?q=murder&amp;case=demo-01&amp;view=decision&amp;paragraph=8">DEMO 01 §8</button><button data-research-prompt="Compare DEMO 01 with DEMO 02">Compare old examples</button>'};
 const original={id:'legacy-chat',title:'My saved matter',caseId:'demo-01',casePanel:{caseId:'demo-01',view:'decision',block:8},caseResearch:true,prompt:user.text,pinned:true,projectId:'my-project',files:[],messages:[user,oldAnswer]};localStorage.setItem(key,JSON.stringify([original]));const header=new Element('header');body.append(header);const container=new Element('main');body.append(container);
 const cleanup=renderChat(container,{route:['chat','legacy-chat'],params:new URLSearchParams(),setHeader(_title,html){header.innerHTML=html},refreshSidebar(){}});assert.equal(tasks.size,0);assert.equal(container.querySelector('#document-panel').hidden,true);const flow=container.querySelector('#chat-flow');assert.ok(flow.textContent.includes('sources for this archived response are no longer available'));assert.ok(!flow.textContent.includes(oldAnswer.text));assert.equal(flow.querySelectorAll('[data-nav]').filter(b=>b.dataset.nav.includes('demo-')).length,0);assert.equal(flow.querySelectorAll('[data-research-prompt]').filter(b=>/DEMO/.test(b.dataset.researchPrompt)).length,0);assert.deepEqual(JSON.parse(localStorage.getItem(key))[0].messages,[user,oldAnswer]);
 const starter=flow.querySelector('[data-research-prompt]');assert.ok(starter);starter.click();flush();const stored=JSON.parse(localStorage.getItem(key))[0];assert.deepEqual(stored.messages.slice(0,2),[user,oldAnswer]);assert.equal(stored.messages.length,4);assert.equal(stored.title,original.title);assert.equal(stored.pinned,true);assert.equal(stored.projectId,original.projectId);assert.equal(stored.caseId,'');assert.equal(stored.casePanel,null);assert.ok(stored.messages.at(-1).text.includes(CASES[9].displayTitle));assert.ok(flow.querySelector('[data-case-source]'));cleanup();
}));
check('Root startChat stores caseId and checks storage before navigation',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');assert.match(app,/caseId:options\.caseId\|\|''/);assert.match(app,/if\(!storage\.set\('chats',chats\)\)return false/);
});
console.log(`\n${passed} checks passed. All ${CASES.length} real-case variants and actual chat-to-source callbacks exercised.`);
console.log('Limits: in-memory DOM checks do not verify browser rendering, physical layout, keyboard focus geometry or live AI.');
