import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {escape} from '../core.js';
import {render} from '../modules/cases.js';
import {CASES} from '../modules/case-data.js';

// Actual module callbacks; no browser, native layout, native date picker or live search.
const clone = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function check(label, run) {
  const keys = ['document','window','location','history','matchMedia','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
  const prior = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const body = new Element('body'), store = new Map(), frames = new Map(), timers = new Map(), routes = [], toasts = [];
  let nextId = 0, cleanup, root;
  globalThis.document = {body, activeElement:body, createElement:tag => new Element(tag), addEventListener:(...args) => body.addEventListener(...args), removeEventListener:(...args) => body.removeEventListener(...args)};
  globalThis.window = {addEventListener() {}, removeEventListener() {}};
  globalThis.location = {hash:''}; globalThis.history = {pushState(_data, _title, hash) {location.hash = hash;}};
  globalThis.matchMedia = () => ({matches:false});
  globalThis.requestAnimationFrame = callback => {frames.set(++nextId, callback); return nextId;};
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.setTimeout = callback => {timers.set(++nextId, callback); return nextId;};
  globalThis.clearTimeout = id => timers.delete(id);
  const storage = {get:(key, fallback) => store.has(key) ? clone(store.get(key)) : fallback, set(key, value) {store.set(key, clone(value)); return true;}};
  const get = selector => {const node = root.querySelector(selector); assert.ok(node, `Missing ${selector}`); return node;};
  const mount = (path='/cases') => {
    cleanup?.(); root?.remove(); root = new Element('main'); body.append(root); location.hash = '#' + path;
    cleanup = render(root, {escape, params:new URLSearchParams(path.split('?')[1] || ''), route:['cases'], storage, setHeader() {}, navigate:route => routes.push(route), toast:message => toasts.push(message), download() {}, startChat() {}});
    root.querySelectorAll('input,textarea').forEach(input => {input.setCustomValidity = value => {input.validationMessage = value;}; input.reportValidity = () => !input.validationMessage;});
    const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback());
    return root;
  };
  const change = (field, value) => {const control = get(`[data-field="${field}"]`); control.value = value; control.emit('change'); return control;};
  const query = value => {const input = get('[data-field="query"]'); input.value = value; input.emit('input'); return input;};
  const finishSearch = () => {for (const [id, callback] of [...timers]) {if (timers.has(id)) {timers.delete(id); callback();}}root.querySelector('[data-action="finish-strategy"]')?.click();};
  const submit = () => {get('[data-search-form]').emit('submit'); finishSearch();};
  const ids = () => root.querySelectorAll('[data-case-card]').map(card => card.dataset.caseCard);
  try {run({mount, get, change, query, submit, finishSearch, ids, storage, routes, toasts, root:() => root}); passed++; console.log('PASS ' + label);}
  finally {cleanup?.(); for (const [key, value] of Object.entries(prior)) {if (value === undefined) delete globalThis[key]; else globalThis[key] = value;}}
}

check('A clean Case Law route restores the original search home rather than remembered results', ({mount, get, ids, storage}) => {
  storage.set('caseWorkspace', {collectionKey:'cylaw-real-v1', q:'murder', court:CASES[0].court, dateFrom:'2005-01-01', dateTo:'2012-12-31', sort:'latest', selected:[CASES[0].id], scroll:182});
  mount(); assert.equal(get('.nl-cases__title').textContent, 'Find the precedent you need.');
  assert.equal(get('.nl-cases__sub').textContent, 'Search court decisions by legal issue, keyword or case reference.');
  assert.equal(get('[data-field="query"]').tagName, 'textarea'); assert.equal(get('[data-field="query"]').value, ''); assert.deepEqual(ids(), []);
  for (const field of ['court','date-from','date-to']) assert.equal(get(`[data-field="${field}"]`).value, '');
  assert.equal(get('[data-field="sort"]').value, 'relevance');
  assert.match(get('.nl-preview-note').textContent, /10 judgments/);
  assert.equal(get('.nl-connected-preview').disabled, true);
  assert.deepEqual(get('.nl-depth-options').querySelectorAll('button').map(button => button.textContent), ['Quick','Balanced','Deep','Deepest']);
  assert.match(get('.nl-connected-preview').textContent, /not connected/);
});

