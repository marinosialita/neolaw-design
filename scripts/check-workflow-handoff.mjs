import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Element} from './dom-double.mjs';
import {escape, icon, storage} from '../core.js';
import {render as renderLibrary, libraryItems} from '../modules/library.js';
import {renderChat} from '../chat.js';
import {workflowSamples, createWorkflowPreview} from '../modules/workflow-samples.js';
import {clearComposerDraft} from '../modules/composer-drafts.js';

// Actual library, chat creation and chat callbacks with a structural DOM double.
// This does not drive a browser, call a model or establish native rendering/focus.
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const startSource = appSource.slice(appSource.indexOf('function startChat('), appSource.indexOf('function openCommand('));
assert.ok(startSource.startsWith('function startChat('), 'Could not locate actual app.startChat');
const callStartChat = new Function('storage', 'navigate', 'createWorkflowPreview', 'options', `let pendingChat=null;${startSource};return startChat(options);`);
const workflows = libraryItems.filter(item => item.type === 'workflows');
assert.equal(workflows.length, 9);
const find = (root, selector) => {const element = root.querySelector(selector); assert.ok(element, `Missing ${selector}`); return element;};
const click = (root, selector) => find(root, selector).click();
let passed = 0;
function check(label, run) {run(); passed++; console.log('PASS ' + label);}

