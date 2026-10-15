import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {escape, icon} from '../core.js';
import {renderHome} from '../chat.js';
import {libraryItems} from '../modules/library.js';
import {openLibraryDialog} from '../modules/library-dialog.js';
import {clearComposerDraft, readComposerDraft} from '../modules/composer-drafts.js';

// Detached structure and event checks only: no server, browser, network or AI.
// Supply the native form/dialog defaults not modelled by this structural double.
const valueDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'value');
Object.defineProperty(Element.prototype, 'value', {
  configurable: true,
  get() { return this._value ?? (this.tagName === 'textarea' ? this.textContent : valueDescriptor.get.call(this)); },
  set(value) { valueDescriptor.set.call(this, value); }
});
Element.prototype.getAttribute = function(name) { return this.attrs[name] ?? null; };
Element.prototype.setCustomValidity = function(message) { this.validationMessage = message; };
Element.prototype.reportValidity = function() { return !this.validationMessage; };
Element.prototype.showModal = function() { this.open = true; this.setAttribute('open', ''); };
Element.prototype.close = function() { this.open = false; this.removeAttribute('open'); this.emit('close'); };
const matches = Element.prototype.matches;
Element.prototype.matches = function(selector) {
  if (selector === '.library-search input') return this.tagName === 'input' && !!this.closest('.library-search');
  if (selector === '.library-category-label select') return this.tagName === 'select' && !!this.closest('.library-category-label');
  return matches.call(this, selector);
};

let passed = 0;
async function check(name, run) {
  const names = ['document', 'window', 'location', 'history', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  const document = new Element('document'), body = new Element('body'), container = new Element('main');
  document.body = body; document.append(body); body.append(container); document.activeElement = null;
  document.createElement = tag => new Element(tag); document.getElementById = id => body.querySelector('#' + id);
  body.style.overflow = 'auto';
  const window = new Element('window'); window.matchMedia = () => ({matches: true});
  const store = new Map(), state = {routes: [], starts: [], headers: [], toasts: [], historyWrites: [], failStart: false};
  const ctx = {
    route: ['chat'], params: new URLSearchParams(), libraryItems, escape, icon,
    storage: {get: (key, fallback) => store.get(key) ?? fallback, set: (key, value) => { store.set(key, value); return true; }},
    setHeader: (...args) => state.headers.push(args),
    navigate: route => state.routes.push(route),
    startChat: options => { state.starts.push(options); return !state.failStart; },
    toast: message => state.toasts.push(message), download() {},
    modal() { throw new Error('Library popup must keep its details inline, not open a second dialog'); }
  };
  globalThis.document = document; globalThis.window = window;
  globalThis.location = {hash: '#/chat', pathname: '/', search: ''};
  globalThis.history = {replaceState: (...args) => state.historyWrites.push(args), pushState: (...args) => state.historyWrites.push(args)};
  globalThis.localStorage = {getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value)};
  globalThis.requestAnimationFrame = callback => { callback(); return 1; }; globalThis.cancelAnimationFrame = () => {};
  let homeCleanup;
  clearComposerDraft('home');
  const home = () => { homeCleanup = renderHome(container, ctx); return container; };
  const dialog = () => body.querySelector('dialog.library-explorer');
  const fire = (element, type = 'click', extra = {}) => { assert.ok(element, `Missing target for ${type}`); return element.emit(type, {currentTarget: element, ...extra}); };
  const open = tab => { const trigger = container.querySelector('#browse-library'); trigger.focus(); if (tab) fire(container.querySelector(`[data-tab="${tab}"]`)); fire(trigger); return dialog(); };
  try {
    await run({ctx, state, store, document, window, body, container, home, open, dialog, fire, cleanupHome: () => homeCleanup?.()});
    passed++; console.log('PASS ' + name);
  } finally {
    homeCleanup?.(); dialog()?.querySelector('[data-close-library]')?.click(); clearComposerDraft('home');
    for (const [name, value] of Object.entries(previous)) value === undefined ? delete globalThis[name] : globalThis[name] = value;
  }
}

