import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {renderChat} from '../chat.js';
import {preparedCaseAnswer} from '../modules/case-research.js';
import {CASES} from '../modules/case-data.js';
import {workflowSamples,createWorkflowPreview} from '../modules/workflow-samples.js';

// Parsed DOM callback integration only: no browser, network, native clipboard or downloaded files.
// Setup: npm install --prefix /tmp/neolaw-export-check --ignore-scripts --no-save --no-audit --no-fund linkedom@0.18.13
const require = createRequire(import.meta.url);
const {parseHTML} = require(process.env.NEOLAW_EXPORT_DOM || '/tmp/neolaw-export-check/node_modules/linkedom');
let passed = 0;
const get = (root, selector) => {const node = root.querySelector(selector); assert.ok(node, `Missing ${selector}`); return node;};

async function check(label, initial, run) {
  const names = ['document','window','localStorage','location','navigator','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const urlCreate = URL.createObjectURL, urlRevoke = URL.revokeObjectURL;
  const {document, window} = parseHTML('<html><body><header id="test-header"></header><main id="main"></main><div id="toast"></div></body></html>');
  const store = new Map(), timers = new Map(), urls = new Map(), downloads = [], clipboard = [];
  let sequence = 0, focus = document.body, cleanup;
  Object.defineProperty(document, 'activeElement', {configurable:true, get:()=>focus});
  const priorFocus = window.HTMLElement.prototype.focus;
  const priorScroll = window.HTMLElement.prototype.scrollIntoView;
  const priorShow = window.HTMLElement.prototype.showModal;
  const priorClose = window.HTMLElement.prototype.close;
  const priorAnchorClick = window.HTMLAnchorElement.prototype.click;
  const priorSelectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  // linkedom exposes a select getter only; model the native setter for application callbacks.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:priorSelectValue.get,set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
  window.HTMLElement.prototype.focus = function(){focus = this;};
  window.HTMLElement.prototype.scrollIntoView = function(){};
  window.HTMLElement.prototype.showModal = function(){this.setAttribute('open','');};
  window.HTMLElement.prototype.close = function(){this.removeAttribute('open');};
  // Read the literal filename attribute: linkedom's getter URI-encodes it, unlike a browser.
  window.HTMLAnchorElement.prototype.click = function(){downloads.push({name:this.getAttribute('download'), blob:urls.get(this.href)});};
  URL.createObjectURL = blob => {const id = 'blob:export-test-'+(++sequence); urls.set(id,blob); return id;};
  URL.revokeObjectURL = id => urls.delete(id);
  const values = {
    document, window, location:{hash:'#/chat/export-check'},
    localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value))},
    navigator:{clipboard:{writeText:async text=>{clipboard.push(text);}}},
    setTimeout:(callback,delay)=>{const id=++sequence;timers.set(id,{callback,delay});return id;}, clearTimeout:id=>timers.delete(id),
    requestAnimationFrame:callback=>{callback();return 1;}, cancelAnimationFrame:()=>{}
  };
  for (const [name,value] of Object.entries(values)) Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  const entry = {id:'export-check',title:'Export check',prompt:'',messages:[],files:[],...initial};
  localStorage.setItem('neolaw.design.chats',JSON.stringify([entry]));
  const container = document.getElementById('main'), header = document.getElementById('test-header');
  const ctx = {route:['chat','export-check'],params:new URLSearchParams(),setHeader(_title,html){header.innerHTML=html;},refreshSidebar(){},navigate(){}};
  const click = selector => get(document,selector).click();
  // Decode bytes without Blob.text()'s BOM removal so raw-text fidelity includes a leading BOM.
  const download = async selector => {const before=downloads.length;click(selector);assert.equal(downloads.length,before+1);const file=downloads.at(-1);assert.ok(file.blob,'Download captured a real Blob');return {name:file.name,text:Buffer.from(await file.blob.arrayBuffer()).toString('utf8')};};
  const conversation = async()=>{click('#chat-options');return download('#export-chat');};
  const copy = async(index=-1)=>{const buttons=[...container.querySelectorAll('.copy-message')];assert.ok(buttons.length);const before=clipboard.length;buttons.at(index).click();await Promise.resolve();assert.equal(clipboard.length,before+1);return clipboard.at(-1);};
  const openSample = ()=>{if(initial.tool==='resolution'){get(container,'#resolution-company').value='Export Company Ltd';get(container,'#resolution-decision').value='Approve the research budget';click('#draft-resolution');}else click('[data-sample]');};
  try {
    cleanup=renderChat(container,ctx);
    await run({document,container,header,click,download,conversation,copy,openSample,entry:()=>JSON.parse(localStorage.getItem('neolaw.design.chats'))[0]});
    passed++;console.log('PASS '+label);
  } finally {
    cleanup?.();URL.createObjectURL=urlCreate;URL.revokeObjectURL=urlRevoke;
    window.HTMLElement.prototype.focus=priorFocus;window.HTMLElement.prototype.scrollIntoView=priorScroll;
    window.HTMLElement.prototype.showModal=priorShow;window.HTMLElement.prototype.close=priorClose;
    window.HTMLAnchorElement.prototype.click=priorAnchorClick;
    Object.defineProperty(window.HTMLSelectElement.prototype,'value',priorSelectValue);
    for(const name of names) {if(previous[name])Object.defineProperty(globalThis,name,previous[name]);else delete globalThis[name];}
  }
}

