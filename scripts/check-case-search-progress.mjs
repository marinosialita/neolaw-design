import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {escape} from '../core.js';
import {render} from '../modules/cases.js';
import {CASES} from '../modules/case-data.js';

// Actual search callbacks with a controlled clock; not a browser or a live search service.
let passed = 0;
const clone = value => JSON.parse(JSON.stringify(value));
function check(label, run) {
  const keys = ['document','window','location','history','matchMedia','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
  const prior = Object.fromEntries(keys.map(key => [key,globalThis[key]]));
  const body = new Element('body'), store = new Map(), timers = new Map(), frames = new Map(), windowEvents = new Map();
  let now = 0, nextId = 0, root, cleanup, narrow = false;
  const originalNow = Date.now; Date.now = () => now;
  globalThis.document = {body, activeElement:body, createElement:tag => new Element(tag), addEventListener:(...args) => body.addEventListener(...args), removeEventListener:(...args) => body.removeEventListener(...args)};
  globalThis.window = {addEventListener(name,callback) {windowEvents.set(name,callback);},removeEventListener(name) {windowEvents.delete(name);}};
  globalThis.location = {hash:''}; globalThis.history = {pushState(_state,_title,hash) {location.hash = hash;}};
  globalThis.matchMedia = query => ({matches:query.includes('max-width') && narrow});
  globalThis.requestAnimationFrame = callback => {frames.set(++nextId,callback); return nextId;};
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.setTimeout = (callback,delay) => {timers.set(++nextId,{callback,at:now + delay}); return nextId;};
  globalThis.clearTimeout = id => timers.delete(id);
  const storage = {get:(key,fallback) => store.has(key) ? clone(store.get(key)) : fallback, set(key,value) {store.set(key,clone(value)); return true;}};
  const advance = amount => {
    const end = now + amount;
    while (true) {const next = [...timers].filter(([,timer]) => timer.at <= end).sort((a,b) => a[1].at - b[1].at)[0]; if (!next) break; now = next[1].at; timers.delete(next[0]); next[1].callback();}
    now = end;
  };
  const get = selector => {const node = root.querySelector(selector); assert.ok(node,`Missing ${selector}`); return node;};
  const mount = (path='/cases') => {cleanup?.(); root?.remove(); root = new Element('main'); body.append(root); location.hash = '#' + path; cleanup = render(root,{escape,params:new URLSearchParams(path.split('?')[1] || ''),route:['cases'],storage,setHeader() {},navigate() {},toast() {}}); for (const callback of frames.values()) callback(); frames.clear(); return root;};
  const query = value => {const input = get('[data-field="query"]'); input.value = value; input.emit('input'); return input;};
  const submit = () => get('[data-search-form]').emit('submit');
  const cards = () => root.querySelectorAll('[data-case-card]');
  const resize = mobile => {narrow = mobile; windowEvents.get('resize')?.();};
  try {run({mount,get,query,submit,advance,cards,storage,timers,resize,root:() => root,unmount:() => cleanup()}); passed++; console.log('PASS ' + label);}
  finally {cleanup?.(); Date.now = originalNow; for (const [key,value] of Object.entries(prior)) {if (value === undefined) delete globalThis[key]; else globalThis[key] = value;}}
}

check('A submitted search shows its accessible 2.5-second intro before the strategy and real results', ({mount,get,query,submit,advance,cards,storage,root}) => {
  mount(); query('murder'); submit();
  assert.equal(cards().length,0); assert.equal(location.hash,'#/cases'); assert.equal(storage.get('caseWorkspace'),undefined);
  assert.equal(get('.cases-search-landing').hidden,true); assert.equal(get('.cases-search-landing').inert,true);
  assert.equal(get('.cases-search-progress__status').attrs.role,'status'); assert.equal(get('.cases-search-progress__status').attrs['aria-live'],'polite');
  assert.equal(get('.cases-search-progress__status').textContent,'Searching the case collection');
  assert.match(get('.cases-search-progress__note').textContent,/10 judgments.*CyLaw/);
  assert.strictEqual(document.activeElement,get('[data-action="cancel-search"]'));
  advance(949); assert.equal(cards().length,0); assert.equal(get('.cases-search-progress__status').textContent,'Searching the case collection');
  advance(1); assert.match(get('.cases-search-progress__status').textContent,/Matching/);
  advance(850); assert.match(get('.cases-search-progress__status').textContent,/Preparing/);
  advance(699); assert.equal(cards().length,0); advance(1);
  assert.equal(cards().length,0); assert.equal(location.hash,'#/cases?q=murder'); assert.equal(root().querySelector('.cases-search-progress'),null);
  assert.ok(get('.cases-strategy-description')); assert.strictEqual(document.activeElement,get('[data-field="query"]'));
  get('[data-action="finish-strategy"]').click(); assert.equal(cards().length,10); assert.strictEqual(document.activeElement,get('.cases-card-title'));
});

check('Double submissions schedule one search and commit its original query only', ({mount,get,query,submit,advance,timers,cards}) => {
  mount(); const input = query('murder'); submit(); submit();
  input.value = 'unrelated change'; input.emit('input'); input.emit('keydown',{key:'Enter'});
  assert.equal(timers.size,3); assert.equal(get('.cases-search-progress__query').textContent,'murder');
  advance(2500); assert.equal(cards().length,0); get('[data-action="finish-strategy"]').click(); assert.equal(cards().length,10); assert.equal(get('[data-field="query"]').value,'murder');
});

check('Cancel preserves the home query and filters and a fresh retry gets its full delay', ({mount,get,query,submit,advance,cards,storage,root}) => {
  mount(); const court = get('[data-field="court"]'); court.value = CASES[0].court; court.emit('change'); query('murder'); submit(); advance(950);
  get('[data-action="cancel-search"]').click();
  assert.equal(root().querySelector('.cases-search-progress'),null); assert.equal(get('.cases-search-landing').hidden,false); assert.equal(get('.cases-search-landing').inert,false);
  assert.strictEqual(get('[data-field="court"]'),court); assert.equal(court.value,CASES[0].court); assert.equal(get('[data-field="query"]').value,'murder');
  assert.strictEqual(document.activeElement,get('[data-field="query"]')); advance(3000); assert.equal(cards().length,0); assert.equal(storage.get('caseWorkspace'),undefined);
  submit(); advance(2499); assert.equal(cards().length,0); advance(1); assert.equal(cards().length,0); get('[data-action="finish-strategy"]').click(); assert.ok(cards().length > 0); assert.equal(get('[data-field="court"]').value,CASES[0].court);
});

check('Escape from a later search restores the exact result list, selection and scroll', ({mount,get,query,submit,advance,cards,root}) => {
  mount('/cases?q=murder'); const list = get('.cases-results-scroll'); list.scrollTop = 217;
  const box = get(`[data-action="select"][data-id="${CASES[0].id}"]`); box.checked = true; box.emit('change');
  query('φόνος εκ προμελέτης'); submit(); advance(1800); assert.equal(get('.cases-search-layout').hidden,true);
  assert.equal(get('[data-action="cancel-search"]').emit('keydown',{key:'Escape'}).defaultPrevented,true);
  assert.equal(root().querySelector('.cases-search-progress'),null); assert.strictEqual(get('.cases-results-scroll'),list); assert.equal(list.scrollTop,217);
  assert.equal(get('.cases-search-layout').hidden,false); assert.equal(box.checked,true); advance(3000); assert.equal(cards().length,10); assert.equal(location.hash,'#/cases?q=murder');
});

check('Route cleanup cancels every callback and an already queued stale callback cannot replace the next page', ({mount,get,query,submit,advance,timers,unmount,root}) => {
  mount(); query('murder'); submit(); const stale = [...timers.values()].at(-1).callback;
  unmount(); assert.equal(timers.size,0); root().innerHTML = '<h1>Projects</h1>'; location.hash = '#/projects';
  advance(3000); stale(); assert.equal(get('h1').textContent,'Projects'); assert.equal(location.hash,'#/projects'); assert.equal(root().querySelector('.cases-search-progress'),null);
});

check('Resizing during progress cannot focus a hidden reader, and Cancel restores its correct mobile focus', ({mount,get,query,submit,resize}) => {
  mount(`/cases?q=murder&case=${CASES[0].id}`); query('φόνος εκ προμελέτης'); submit();
  const cancel = get('[data-action="cancel-search"]'); resize(true); assert.strictEqual(document.activeElement,cancel);
  cancel.click(); assert.equal(get('.cases-list-column').inert,true); assert.equal(get('.cases-detail-panel').attrs['aria-modal'],'true');
  assert.strictEqual(document.activeElement,get('.cases-panel-heading h2'));
});

check('A route that changes before cleanup cannot receive a late search commit', ({mount,query,submit,advance,cards,root,storage}) => {
  mount(); query('murder'); submit(); location.hash = '#/chat'; advance(2500);
  assert.equal(location.hash,'#/chat'); assert.equal(cards().length,0); assert.equal(storage.get('caseWorkspace'),undefined); assert.equal(root().querySelector('.cases-search-progress'),null);
});

check('Saved results and direct source links are immediate; empty and invalid searches never enter progress', ({mount,get,submit,query,timers,cards,root}) => {
  mount('/cases?q=murder'); assert.equal(cards().length,10); assert.equal(timers.size,0); assert.equal(root().querySelector('.cases-search-progress'),null);
  mount(`/cases?q=murder&case=${CASES[0].id}`); assert.equal(get('.cases-detail-panel').hidden,false); assert.equal(timers.size,0);
  mount(); submit(); assert.equal(timers.size,0); query('murder');
  for (const [field,value] of [['date-from','2022-01-01'],['date-to','2010-01-01']]) {const control = get(`[data-field="${field}"]`); control.value = value; control.emit('change');}
  submit(); assert.equal(timers.size,0); assert.equal(root().querySelector('.cases-search-progress'),null);
});

check('Preview query is escaped, and cancelling the empty-results suggestion keeps the displayed draft consistent', ({mount,get,query,submit,advance,root}) => {
  mount(); query('<img src=x onerror=alert(1)>'); submit();
  assert.equal(get('.cases-search-progress__query').textContent,'<img src=x onerror=alert(1)>'); assert.equal(root().querySelector('img'),null);
  advance(2500); get('[data-action="example"]').click(); assert.equal(get('.cases-search-progress__query').textContent,'murder'); get('[data-action="cancel-search"]').click();
  assert.equal(get('[data-field="query"]').value,'murder'); submit(); advance(2500); get('[data-action="finish-strategy"]').click(); assert.equal(root().querySelectorAll('[data-case-card]').length,10);
});

console.log(`\n${passed} Case Law progress callback groups passed. Visual appearance, focus geometry and screen-reader announcements remain unverified.`);