console.log('Explore library · detached DOM integration checks');
console.log('These checks do not establish visual layout, native focus trapping or browser animation.\n');

await check('Home screening card stays within nine tools and preserves the unfinished chat draft', ({home, container, state, fire, cleanupHome}) => {
  home();
  const cards = container.querySelectorAll('.tool-card');
  assert.equal(cards.length, 9);
  assert.match(cards.at(-1).textContent, /Screen a client/);
  assert.ok(libraryItems.some(item => item.tool === 'chronology'));
  const textarea = container.querySelector('#chat-input');
  textarea.value = 'Keep my pending matter question'; textarea.oninput();
  const draft = readComposerDraft('home');
  fire(cards.at(-1));
  assert.equal(state.starts.at(-1).tool, 'screening');
  cleanupHome();
  assert.deepEqual(readComposerDraft('home'), draft);
});

await check('Screening opens from the library popup and closes it after an accepted workspace handoff', ({home, open, fire, dialog, state}) => {
  home(); const popup = open('tools');
  fire(popup.querySelector('[data-library-open="screening"]'));
  assert.equal(popup.querySelector('#library-prompt-input'), null);
  state.failStart = true;
  fire(popup.querySelector('[data-screening-open]'));
  assert.strictEqual(dialog(), popup);
  state.failStart = false;
  fire(popup.querySelector('[data-screening-open]'));
  assert.equal(state.starts.at(-1).tool, 'screening');
  assert.equal(dialog(), null);
});

await check('Explore opens the selected home category without navigating, changing the header or replacing the composer', async ({home, open, dialog, container, state, fire, ctx}) => {
  home(); const textarea = container.querySelector('#chat-input'), form = container.querySelector('#chat-form');
  textarea.value = '  Keep my unsent question.\nSecond line.  '; textarea.oninput();
  const file = container.querySelector('#file-input'); file.files = [{name: 'matter.pdf', size: 120, type: 'application/pdf'}]; await file.onchange({target: file});
  const draft = readComposerDraft('home');
  for (const tab of ['tools', 'contracts', 'skills', 'prompts', 'workflows']) {
    const popup = open(tab); assert.ok(popup); assert.equal(popup.open, true);
    assert.equal(popup.querySelector('[aria-selected="true"]').dataset.libraryTab, tab);
    assert.strictEqual(container.querySelector('#chat-input'), textarea); assert.strictEqual(container.querySelector('#chat-form'), form);
    assert.deepEqual(readComposerDraft('home'), draft); assert.equal(container.querySelectorAll('.attached-chip').length, 1);
    assert.equal(location.hash, '#/chat'); assert.equal(ctx.params.toString(), ''); assert.equal(state.headers.length, 1);
    assert.deepEqual(state.routes, []); assert.deepEqual(state.historyWrites, []);
    fire(popup.querySelector('[data-close-library]')); assert.equal(dialog(), null);
  }
});

await check('Search, filters, category keys and reset operate inside the popup with the chat route intact', ({home, open, state, fire, document}) => {
  home(); const popup = open('contracts'), search = popup.querySelector('.library-search input');
  search.value = 'borrower'; fire(search, 'input'); assert.equal(popup.querySelectorAll('.library-card').length, 1);
  assert.match(popup.querySelector('.library-card').textContent, /Loan Agreement/);
  const category = popup.querySelector('.library-category-label select'); category.value = 'Finance'; fire(category, 'change');
  search.value = 'no matching agreement'; fire(search, 'input'); assert.ok(popup.querySelector('.library-empty'));
  fire(popup.querySelector('[data-library-reset]')); assert.equal(popup.querySelectorAll('.library-card').length, 12);
  fire(popup.querySelector('[data-library-tab="prompts"]'));
  assert.equal(popup.querySelector('[aria-selected="true"]').dataset.libraryTab, 'prompts');
  const active = popup.querySelector('[aria-selected="true"]'); fire(active, 'keydown', {key: 'ArrowDown'});
  assert.equal(popup.querySelector('[aria-selected="true"]').dataset.libraryTab, 'workflows');
  assert.strictEqual(document.activeElement, popup.querySelector('[aria-selected="true"]'));
  assert.deepEqual(state.routes, []); assert.deepEqual(state.historyWrites, []); assert.equal(location.hash, '#/chat');
});

