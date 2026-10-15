import assert from 'node:assert/strict';
import { Element } from './dom-double.mjs';
import { escape } from '../core.js';
import { createCaseHighlighter } from '../modules/case-highlight.js';
import { render } from '../modules/cases.js';
import { CASES } from '../modules/case-data.js';

// Plain-text safety and actual result-card callbacks, without browser/layout claims.
let passed = 0;
const mark = text => `<mark class="cases-query-match">${text}</mark>`;
const markedWords = html => [...html.matchAll(/<mark class="cases-query-match">(.*?)<\/mark>/gu)].map(match => match[1]);
const check = (label, test) => { test(); passed++; console.log('PASS ' + label); };

check('Premeditation matches accented, uppercase, genitive and decomposed Greek without changing source text', () => {
  const text = 'Η ΠΡΟΜΕΛΕΤΗ, η προμελέτη και η απόδειξη προμελέτης. ' + 'προμελέτη'.normalize('NFD');
  for (const query of ['προμελέτη', 'ΠΡΟΜΕΛΕΤΗ', 'προμελετης', 'προμελέτης']) {
    const html = createCaseHighlighter(query)(text);
    assert.equal(markedWords(html).length, 4, query);
    assert.equal(html.replace(/<mark class="cases-query-match">|<\/mark>/g, ''), escape(text));
  }
  assert.equal(createCaseHighlighter('προμελέτη')('προμελετημένος φόνος'), mark('προμελετημένος') + ' φόνος');
});

check('Only meaningful complete words match; no partial-word or stop-word flooding', () => {
  assert.deepEqual(markedWords(createCaseHighlighter('Βρες μου νομολογία για προμελέτη')('Βρες νομολογία για την προμελέτη.')), ['προμελέτη']);
  assert.equal(createCaseHighlighter('προμελέτη')('απρομελέτητη υπερπρομελέτη προμελετητής'), 'απρομελέτητη υπερπρομελέτη προμελετητής');
  assert.equal(createCaseHighlighter('law')('lawful unlawful law'), 'lawful unlawful law');
  assert.equal(createCaseHighlighter('intent')('Intent intentional'), mark('Intent') + ' intentional');
  assert.equal(createCaseHighlighter('')('<none>'), '&lt;none&gt;');
});

check('Text and query punctuation cannot inject HTML or regex markup', () => {
  const text = '<img src=x onerror="alert(1)"> προμελέτη & "προμελέτης"';
  const html = createCaseHighlighter('προμελέτη (.*)')(text);
  assert.equal(html.replace(/<mark class="cases-query-match">|<\/mark>/g, ''), escape(text));
  assert.ok(!html.includes('<img'));
  assert.ok(!createCaseHighlighter('<script>alert(1)</script>')('safe text').includes('<script>'));
});

const keys = ['document','window','location','history','matchMedia','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
const originals = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
const body = new Element('body'), store = new Map(), frames = new Map(), timers = new Map();
let next = 0, root, cleanup;
globalThis.document = { body, activeElement:body, createElement:tag => new Element(tag) };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.location = { hash:'' };
globalThis.history = { pushState(_a, _b, hash) { location.hash = hash; } };
globalThis.matchMedia = () => ({ matches:false });
globalThis.requestAnimationFrame = callback => { frames.set(++next, callback); return next; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
globalThis.setTimeout = callback => { timers.set(++next, callback); return next; };
globalThis.clearTimeout = id => timers.delete(id);
const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
const get = selector => { const node = root.querySelector(selector); assert.ok(node, 'Missing ' + selector); return node; };
const mount = query => {
  cleanup?.(); root?.remove(); root = new Element('main'); body.append(root);
  const params = new URLSearchParams({ q:query }); location.hash = '#/cases?' + params;
  cleanup = render(root, { escape, params, route:['cases'], storage:{ get:(key,fallback) => store.get(key) ?? fallback, set:(key,value) => store.set(key,value) }, setHeader() {}, toast() {}, navigate() {} });
  flush();
};
const finishSearch = () => {
  for (const [id, callback] of [...timers]) if (timers.has(id)) { timers.delete(id); callback(); }
  root.querySelector('[data-action="finish-strategy"]')?.click(); flush();
};

try {
  check('All ten premeditation result cards highlight visible summary, subject, tags and principle text', () => {
    mount('προμελέτη');
    const cards = root.querySelectorAll('[data-case-card]');
    assert.equal(cards.length, 10);
    assert.deepEqual(cards.map(card => card.dataset.caseCard), CASES.map(item => item.id));
    for (const card of cards) assert.ok(card.querySelectorAll('.cases-query-match').length, card.dataset.caseCard);
    for (const selector of ['.cases-card-subject', '.cases-card-summary', '.cases-card-labels', '.cases-principle-content']) assert.ok(get(selector).querySelector('mark'), selector);
    assert.equal(get('[data-action="topic"]').dataset.topic, CASES[0].tags[0], 'Markup never reaches data attributes');
    assert.equal(root.querySelector('.cases-strategy mark'), null, 'Strategy and controls are untouched');
  });
  check('Opening, filtering and sorting retain matching text and the correct case interactions', () => {
    get('[data-action="open"][data-id="case-01"]').click(); flush();
    assert.equal(get('.cases-detail-panel').hidden, false);
    assert.ok(get('[data-case-card="case-01"]').querySelector('mark'));
    assert.equal(get('.cases-source-link').attrs.href, CASES[0].sourceUrl);
    get('[data-action="close-panel"]').click();
    const year = get('[data-field="year"]'); year.value = '1991'; year.emit('change');
    assert.equal(root.querySelectorAll('[data-case-card]').length, 1);
    assert.ok(get('.cases-card-summary').querySelector('mark'));
    year.value = ''; year.emit('change');
    const sort = get('[data-field="sort"]'); sort.value = 'oldest'; sort.emit('change');
    assert.equal(root.querySelectorAll('[data-case-card]').length, 10);
    assert.ok(root.querySelectorAll('.cases-card mark').length);
  });
  check('Highlights follow the submitted query rather than input drafts or stale searches', () => {
    const input = get('[data-field="query"]'); input.value = 'ομολογία'; input.emit('input');
    assert.ok(get('.cases-card-summary').querySelector('mark').textContent.startsWith('προμελέτ'));
    get('[data-search-form]').emit('submit'); finishSearch();
    assert.ok(root.querySelectorAll('.cases-card mark').length);
    assert.ok(root.querySelectorAll('.cases-card mark').every(node => node.textContent.toLocaleLowerCase('el') === 'ομολογία'));
    mount('MURDER');
    assert.equal(root.querySelectorAll('[data-case-card]').length, 10);
    assert.equal(root.querySelectorAll('.cases-card mark').length, 0, 'No stale Greek query emphasis in English query');
    mount('ΠΡΟΜΕΛΕΤΗΣ');
    assert.equal(root.querySelectorAll('[data-case-card]').length, 10);
    assert.ok(root.querySelectorAll('.cases-card mark').length);
  });
} finally {
  cleanup?.();
  for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
console.log(`\n${passed} case highlight checks passed. Browser appearance remains unverified.`);