function withWorkspace(run) {
  const keys = ['document', 'window', 'location', 'history', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const document = new Element('document'), body = new Element('body'); document.body = body; document.append(body); document.activeElement = body;
  const header = new Element('header'), toast = new Element('div', {id:'toast'}); body.append(header); body.append(toast);
  document.getElementById = id => body.querySelector('#' + id);
  document.createElement = tag => new Element(tag);
  const records = new Map(), timers = new Map(), frames = new Map(), routes = [], starts = [], mountedIds = new Set();
  let rejected = false, timerId = 0, frameId = 0, dialog = null, libraryCleanup, libraryContainer, chatCleanup, chatContainer;
  globalThis.document = document;
  globalThis.window = {matchMedia: () => ({matches:false}), addEventListener() {}, removeEventListener() {}};
  globalThis.location = {pathname:'/', search:'', hash:'#/library?tab=workflows'};
  globalThis.history = {replaceState() {}};
  globalThis.localStorage = {getItem:key => records.get(key) ?? null, setItem(key, value) {if (rejected && key === 'neolaw.design.chats') throw Error('Simulated chat save failure'); records.set(key, value);}};
  globalThis.setTimeout = callback => {timers.set(++timerId, callback); return timerId;};
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.requestAnimationFrame = callback => {frames.set(++frameId, callback); return frameId;};
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const paint = () => {const work = [...frames.values()]; frames.clear(); work.forEach(callback => callback());};
  const startChat = options => {starts.push(structuredClone(options)); return callStartChat(storage, route => routes.push(route), createWorkflowPreview, options);};
  const currentEntry = () => storage.get('chats', [])[0];
  function modal({body:html, onMount}) {
    const before = document.activeElement, root = new Element('dialog', {open:''}); root.innerHTML = html; body.append(root); dialog = root;
    root.querySelectorAll('textarea').forEach(field => {field.value = field.textContent;});
    root.querySelectorAll('select').forEach(field => {field.value = field.querySelector('option[selected]')?.textContent || field.querySelector('option')?.textContent || '';});
    root.querySelectorAll('input, textarea').forEach(field => {field.setCustomValidity = value => {field.validationMessage = value;}; field.reportValidity = () => !field.validationMessage;});
    let closed = false;
    const close = () => {if (closed) return; closed = true; root.remove(); if (dialog === root) dialog = null; if (before?.isConnected) before.focus({preventScroll:true});};
    onMount?.(root, close); return close;
  }
  function library(item) {
    libraryCleanup?.(); libraryContainer?.remove();
    libraryContainer = new Element('main'); body.append(libraryContainer);
    libraryCleanup = renderLibrary(libraryContainer, {params:new URLSearchParams({tab:'workflows', item:item.id}), escape, icon, storage, startChat, modal, setHeader() {}, navigate:route => routes.push(route), toast() {}, download() {}});
    assert.ok(dialog); return dialog;
  }
  function mountChat() {
    chatCleanup?.(); chatContainer?.remove();
    const entry = currentEntry(); assert.ok(entry, 'Chat creation did not save an entry'); mountedIds.add(entry.id);
    chatContainer = new Element('main'); body.append(chatContainer);
    chatCleanup = renderChat(chatContainer, {route:['chat', entry.id], params:new URLSearchParams(), setHeader(_title, html='') {header.innerHTML = html;}, refreshSidebar() {}, navigate:route => routes.push(route)});
    paint(); return chatContainer;
  }
  try {run({library, mountChat, currentEntry, starts, routes, startChat, currentDialog:() => dialog, reject(value=true) {rejected = value;}});}
  finally {
    chatCleanup?.(); libraryCleanup?.();
    for (const id of mountedIds) clearComposerDraft('chat:' + id);
    for (const [key, value] of Object.entries(previous)) {if (value === undefined) delete globalThis[key]; else globalThis[key] = value;}
  }
}

function setInstructions(dialog, item) {
  const values = {context:`Client context for ${item.title}: preserve the €2,700 amount and distinguish uncertain dates.`, perspective:'Client priorities first', notes:'Keep the open issues visible — do not invent missing facts.'};
  find(dialog, '#library-workflow-context').value = values.context;
  find(dialog, '#library-workflow-focus').value = values.perspective;
  find(dialog, '#library-workflow-notes').value = values.notes;
  return values;
}
function assertArtifact(container, item, values) {
  const sample = workflowSamples[item.id], paper = find(container, '.document-paper'), answer = find(container, '.assistant-body');
  assert.equal(find(container, '#document-panel').hidden, false);
  assert.equal(find(paper, 'h2').textContent, sample.title);
  for (const root of [paper, answer]) {
    for (const value of [sample.title, sample.summary, sample.next, ...sample.rows.flat()]) assert.ok(root.textContent.includes(value), `${item.id} lost ${value}`);
    assert.match(root.textContent, /automatic analysis is unavailable/i);
    assert.match(root.textContent, /Edited instructions are saved separately/i);
    assert.ok(!root.textContent.includes(values.context), 'Prepared output was presented as analysis of custom instructions');
  }
  for (const value of Object.values(values)) assert.ok(find(container, '.user-bubble').textContent.includes(value), 'User instructions were not retained');
  assert.equal(container.querySelectorAll('.tool-welcome').length, 0, 'Workflow was replaced by generic tool onboarding');
}

for (const item of workflows) {
  check(`${item.title}: library preview reaches chat and document intact through close, reopen and remount`, () => withWorkspace(workspace => {
    const dialog = workspace.library(item), values = setInstructions(dialog, item), sample = workflowSamples[item.id];
    click(dialog, '[data-workflow-preview]');
    const preview = find(dialog, '.library-workflow-result');
    assert.equal(preview.hidden, false);
    assert.deepEqual(preview.querySelectorAll('tbody tr').map(row => row.querySelectorAll('td').map(cell => cell.textContent)), sample.rows);
    for (const value of [sample.summary, sample.next]) assert.ok(preview.textContent.includes(value));
    click(dialog, '[data-workflow-followup]');
    assert.equal(workspace.currentDialog(), null);
    assert.equal(workspace.starts.length, 1); assert.equal(workspace.starts[0].workflowId, item.id);
    assert.ok(workspace.starts[0].prompt.includes('practical next-actions list'));
    const saved = workspace.currentEntry();
    assert.equal(saved.workflowId, item.id); assert.deepEqual(saved.document, {kind:'workflow', workflowId:item.id, name:sample.title});
    assert.equal(saved.documentPanelOpen, true); assert.equal(saved.messages.length, 2);
    assert.equal(saved.messages[0].role, 'user'); assert.equal(saved.messages[1].role, 'assistant');
    assert.deepEqual(workspace.routes, ['/chat/' + saved.id]);
    const initialMessages = structuredClone(saved.messages), initialDocument = structuredClone(saved.document);
    let container = workspace.mountChat(); assertArtifact(container, item, values);
    const paperText = find(container, '.document-paper').textContent;
    click(container, '#close-document'); assert.equal(workspace.currentEntry().documentPanelOpen, false);
    assert.equal(find(container, '#document-panel').hidden, true);
    container = workspace.mountChat(); assert.equal(find(container, '#document-panel').hidden, true);
    click(container, '#reopen-doc'); assertArtifact(container, item, values);
    assert.equal(find(container, '.document-paper').textContent, paperText);
    container = workspace.mountChat(); assertArtifact(container, item, values);
    assert.equal(find(container, '.document-paper').textContent, paperText);
    assert.deepEqual(workspace.currentEntry().document, initialDocument);
    assert.deepEqual(workspace.currentEntry().messages, initialMessages, 'Returning to a workflow appended a duplicate introduction');
    assert.equal(container.querySelectorAll('.message.assistant').length, 1);
  }));
}

check('All nine workflows can open the same artifact directly without first running the sample preview', () => {
  for (const item of workflows) withWorkspace(workspace => {
    const dialog = workspace.library(item), values = setInstructions(dialog, item);
    click(dialog, '[data-workflow-start]');
    assert.equal(workspace.currentDialog(), null); assert.equal(workspace.starts[0].workflowId, item.id);
    assertArtifact(workspace.mountChat(), item, values);
    assert.equal(workspace.currentEntry().messages.length, 2);
  });
});

check('Unknown workflow IDs never create a prepared artifact or invented workflow message', () => withWorkspace(workspace => {
  assert.equal(createWorkflowPreview('workflow-unknown'), null);
  assert.equal(createWorkflowPreview('__proto__'), null);
  assert.equal(workspace.startChat({workflowId:'workflow-unknown', tool:'review', title:'Unknown workflow', prompt:'Retain these instructions.'}), true);
  const saved = workspace.currentEntry();
  assert.equal(saved.workflowId, undefined); assert.equal(saved.document, undefined); assert.equal(saved.documentPanelOpen, undefined);
  assert.deepEqual(saved.messages, [{role:'user', text:'Retain these instructions.'}]);
  const container = workspace.mountChat(); assert.equal(find(container, '#document-panel').hidden, true);
  assert.equal(container.querySelector('.document-paper'), null);
}));

check('Rejected chat saves keep each workflow dialog and its draft; retry creates one complete workspace', () => {
  for (const item of workflows) withWorkspace(workspace => {
    const dialog = workspace.library(item), values = setInstructions(dialog, item);
    click(dialog, '[data-workflow-preview]'); workspace.reject(); click(dialog, '[data-workflow-followup]');
    assert.equal(workspace.currentDialog(), dialog); assert.equal(dialog.isConnected, true);
    assert.deepEqual(workspace.routes, []); assert.equal(workspace.currentEntry(), undefined);
    assert.equal(find(dialog, '#library-workflow-context').value, values.context);
    assert.equal(find(dialog, '#library-workflow-focus').value, values.perspective);
    assert.equal(find(dialog, '#library-workflow-notes').value, values.notes);
    assert.equal(find(dialog, '.library-workflow-result').hidden, false);
    workspace.reject(false); click(dialog, '[data-workflow-followup]');
    assert.equal(workspace.currentDialog(), null); assert.equal(workspace.routes.length, 1);
    assert.equal(storage.get('chats', []).length, 1); assert.equal(workspace.currentEntry().messages.length, 2);
    assertArtifact(workspace.mountChat(), item, values);
  });
});

console.log(`\n${passed} workflow handoff callback groups passed. Native browser layout, focus, scrolling and downloads remain unverified.`);