await check('Office contracts open as internal inline detail and return to the same filtered collection', ({home, open, fire, body, document}) => {
  home(); const popup = open('contracts'), search = popup.querySelector('.library-search input');
  search.value = 'non-disclosure'; fire(search, 'input');
  const trigger = popup.querySelector('[data-library-open="contract-nda"]'); trigger.focus(); fire(trigger);
  const preview = popup.querySelector('.library-explorer-preview');
  assert.equal(body.querySelectorAll('dialog').length, 1); assert.ok(preview.querySelector('.library-contract-detail'));
  assert.match(preview.textContent, /Cyprus law/); assert.match(preview.textContent, /Reviewed NDA example/);
  assert.equal(preview.querySelectorAll('a').length, 0); assert.equal(preview.querySelector('[data-detail-launch]'), null);
  fire(preview.querySelector('[data-close]'));
  assert.equal(popup.querySelector('.library-explorer-detail'), null);
  assert.equal(popup.querySelector('.library-search input').value, 'non-disclosure'); assert.equal(popup.querySelectorAll('.library-card').length, 1);
  assert.strictEqual(document.activeElement, trigger);
});

await check('An unsuccessful prompt launch preserves edited instructions; an accepted launch closes the whole popup', ({home, open, fire, dialog, state}) => {
  home(); const popup = open('prompts'); fire(popup.querySelector('[data-library-open="prompt-lease"]'));
  const field = popup.querySelector('#library-prompt-input'); field.value = 'Use these particular tenant instructions.';
  state.failStart = true; fire(popup.querySelector('[data-detail-launch]'));
  assert.strictEqual(dialog(), popup); assert.strictEqual(popup.querySelector('#library-prompt-input'), field);
  assert.equal(field.value, 'Use these particular tenant instructions.');
  assert.equal(state.starts.at(-1).prompt, field.value); assert.equal(state.starts.at(-1).tool, 'review');
  state.failStart = false; fire(popup.querySelector('[data-detail-launch]'));
  assert.equal(dialog(), null); assert.equal(state.starts.length, 2); assert.deepEqual(state.routes, []);
});

await check('Workflow context, perspective and notes reach the existing workspace handoff before the popup closes', ({home, open, fire, dialog, state}) => {
  home(); const popup = open('workflows'); fire(popup.querySelector('[data-library-open="workflow-contract"]'));
  popup.querySelector('#library-workflow-context').value = 'Client-provided agreement context.';
  popup.querySelector('#library-workflow-focus').value = 'Client priorities first';
  popup.querySelector('#library-workflow-notes').value = 'Check the payment dates.';
  state.failStart = true; fire(popup.querySelector('[data-workflow-start]')); assert.strictEqual(dialog(), popup);
  state.failStart = false; fire(popup.querySelector('[data-workflow-start]')); assert.equal(dialog(), null);
  const options = state.starts.at(-1); assert.equal(options.workflowId, 'workflow-contract'); assert.equal(options.tool, 'review');
  for (const text of ['Client-provided agreement context.', 'Client priorities first', 'Check the payment dates.']) assert.ok(options.prompt.includes(text));
});

await check('The document-set tool closes the popup and uses the matrix route rather than creating a chat', ({home, open, fire, dialog, state}) => {
  home(); const popup = open('tools'); fire(popup.querySelector('[data-library-open="tool-matrix"]'));
  fire(popup.querySelector('[data-matrix-open]'));
  assert.equal(dialog(), null); assert.deepEqual(state.routes, ['/matrix']); assert.deepEqual(state.starts, []);
});