console.log('Actual chat/document export controls · inert DOM integration\n');

const documentCases = [
  ['review',['Consultancy agreement','Limitation of liability','[ORIGINAL]','[PROPOSED / TO COMPLETE]']],
  ['edit',['Consultancy agreement','EUR 80 per hour','EUR 100 per hour']],
  ['resolution',['Export Company Ltd','Approve the research budget','Authority to act','[address to be completed]']],
  ['compare',['ORIGINAL · V1','REVISED · V2','EUR 80','EUR 100','30 days’ written notice']],
  ['translate',['4. Fees and payment · EN','4. Αμοιβή και πληρωμή · EL','9. Τερματισμός · EL']],
  ['pleading',['Statement of claim','5. The Claimant seeks damages','[amount to be particularised]']],
  ['opinion',['Working legal opinion','Question for advice','Legal authorities remain to be added.']],
  ['chronology',['Matter chronology','3 February 2026','Source: Email C.','Its date remains unconfirmed.']],
  ['draft',['Draft from a template','[Company legal name]','[Describe the agreed scope, deliverables and service schedule.]']]
];
for(const [tool,expected] of documentCases) await check(`${tool} Export button exports its actual prepared document`,{tool},async({openSample,download})=>{
  openSample();const file=await download('#export-document');assert.equal(file.name,tool==='resolution'?'board-resolution.txt':'document.txt');
  assert.ok(file.text.startsWith('NEOLAW · DOCUMENT'));
  for(const value of expected)assert.ok(file.text.includes(value),`${tool}: ${value}`);
  assert.doesNotMatch(file.text,/(?:^|\n)(?:Accept|Dismiss|Undo)(?:\n|$)/);
  if(['pleading','opinion','chronology','draft','resolution'].includes(tool))assert.ok(!file.text.includes('The Consultant’s liability shall be unlimited'));
});

await check('Review exports pending markup, then only accepted and retained wording',{tool:'review'},async({openSample,click,download})=>{
  openSample();let file=await download('#export-document');
  assert.ok(file.text.includes('[ORIGINAL] The Consultant’s liability shall be unlimited'));
  assert.ok(file.text.includes('[PROPOSED / TO COMPLETE] The Consultant’s aggregate liability'));
  click('[data-change="liability"][data-decision="accepted"]');click('[data-change="termination"][data-decision="rejected"]');
  file=await download('#export-document');assert.ok(file.text.includes('fees paid during the preceding twelve months'));
  assert.ok(file.text.includes('The Client may terminate this Agreement at any time without notice.'));
  for(const value of ['The Consultant’s liability shall be unlimited','Either party may terminate this Agreement by giving 30 days','[ORIGINAL]','[PROPOSED / TO COMPLETE]','Commercial risk ·','Undo'])assert.ok(!file.text.includes(value),value);
});

