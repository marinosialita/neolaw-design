import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chatReport,mountScreeningChat,requestChat} from '../modules/screening-chat.js';
const {parseHTML}=createRequire(import.meta.url)('/tmp/neolaw-export-check/node_modules/linkedom');
const base={id:'one',query:{name:'Example Person'},matches:[],notes:'PRIVATE NOTE',projectName:'PRIVATE MATTER',decisions:{a:{status:'investigate',note:'PRIVATE DECISION',reviewer:'PRIVATE REVIEWER'}}};
const answer=id=>({reportId:id,status:'answered',points:[{heading:'Identity',text:'A possible match is not confirmed identity.',evidence:[{id:'E1',title:'Recorded identity',quote:'Identity unresolved',target:{kind:'overview'}}]}],followUps:['What should I verify next?']});
const tick=()=>new Promise(r=>setTimeout(r,0));let passed=0;
async function check(label,run){
 const {document,window}=parseHTML('<button id="trigger"></button><aside></aside>');globalThis.document=document;globalThis.window=window;
 window.HTMLElement.prototype.focus=function(){};
 const host=document.querySelector('aside'),trigger=document.querySelector('button'),sessions=new Map();let report=structuredClone(base),chat;const calls=[],refs=[];
 const setup=(request=async(path,options)=>{calls.push(options);return answer(report.id);})=>chat=mountScreeningChat(host,{getReport:()=>report,trigger,sessions,request,onEvidence:ref=>refs.push(ref)});
 const send=async(text)=>{const input=host.querySelector('textarea');input.value=text;input.oninput();host.querySelector('form').onsubmit({preventDefault(){}});await tick();};
 try{await run({host,trigger,sessions,calls,refs,setup,send,setReport:r=>report=r,get chat(){return chat;}});passed++;console.log('PASS '+label);}finally{chat?.destroy();delete globalThis.document;delete globalThis.window;}
}
await check('Only current report data is projected; office notes and reviewer free text stay out',()=>{const value=JSON.stringify(chatReport(base));for(const s of ['PRIVATE NOTE','PRIVATE MATTER','PRIVATE DECISION','PRIVATE REVIEWER'])assert.ok(!value.includes(s));});
await check('Chat opens small, sends one report and renders linked evidence as text',async x=>{x.setup();x.chat.toggle();assert.equal(x.host.hidden,false);await x.send('Explain this result');assert.equal(x.calls.length,1);assert.equal(x.calls[0].body.report.id,'one');assert.equal(x.calls[0].body.question,'Explain this result');assert.match(x.host.textContent,/possible match is not confirmed/);x.host.querySelector('[data-ask-evidence]').onclick();assert.equal(x.refs[0].target.kind,'overview');assert.equal(x.host.hidden,true);});
await check('Structured headings and reviewer-authored follow-ups stay inside the report chat',async x=>{x.setup();x.chat.toggle();await x.send('Explain this result');assert.match(x.host.textContent,/Identity/);assert.match(x.host.textContent,/Continue the review/);assert.match(x.host.textContent,/Which identifiers support or conflict with the candidate/);assert.doesNotMatch(x.host.textContent,/Would you like/);});
await check('A new report gets an empty conversation and late answers cannot bleed across',async x=>{let complete;x.setup(()=>new Promise(r=>complete=r));x.chat.toggle();await x.send('First report question');x.setReport({...base,id:'two',query:{name:'Another Person'}});x.chat.update();complete(answer('one'));await tick();assert.ok(!x.host.textContent.includes('First report question'));assert.ok(!x.host.textContent.includes('possible match is not confirmed'));assert.equal(x.sessions.get('two').messages.length,0);});
await check('Changed evidence clears stale conversation even under the same report ID',async x=>{x.setup();x.chat.toggle();await x.send('Explain');x.setReport({...base,research:{status:'failed'}});x.chat.update();assert.match(x.host.textContent,/report changed/i);assert.equal(x.sessions.get('one').messages.length,0);});
await check('Incoming results do not show a retry warning before the user has asked anything',async x=>{x.setup();x.chat.toggle();x.setReport({...base,research:{status:'running'}});x.chat.update();assert.doesNotMatch(x.host.textContent,/Ask again/);assert.equal(x.sessions.get('one').messages.length,0);});
await check('Stopping and clearing prevent delayed output while preserving report data',async x=>{let complete;x.setup(()=>new Promise(r=>complete=r));x.chat.toggle();await x.send('Question');x.host.querySelector('[data-ask-stop]').click();complete(answer('one'));await tick();assert.match(x.host.textContent,/Stopped waiting/);assert.ok(!x.host.textContent.includes('possible match is not confirmed'));x.host.querySelector('[data-ask-clear]').click();assert.equal(x.sessions.get('one').messages.length,0);});
await check('Provider failures retain the question, permit retry and never show a fake answer',async x=>{x.setup(async()=>{throw Error('Connect OpenAI to ask about this report.');});x.chat.toggle();await x.send('What next?');assert.match(x.host.textContent,/Connect OpenAI/);assert.equal(x.host.querySelector('textarea').value,'What next?');assert.equal(x.host.querySelector('[type="submit"]').disabled,false);});
await check('A retry excludes the failed question from model history',async x=>{let attempt=0,history;x.setup(async(_path,options)=>{if(!attempt++)throw Error('Temporary outage');history=options.body.history;return answer('one');});x.chat.toggle();await x.send('What next?');await x.send('What next?');assert.equal(history.length,0);assert.match(x.host.textContent,/possible match is not confirmed/);});
await check('HTML in answers and questions cannot create executable elements',async x=>{x.setup(async()=>({...answer('one'),points:[{text:'<img src=x onerror=alert(1)>',evidence:[]}]}));x.chat.toggle();await x.send('<script>bad()</script>');assert.equal(x.host.querySelector('script'),null);assert.equal(x.host.querySelector('img'),null);assert.match(x.host.textContent,/<img src=x/);});
await check('Busy-slot waiting is cancellable and does not retry provider errors',async()=>{
 const previous=globalThis.fetch;const controller=new AbortController();let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return{ok:false,status:409,json:async()=>({error:'Another screening answer is still finishing. Please retry shortly.'})};};
  await assert.rejects(requestChat('/local',{body:{},signal:controller.signal,onWaiting:waiting=>{if(waiting)controller.abort();}}),error=>error.name==='AbortError');assert.equal(calls,1);
  calls=0;globalThis.fetch=async()=>++calls===1?{ok:false,status:409,json:async()=>({error:'Another screening answer is still finishing. Please retry shortly.'})}:{ok:true,status:200,json:async()=>({status:'answered'})};
  assert.equal((await requestChat('/local',{body:{}})).status,'answered');assert.equal(calls,2);
  calls=0;globalThis.fetch=async()=>{calls++;return{ok:false,status:502,json:async()=>({error:'Unverified provider answer'})};};
  await assert.rejects(requestChat('/local',{body:{}}),/Unverified provider answer/);assert.equal(calls,1);
 }finally{globalThis.fetch=previous;}
});
console.log(`${passed} chat UI checks passed. Detached DOM and synthetic responses; no API calls.`);