await check('Saved items persist after close and reopen and appear in the popup saved filter', ({home, open, fire, store}) => {
  home(); let popup = open('contracts'); fire(popup.querySelector('[data-library-open="contract-nda"]'));
  fire(popup.querySelector('[data-detail-save]')); assert.deepEqual(store.get('library-saved'), ['contract-nda']);
  fire(popup.querySelector('[data-close-library]')); popup = open('contracts');
  assert.equal(popup.querySelector('[data-library-save="contract-nda"]').getAttribute('aria-pressed'), 'true');
  fire(popup.querySelector('[data-library-saved-filter]')); assert.equal(popup.querySelectorAll('.library-card').length, 1);
  assert.match(popup.querySelector('.library-card').textContent, /Non-Disclosure Agreement/);
});

await check('Create and edit saved prompts stay inline and Cancel restores the exact unfinished launch instructions', ({home, open, fire, store, body}) => {
  home(); const popup = open('prompts'); fire(popup.querySelector('[data-library-create]'));
  popup.querySelector('#library-custom-title').value = 'My case preparation';
  popup.querySelector('#library-custom-instructions').value = 'Prepare this matter from the supplied notes.';
  fire(popup.querySelector('.library-prompt-form'), 'submit');
  const item = store.get('library-custom-prompts')[0]; assert.equal(item.title, 'My case preparation');
  assert.equal(body.querySelectorAll('dialog').length, 1);
  fire(popup.querySelector(`[data-library-open="${item.id}"]`));
  popup.querySelector('#library-prompt-input').value = '  Preserve this draft.\nAnd its second line.  ';
  fire(popup.querySelector('[data-custom-edit]'));
  assert.equal(popup.querySelector('#library-custom-instructions').value, '  Preserve this draft.\nAnd its second line.  ');
  popup.querySelector('#library-custom-instructions').value = 'Cancel these further edits.';
  fire(popup.querySelector('[data-editor-cancel]'));
  assert.equal(popup.querySelector('#library-prompt-input').value, '  Preserve this draft.\nAnd its second line.  ');
  assert.equal(store.get('library-custom-prompts')[0].prompt, 'Prepare this matter from the supplied notes.');
  assert.equal(body.querySelectorAll('dialog').length, 1);
});

await check('Header close, Escape and backdrop dismissal restore the launcher and original body scrolling', ({home, open, fire, dialog, document, body, container}) => {
  home(); const trigger = container.querySelector('#browse-library');
  for (const action of ['header', 'escape', 'backdrop']) {
    const popup = open(); fire(popup.querySelector('[data-library-open="review"]'));
    if (action === 'header') fire(popup.querySelector('[data-close-library]'));
    else if (action === 'escape') { const event = fire(popup, 'cancel'); assert.equal(event.defaultPrevented, true); }
    else fire(popup);
    assert.equal(dialog(), null); assert.strictEqual(document.activeElement, trigger); assert.equal(body.style.overflow, 'auto');
  }
});

await check('Home cleanup and route changes dispose the popup, its keyboard listener and repeated close safely', ({home, open, window, document, dialog, cleanupHome, ctx, body}) => {
  home(); const originalKeys = document.listeners.keydown?.length || 0;
  open(); assert.ok(dialog()); cleanupHome(); assert.equal(dialog(), null);
  assert.equal(document.listeners.keydown?.length || 0, originalKeys);
  const close = openLibraryDialog(ctx, {tab: 'skills'}); assert.ok(dialog());
  window.emit('hashchange'); assert.equal(dialog(), null); close(); close(); assert.equal(body.style.overflow, 'auto');
  assert.equal(document.listeners.keydown?.length || 0, originalKeys);
});

console.log(`\n${passed} library popup integration checks passed.`);
