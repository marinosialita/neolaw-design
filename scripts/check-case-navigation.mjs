import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {render} from '../modules/cases.js';
import {CASES} from '../modules/case-data.js';
import {escape} from '../core.js';

// Actual module callbacks with controlled route remounts; not native Back/Forward or browser geometry.
const originals = Object.fromEntries(['document','window','location','history','matchMedia','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'].map(key=>[key,globalThis[key]]));
let passed=0;
const clone=value=>JSON.parse(JSON.stringify(value));
function check(label,run){
  const body=new Element('body'),store=new Map(),routes=[],frames=new Map(),timers=new Map();let id=0,root,cleanup;
  globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag)};
  globalThis.window={addEventListener(){},removeEventListener(){}};
  globalThis.location={hash:''};globalThis.history={pushState(_data,_title,hash){location.hash=hash;}};
  globalThis.matchMedia=()=>({matches:false});globalThis.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  globalThis.setTimeout=callback=>{timers.set(++id,callback);return id;};globalThis.clearTimeout=id=>timers.delete(id);
  const storage={get:(key,fallback)=>store.has(key)?clone(store.get(key)):fallback,set:(key,value)=>{store.set(key,clone(value));return true;}};
  const finishSearch=()=>{for(const[id,callback]of[...timers]){if(timers.has(id)){timers.delete(id);callback();}}root.querySelector('[data-action="finish-strategy"]')?.click();};
  const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
  const get=selector=>{const node=root.querySelector(selector);assert.ok(node,`Missing ${selector}`);return node;};
  const mount=path=>{cleanup?.();root?.remove();root=new Element('main');body.append(root);location.hash='#'+path;cleanup=render(root,{escape,params:new URLSearchParams(path.split('?')[1]||''),route:['cases'],storage,setHeader(){},navigate:path=>routes.push(path),toast(){}});flush();};
  const select=(caseId,checked=true)=>{const control=get(`[data-action="select"][data-id="${caseId}"]`);control.checked=checked;control.emit('change');};
  const filter=(field,value)=>{const control=get(`[data-field="${field}"]`);control.value=value;control.emit('change');};
  const open=caseId=>{get(`[data-action="open"][data-id="${caseId}"]`).click();flush();};
  try{run({mount,get,select,filter,open,flush,finishSearch,storage,routes,root:()=>root});passed++;console.log('PASS '+label);}finally{cleanup?.();}
}

