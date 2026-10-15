import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {escape} from '../core.js';
import {render} from '../modules/cases.js';
import {CASES} from '../modules/case-data.js';
import {getCaseStrategy} from '../modules/case-strategy.js';

// The actual Case Law module and callbacks with a deterministic clock. This is
// an inert DOM check, not browser animation, layout or screen-reader verification.
let passed = 0;
const clone = value => JSON.parse(JSON.stringify(value));
function check(label, run) {
  const keys = ['document','window','location','history','matchMedia','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
  const originals = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const originalNow = Date.now;
  const body = new Element('body'), store = new Map(), timers = new Map(), frames = new Map(), routes = [];
  let now = 0, nextId = 0, root, cleanup, reduced = false;
  globalThis.document = {body, activeElement:body, createElement:tag => new Element(tag), addEventListener:(...args) => body.addEventListener(...args), removeEventListener:(...args) => body.removeEventListener(...args)};
  globalThis.window = {addEventListener() {}, removeEventListener() {}};
  globalThis.location = {hash:''};
  globalThis.history = {pushState(_state, _title, hash) {location.hash = hash;}};
  globalThis.matchMedia = query => ({matches:query.includes('prefers-reduced-motion') && reduced});
  globalThis.requestAnimationFrame = callback => {frames.set(++nextId, callback); return nextId;};
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.setTimeout = (callback, delay=0) => {timers.set(++nextId, {callback, at:now + delay}); return nextId;};
  globalThis.clearTimeout = id => timers.delete(id);
  Date.now = () => now;
  const storage = {get:(key, fallback) => store.has(key) ? clone(store.get(key)) : fallback, set(key, value) {store.set(key, clone(value)); return true;}};
  const flush = () => {const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now));};
  const advance = amount => {
    const end = now + amount; let callbacks = 0;
    while (true) {
      const next = [...timers].filter(([,timer]) => timer.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) break;
      assert.ok(++callbacks < 2000, 'Timer loop is bounded');
      now = next[1].at; timers.delete(next[0]); next[1].callback(); flush();
    }
    now = end; flush();
  };
  const get = selector => {const node = root.querySelector(selector); assert.ok(node, `Missing ${selector}`); return node;};
  const mount = (path='/cases') => {
    cleanup?.(); root?.remove(); root = new Element('main'); body.append(root); location.hash = '#' + path;
    cleanup = render(root, {escape, params:new URLSearchParams(path.split('?')[1] || ''), route:['cases'], storage, setHeader() {}, navigate:path => routes.push(path), toast() {}});
    flush(); return root;
  };
  const submit = value => {const input = get('[data-field="query"]'); input.value = value; input.emit('input'); get('[data-search-form]').emit('submit');};
  const filter = (field, value) => {const node = get(`[data-field="${field}"]`); node.value = value; node.emit('change'); flush();};
  const cards = () => root.querySelectorAll('[data-case-card]');
  const description = () => root.querySelector('.cases-strategy-typed')?.textContent ?? get('.cases-strategy-description').textContent;
  const startTyping = (query='murder') => {submit(query); advance(2500); assert.equal(cards().length,0); assert.ok(get('.cases-strategy-description'));};
  try {
    run({mount, get, submit, startTyping, advance, flush, filter, cards, description, storage, timers, routes, root:() => root, unmount:() => cleanup(), reduce:() => {reduced = true;}});
    passed++; console.log('PASS ' + label);
  } finally {
    cleanup?.(); Date.now = originalNow;
    for (const [key,value] of Object.entries(originals)) {if (value === undefined) delete globalThis[key]; else globalThis[key] = value;}
  }
}

console.log('Case strategy typing · staged results and cancellation\n');

