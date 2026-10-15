import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {render} from '../modules/cases.js';
import {mountCasePanel} from '../modules/chat-case-panel.js';
import {CASES} from '../modules/case-data.js';
import {escape} from '../core.js';

// Source/callback verification only; no browser, legal research or native clipboard/download access.
const globalNames = ['document','window','location','history','matchMedia','requestAnimationFrame','cancelAnimationFrame','navigator'];
const originalGlobals = Object.fromEntries(globalNames.map(name => [name,Object.getOwnPropertyDescriptor(globalThis,name)]));
let passed = 0;
async function check(name, run) {
  const document = new Element('document'); document.body = new Element('body'); document.append(document.body); document.activeElement = document.body; document.createElement = tag => new Element(tag);
  const copies = [], downloads = [], routes = [], data = new Map();
  const matchMedia = () => ({matches:false});
  const window = {matchMedia,addEventListener() {},removeEventListener() {}};
  Object.assign(globalThis,{document,window,location:{hash:'#/cases'},history:{pushState(_a,_b,url) {location.hash=url;},replaceState(_a,_b,url) {location.hash=url;}},matchMedia,requestAnimationFrame: callback => {callback();return 1;},cancelAnimationFrame() {}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{async writeText(text) {copies.push(text);}}}});
  const container = new Element('main'); document.body.append(container);
  let cleanup;
  const ctx = {escape,route:['cases'],params:new URLSearchParams(),setHeader() {},storage:{get:(key,fallback)=>data.get(key)??fallback,set(key,value) {data.set(key,value);return true;}},navigate:path=>routes.push(path),toast() {},download:(...args)=>downloads.push(args),startChat() {}};
  const api = {container,copies,downloads,routes,mount(query) {cleanup?.();ctx.params=new URLSearchParams(query);cleanup=render(container,ctx);},mountChat(item,options) {cleanup?.();cleanup=mountCasePanel(container,item,options);}};
  try {await run(api);passed++;console.log('PASS '+name);} finally {cleanup?.();}
}
const find = (root,selector) => {const element=root.querySelector(selector);assert.ok(element,`Missing ${selector}`);return element;};
const referenceNumbers = root => root.querySelectorAll('[data-source-block]').map(button=>Number(button.dataset.sourceBlock));
const validRefs = (item,key) => (item.sectionRefs[key]||[]).filter(n=>item.paragraphs.some(block=>block.n===n));
try {
  await check('Chat briefs retain every valid reference in all ten cases, including sections with more than three sources', ({container,mountChat}) => {
    for (const item of CASES) {
      mountChat(item); assert.deepEqual(referenceNumbers(find(container,'.cases-reader-principle')),validRefs(item,'principle'));
      for (const [label,key] of [['Facts','facts'],['Issue','issue'],['Holding','holding'],['Reasoning','reasoning'],['Outcome','result']]) {
        const section=container.querySelectorAll('.cases-brief-section').find(section=>section.querySelector('h3')?.textContent===label);
        assert.deepEqual(referenceNumbers(section),validRefs(item,key),`${item.id}: ${label}`);
      }
    }
  });
  await check('Previously hidden outcome references in Gavriil and Dejan open their actual concluding source blocks', ({container,mountChat}) => {
    for (const id of ['case-05','case-07']) {
      const item=CASES.find(item=>item.id===id), last=item.sectionRefs.result.at(-1), states=[];
      mountChat(item,{onState:value=>states.push(value)});
      const section=container.querySelectorAll('.cases-brief-section').find(section=>section.querySelector('h3')?.textContent==='Outcome');
      find(section,`[data-source-block="${last}"]`).click();
      assert.equal(states.at(-1).block,last);assert.equal(states.at(-1).view,'decision');
      assert.equal(find(container,`#chat-source-${last}`).textContent.includes(item.paragraphs.find(block=>block.n===last).text),true);
      assert.equal(document.activeElement,find(container,`#chat-source-${last}`));
    }
  });
  await check('Comparison shows Andreou’s unchanged ECLI, corrected body year and explanatory date caveat with original-source access', ({container,mount}) => {
    const items=[CASES[7],CASES[6]];mount('q=murder&compare='+items.map(item=>item.id).join(','));
    const headers=container.querySelectorAll('.cases-compare-case');assert.equal(headers.length,2);
    items.forEach((item,index)=>{assert.ok(headers[index].textContent.includes(item.code));assert.ok(headers[index].textContent.includes(item.year));const link=find(headers[index],'.cases-source-link');assert.equal(link.attrs.href,item.sourceUrl);assert.equal(link.attrs.target,'_blank');assert.match(link.attrs.rel,/noopener/);});
    assert.equal(find(headers[0],'.cases-date-note').textContent,CASES[7].dateNote);
  });
  await check('Comparison outcome references preserve every mapped block and navigate to the selected judgment', ({container,mount,routes}) => {
    const items=[CASES[4],CASES[6]];mount('q=murder&compare='+items.map(item=>item.id).join(','));
    const outcomeCells=container.querySelectorAll('.cases-compare-cell').slice(0,2);
    items.forEach((item,index)=>{const links=outcomeCells[index].querySelectorAll('[data-action="reference"]');assert.deepEqual(links.map(button=>Number(button.dataset.paragraph)),validRefs(item,'result'));assert.ok(links.every(button=>button.dataset.id===item.id));});
    const last=CASES[6].sectionRefs.result.at(-1);find(outcomeCells[1],`[data-paragraph="${last}"]`).click();
    const route=routes.at(-1);assert.ok(route.includes('case=case-07'));assert.ok(route.includes(`paragraph=${last}`));assert.ok(route.includes('view=decision'));
  });
  await check('Every copied and exported brief includes parties, legal basis, available references and original source URL', async ({container,mount,copies,downloads}) => {
    for (const item of CASES) {
      mount(`q=murder&case=${item.id}`);find(container,'[data-action="copy"]').click();await Promise.resolve();find(container,'[data-action="export"]').click();
      const text=downloads.at(-1)[1];assert.equal(copies.at(-1),text);assert.ok(text.includes(`## Parties\n${item.parties}`));assert.ok(text.includes(`## Legal basis\n${item.legalBasis}`));assert.ok(text.includes(item.sourceUrl));assert.ok(text.includes(item.result));
      for (const key of ['parties','legalBasis']) {const refs=validRefs(item,key);if(refs.length)assert.ok(text.includes(`${item[key]} [Source blocks ${refs.join(', ')}]`),`${item.id}: ${key}`);}
      if(item.dateNote)assert.ok(text.includes(item.dateNote));
    }
  });
  await check('Comparison copy and export preserve date caveats, parties and full source references for each included case', async ({container,mount,copies,downloads}) => {
    const items=[CASES[0],CASES[7]];mount('q=murder&compare='+items.map(item=>item.id).join(','));
    find(container,'[data-action="copy-comparison"]').click();await Promise.resolve();find(container,'[data-action="export-comparison"]').click();
    const text=downloads.at(-1)[1];assert.equal(copies.at(-1),text);assert.ok(text.startsWith('# Case comparison'));
    for(const item of items){assert.ok(text.includes(item.parties));assert.ok(text.includes(item.sourceUrl));assert.ok(text.includes(item.result));if(item.dateNote)assert.ok(text.includes(item.dateNote));}
    assert.ok(text.includes('not the judgment’s paragraph numbering'));
  });
  console.log(`\n${passed} case provenance callback checks passed. Browser presentation and native clipboard/download delivery remain unverified.`);
} finally {
  for(const name of globalNames){const descriptor=originalGlobals[name];if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
}
