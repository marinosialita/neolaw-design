import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {escape, icon} from '../core.js';
import {render, libraryItems} from '../modules/library.js';

// Structural DOM/callback checks. No browser rendering, network or model is used.
let passed = 0;
function check(name, run) { run(); passed++; console.log(`PASS ${name}`); }
function withLibrary(params, run, initialStore = {}) {
  const globals = ['document', 'window', 'history', 'location'];
  const prior = Object.fromEntries(globals.map(key => [key, globalThis[key]]));
  const document = new Element('document'), body = new Element('body');
  document.body = body; document.append(body); document.activeElement = null;
  globalThis.document = document;
  globalThis.window = {matchMedia: () => ({matches: true})};
  globalThis.location = {pathname: '/', search: ''};
  globalThis.history = {replaceState() {}};
  const container = new Element('main'); body.append(container);
  const state = {dialog: null, title: '', starts: [], routes: [], downloads: [], toasts: [], failStart: false, failSave: false};
  const store = new Map(Object.entries(initialStore));
  function hydrate(root) {
    root.querySelectorAll('textarea').forEach(field => { field.value = field.textContent; });
    root.querySelectorAll('select').forEach(field => { field.value = field.querySelector('option[selected]')?.value || field.querySelector('option')?.textContent || ''; });
    root.querySelectorAll('input, textarea').forEach(field => {
      field.setCustomValidity = value => { field.validationMessage = value; };
      field.reportValidity = () => !field.validationMessage;
    });
  }
  const ctx = {
    params: new URLSearchParams(params), escape, icon,
    setHeader() {},
    storage: {get: (key, fallback) => store.get(key) ?? fallback, set(key, value) { if (state.failSave) return false; store.set(key, value); return true; }},
    toast: value => state.toasts.push(value),
    startChat(options) { state.starts.push(options); return !state.failStart; },
    navigate: value => state.routes.push(value),
    download: (...args) => state.downloads.push(args),
    modal({title, body: html, onMount}) {
      const before = document.activeElement;
      const dialog = new Element('dialog', {open: ''}); dialog.innerHTML = '<button data-close aria-label="Close dialog"></button>' + html; body.append(dialog); hydrate(dialog);
      state.dialog = dialog; state.title = title;
      let closed = false;
      const close = () => { if (closed) return; closed = true; dialog.remove(); if (state.dialog === dialog) state.dialog = null; before?.focus(); };
      dialog.querySelector('[data-close]').onclick = close;
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
      onMount?.(dialog, close); return close;
    }
  };
  let cleanup;
  try { cleanup = render(container, ctx); run({container, state, store, document, body, ctx}); }
  finally { cleanup?.(); for (const key of globals) prior[key] === undefined ? delete globalThis[key] : globalThis[key] = prior[key]; }
}

console.log('Library and workflow source/callback verification');
console.log('DOM doubles do not establish visual layout, native focus behavior or animation.\n');