check('Greek strategy types progressively and all ten cases appear only after the exact text is complete', ({mount,startTyping,get,advance,cards,description,timers}) => {
  mount(); startTyping();
  const full = getCaseStrategy('murder', CASES).description;
  const initial = description();
  assert.ok(initial.length < full.length); assert.ok(full.startsWith(initial));
  assert.equal(get('.cases-results').attrs['aria-busy'],'true');
  assert.equal(get('[data-action="strategy-toggle"]').disabled,true);
  assert.equal(get('#cases-strategy-details').hidden,true);
  assert.equal(get('.cases-results-end').hidden,true);
  advance(1200);
  const middle = description(); assert.ok(middle.length > initial.length); assert.ok(middle.length < full.length); assert.ok(full.startsWith(middle));
  assert.equal(cards().length,0); assert.equal(get('.cases-results').children.length,0,'No invisible or clickable case cards are inserted early');
  advance(2900); assert.equal(cards().length,0,'Cases stay withheld through the typing interval');
  advance(500); assert.equal(description(),full); assert.equal(cards().length,10);
  assert.notEqual(get('.cases-results').attrs['aria-busy'],'true'); assert.equal(get('[data-action="strategy-toggle"]').disabled,false);
  assert.equal(get('.cases-results-end').hidden,false); assert.equal(timers.size,0);
  assert.deepEqual(cards().map(card => card.dataset.caseCard), CASES.map(item => item.id));
});

check('Show cases completes the text once and clears every remaining reveal callback', ({mount,startTyping,get,advance,cards,description,timers,root}) => {
  mount(); startTyping(); advance(600);
  const button = get('[data-action="finish-strategy"]'); button.click();
  assert.equal(cards().length,10); assert.equal(description(),getCaseStrategy('murder',CASES).description); assert.equal(timers.size,0);
  const html = root().innerHTML; button.click(); advance(10000); assert.equal(root().innerHTML,html);
});

check('Reduced motion skips the strategy delay while retaining all text and results', ({mount,reduce,submit,advance,cards,description,timers,root}) => {
  reduce(); mount(); submit('murder'); advance(2500);
  assert.equal(cards().length,10); assert.equal(description(),getCaseStrategy('murder',CASES).description);
  assert.equal(timers.size,0); assert.equal(root().querySelector('.cases-strategy-caret'),null);
});

check('Saved result mounts and direct source links render immediately with no replay', ({mount,get,startTyping,advance,cards,description,timers,root}) => {
  mount(); startTyping(); advance(1000);
  mount('/cases?q=murder'); assert.equal(cards().length,10); assert.equal(timers.size,0); assert.equal(description(),getCaseStrategy('murder',CASES).description);
  mount('/cases?q=murder&case=case-01&view=decision&paragraph=1');
  assert.equal(cards().length,10); assert.equal(get('.cases-detail-panel').hidden,false); assert.equal(root().querySelector('.cases-strategy-typed'),null);
});

check('A fresh submitted search replays the strategy even when its query already has saved results', ({mount,startTyping,get,advance,cards,description}) => {
  mount('/cases?q=murder'); assert.equal(cards().length,10);
  startTyping('murder'); assert.ok(description().length < getCaseStrategy('murder',CASES).description.length);
  advance(4600); assert.equal(cards().length,10);
  startTyping('απουσία προμελέτης'); get('[data-action="finish-strategy"]').click();
  assert.equal(description(),getCaseStrategy('απουσία προμελέτης',CASES).description); assert.ok(cards().length>0);
});

check('Filtering during typing immediately settles to the filtered cases and cannot reinsert the old list', ({mount,startTyping,advance,filter,get,cards,description,timers}) => {
  mount(); startTyping(); advance(500); const stale = [...timers.values()].map(timer => timer.callback);
  filter('year','1991'); assert.deepEqual(cards().map(card => card.dataset.caseCard),['case-01']);
  assert.equal(description(),getCaseStrategy('murder',[CASES[0]]).description);
  for (const citation of get('.cases-strategy').querySelectorAll('[data-action="reference"]')) assert.equal(citation.dataset.id,'case-01');
  stale.forEach(callback => callback()); advance(10000);
  assert.deepEqual(cards().map(card => card.dataset.caseCard),['case-01']); assert.equal(timers.size,0);
});