await check('Translation export follows the selected language rather than exporting a hidden source',{tool:'translate'},async({openSample,container,download})=>{
  openSample();const select=get(container,'#language-view');select.value='el';select.dispatchEvent(new window.Event('change',{bubbles:true}));
  const file=await download('#export-document');assert.ok(file.text.includes('Αμοιβή και πληρωμή'));assert.ok(!file.text.includes('Fees and payment · EN'));assert.ok(!file.text.includes('Either party may terminate'));
});

const raw='\uFEFF  Original client notes\r\n\r\n<literal> & ποσό €120\t\n';
await check('Uploaded text exports exact raw contents and an original-based filename',{files:[{name:'Client notes.md',type:'text/markdown',content:raw,size:100}]},async({click,download})=>{
  click('[data-preview-text="0"]');const file=await download('#export-document');assert.equal(file.name,'Client notes.txt');assert.equal(file.text,raw);
});

for(const [tool,expected] of [
  ['review',['Uncapped liability — HIGH','Consider a negotiated cap with appropriate exceptions.','Source: Clause 7','Termination without notice — NEGOTIATE','Source: Clause 9']],
  ['compare',['EUR 80 → EUR 100 per hour.','Immediate termination → 30 days’ written notice.']],
  ['pleading',['Particulars of loss — MISSING','Paragraph 8 refers to paragraph 12, which is not present.','The defendant’s address remains a placeholder.']]
]) await check(`${tool} conversation Export and Copy retain the complete rich answer`,{tool},async({openSample,conversation,copy})=>{
  openSample();const file=await conversation(),copied=await copy();assert.equal(file.name,'neolaw-conversation.txt');
  for(const text of [file.text,copied])for(const value of expected)assert.ok(text.includes(value),`${tool}: ${value}`);
});

const item=CASES[7],answer=preparedCaseAnswer('Explain case 08.');
await check('Case 08 Copy and conversation Export retain date caveat, CyLaw URL and supporting source blocks',{messages:[{role:'user',text:'Explain case 08.'},{role:'assistant',...answer}],caseResearch:true,caseId:item.id},async({conversation,copy})=>{
  const file=await conversation(),copied=await copy();
  for(const text of [file.text,copied]){
    assert.ok(text.includes(item.dateNote));assert.ok(text.includes(item.sourceUrl));assert.ok(text.includes(item.code));
    for(const key of ['facts','issue','holding','result'])for(const block of item.sectionRefs[key])assert.match(text,new RegExp(`Source blocks: [^\\n]*\\b${block}\\b`));
    assert.ok(text.includes('not official judicial paragraph numbers'));
    assert.ok(!text.includes('Compare a related judgment'));assert.ok(!text.includes('Open beside the chat'));
  }
});

for(const [id,sample] of Object.entries(workflowSamples)){
 const preview=createWorkflowPreview(id);
 await check(`${id} document export and answer Copy retain the same workflow findings and analysis availability`,{tool:'review',workflowId:id,document:preview.document,documentPanelOpen:true,messages:[{role:'user',text:'Customized instructions are retained separately.'},preview.message]},async({download,copy,conversation})=>{
  const file=await download('#export-document'),copied=await copy(),chat=await conversation();
  assert.equal(file.name,id+'-brief.txt');
  for(const text of [file.text,copied,chat.text]){
   for(const value of [sample.title,sample.summary,sample.next,...sample.rows.flat()])assert.ok(text.includes(value),`${id}: ${value}`);
   assert.doesNotMatch(text,/fictional sample|local preview|design preview/i);assert.match(text,/automatic analysis is unavailable/i);
  }
  assert.ok(file.text.includes(sample.context));assert.ok(chat.text.includes('Customized instructions are retained separately.'));
  assert.ok(!file.text.includes('Customized instructions are retained separately.'));
 });
}

console.log(`\n${passed} actual-control export checks passed with parsed DOM callbacks. Browser rendering, native clipboard and file delivery remain unverified.`);