check('Every workflow deep link opens its configuration instead of starting chat', () => {
  for (const item of libraryItems.filter(item => item.type === 'workflows')) {
    withLibrary(`tab=workflows&item=${item.id}`, ({container, state}) => {
      assert.equal(container.querySelector('[aria-selected="true"]').dataset.libraryTab, 'workflows');
      assert.equal(state.title, item.title);
      assert.equal(state.starts.length, 0);
      assert.equal(state.dialog.querySelectorAll('.library-steps li').length, item.steps.length);
      assert.ok(state.dialog.textContent.includes('automatic analysis is unavailable'));
      assert.ok(state.dialog.querySelector('#library-workflow-context').value.length > 40);
    });
  }
});
check('Deep links choose the item category and ignore unknown or deleted items', () => {
  withLibrary('tab=tools&item=workflow-litigation', ({container, state}) => {
    assert.equal(container.querySelector('[aria-selected="true"]').dataset.libraryTab, 'workflows');
    assert.equal(state.title, 'Litigation briefing');
  });
  withLibrary('tab=prompts&item=missing', ({container, state}) => {
    assert.equal(container.querySelector('[aria-selected="true"]').dataset.libraryTab, 'prompts');
    assert.equal(state.dialog, null);
  });
  withLibrary('tab=prompts&item=custom-deleted', ({state}) => assert.equal(state.dialog, null), {
    'library-custom-prompts': [{id: 'custom-deleted', type: 'prompts', title: 'Deleted', prompt: 'Old instructions', deletedAt: '2026-10-11'}]
  });
});
check('Malformed saved-library state cannot blank the page', () => {
  for (const saved of [17, {unexpected: true}, ['review', null, 2]]) {
    withLibrary('', ({container}) => assert.equal(container.querySelectorAll('.library-card').length, 11), {'library-saved': saved});
  }
});
check('Workflow briefs retain context limitations, download their content and preserve customized launch inputs', () => {
  for (const item of libraryItems.filter(item => item.type === 'workflows')) {
    withLibrary(`item=${item.id}`, ({state, document}) => {
      const dialog = state.dialog, context = dialog.querySelector('#library-workflow-context');
      context.value = 'User-provided context which differs from the fictional sample.';
      dialog.querySelector('#library-workflow-focus').value = 'Client priorities first';
      dialog.querySelector('#library-workflow-notes').value = 'Keep the unresolved dates visible.';
      dialog.querySelector('[data-workflow-preview]').click();
      const result = dialog.querySelector('.library-workflow-result');
      assert.equal(result.hidden, false); assert.strictEqual(document.activeElement, result);
      assert.ok(result.textContent.includes('automatic analysis is unavailable'));
      assert.ok(!result.textContent.includes(context.value));
      dialog.querySelector('[data-workflow-download]').click();
      const [name, content, type] = state.downloads[0];
      assert.equal(name, `${item.id}-brief.txt`); assert.equal(type, 'text/plain');
      assert.ok(content.startsWith('NEOLAW · WORKFLOW BRIEF'));
      assert.ok(content.includes(result.querySelector('h3').textContent));
      assert.ok(!content.includes(context.value));
      state.failStart = true;
      dialog.querySelector('[data-workflow-followup]').click();
      assert.strictEqual(state.dialog, dialog); assert.equal(context.value, 'User-provided context which differs from the fictional sample.');
      const attempt = state.starts.at(-1);
      assert.equal(attempt.tool, item.tool); assert.equal(attempt.title, item.title);
      for (const value of [item.prompt, context.value, 'Client priorities first', 'Keep the unresolved dates visible.', 'practical next-actions list']) assert.ok(attempt.prompt.includes(value));
      state.failStart = false; dialog.querySelector('[data-workflow-followup]').click();
      assert.equal(state.dialog, null);
    });
  }
});
check('Blank workflow context stops launch and sample reset restores usable content', () => {
  withLibrary('item=workflow-contract', ({state}) => {
    const dialog = state.dialog, context = dialog.querySelector('#library-workflow-context'), sample = context.value;
    context.value = '   '; dialog.querySelector('[data-workflow-start]').click();
    assert.equal(state.starts.length, 0); assert.ok(context.validationMessage);
    dialog.querySelector('[data-workflow-reset]').click();
    assert.equal(context.value, sample); assert.equal(context.validationMessage, '');
    dialog.querySelector('[data-workflow-start]').click(); assert.equal(state.starts.length, 1); assert.equal(state.dialog, null);
  });
});
check('Prompt deep links retain edited instructions if chat creation fails', () => {
  withLibrary('item=prompt-lease', ({state}) => {
    const dialog = state.dialog, field = dialog.querySelector('#library-prompt-input');
    field.value = 'Specific tenant-side lease instructions.'; state.failStart = true;
    dialog.querySelector('[data-detail-launch]').click();
    assert.strictEqual(state.dialog, dialog); assert.equal(state.starts[0].prompt, field.value);
    state.failStart = false; dialog.querySelector('[data-detail-launch]').click(); assert.equal(state.dialog, null);
  });
});
check('Matrix deep link opens the review table without creating a chat', () => {
  withLibrary('item=tool-matrix', ({state}) => {
    state.dialog.querySelector('[data-matrix-open]').click();
    assert.deepEqual(state.routes, ['/matrix']); assert.equal(state.starts.length, 0); assert.equal(state.dialog, null);
  });
});
check('Screening opens its dedicated workspace, preserving matter context and a failed launch', () => {
  withLibrary('item=screening&project=matter-1', ({state}) => {
    assert.equal(state.title, 'Screen a client');
    assert.equal(state.dialog.querySelector('#library-prompt-input'), null);
    const dialog = state.dialog;
    state.failStart = true;
    dialog.querySelector('[data-screening-open]').click();
    assert.strictEqual(state.dialog, dialog);
    assert.equal(state.starts[0].tool, 'screening');
    assert.equal(state.starts[0].projectId, 'matter-1');
    state.failStart = false;
    dialog.querySelector('[data-screening-open]').click();
    assert.equal(state.dialog, null);
    assert.equal(state.starts.length, 2);
    assert.deepEqual(state.routes, []);
  });
});
check('Tab keys wrap categories and focus the freshly rendered selected tab', () => {
  withLibrary('', ({container, document}) => {
    for (const [key, next] of [['ArrowLeft', 'contracts'], ['ArrowLeft', 'workflows'], ['ArrowRight', 'contracts'], ['ArrowRight', 'tools'], ['End', 'workflows'], ['Home', 'contracts']]) {
      const active = container.querySelector('[aria-selected="true"]');
      document.emit('keydown', {target: active, key});
      const selected = container.querySelector('[aria-selected="true"]');
      assert.equal(selected.dataset.libraryTab, next); assert.strictEqual(document.activeElement, selected);
    }
  });
});
check('Contracts precedes Tools while existing tool links retain their selected category', () => {
  for (const [params, expectedTab] of [['tab=contracts', 'contracts'], ['tab=tools', 'tools']]) {
    withLibrary(params, ({container, state}) => {
      assert.deepEqual(container.querySelectorAll('[data-library-tab]').map(tab => tab.dataset.libraryTab), ['contracts', 'tools', 'skills', 'prompts', 'workflows']);
      assert.equal(container.querySelector('[aria-selected="true"]').dataset.libraryTab, expectedTab);
      assert.equal(container.querySelectorAll('.library-card').length, expectedTab === 'tools' ? 11 : 12);
      assert.equal(state.starts.length, 0);
      assert.equal(container.querySelector('#library-results').attrs['aria-labelledby'], `library-tab-${expectedTab}`);
    });
  }
});
check('Contract search includes perspectives, supports category filters and resets an empty result', () => {
  withLibrary('tab=contracts', ({container, state}) => {
    const search = container.querySelector('.library-search input');
    const category = container.querySelector('.library-category-label select');
    // The structural double only matches simple selectors; supply these native
    // descendant matches for the delegated input/change event targets.
    search.matches = selector => selector === '.library-search input' ? !!search.closest('.library-search') : Element.prototype.matches.call(search, selector);
    category.matches = selector => selector === '.library-category-label select' ? !!category.closest('.library-category-label') : Element.prototype.matches.call(category, selector);
    assert.deepEqual(category.querySelectorAll('option').map(option => option.attrs.value), ['all', 'Commercial', 'Corporate', 'Dispute Resolution', 'Employment', 'Finance', 'Property']);
    search.value = '  BoRrOwEr  '; search.emit('input');
    assert.equal(container.querySelectorAll('.library-card').length, 1);
    assert.equal(container.querySelector('.library-card h3').textContent, 'Loan Agreement');
    assert.equal(container.querySelector('.library-result-count').textContent, '1 contract');
    category.value = 'Finance'; category.emit('change');
    assert.equal(container.querySelectorAll('.library-card').length, 1);
    search.value = 'unmatched contract query'; search.emit('input');
    assert.equal(container.querySelectorAll('.library-card').length, 0);
    assert.ok(container.querySelector('.library-empty'));
    container.querySelector('[data-library-reset]').click();
    assert.equal(container.querySelectorAll('.library-card').length, 12);
    assert.equal(container.querySelector('.library-search input').value, '');
    assert.equal(container.querySelector('.library-category-label select').value, 'all');
    assert.equal(state.starts.length, 0);
  });
});
check('All twelve contract details stay internal and can select an agreement in chat', () => {
  const contracts = libraryItems.filter(item => item.type === 'contracts');
  assert.equal(contracts.length, 12);
  for (const item of contracts) {
    withLibrary(`tab=tools&item=${item.id}`, ({container, state}) => {
      assert.equal(container.querySelector('[aria-selected="true"]').dataset.libraryTab, 'contracts');
      assert.equal(state.title, item.title);
      const dialog = state.dialog;
      assert.equal(dialog.querySelector('[data-contract-open]'), null);
      assert.equal(dialog.querySelectorAll('a').length, 0);
      assert.match(dialog.textContent, /Cyprus law/);
      assert.match(dialog.textContent, /Your office/);
      assert.match(dialog.querySelector('.library-contract-empty').textContent, item.kind === 'nda' ? /Reviewed NDA example/ : /No template added yet/);
      assert.doesNotMatch(dialog.textContent, /Lexology|Lawgood|\bUS law\b/i);
      assert.doesNotMatch(container.textContent, /Lexology|Lawgood|\bUS law\b/i);
      assert.equal(container.querySelectorAll('.library-contract-meta').length, 12);
      container.querySelectorAll('.library-contract-meta').forEach(meta => assert.match(meta.textContent, /Cyprus law/));
      const perspectives = dialog.querySelectorAll('.library-contract-perspective');
      assert.equal(perspectives.length, item.perspectives.length);
      perspectives.forEach((label, index) => {
        assert.equal(label.attrs.href, undefined);
        assert.ok(label.textContent.includes(item.perspectives[index].label));
        assert.equal(label.tagName.toLowerCase(), 'span');
      });
      assert.equal(dialog.querySelector('[data-detail-launch]'), null);
      assert.equal(dialog.querySelector('#library-prompt-input'), null);
      assert.equal(state.starts.length, 0);
      assert.deepEqual(state.routes, []);
      dialog.querySelector('[data-contract-select]').click();
      assert.deepEqual(state.routes, ['/chat?contract=' + item.id]);
    });
  }
});
check('Contract bookmarks persist in cards and details without claiming a rejected save', () => {
  withLibrary('tab=contracts', ({container, state, store}) => {
    const id = 'contract-nda';
    state.failSave = true;
    container.querySelector(`[data-library-save="${id}"]`).click();
    assert.equal(container.querySelector(`[data-library-save="${id}"]`).attrs['aria-pressed'], 'false');
    assert.equal(store.has('library-saved'), false);
    state.failSave = false;
    container.querySelector(`[data-library-save="${id}"]`).click();
    assert.deepEqual(store.get('library-saved'), [id]);
    assert.equal(container.querySelector(`[data-library-save="${id}"]`).attrs['aria-pressed'], 'true');
    container.querySelector('[data-library-saved-filter]').click();
    assert.equal(container.querySelectorAll('.library-card').length, 1);
    container.querySelector(`[data-library-open="${id}"]`).click();
    const save = state.dialog.querySelector('[data-detail-save]');
    assert.equal(save.attrs['aria-pressed'], 'true');
    state.failSave = true;
    save.emit('click', {currentTarget: save});
    assert.equal(save.attrs['aria-pressed'], 'true');
    assert.deepEqual(store.get('library-saved'), [id]);
    state.failSave = false;
    save.emit('click', {currentTarget: save});
    assert.equal(save.attrs['aria-pressed'], 'false');
    assert.deepEqual(store.get('library-saved'), []);
    assert.equal(container.querySelectorAll('.library-card').length, 0);
    state.dialog.querySelector('[data-close]').click();
    assert.equal(state.dialog, null);
    container.querySelector('[data-library-reset]').click();
    assert.equal(container.querySelectorAll('.library-card').length, 12);
    assert.equal(container.querySelector('[data-library-saved-filter]').attrs['aria-pressed'], 'false');
    assert.equal(state.starts.length, 0);
  });
});
check('Removing the only saved card retains a useful keyboard target', () => {
  withLibrary('', ({container, document}) => {
    container.querySelector('[data-library-saved-filter]').click();
    assert.equal(container.querySelectorAll('.library-card').length, 1);
    container.querySelector('[data-library-save="review"]').click();
    assert.equal(container.querySelectorAll('.library-card').length, 0);
    assert.strictEqual(document.activeElement, container.querySelector('[data-library-saved-filter]'));
  }, {'library-saved': ['review']});
});
const customPrompt = {id:'custom-roundtrip', type:'prompts', title:'Reusable brief', description:'Original instructions', prompt:'Original reusable instructions.', category:'Your prompts', icon:'message-square', tool:'', custom:true};
check('Edit saved prompt receives current launch instructions; Cancel returns to the exact unfinished launch', () => {
  withLibrary('item=custom-roundtrip', ({state, store, document, body}) => {
    const draft = '  Matter-specific instructions.\nKeep this unfinished line.  ';
    state.dialog.querySelector('#library-prompt-input').value = draft;
    state.dialog.querySelector('[data-custom-edit]').click();
    assert.equal(state.dialog.querySelector('#library-custom-instructions').value, draft);
    state.dialog.querySelector('#library-custom-title').value = 'Discard this editor title';
    state.dialog.querySelector('#library-custom-instructions').value = 'Discard further editor changes';
    state.dialog.querySelector('[data-editor-cancel]').click();
    assert.equal(state.dialog.querySelector('#library-prompt-input').value, draft);
    assert.equal(store.get('library-custom-prompts')[0].prompt, customPrompt.prompt);
    assert.equal(store.get('library-custom-prompts')[0].title, customPrompt.title);
    assert.strictEqual(document.activeElement, state.dialog.querySelector('#library-prompt-input'));
    assert.equal(body.querySelectorAll('dialog').length, 1);
    state.dialog.querySelector('[data-detail-launch]').click();
    assert.equal(state.starts.at(-1).prompt, draft.trim());
  }, {'library-custom-prompts': [{...customPrompt}]});
});
check('Header close, Escape and backdrop dismissal restore the launch draft without saving editor changes', () => {
  for (const action of ['header','escape','backdrop']) {
    withLibrary('item=custom-roundtrip', ({state, store, body}) => {
      state.dialog.querySelector('#library-prompt-input').value = 'Preserve this '+action+' launch draft.';
      state.dialog.querySelector('[data-custom-edit]').click();
      const editor = state.dialog;
      if (action === 'header') editor.querySelector('[data-close]').click();
      else if (action === 'escape') editor.emit('cancel');
      else editor.emit('click');
      assert.equal(state.dialog.querySelector('#library-prompt-input').value, 'Preserve this '+action+' launch draft.');
      assert.equal(body.querySelectorAll('dialog').length, 1);
      assert.equal(store.get('library-custom-prompts')[0].prompt, customPrompt.prompt);
    }, {'library-custom-prompts': [{...customPrompt}]});
  }
});
check('Saving handed-off instructions returns an updated launch; rejected saves keep the editor for retry', () => {
  withLibrary('item=custom-roundtrip', ({state, store}) => {
    state.dialog.querySelector('#library-prompt-input').value = 'My current matter instructions.';
    state.dialog.querySelector('[data-custom-edit]').click();
    const editor = state.dialog;
    editor.querySelector('#library-custom-title').value = 'Updated reusable brief';
    editor.querySelector('#library-custom-instructions').value += '\nInclude the client deadline.';
    state.failSave = true; editor.querySelector('form').emit('submit');
    assert.strictEqual(state.dialog, editor);
    assert.equal(store.get('library-custom-prompts')[0].prompt, customPrompt.prompt);
    assert.equal(editor.querySelector('#library-custom-instructions').value, 'My current matter instructions.\nInclude the client deadline.');
    state.failSave = false; editor.querySelector('form').emit('submit');
    assert.equal(store.get('library-custom-prompts').length, 1);
    assert.equal(store.get('library-custom-prompts')[0].prompt, 'My current matter instructions.\nInclude the client deadline.');
    assert.equal(state.title, 'Updated reusable brief');
    assert.equal(state.dialog.querySelector('#library-prompt-input').value, store.get('library-custom-prompts')[0].prompt);
    state.dialog.querySelector('[data-detail-launch]').click();
    assert.equal(state.starts.at(-1).prompt, store.get('library-custom-prompts')[0].prompt);
    assert.equal(state.starts.at(-1).title, 'Updated reusable brief');
  }, {'library-custom-prompts': [{...customPrompt}]});
});
console.log(`\n${passed} library checks passed; all nine workflow variants exercised.`);