check('Saved-only switching cancels typing without leaking unsaved cards or strategy', ({mount,startTyping,get,advance,cards,root,timers}) => {
  mount(); startTyping(); advance(900); const stale = [...timers.values()].map(timer => timer.callback);
  get('[data-action="tab"][data-tab="saved"]').click(); assert.equal(cards().length,0); assert.equal(root().querySelector('.cases-strategy'),null); assert.ok(get('.cases-empty'));
  stale.forEach(callback => callback()); advance(10000); assert.equal(cards().length,0); assert.equal(root().querySelector('.cases-strategy'),null);
  get('[data-action="tab"][data-tab="all"]').click(); assert.equal(cards().length,10); assert.equal(timers.size,0);
});

check('Changing sort during typing shows the selected order and does not replay', ({mount,startTyping,filter,cards,timers,advance}) => {
  mount(); startTyping(); filter('sort','oldest');
  const ordered = [...CASES].sort((a,b) => a.date.localeCompare(b.date)).map(item => item.id);
  assert.deepEqual(cards().map(card => card.dataset.caseCard),ordered); assert.equal(timers.size,0);
  advance(10000); assert.deepEqual(cards().map(card => card.dataset.caseCard),ordered);
});

check('Submitting another search during typing cancels the first reveal and preserves the newer result state', ({mount,startTyping,submit,advance,cards,root,timers}) => {
  mount(); startTyping(); advance(700); const stale = [...timers.values()].map(timer => timer.callback);
  submit('unfair dismissal'); assert.ok(root().querySelector('.cases-search-progress'));
  stale.forEach(callback => callback()); advance(2500);
  assert.equal(location.hash,'#/cases?q=unfair+dismissal'); assert.equal(root().querySelector('.cases-strategy'),null); assert.equal(cards().length,0);
  advance(10000); assert.equal(cards().length,0); assert.equal(timers.size,0);
});

check('Route cleanup cancels typing and stale callbacks cannot mutate a replacement page', ({mount,startTyping,get,unmount,root,timers,advance}) => {
  mount(); startTyping(); const stale = [...timers.values()].map(timer => timer.callback);
  unmount(); assert.equal(timers.size,0); root().innerHTML = '<h1>Projects</h1>'; location.hash = '#/projects';
  stale.forEach(callback => callback()); advance(10000); assert.equal(get('h1').textContent,'Projects'); assert.equal(root().querySelector('[data-case-card]'),null); assert.equal(location.hash,'#/projects');
});

check('Unrelated and empty-result searches skip the additional strategy animation', ({mount,submit,advance,cards,timers,root}) => {
  mount(); submit('case law'); advance(2500); assert.equal(cards().length,10); assert.equal(root().querySelector('.cases-strategy'),null); assert.equal(timers.size,0);
  submit('completely-unrelated-nonsense'); advance(2500); assert.equal(cards().length,0); assert.equal(root().querySelector('.cases-strategy'),null); assert.equal(timers.size,0);
});

check('Completed strategy references still open exact source blocks in the right panel', ({mount,startTyping,get,advance,flush}) => {
  mount(); startTyping(); advance(5000); get('[data-action="strategy-toggle"]').click();
  const source = get('.cases-strategy [data-action="reference"]'); source.click(); flush();
  const params = new URLSearchParams(location.hash.split('?')[1]);
  assert.equal(params.get('case'),source.dataset.id); assert.equal(params.get('paragraph'),source.dataset.paragraph); assert.equal(params.get('view'),'decision');
  assert.equal(get('.cases-detail-panel').hidden,false); assert.ok(get(`#cases-paragraph-${source.dataset.paragraph}`).classList.contains('is-focused'));
});

console.log(`\n${passed} case-strategy typing groups passed. Browser animation and geometry remain unverified.`);
