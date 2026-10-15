import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {render, ensureProjects} from '../modules/projects.js';
import {escape} from '../core.js';
import {renderChat} from '../chat.js';
import {readComposerDraft, clearComposerDraft} from '../modules/composer-drafts.js';
import {historyFixture} from './screening-history-fixture.mjs';
import {officialPortals} from '../modules/screening-view-model.js';

// Structural callbacks only. This does not exercise a browser or native file picker.
const originalValue = Object.getOwnPropertyDescriptor(Element.prototype, 'value');
Object.defineProperty(Element.prototype, 'value', {
  get() { return this._value ?? (this.tagName === 'textarea' ? this.textContent : originalValue.get.call(this)); },
  set(value) { originalValue.set.call(this, value); }
});
const originalMatches = Element.prototype.matches;
Element.prototype.matches = function(selector) {
  if (!selector.includes(' ')) return originalMatches.call(this, selector);
  const parts = selector.split(/\s+(?![^\[]*\])/);
  if (!originalMatches.call(this, parts.pop())) return false;
  let ancestor = this.parentElement;
  while (parts.length) {
    const part = parts.pop(); while (ancestor && !originalMatches.call(ancestor, part)) ancestor = ancestor.parentElement;
    if (!ancestor) return false; ancestor = ancestor.parentElement;
  }
  return true;
};
const originals = {document: globalThis.document, FormData: globalThis.FormData};
let passed = 0;
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
function event(target, type, extra = {}) {
  const e = {target, type, preventDefault() {this.defaultPrevented = true;}, stopPropagation() {this.stopped = true;}, ...extra};
  let node = target;
  while (node) {
    for (const callback of node.listeners[type] || []) callback(e);
    if (e.stopped) break;
    node = node.parentElement;
  }
  return e;
}
async function check(name, run) {
  const document = new Element('document'); document.body = new Element('body'); document.append(document.body); document.activeElement = null;
  document.createElement = tag => new Element(tag); globalThis.document = document;
  globalThis.FormData = class {constructor(form) {this.form = form;} get(name) {const field = this.form.querySelector(`[name="${name}"]`); return field?.value || field?.querySelector('option')?.textContent || '';}};
  const data = new Map(), toasts = [], navigations = [], dialogs = [];
  let reject = false, sidebarRefreshes = 0;
  const storage = {get(key, fallback) {return clone(data.has(key) ? data.get(key) : fallback);}, set(key, value) {if (reject && (reject === true || reject === key)) return false; data.set(key, clone(value)); return true;}};
  const seeds = ensureProjects(storage);
  seeds.forEach(project => clearComposerDraft('project:' + project.id));
  const container = new Element('main'); document.body.append(container);
  const ctx = {route: ['projects', seeds[0].id], storage, screeningHistory:historyFixture(storage), escape, icon: () => '', toast: value => toasts.push(value), setHeader() {}, navigate: value => navigations.push(value), refreshSidebar() {sidebarRefreshes++;}, startChat() {},
    modal({body, onMount}) {const dialog = new Element('dialog'); dialog.innerHTML = body; document.body.append(dialog); const form = dialog.querySelector('form'); if (form) {form.elements = new Proxy({}, {get: (_, name) => form.querySelector(`[name="${String(name)}"]`)});}
      const close = () => {dialog.closed = true; dialog.remove();}; dialogs.push(dialog); onMount?.(dialog); return close;}
  };
  const api = {ctx, container, storage, seeds, data, toasts, navigations, dialogs, get sidebarRefreshes() {return sidebarRefreshes;}, reject(value = true) {reject = value;}};
  try {await run(api); passed++; console.log('PASS ' + name);} finally {seeds.forEach(project => clearComposerDraft('project:' + project.id));document.children = [];}
}
function menu(container, kind, id) {
  const trigger = container.querySelectorAll('[data-menu]').find(button => button.dataset.menu === kind && button.dataset.id === id);
  event(trigger, 'click');
  return {trigger, option: action => container.querySelector(`[data-menu-action="${action}"]`)};
}
function setDraft(container) {
  const input = container.querySelector('.project-composer textarea'); input.value = 'Keep this unfinished question exactly'; event(input, 'input');
  const chats = container.querySelector('[data-search="chats"]'); chats.value = 'warrant'; event(chats, 'input');
  const files = container.querySelector('[data-search="files"]'); files.value = 'notes'; event(files, 'input');
}
function expectDraft(container) {
  assert.equal(container.querySelector('.project-composer textarea').value, 'Keep this unfinished question exactly');
  assert.equal(container.querySelector('.project-send').disabled, false);
  assert.equal(container.querySelector('[data-search="chats"]').value, 'warrant');
  assert.equal(container.querySelector('[data-search="files"]').value, 'notes');
  assert.equal(container.querySelectorAll('.project-chat-row').length, 1);
  assert.equal(container.querySelectorAll('.project-file-row').length, 1);
}
const tick = async () => { for (let i=0;i<5;i++) await Promise.resolve(); };
function savedScreening(id, projectId, options={}) {
  return {id, query:{name:options.name||'Example subject', country:'Cyprus', type:'person', projectId}, projectName:'Project name at save time', createdAt:options.createdAt||'2026-10-14T09:00:00.000Z', matches:[], totalMatches:0, sourceSnapshots:[], decisions:{}, notes:'Preserve original evidence',
    research:{schemaVersion:6,mode:'search',status:'completed',officialChecks:officialPortals.map(source=>({...source,status:source.id===options.failed?'failed':'completed',matchCount:0,candidates:[]})),opensanctions:{status:'not_configured'},worldbank:{status:'completed',totalResults:0,candidates:[]}}};
}
try {
  await check('Legacy projects with omitted collections can be saved without a false cross-tab conflict', ({ctx, container, storage, toasts}) => {
    storage.set('projects',[{id:'legacy-project',name:'Legacy matter',pinned:false,updatedAt:'2026-10-14T08:00:00Z'}]);ctx.route=['projects','legacy-project'];
    const cleanup=render(container,ctx);event(container.querySelector('[data-action="pin-current"]'),'click');
    assert.equal(storage.get('projects')[0].pinned,true);assert.deepEqual(storage.get('projects')[0].chats,[]);assert.deepEqual(storage.get('projects')[0].files,[]);assert.ok(!toasts.some(message=>/another tab/.test(message)));cleanup();
  });
  await check('Stale project edits preserve unrelated projects created or renamed in another tab', ({ctx, container, storage, seeds}) => {
    const cleanup=render(container,ctx);setDraft(container);
    const latest=storage.get('projects');latest[1].name='Renamed in another tab';latest.push({id:'other-tab',name:'Other tab matter',chats:[],files:[]});storage.set('projects',latest);
    event(container.querySelector('[data-action="pin-current"]'),'click');
    const saved=storage.get('projects');assert.equal(saved.find(p=>p.id===seeds[0].id).pinned,false);assert.equal(saved.find(p=>p.id===seeds[1].id).name,'Renamed in another tab');assert.ok(saved.some(p=>p.id==='other-tab'));expectDraft(container);cleanup();
  });
  await check('Overlapping cross-tab project edits reject before updating either the project or chat store', ({ctx, container, storage, seeds, dialogs, toasts}) => {
    const source=seeds[0].chats[0];storage.set('chats',[{...source,projectId:seeds[0].id}]);
    const cleanup=render(container,ctx);const action=menu(container,'chat',source.id);event(action.option('rename'),'click');
    const form=dialogs.at(-1).querySelector('form');form.elements.name.value='My pending rename';
    const latest=storage.get('projects');latest[0].chats[0].title='Other reviewer title';storage.set('projects',latest);const chats=storage.get('chats');
    event(form,'submit');assert.deepEqual(storage.get('projects'),latest);assert.deepEqual(storage.get('chats'),chats);assert.equal(dialogs.at(-1).closed,undefined);assert.equal(form.elements.name.value,'My pending rename');assert.ok(toasts.some(message=>/another tab/.test(message)));cleanup();
  });
  await check('Project screenings show only linked canonical reports, newest first, with exact report links and honest outcomes', async ({ctx, container, seeds, storage}) => {
    const reports=[savedScreening('other',seeds[1].id),savedScreening('unlinked',''),savedScreening('older',seeds[0].id,{createdAt:'2026-10-13T09:00:00Z',name:'Earlier check'}),savedScreening('new &/report',seeds[0].id,{name:'Name <script> & Co',failed:'ofac'})];
    storage.set('screening-reports',reports);const before=storage.get('projects');const cleanup=render(container,ctx);await tick();
    const rows=container.querySelectorAll('[data-project-report]');assert.deepEqual(rows.map(row=>row.dataset.projectReport),['new &/report','older']);
    assert.equal(container.querySelector('[data-screening-count]').textContent,'2');assert.match(rows[0].textContent,/Checks incomplete/);assert.match(rows[1].textContent,/No sanctions name matches found/);assert.doesNotMatch(rows[0].textContent,/clear/i);
    assert.equal(rows[0].querySelector('script'),null);assert.match(rows[0].textContent,/Name <script> & Co/);
    assert.equal(rows[0].dataset.nav,'/screening?report=new%20%26%2Freport&project='+encodeURIComponent(seeds[0].id));assert.equal(rows[0].attrs.href,'#'+rows[0].dataset.nav);
    assert.ok(container.querySelectorAll('[data-nav]').some(link=>link.dataset.nav==='/screening?project='+encodeURIComponent(seeds[0].id)));
    assert.deepEqual(storage.get('screening-reports'),reports);assert.deepEqual(storage.get('projects'),before);cleanup();
  });
  await check('Delayed screening load and filtering preserve the exact project composer and focus', async ({ctx, container, seeds, storage}) => {
    let finish;ctx.screeningHistory.ready=()=>new Promise(resolve=>{finish=resolve;});storage.set('screening-reports',[savedScreening('one',seeds[0].id,{name:'Alpha'}),savedScreening('two',seeds[0].id,{name:'Beta'})]);
    const cleanup=render(container,ctx);assert.match(container.querySelector('[data-screening-list]').textContent,/Loading saved screenings/);assert.doesNotMatch(container.textContent,/No saved screenings yet/);
    setDraft(container);const composer=container.querySelector('.project-composer textarea');composer.focus();composer.selectionStart=2;composer.selectionEnd=8;
    const search=container.querySelector('[data-search="screenings"]');search.value='beta';event(search,'input');await Promise.resolve();finish();await tick();
    assert.strictEqual(container.querySelector('.project-composer textarea'),composer);assert.strictEqual(document.activeElement,composer);assert.equal(composer.selectionStart,2);expectDraft(container);
    assert.equal(container.querySelector('[data-search="screenings"]').value,'beta');assert.deepEqual(container.querySelectorAll('[data-project-report]').map(row=>row.dataset.projectReport),['two']);
    search.value='missing';event(search,'input');assert.match(container.querySelector('[data-screening-list]').textContent,/No matching screenings/);assert.equal(container.querySelector('[data-screening-count]').textContent,'2');cleanup();
  });
  await check('Screening storage failure is not an empty project and retry recovers without changing reports', async ({ctx, container, seeds, storage}) => {
    const reports=[savedScreening('recover',seeds[0].id)];storage.set('screening-reports',reports);let unavailable=true,refreshes=0;
    ctx.screeningHistory.ready=async()=>{if(unavailable)throw Error('Storage blocked');};ctx.screeningHistory.refresh=async()=>{refreshes++;};
    const cleanup=render(container,ctx);await tick();assert.match(container.querySelector('[data-screening-list]').textContent,/could not be loaded/);assert.doesNotMatch(container.querySelector('[data-screening-list]').textContent,/No saved screenings/);assert.equal(container.querySelector('[data-screening-count]').textContent,'—');
    unavailable=false;event(container.querySelector('[data-action="retry-screenings"]'),'click');await tick();assert.equal(refreshes,1);assert.equal(container.querySelector('[data-project-report]').dataset.projectReport,'recover');assert.deepEqual(storage.get('screening-reports'),reports);cleanup();
  });
  await check('Reassignment and cross-tab saves refresh project membership without duplicate storage or losing a draft', async ({ctx, container, seeds, storage}) => {
    storage.set('screening-reports',[savedScreening('move',seeds[0].id)]);let notify,unsubscribed=false,closed=false;
    ctx.screeningHistory.subscribe=listener=>{notify=listener;return()=>{unsubscribed=true;};};ctx.screeningHistory.close=async()=>{closed=true;};
    const cleanup=render(container,ctx);await tick();assert.equal(container.querySelectorAll('[data-project-report]').length,1);setDraft(container);const composer=container.querySelector('.project-composer textarea');
    const moved=storage.get('screening-reports');moved[0].query.projectId=seeds[1].id;storage.set('screening-reports',moved);notify({type:'external-change'});await tick();
    assert.equal(container.querySelectorAll('[data-project-report]').length,0);assert.match(container.querySelector('[data-screening-list]').textContent,/No saved screenings yet/);assert.strictEqual(container.querySelector('.project-composer textarea'),composer);expectDraft(container);assert.equal(storage.get('screening-reports').length,1);
    cleanup();assert.equal(unsubscribed,true);assert.equal(closed,false);const html=container.innerHTML;notify({type:'external-change'});await tick();assert.equal(container.innerHTML,html);
  });
  await check('Leaving a project during delayed history loading does not alter the next page', async ({ctx, container}) => {
    let finish;ctx.screeningHistory.ready=()=>new Promise(resolve=>{finish=resolve;});const cleanup=render(container,ctx);await Promise.resolve();cleanup();container.innerHTML='<p>Next screen</p>';finish();await tick();assert.equal(container.textContent,'Next screen');
  });
  await check('Project starter copy updates only exact original text and preserves user edits', ({storage, seeds}) => {
    const projects = storage.get('projects');
    projects[0].chats[0].prompt = 'Review the key risks in the demonstration Aurora share purchase agreement.';
    projects[0].chats[1].prompt = 'My fictional acquisition prompt — retain my wording';
    projects[0].files[0].content = 'My demo document — retain my wording';
    projects.push({id: 'custom-project', chats: [{id: seeds[0].chats[0].id, prompt: projects[0].chats[0].prompt}], files: []});
    storage.set('projects', projects);
    const refreshed = ensureProjects(storage);
    assert.equal(refreshed[0].chats[0].prompt, 'Review the key risks in the Aurora share purchase agreement.');
    assert.equal(refreshed[0].chats[1].prompt, projects[0].chats[1].prompt);
    assert.equal(refreshed[0].files[0].content, projects[0].files[0].content);
    assert.equal(refreshed.at(-1).chats[0].prompt, projects.at(-1).chats[0].prompt);
    assert.deepEqual(storage.get('projects'), refreshed);
  });
  await check('Project chrome is clean and unavailable file content is stated accurately', ({ctx, container, dialogs}) => {
    let cleanup = render(container, ctx);
    assert.doesNotMatch(container.textContent, /demo|fictional|prototype|local preview/i);
    event(container.querySelector('[data-preview="aurora-disclosure"]'), 'click');
    assert.match(dialogs.at(-1).textContent, /Preview unavailable/);
    assert.match(dialogs.at(-1).textContent, /File content is not available/);
    assert.doesNotMatch(dialogs.at(-1).textContent, /demo|fictional|prototype/i);
    cleanup();
    ctx.route = ['projects']; cleanup = render(container, ctx);
    assert.doesNotMatch(container.textContent, /demo|fictional|prototype|local matter|design preview/i);
    cleanup();
  });
  await check('Project pin retains unfinished composer and chat/file searches', ({ctx, container, storage}) => {
    const cleanup = render(container, ctx); setDraft(container);
    event(container.querySelector('[data-action="pin-current"]'), 'click');
    expectDraft(container); assert.equal(storage.get('projects')[0].pinned, false);
    assert.equal(document.activeElement, container.querySelector('[data-action="pin-current"]')); cleanup();
  });
  await check('Chat pin retains filtered results and restores its options focus', ({ctx, container, seeds, storage}) => {
    const cleanup = render(container, ctx); setDraft(container);
    const id = seeds[0].chats[2].id, action = menu(container, 'chat', id); event(action.option('pin'), 'click'); expectDraft(container);
    assert.equal(storage.get('projects')[0].chats.find(chat => chat.id === id).pinned, true);
    assert.equal(document.activeElement.dataset.id, id); assert.equal(document.activeElement.isConnected, true); cleanup();
  });
  await check('Failed project creation keeps dialog and entered values; retry saves once', ({ctx, container, reject, dialogs, navigations, storage}) => {
    ctx.route = ['projects']; const cleanup = render(container, ctx); event(container.querySelector('[data-action="create"]'), 'click');
    const dialog = dialogs.at(-1), form = dialog.querySelector('form'); form.elements.name.value = 'New matter'; form.elements.description.value = 'Preserve my text';
    reject(); event(form, 'submit'); assert.equal(navigations.length, 0); assert.equal(dialog.closed, undefined); assert.equal(form.elements.name.value, 'New matter'); assert.equal(storage.get('projects').length, 3);
    reject(false); event(form, 'submit'); assert.equal(navigations.length, 1); assert.equal(dialog.closed, true); assert.equal(storage.get('projects').length, 4); assert.equal(storage.get('projects').at(-1).name, 'New matter'); cleanup();
  });
  await check('Rejected pin and file removal leave stored and visible state unchanged', ({ctx, container, seeds, reject, storage}) => {
    const cleanup = render(container, ctx); reject(); event(container.querySelector('[data-action="pin-current"]'), 'click');
    assert.equal(storage.get('projects')[0].pinned, true); assert.equal(container.querySelector('[data-action="pin-current"]').attrs['aria-pressed'], 'true');
    const action = menu(container, 'file', seeds[0].files[0].id); event(action.option('remove'), 'click');
    assert.equal(storage.get('projects')[0].files.length, 3); assert.equal(container.querySelectorAll('.project-file-row').length, 3);
    reject(false); event(container.querySelector('[data-action="pin-current"]'), 'click'); assert.equal(storage.get('projects')[0].files.length, 3); cleanup();
  });
  await check('Rename rolls the chat store back when the project save fails and preserves the form for retry', ({ctx, container, storage, seeds, reject, dialogs}) => {
    const source = seeds[0].chats[0], original = {...source, projectId: seeds[0].id, messages: [{role: 'user', text: 'Keep conversation'}]}; storage.set('chats', [original]);
    const cleanup = render(container, ctx), action = menu(container, 'chat', source.id); event(action.option('rename'), 'click');
    const dialog = dialogs.at(-1), form = dialog.querySelector('form'); form.elements.name.value = 'Updated chat title';
    reject('projects'); event(form, 'submit'); assert.deepEqual(storage.get('chats'), [original]); assert.equal(storage.get('projects')[0].chats[0].title, source.title); assert.equal(dialog.closed, undefined); assert.equal(form.elements.name.value, 'Updated chat title');
    reject(false); event(form, 'submit'); assert.equal(dialog.closed, true); assert.equal(storage.get('projects')[0].chats[0].title, 'Updated chat title'); assert.equal(storage.get('chats')[0].title, 'Updated chat title'); assert.deepEqual(storage.get('chats')[0].messages, original.messages); cleanup();
  });
  await check('Move fails without splitting project membership, then retry moves the chat exactly once', ({ctx, container, storage, seeds, reject, dialogs}) => {
    const source = seeds[0].chats[0], original = {...source, projectId: seeds[0].id}; storage.set('chats', [original]);
    const cleanup = render(container, ctx), action = menu(container, 'chat', source.id); event(action.option('move'), 'click');
    const dialog = dialogs.at(-1), form = dialog.querySelector('form'); form.elements.destination.value = seeds[1].id;
    reject('projects'); event(form, 'submit'); assert.equal(storage.get('chats')[0].projectId, seeds[0].id); assert.equal(storage.get('projects')[0].chats.filter(chat => chat.id === source.id).length, 1); assert.equal(storage.get('projects')[1].chats.filter(chat => chat.id === source.id).length, 0); assert.equal(dialog.closed, undefined);
    reject(false); event(form, 'submit'); const projects = storage.get('projects'); assert.equal(dialog.closed, true); assert.equal(storage.get('chats')[0].projectId, seeds[1].id); assert.equal(projects[0].chats.filter(chat => chat.id === source.id).length, 0); assert.equal(projects[1].chats.filter(chat => chat.id === source.id).length, 1); cleanup();
  });
  await check('A delayed upload merges into current storage after navigation without clobbering a new project or rename', async api => {
    const {ctx, container, storage, seeds} = api;
    const cleanup = render(container, ctx); let finish;
    const file = {name: 'Late note.txt', type: 'text/plain', size: 10, text: () => new Promise(resolve => {finish = resolve;})};
    const input = container.querySelector('.project-file-input'); event(input, 'change', {target: Object.assign(input, {files: [file]})}); cleanup();
    const latest = storage.get('projects'); latest[0].name = 'Renamed in the next screen'; latest.push({id: 'new-project', name: 'New project elsewhere', chats: [], files: []}); storage.set('projects', latest);
    finish('Text contents'); await Promise.resolve(); await Promise.resolve();
    const saved = storage.get('projects'); assert.equal(saved.length, 4); assert.equal(saved[0].name, 'Renamed in the next screen'); assert.equal(saved[0].files.length, seeds[0].files.length + 1); assert.equal(saved[0].files.at(-1).content, 'Text contents'); assert.equal(api.sidebarRefreshes, 0);
  });
  await check('Upload completion retains the active composer, selection and filtered resource lists', async ({ctx, container}) => {
    const cleanup = render(container, ctx); setDraft(container); const draft = container.querySelector('.project-composer textarea'); draft.focus(); draft.selectionStart = 3; draft.selectionEnd = 6;
    const originalSelection = Element.prototype.setSelectionRange;
    Element.prototype.setSelectionRange = function(start, end) {this.selectionStart = start; this.selectionEnd = end;};
    try {const input = container.querySelector('.project-file-input'); input.files = [{name: 'Other.txt', type: 'text/plain', size: 5, text: async () => 'hello'}]; event(input, 'change'); await Promise.resolve(); await Promise.resolve();
      expectDraft(container); assert.equal(document.activeElement, container.querySelector('.project-composer textarea')); assert.equal(document.activeElement.selectionStart, 3); assert.equal(document.activeElement.selectionEnd, 6);
    } finally {Element.prototype.setSelectionRange = originalSelection; cleanup();}
  });
  await check('Project edit opened during an upload saves onto the fresh collection and retries without losing the file', async ({ctx, container, storage, seeds, dialogs, reject}) => {
    const cleanup = render(container, ctx); let finish;
    const input = container.querySelector('.project-file-input'); input.files = [{name:'Pending project note.txt',type:'text/plain',size:10,text:()=>new Promise(resolve=>{finish=resolve;})}]; event(input,'change');
    const action=menu(container,'project',seeds[0].id); event(action.option('edit'),'click');
    const dialog=dialogs.at(-1),form=dialog.querySelector('form'); form.elements.name.value='Name entered during upload'; form.elements.description.value='Description entered during upload';
    finish('Keep the uploaded contents'); await Promise.resolve(); await Promise.resolve();
    reject('projects'); event(form,'submit'); assert.equal(dialog.closed,undefined); assert.equal(form.elements.name.value,'Name entered during upload'); assert.equal(storage.get('projects')[0].name,seeds[0].name); assert.equal(storage.get('projects')[0].files.at(-1).content,'Keep the uploaded contents');
    reject(false); event(form,'submit'); const project=storage.get('projects')[0]; assert.equal(project.name,'Name entered during upload'); assert.equal(project.description,'Description entered during upload'); assert.equal(project.files.at(-1).content,'Keep the uploaded contents'); assert.equal(project.files.length,seeds[0].files.length+1); assert.equal(dialog.closed,true); cleanup();
  });
  await check('Chat rename opened during an upload keeps project and global titles consistent after a rejected save and retry', async ({ctx, container, storage, seeds, dialogs, reject}) => {
    const source=seeds[0].chats[0]; storage.set('chats',[{...source,projectId:seeds[0].id,messages:[{role:'user',text:'Keep this turn'}]}]);
    const cleanup=render(container,ctx); let finish; const input=container.querySelector('.project-file-input'); input.files=[{name:'Pending chat note.txt',type:'text/plain',size:10,text:()=>new Promise(resolve=>{finish=resolve;})}]; event(input,'change');
    const action=menu(container,'chat',source.id); event(action.option('rename'),'click'); const dialog=dialogs.at(-1),form=dialog.querySelector('form'); form.elements.name.value='Rename with file pending';
    finish('Chat context'); await Promise.resolve(); await Promise.resolve(); reject('projects'); event(form,'submit'); assert.equal(dialog.closed,undefined); assert.equal(storage.get('chats')[0].title,source.title); assert.equal(storage.get('projects')[0].chats[0].title,source.title);
    reject(false); event(form,'submit'); assert.equal(storage.get('chats')[0].title,'Rename with file pending'); assert.equal(storage.get('projects')[0].chats[0].title,'Rename with file pending'); assert.equal(storage.get('projects')[0].files.at(-1).content,'Chat context'); assert.equal(storage.get('chats')[0].messages[0].text,'Keep this turn'); assert.equal(dialog.closed,true); cleanup();
  });
  await check('Chat move opened during an upload carries the fresh chat metadata and leaves the new file in its source project', async ({ctx, container, storage, seeds, dialogs, reject}) => {
    const source=seeds[0].chats[0]; storage.set('chats',[{...source,projectId:seeds[0].id}]);
    const cleanup=render(container,ctx); let finish; const input=container.querySelector('.project-file-input'); input.files=[{name:'Source project note.txt',type:'text/plain',size:10,text:()=>new Promise(resolve=>{finish=resolve;})}]; event(input,'change');
    const action=menu(container,'chat',source.id); event(action.option('move'),'click'); const dialog=dialogs.at(-1),form=dialog.querySelector('form'); form.elements.destination.value=seeds[1].id;
    const latest=storage.get('projects'); latest[0].chats[0].title='Current chat title'; latest[0].chats[0].pinned=false; storage.set('projects',latest); const chats=storage.get('chats'); chats[0].title='Current chat title'; chats[0].pinned=false; storage.set('chats',chats);
    finish('Stay in the source matter'); await Promise.resolve(); await Promise.resolve(); reject('projects'); event(form,'submit'); assert.equal(dialog.closed,undefined); assert.equal(storage.get('chats')[0].projectId,seeds[0].id); assert.equal(storage.get('projects')[0].chats[0].title,'Current chat title');
    reject(false); event(form,'submit'); const saved=storage.get('projects'),moved=saved[1].chats.find(chat=>chat.id===source.id); assert.equal(saved[0].chats.some(chat=>chat.id===source.id),false); assert.equal(moved.title,'Current chat title'); assert.equal(moved.pinned,false); assert.equal(saved[0].files.at(-1).content,'Stay in the source matter'); assert.equal(saved[1].chats.filter(chat=>chat.id===source.id).length,1); assert.equal(storage.get('chats')[0].projectId,seeds[1].id); cleanup();
  });
  await check('First opening a pinned seed chat preserves its pin and date in the global chat and options menu', ({ctx, container, storage, seeds}) => {
    const previousLocalStorage=globalThis.localStorage; let cleanup;
    document.getElementById=id=>document.querySelector('#'+id); document.createElement=tag=>{const node=new Element(tag); if(tag==='dialog'){node.showModal=()=>{};node.close=()=>{};}return node;};
    globalThis.localStorage={getItem:key=>JSON.stringify(storage.get(key.replace('neolaw.design.',''),null)),setItem:(key,value)=>storage.set(key.replace('neolaw.design.',''),JSON.parse(value))};
    const header=new Element('header'); document.body.append(header); const source=seeds[0].chats[0]; assert.equal(source.pinned,true);
    try {
      cleanup=renderChat(container,{...ctx,route:['chat',source.id],params:new URLSearchParams({project:seeds[0].id}),setHeader(_title,html){header.innerHTML=html;}});
      const chat=storage.get('chats')[0]; assert.equal(chat.pinned,true); assert.equal(chat.updatedAt,source.updatedAt); assert.equal(chat.title,source.title); assert.equal(chat.projectId,seeds[0].id);
      header.querySelector('#chat-options').click(); assert.equal(document.querySelector('#pin-chat').textContent,'Unpin chat'); assert.equal(storage.get('projects')[0].chats[0].pinned,true);
    } finally {cleanup?.();if(previousLocalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousLocalStorage;}
  });
  await check('Menu supports Home, End, Escape and Tab dismissal without detached focus', ({ctx, container, seeds}) => {
    const cleanup = render(container, ctx); const action = menu(container, 'chat', seeds[0].chats[0].id);
    event(document.activeElement, 'keydown', {key: 'End'}); assert.equal(document.activeElement.dataset.menuAction, 'move');
    event(document.activeElement, 'keydown', {key: 'Home'}); assert.equal(document.activeElement.dataset.menuAction, 'rename');
    event(document.activeElement, 'keydown', {key: 'Tab'}); assert.equal(container.querySelector('.project-dropdown'), null); assert.equal(document.activeElement, action.trigger);
    event(action.trigger, 'click'); event(document.activeElement, 'keydown', {key: 'Escape'}); assert.equal(document.activeElement, action.trigger); assert.equal(action.trigger.attrs['aria-expanded'], 'false'); cleanup();
  });
  await check('IME Enter does not submit while a character is still being composed', ({ctx, container}) => {
    const cleanup = render(container, ctx); const input = container.querySelector('.project-composer textarea'); let submits = 0; input.form = {requestSubmit() {submits++;}};
    event(input, 'keydown', {key: 'Enter', isComposing: true}); assert.equal(submits, 0);
    event(input, 'keydown', {key: 'Enter', shiftKey: true}); assert.equal(submits, 0);
    event(input, 'keydown', {key: 'Enter', isComposing: false}); assert.equal(submits, 1); cleanup();
  });
  for (const kind of ['chats', 'files']) {
    await check(`Upload completion restores the focused ${kind} search and its text selection`, async ({ctx, container}) => {
      const originalRange = Element.prototype.setSelectionRange, originalFocus = Element.prototype.focus;
      Element.prototype.setSelectionRange = function(start, end) {this.selectionStart=start;this.selectionEnd=end;};
      Element.prototype.focus = function(options) {this.focusOptions=options;originalFocus.call(this);};
      const cleanup=render(container,ctx);
      try {
        let finish;const picker=container.querySelector('.project-file-input');picker.files=[{name:'Delayed search note.txt',type:'text/plain',size:5,text:()=>new Promise(resolve=>{finish=resolve;})}];event(picker,'change');
        const search=container.querySelector(`[data-search="${kind}"]`);search.value=kind==='chats'?'warrant':'notes';event(search,'input');search.focus();search.selectionStart=1;search.selectionEnd=4;
        finish('hello');await Promise.resolve();await Promise.resolve();
        const restored=container.querySelector(`[data-search="${kind}"]`);assert.notStrictEqual(restored,search);assert.equal(search.isConnected,false);assert.equal(restored.value,search.value);assert.strictEqual(document.activeElement,restored);assert.equal(restored.selectionStart,1);assert.equal(restored.selectionEnd,4);assert.deepEqual(restored.focusOptions,{preventScroll:true});
        assert.equal(container.querySelectorAll(kind==='chats'?'.project-chat-row':'.project-file-row').length,1);
      } finally {cleanup();Element.prototype.setSelectionRange=originalRange;Element.prototype.focus=originalFocus;}
    });
  }
  await check('Upload redraw does not take focus or selection from an open project dialog', async ({ctx, container, seeds, dialogs}) => {
    const cleanup=render(container,ctx);let finish;const picker=container.querySelector('.project-file-input');picker.files=[{name:'Dialog context.txt',type:'text/plain',size:5,text:()=>new Promise(resolve=>{finish=resolve;})}];event(picker,'change');
    const action=menu(container,'project',seeds[0].id);event(action.option('edit'),'click');const name=dialogs.at(-1).querySelector('[name="name"]');name.value='Unfinished dialog name';name.focus();name.selectionStart=2;name.selectionEnd=8;
    finish('hello');await Promise.resolve();await Promise.resolve();assert.strictEqual(document.activeElement,name);assert.equal(name.isConnected,true);assert.equal(name.value,'Unfinished dialog name');assert.equal(name.selectionStart,2);assert.equal(name.selectionEnd,8);cleanup();
  });
  await check('Project drafts survive route remounts independently and stay out of saved project/chat records', ({ctx, container, seeds, storage}) => {
    const before=storage.get('projects');let cleanup=render(container,ctx);let input=container.querySelector('.project-composer textarea');input.value='  Compare the agreement and notes\nKeep the notice period.  ';event(input,'input');cleanup();container.innerHTML='';
    cleanup=render(container,{...ctx,route:['projects',seeds[1].id]});input=container.querySelector('.project-composer textarea');assert.equal(input.value,'');input.value='Prepare the employment checklist';event(input,'input');cleanup();container.innerHTML='';
    cleanup=render(container,ctx);assert.equal(container.querySelector('.project-composer textarea').value,'  Compare the agreement and notes\nKeep the notice period.  ');assert.equal(container.querySelector('.project-send').disabled,false);assert.deepEqual(readComposerDraft('project:'+seeds[0].id).attachments,[]);cleanup();container.innerHTML='';
    cleanup=render(container,{...ctx,route:['projects',seeds[1].id]});assert.equal(container.querySelector('.project-composer textarea').value,'Prepare the employment checklist');assert.deepEqual(storage.get('projects'),before);assert.deepEqual(storage.get('chats',[]),[]);cleanup();
  });
  await check('Rejected project-chat creation retains its draft across remount; accepted retry clears it once', ({ctx, container, seeds}) => {
    let accept=false;const attempts=[];ctx.startChat=options=>{attempts.push(options);return accept;};let cleanup=render(container,ctx);let form=container.querySelector('.project-composer'),input=form.querySelector('textarea');form.elements={prompt:input};input.value='  Summarise this matter  ';event(input,'input');event(form,'submit');
    assert.equal(input.value,'  Summarise this matter  ');assert.equal(readComposerDraft('project:'+seeds[0].id).text,input.value);assert.equal(container.querySelector('.project-send').disabled,false);cleanup();container.innerHTML='';
    cleanup=render(container,ctx);form=container.querySelector('.project-composer');input=form.querySelector('textarea');form.elements={prompt:input};assert.equal(input.value,'  Summarise this matter  ');accept=true;event(form,'submit');assert.equal(attempts.length,2);assert.equal(attempts[1].prompt,'Summarise this matter');assert.equal(attempts[1].projectId,seeds[0].id);assert.equal(readComposerDraft('project:'+seeds[0].id).text,'');assert.equal(input.value,'');assert.equal(container.querySelector('.project-send').disabled,true);cleanup();container.innerHTML='';
    cleanup=render(container,ctx);assert.equal(container.querySelector('.project-composer textarea').value,'');cleanup();
  });
  await check('Synchronous navigation after accepted project chat cannot resave its submitted draft', ({ctx, container, seeds}) => {
    let cleanup,submitted;ctx.startChat=options=>{submitted=options;cleanup();container.innerHTML='';return true;};cleanup=render(container,ctx);const form=container.querySelector('.project-composer'),input=form.querySelector('textarea');form.elements={prompt:input};
    event(container.querySelector('[data-prompt]'),'click');assert.equal(readComposerDraft('project:'+seeds[0].id).text,input.value);event(form,'submit');assert.equal(submitted.projectId,seeds[0].id);assert.equal(readComposerDraft('project:'+seeds[0].id).text,'');cleanup=render(container,ctx);assert.equal(container.querySelector('.project-composer textarea').value,'');assert.equal(container.querySelector('.project-send').disabled,true);cleanup();
  });
  console.log(`\n${passed} project state and keyboard callback checks passed. Browser rendering, native file selection and real Tab traversal remain unverified.`);
} finally {
  Object.defineProperty(Element.prototype, 'value', originalValue);
  Element.prototype.matches = originalMatches;
  for (const [key, value] of Object.entries(originals)) {if (value === undefined) delete globalThis[key]; else globalThis[key] = value;}
}