check('Court and date popovers close siblings, dismiss on Escape with focus restored, and close on outside click', ({mount, get, root}) => {
  mount(); const [court, dates] = root().querySelectorAll('.nl-filter');
  court.setAttribute('open',''); court.emit('toggle'); dates.setAttribute('open',''); dates.emit('toggle');
  assert.equal(court.matches('[open]'),false); assert.equal(dates.matches('[open]'),true);
  const date = get('[data-field="date-from"]'); date.focus(); assert.equal(date.emit('keydown',{key:'Escape'}).defaultPrevented,true);
  assert.equal(dates.matches('[open]'),false); assert.strictEqual(document.activeElement,dates.querySelector('summary'));
  court.setAttribute('open',''); court.emit('toggle'); get('[data-field="query"]').click(); assert.equal(court.matches('[open]'),false);
});

check('Collection examples fill the textarea without submitting and find relevant judgments when searched', ({mount, get, submit, ids, root}) => {
  mount();
  const expected = ['φόνος εκ προμελέτης','περιστατική μαρτυρία','ECLI:CY:AD:2021:B67'];
  const expectedCases = [CASES.map(item => item.id), ['case-02','case-03','case-05','case-07','case-08','case-09','case-10'], ['case-03']];
  assert.deepEqual(root().querySelectorAll('.nl-try__text strong').map(node => node.textContent), ['Premeditation','Evidence','Case reference']);
  for (const [index, query] of expected.entries()) {
    mount(); root().querySelectorAll('[data-action="home-example"]')[index].click();
    assert.equal(get('[data-field="query"]').value, query);
    assert.strictEqual(document.activeElement, get('[data-field="query"]')); assert.equal(location.hash, '#/cases'); assert.deepEqual(ids(), []);
    submit(); assert.deepEqual(ids(), expectedCases[index]);
  }
});

check('Textarea Enter searches while Shift+Enter and IME composition retain the home draft', ({mount, get, query, finishSearch, ids}) => {
  mount(); const input = query('murder');
  for (const extra of [{shiftKey:true},{isComposing:true},{keyCode:229}]) {
    assert.notEqual(input.emit('keydown', {key:'Enter', ...extra}).defaultPrevented, true); assert.equal(location.hash, '#/cases'); assert.deepEqual(ids(), []);
  }
  assert.equal(input.emit('keydown', {key:'Enter'}).defaultPrevented, true); finishSearch(); assert.equal(ids().length, 10);
  assert.equal(get('[data-field="query"]').value, 'murder'); assert.equal(location.hash, '#/cases?q=murder');
});

check('Initial search honors court, inclusive date range and sort, exposing its active dates in results', ({mount, get, change, query, submit, ids, storage}) => {
  mount(); const court = CASES[0].court;
  change('court', court); change('date-from', '2005-01-01'); change('date-to', '2012-12-31'); change('sort', 'oldest'); query('murder'); submit();
  const expected = CASES.filter(item => item.court === court && item.date >= '2005-01-01' && item.date <= '2012-12-31').sort((a,b) => a.date.localeCompare(b.date)).map(item => item.id);
  assert.ok(expected.length > 0 && expected.length < 10); assert.deepEqual(ids(), expected);
  assert.equal(get('[data-field="court"]').value, court); assert.equal(get('[data-field="sort"]').value, 'oldest');
  assert.equal(get('[data-field="date-from"]').value, '2005-01-01'); assert.equal(get('[data-field="date-to"]').value, '2012-12-31');
  assert.equal(get('.cases-extra-filters').hidden, false); assert.equal(get('[data-action="filters"]').attrs['aria-expanded'], 'true');
  assert.equal(get('[data-action="reset-filters"]').hidden, false); assert.equal(get('.cases-filter-dot').hidden, false);
  assert.equal(storage.get('caseWorkspace').dateFrom, '2005-01-01'); assert.equal(storage.get('caseWorkspace').dateTo, '2012-12-31');
});