console.log('Case navigation callbacks · real ten-case collection\n');
try{
  check('Comparison Results restores selected cases, filters and result scroll',({mount,get,select,filter,storage,routes})=>{
    mount('/cases?q=murder');filter('sort','oldest');select(CASES[0].id);select(CASES[1].id);get('.cases-results-scroll').scrollTop=244;
    get('[data-action="compare"]').click();mount(routes.at(-1));assert.ok(get('.cases-compare-workspace'));get('[data-action="back-results"]').click();mount(routes.at(-1));
    assert.equal(get('[data-field="sort"]').value,'oldest');assert.equal(get('.cases-results-scroll').scrollTop,244);assert.equal(get('.cases-selection-tray').hidden,false);assert.equal(get('[data-selected-count]').textContent,'2');
    for(const item of CASES.slice(0,2))assert.equal(get(`[data-action="select"][data-id="${item.id}"]`).checked,true);
    select(CASES[1].id,false);select(CASES[2].id);assert.deepEqual(storage.get('caseWorkspace').selected,[CASES[0].id,CASES[2].id]);
    get('[data-action="compare"]').click();assert.ok(routes.at(-1).includes(`compare=${CASES[0].id},${CASES[2].id}`));
  });
  check('Checkbox selection survives same-query remount without requiring Compare first',({mount,get,select,storage})=>{
    mount('/cases?q=murder');select(CASES[2].id);select(CASES[4].id);assert.deepEqual(storage.get('caseWorkspace').selected,[CASES[2].id,CASES[4].id]);mount('/cases?q=murder');
    assert.equal(get('[data-selected-count]').textContent,'2');assert.equal(get(`[data-action="select"][data-id="${CASES[4].id}"]`).checked,true);
    get('[data-action="clear-selection"]').click();mount('/cases?q=murder');assert.equal(get('.cases-selection-tray').hidden,true);assert.deepEqual(storage.get('caseWorkspace').selected,[]);
  });
  check('Comparison URL selection wins over stale remembered selections and survives its Results return',({mount,get,select,routes})=>{
    mount('/cases?q=murder');select(CASES[0].id);select(CASES[1].id);mount(`/cases?q=murder&compare=${CASES[4].id},${CASES[7].id}`);
    get('[data-action="back-results"]').click();mount(routes.at(-1));assert.equal(get('[data-selected-count]').textContent,'2');
    assert.equal(get(`[data-action="select"][data-id="${CASES[0].id}"]`).checked,false);for(const item of [CASES[4],CASES[7]])assert.equal(get(`[data-action="select"][data-id="${item.id}"]`).checked,true);
  });
  check('New query clears selections and obsolete case IDs never become checked',({mount,get,select,finishSearch,storage})=>{
    storage.set('caseWorkspace',{collectionKey:'cylaw-real-v1',q:'murder',selected:['demo-01',CASES[2].id,'missing']});mount('/cases?q=murder');assert.equal(get('[data-selected-count]').textContent,'1');
    const input=get('[data-field="query"]');input.value='φόνος εκ προμελέτης';input.emit('input');get('[data-search-form]').emit('submit');finishSearch();assert.equal(get('.cases-selection-tray').hidden,true);assert.deepEqual(storage.get('caseWorkspace').selected,[]);
    select(CASES[3].id);mount('/cases?q=Different');assert.equal(get('.cases-selection-tray').hidden,true);
  });
  check('Successive source clicks update the deep-link block and reload highlights the latest passage',({mount,get,open,flush})=>{
    const item=CASES[0],first=item.sectionRefs.principle[0],next=item.paragraphs.find(p=>p.n!==first).n;
    mount('/cases?q=murder');open(item.id);get(`.cases-detail-panel [data-action="reference"][data-paragraph="${first}"]`).click();flush();assert.equal(new URLSearchParams(location.hash.split('?')[1]).get('paragraph'),String(first));
    get(`#cases-paragraph-${next} [data-action="reference"]`).click();assert.equal(new URLSearchParams(location.hash.split('?')[1]).get('paragraph'),String(next));assert.ok(get(`#cases-paragraph-${next}`).classList.contains('is-focused'));
    const path=location.hash.slice(1);mount(path);assert.ok(get(`#cases-paragraph-${next}`).classList.contains('is-focused'));assert.equal(document.activeElement,get(`#cases-paragraph-${next}`));assert.equal(new URLSearchParams(location.hash.split('?')[1]).get('paragraph'),String(next));
  });
  check('Changing reader tabs, cases or closing clears stale passage anchors',({mount,get,open,flush})=>{
    const first=CASES[0],block=first.sectionRefs.principle[0];mount(`/cases?q=murder&case=${first.id}&view=decision&paragraph=${block}`);
    get('[data-action="reader-tab"][data-view="brief"]').click();flush();assert.equal(new URLSearchParams(location.hash.split('?')[1]).has('paragraph'),false);
    get('[data-action="reader-tab"][data-view="decision"]').click();flush();assert.equal(new URLSearchParams(location.hash.split('?')[1]).has('paragraph'),false);
    get(`#cases-paragraph-${block} [data-action="reference"]`).click();assert.equal(new URLSearchParams(location.hash.split('?')[1]).get('paragraph'),String(block));open(CASES[1].id);assert.equal(new URLSearchParams(location.hash.split('?')[1]).get('case'),CASES[1].id);assert.equal(new URLSearchParams(location.hash.split('?')[1]).has('paragraph'),false);
    get('[data-action="close-panel"]').click();assert.equal(location.hash,'#/cases?q=murder');
  });
  console.log(`\n${passed} case-navigation groups pass. Browser history-event delivery, physical focus and rendering remain unverified.`);
}finally{for(const[key,value]of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
