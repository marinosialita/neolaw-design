import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mountArticlePanel } from '../modules/chat-article-panel.js';
import { CASES } from '../modules/case-data.js';
import { ARTICLES } from '../modules/article-data.js';

// Inert DOM and actual delegated callbacks only: no browser or network access.
const require = createRequire(import.meta.url);
const { parseHTML } = require(process.env.NEOLAW_EXPORT_DOM || '/tmp/neolaw-export-check/node_modules/linkedom');
const { document, HTMLElement, Event } = parseHTML('<html><body><aside aria-label="Previous panel"></aside></body></html>');
globalThis.document = document;
let focus;
HTMLElement.prototype.focus = function () { focus = this; };
let sequence = 0;
const frames = new Map();
globalThis.requestAnimationFrame = callback => { const id = ++sequence; frames.set(id, callback); return id; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
const container = document.querySelector('aside');
let cleanup = () => {};
let passed = 0;
function check(name, run) { cleanup(); container.innerHTML = ''; run(); passed++; console.log('PASS ' + name); }
function click(selector) { container.querySelector(selector).dispatchEvent(new Event('click', { bubbles: true })); flush(); }
function key(selector, value) { const event = new Event('keydown', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'key', { value }); container.querySelector(selector).dispatchEvent(event); flush(); return event; }
const item = ARTICLES[0];

check('Article shows captured text, source, date and accessible tab relationships', () => {
  cleanup = mountArticlePanel(container, item); flush();
  for (const text of item.text) assert.ok(container.textContent.includes(text));
  assert.ok(container.textContent.includes(item.verifiedOn));
  assert.equal(container.querySelector('.cases-original-link').getAttribute('href'), item.sourceUrl);
  const selected = container.querySelector('[aria-selected="true"]');
  assert.equal(selected.dataset.articleView, 'article');
  assert.equal(container.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby'), selected.id);
  assert.equal(focus, container.querySelector('.cases-panel-heading h2'));
});

check('History includes explicit coverage note and linked amendment entries', () => {
  const states = [];
  cleanup = mountArticlePanel(container, item, { onState: next => states.push(next) });
  click('[data-article-view="history"]');
  assert.deepEqual(states, [{ view: 'history' }]);
  assert.ok(container.textContent.includes(item.historyNote));
  assert.equal(container.querySelectorAll('.article-history__list>li').length, item.history.length);
  assert.equal(container.querySelectorAll('.article-history__list a').length, item.history.filter(entry => entry.url).length);
  assert.equal(focus.dataset.articleView, 'history');
});

check('Related judgments hand off the verified source block and actual trigger', () => {
  const calls = [];
  cleanup = mountArticlePanel(container, item, { view: 'cases', onCase: (...args) => calls.push(args) });
  const trigger = container.querySelector('[data-article-case="0"]');
  click('[data-article-case="0"]');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [item.relatedCases[0].caseId, item.relatedCases[0].block, trigger]);
});

check('Arrow keys wrap; Home and End select their tabs and focus after rendering', () => {
  cleanup = mountArticlePanel(container, item); flush();
  const active = () => '[aria-selected="true"]';
  assert.equal(key(active(), 'ArrowLeft').defaultPrevented, true);
  assert.equal(focus.dataset.articleView, 'cases');
  key(active(), 'ArrowRight'); assert.equal(focus.dataset.articleView, 'article');
  key(active(), 'End'); assert.equal(focus.dataset.articleView, 'cases');
  key(active(), 'Home'); assert.equal(focus.dataset.articleView, 'article');
});

check('Switching tabs retains each content scroll position', () => {
  cleanup = mountArticlePanel(container, item); flush();
  container.querySelector('.cases-panel-content').scrollTop = 210;
  click('[data-article-view="history"]');
  container.querySelector('.cases-panel-content').scrollTop = 95;
  click('[data-article-view="article"]');
  assert.equal(container.querySelector('.cases-panel-content').scrollTop, 210);
  click('[data-article-view="history"]');
  assert.equal(container.querySelector('.cases-panel-content').scrollTop, 95);
});

check('Failed persistence cancels the tab switch without losing content', () => {
  cleanup = mountArticlePanel(container, item, { onState: () => false }); flush();
  const before = container.querySelector('[role="tabpanel"]');
  click('[data-article-view="history"]');
  assert.equal(container.querySelector('[role="tabpanel"]'), before);
  assert.equal(container.querySelector('[aria-selected="true"]').dataset.articleView, 'article');
});

check('Escape and close button invoke close; cleanup removes listeners, pending focus and scoped styling', () => {
  let closed = 0;
  cleanup = mountArticlePanel(container, item, { onClose: () => closed++ });
  assert.equal(key('[role="tabpanel"]', 'Escape').defaultPrevented, true);
  click('[data-close-article]'); assert.equal(closed, 2);
  click('[data-article-view="history"]');
  cleanup(); cleanup();
  assert.equal(frames.size, 0);
  assert.equal(container.classList.contains('chat-article-panel'), false);
  assert.equal(container.getAttribute('aria-label'), 'Previous panel');
  click('[data-close-article]'); assert.equal(closed, 2);
});

check('Unavailable cases and source blocks are not invented; unsafe links and markup stay inert', () => {
  const calls = [];
  cleanup = mountArticlePanel(container, { ...item, sourceUrl: 'javascript:alert(1)', title: '<script>unsafe</script>', history: [{ label: '<b>label</b>', description: 'text', url: 'javascript:alert(1)' }], relatedCases: [{ caseId: 'missing', block: 2 }, { caseId: CASES[0].id, block: 999999 }] }, { view: 'cases', onCase: (...args) => calls.push(args) });
  assert.equal(container.querySelector('script'), null);
  assert.equal(container.querySelector('.cases-original-link'), null);
  assert.equal(container.querySelectorAll('[data-article-case]').length, 1);
  click('[data-article-case="0"]'); assert.equal(calls[0][1], 0);
  click('[data-article-view="history"]'); assert.equal(container.querySelector('.article-history__list a'), null);
});

cleanup();
console.log(`${passed} article panel callback groups passed.`);