check('Date filters survive same-query remount and Reset clears them without losing result scroll', ({mount, get, change, query, submit, ids, storage}) => {
  mount(); change('date-from','2000-01-01'); change('date-to','2010-12-31'); query('φόνος εκ προμελέτης'); submit();
  const expected = ids(); get('.cases-results-scroll').scrollTop = 151;
  mount('/cases?q=' + encodeURIComponent('φόνος εκ προμελέτης'));
  assert.deepEqual(ids(), expected); assert.equal(get('[data-field="date-from"]').value,'2000-01-01'); assert.equal(get('[data-field="date-to"]').value,'2010-12-31');
  assert.equal(get('.cases-results-scroll').scrollTop,151); get('[data-action="reset-filters"]').click();
  assert.equal(ids().length,10); for (const field of ['date-from','date-to']) assert.equal(get(`[data-field="${field}"]`).value,'');
  assert.equal(get('.cases-results-scroll').scrollTop,151); assert.equal(storage.get('caseWorkspace').dateFrom,''); assert.equal(storage.get('caseWorkspace').dateTo,'');
  assert.equal(get('[data-action="reset-filters"]').hidden,true); assert.equal(get('.cases-filter-dot').hidden,true);
});

check('An invalid date range cannot submit, and fixing it or clearing dates permits search', ({mount, get, change, query, submit, ids, storage, toasts}) => {
  mount(); change('date-from','2022-01-01'); const end=change('date-to','2005-01-01'); query('murder'); submit();
  assert.equal(location.hash,'#/cases'); assert.deepEqual(ids(),[]); assert.equal(storage.get('caseWorkspace'),undefined);
  assert.match(end.validationMessage,/end date/); assert.strictEqual(document.activeElement,end); assert.ok(Object.hasOwn(end.closest('details').attrs,'open')); assert.match(toasts.at(-1),/end date/);
  end.value='2022-12-31'; end.emit('input'); assert.equal(end.validationMessage,''); submit(); assert.ok(ids().length>0);
  mount(); change('date-from','2022-01-01'); change('date-to','2005-01-01'); query('murder'); submit();
  get('[data-action="clear-dates"]').click(); assert.equal(get('[data-date-label]').textContent,'Any date'); assert.equal(get('[data-field="date-to"]').validationMessage,''); submit(); assert.equal(ids().length,10);
});

check('A later results query retains the existing reset behavior for court and date filters', ({mount, get, change, query, submit, ids}) => {
  mount(); change('court',CASES[0].court); change('date-from','2000-01-01'); change('date-to','2012-12-31'); change('sort','latest'); query('murder'); submit();
  assert.ok(ids().length<10); query('φόνος εκ προμελέτης'); submit();
  assert.equal(ids().length,10); for (const field of ['court','date-from','date-to']) assert.equal(get(`[data-field="${field}"]`).value,'');
  assert.equal(get('[data-field="sort"]').value,'latest');
});

check('New search returns to the blank home and unsupported queries never substitute murder', ({mount, get, query, submit, finishSearch, ids, routes}) => {
  mount('/cases?q=murder'); get('[data-action="new-search"]').click(); assert.equal(routes.at(-1),'/cases'); mount(routes.at(-1));
  assert.ok(get('.nl-search')); assert.equal(get('[data-field="query"]').value,''); assert.deepEqual(ids(),[]);
  query('Unfair dismissal after redundancy'); submit();
  assert.equal(get('[data-field="query"]').value,'Unfair dismissal after redundancy'); assert.deepEqual(ids(),[]); assert.ok(get('.cases-empty'));
  get('[data-action="example"]').click(); finishSearch(); assert.equal(get('[data-field="query"]').value,'murder'); assert.equal(ids().length,10);
});

console.log(`\n${passed} Case Law home callback groups passed. Native date controls, textarea behavior and visual layout remain unverified.`);
