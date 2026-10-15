import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {render} from '../modules/matrix.js';
import {escape} from '../core.js';

// Source/callback checks only. No browser, layout, native focus traversal or file download is exercised.
const oldValue = Object.getOwnPropertyDescriptor(Element.prototype, 'value');
const oldHasAttribute = Element.prototype.hasAttribute;
const oldFocus = Element.prototype.focus;
Object.defineProperty(Element.prototype, 'value', {
  get() {return this._value ?? (this.tagName === 'textarea' ? this.textContent : oldValue.get.call(this));},
  set(value) {oldValue.set.call(this, value);}
});
Element.prototype.hasAttribute = function(name) {return Object.hasOwn(this.attrs, name);};
Element.prototype.focus = function(options) {this.focusOptions = options; oldFocus.call(this, options);};
const globals = {document: globalThis.document, window: globalThis.window};
const clone = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function check(label, run) {
  const document = new Element('document'); document.body = new Element('body'); document.append(document.body); document.activeElement = document.body;
  globalThis.document = document; globalThis.window = {matchMedia: () => ({matches: false})};
  const data = new Map(), toasts = [], downloads = [], dialogs = [];
  let rejection = false;
  const storage = {get(key, fallback) {return clone(data.has(key) ? data.get(key) : fallback);}, set(key, value) {if (rejection === 'throw') throw Error('quota'); if (rejection) return false; data.set(key, clone(value)); return true;}};
  const container = new Element('main'); document.body.append(container);
  const ctx = {storage, escape, icon: () => '', setHeader() {}, toast: value => toasts.push(value), download: (...args) => downloads.push(args), modal({body, onMount}) {
    const before = document.activeElement;
    const dialog = new Element('dialog'); dialog.innerHTML = body; document.body.append(dialog); dialogs.push(dialog);
    const form = dialog.querySelector('form'); form.elements = new Proxy({}, {get: (_, name) => form.querySelector(`[name="${String(name)}"]`)});
    const close = () => {dialog.closed = true; dialog.remove(); (before?.isConnected ? before : container).focus({preventScroll:true});}; onMount(dialog, close); return close;
  }};
  let cleanup;
  try {cleanup = render(container, ctx); run({ctx, container, data, storage, toasts, downloads, dialogs, reject(value = true) {rejection = value;}, remount() {cleanup(); container.innerHTML = ''; cleanup = render(container, ctx);}}); passed++; console.log('PASS ' + label);}
  finally {cleanup?.(); document.children = [];}
}
const find = (container, selector) => {const node = container.querySelector(selector); assert.ok(node, `Missing ${selector}`); return node;};
const click = (container, selector) => find(container, selector).click();
const column = (container, id, checked) => {const input = find(container, `[data-matrix-column="${id}"]`); input.checked = checked; input.emit('change'); return input;};
const filter = (container, value) => {const input = find(container, '[data-matrix-risk]'); input.value = value; input.emit('change');};
const source = (container, key = 'msa-01:notice') => click(container, `[data-matrix-cell="${key}"]`);
try {
  check('Rejected review mark remains unmarked and never leaks into a later successful column save', ({container, reject, storage}) => {
    source(container); reject(); click(container, '[data-matrix-review]');
    assert.equal(find(container, '[data-matrix-review]').attrs['aria-pressed'], 'false');
    assert.equal(find(container, '[data-reviewed-count]').textContent, '0');
    assert.match(find(container, '.matrix-local-status').textContent, /not saved/);
    reject(false); column(container, 'law', false); assert.equal(storage.get('matrix-state', {}).reviewed['msa-01:notice'], undefined);
    click(container, '[data-matrix-review]'); assert.equal(storage.get('matrix-state', {}).reviewed['msa-01:notice'], true);
  });
  check('Rejected column toggle and Show all preserve the stored selection and connected focus', ({container, reject, storage}) => {
    column(container, 'law', false); reject(); const input = column(container, 'term', false);
    assert.equal(input.checked, true); assert.equal(container.querySelectorAll('.matrix-col-term').length, 1);
    click(container, '[data-matrix-menu="columns"]'); click(container, '[data-matrix-show-all]');
    assert.equal(container.querySelectorAll('.matrix-col-law').length, 0); assert.equal(find(container, '[data-matrix-column="law"]').checked, false);
    assert.deepEqual(storage.get('matrix-state', {}).visibleColumns, ['counterparty','term','notice','liability','risk']);
    assert.equal(document.activeElement, find(container, '[data-matrix-show-all]')); assert.equal(document.activeElement.isConnected, true);
  });
  check('Failed note stays recoverable across source changes; retry saves the same text for reload', ({container, reject, storage, remount}) => {
    source(container); reject('throw'); const note = find(container, '[data-matrix-note]'); note.value = 'Confirm the 60-day notice\nand get client instructions.'; note.emit('input');
    assert.equal(find(container, '[data-matrix-retry-note]').hidden, false); assert.equal(storage.get('matrix-state', {}).notes, undefined);
    click(container, '[data-matrix-next]'); click(container, '[data-matrix-prev]');
    assert.equal(find(container, '[data-matrix-note]').value, note.value); assert.equal(find(container, '[data-matrix-note-status]').textContent, 'Not saved');
    reject(false); click(container, '[data-matrix-retry-note]'); assert.equal(find(container, '[data-matrix-retry-note]').hidden, true);
    assert.equal(document.activeElement, find(container, '[data-matrix-note]')); assert.equal(storage.get('matrix-state', {}).notes['msa-01:notice'], note.value);
    remount(); source(container); assert.equal(find(container, '[data-matrix-note]').value, note.value);
  });
  check('Saving a review mark does not falsely mark an unsaved note as saved; CSV includes the current draft', ({container, reject, storage, downloads}) => {
    source(container); reject(); const note = find(container, '[data-matrix-note]'); note.value = 'Unsaved draft with "quotes"'; note.emit('input');
    reject(false); click(container, '[data-matrix-review]');
    assert.equal(storage.get('matrix-state', {}).notes['msa-01:notice'], undefined); assert.equal(find(container, '[data-matrix-note-status]').textContent, 'Not saved');
    assert.equal(find(container, '.matrix-local-status').textContent, 'Notes not saved');
    click(container, '[data-matrix-menu="export"]'); click(container, '[data-matrix-export="all"]');
    assert.match(downloads[0][1], /Unsaved draft with ""quotes""/); assert.match(downloads[0][1], /Vendor agreements/);
    assert.equal(document.activeElement, find(container, '[data-matrix-menu="export"]'));
  });
  check('Source previous and next follow the active filtered documents and stop at the matching boundaries', ({container}) => {
    filter(container, 'review'); source(container); assert.equal(find(container, '[data-matrix-source-position]').textContent, 'Document 1 of 3 matching');
    assert.equal(find(container, '[data-matrix-prev]').disabled, true); click(container, '[data-matrix-next]');
    assert.match(find(container, '.matrix-source-document').textContent, /Distribution agreement/);
    click(container, '[data-matrix-next]'); assert.match(find(container, '.matrix-source-document').textContent, /Data services agreement/);
    assert.equal(find(container, '[data-matrix-next]').disabled, true); click(container, '[data-matrix-prev]'); assert.match(find(container, '.matrix-source-document').textContent, /Distribution agreement/);
  });
  check('A filter that hides the active document closes its stale source without stealing filter focus', ({container}) => {
    source(container); const input = find(container, '[data-matrix-search]'); input.focus(); input.value = 'software licence'; input.emit('input');
    assert.equal(find(container, '.matrix-source-panel').hidden, true); assert.equal(find(container, '.matrix-layout').classList.contains('matrix-has-source'), false);
    assert.equal(document.activeElement, input); assert.equal(container.querySelectorAll('.matrix-document-link').length, 1);
    source(container, 'licence-02:notice'); assert.equal(find(container, '[data-matrix-source-position]').textContent, 'Document 1 of 1 matching');
  });
  check('Hiding the inspected column dismisses its source only after the column preference saves', ({container, reject}) => {
    source(container); reject(); column(container, 'notice', false); assert.equal(find(container, '.matrix-source-panel').hidden, false);
    reject(false); column(container, 'notice', false); assert.equal(find(container, '.matrix-source-panel').hidden, true);
  });
  check('Review changes retain source scroll and return focus to the refreshed review control', ({container}) => {
    source(container); find(container, '.matrix-source-content').scrollTop = 173; click(container, '[data-matrix-review]');
    assert.equal(find(container, '.matrix-source-content').scrollTop, 173); assert.equal(document.activeElement, find(container, '[data-matrix-review]'));
    click(container, '[data-matrix-next]'); assert.equal(find(container, '.matrix-source-content').scrollTop, 0);
  });
  check('Export menu supports Home, End, Escape and Tab dismissal with a connected trigger', ({container}) => {
    const row = find(container, '[data-matrix-select="msa-01"]'); row.checked = true; row.emit('change');
    click(container, '[data-matrix-menu="export"]'); assert.equal(document.activeElement.dataset.matrixExport, 'all');
    document.activeElement.emit('keydown', {key: 'End'}); assert.equal(document.activeElement.dataset.matrixExport, 'selected');
    document.activeElement.emit('keydown', {key: 'Home'}); assert.equal(document.activeElement.dataset.matrixExport, 'all');
    document.activeElement.emit('keydown', {key: 'Tab'}); assert.equal(find(container, '[data-matrix-popover="export"]').hidden, true); assert.equal(document.activeElement, find(container, '[data-matrix-menu="export"]'));
    document.activeElement.click(); document.activeElement.emit('keydown', {key: 'Escape'}); assert.equal(document.activeElement, find(container, '[data-matrix-menu="export"]'));
    assert.equal(document.activeElement.isConnected, true);
  });
  check('Columns allow Tab through their checkboxes and dismiss when focus leaves the menu', ({container}) => {
    click(container, '[data-matrix-menu="columns"]'); const first = document.activeElement;
    assert.equal(first.dataset.matrixColumn, 'counterparty'); first.emit('keydown', {key: 'Tab'});
    assert.equal(find(container, '[data-matrix-popover="columns"]').hidden, false);
    first.emit('focusout', {relatedTarget: find(container, '[data-matrix-column="term"]')});
    assert.equal(find(container, '[data-matrix-popover="columns"]').hidden, false);
    first.emit('focusout', {relatedTarget: find(container, '[data-matrix-search]')});
    assert.equal(find(container, '[data-matrix-popover="columns"]').hidden, true);
    assert.equal(find(container, '[data-matrix-menu="columns"]').attrs['aria-expanded'], 'false');
  });
  check('Failed custom question save keeps entered values and retry adds exactly one unextracted column', ({container, reject, dialogs, storage}) => {
    click(container, '[data-matrix-add]'); const dialog = dialogs.at(-1), form = dialog.querySelector('form');
    form.elements.label.value = 'Assignment'; form.elements.question.value = 'Can a party assign this agreement?'; reject(); form.emit('submit');
    assert.equal(dialog.closed, undefined); assert.equal(form.elements.question.value, 'Can a party assign this agreement?'); assert.equal(find(container, '[data-question-count]').textContent, '6');
    reject(false); form.emit('submit'); assert.equal(dialog.closed, true); assert.equal(find(container, '[data-question-count]').textContent, '7');
    const saved = storage.get('matrix-state', {}); assert.equal(saved.customColumns.length, 1); source(container, 'msa-01:' + saved.customColumns[0].id);
    assert.equal(find(container, '[data-matrix-review]').disabled, true); assert.match(find(container, '.matrix-no-source').textContent, /No extraction connected/);
  });
  check('Adding a question from the table header focuses the new column while retaining vertical scroll', ({container, dialogs, storage}) => {
    const tableScroll = find(container, '.matrix-table-scroll'); tableScroll.scrollTop = 218; tableScroll.scrollWidth = 1400; tableScroll.scrollLeft = 520;
    const trigger = find(container, 'thead [data-matrix-add]'); trigger.focus(); trigger.click();
    const form = dialogs.at(-1).querySelector('form');
    form.elements.label.value = 'Assignment'; form.elements.question.value = 'Can either party assign?'; form.emit('submit');
    const id = storage.get('matrix-state', {}).customColumns[0].id;
    const heading = find(container, `[data-matrix-column-heading="${id}"]`);
    assert.equal(document.activeElement, heading); assert.equal(heading.isConnected, true); assert.equal(heading.attrs.tabindex, '-1');
    assert.deepEqual(heading.focusOptions, {preventScroll:true}); assert.equal(trigger.isConnected, false);
    assert.equal(tableScroll.scrollTop, 218); assert.equal(tableScroll.scrollLeft, 1400);
  });
  check('Clearing filters and selections restores connected usable controls and preserves table scroll', ({container}) => {
    const search = find(container, '[data-matrix-search]'), tableScroll = find(container, '.matrix-table-scroll');
    tableScroll.scrollTop = 163; tableScroll.scrollLeft = 370;
    search.value = 'no matching document'; search.emit('input');
    const clearFilters = find(container, '[data-matrix-reset]'); clearFilters.focus(); clearFilters.click();
    assert.equal(document.activeElement, search); assert.equal(search.isConnected, true); assert.deepEqual(search.focusOptions, {preventScroll:true});
    assert.equal(container.querySelectorAll('.matrix-document-link').length, 6);
    const selectRow = () => {const row = find(container, '[data-matrix-select="msa-01"]'); row.checked = true; row.emit('change');};
    selectRow(); const clearSelection = find(container, '[data-matrix-clear-selection]'); clearSelection.focus(); clearSelection.click();
    const selectAll = find(container, '[data-matrix-select-all]'); assert.equal(document.activeElement, selectAll); assert.equal(selectAll.isConnected, true); assert.equal(selectAll.disabled, false);
    assert.deepEqual(selectAll.focusOptions, {preventScroll:true}); assert.equal(find(container, '.matrix-selection-bar').hidden, true);
    selectRow(); search.value = 'no matching document'; search.emit('input'); clearSelection.focus(); clearSelection.click();
    assert.equal(find(container, '[data-matrix-select-all]').disabled, true); assert.equal(document.activeElement, search); assert.deepEqual(search.focusOptions, {preventScroll:true});
    assert.equal(tableScroll.scrollTop, 163); assert.equal(tableScroll.scrollLeft, 370);
  });
  console.log(`\n${passed} matrix state and keyboard callback checks passed. Browser rendering, native focus/scroll and downloads remain unverified.`);
} finally {
  Object.defineProperty(Element.prototype, 'value', oldValue);
  if (oldHasAttribute) Element.prototype.hasAttribute = oldHasAttribute; else delete Element.prototype.hasAttribute;
  Element.prototype.focus = oldFocus;
  for (const [key, value] of Object.entries(globals)) {if (value === undefined) delete globalThis[key]; else globalThis[key] = value;}
}
