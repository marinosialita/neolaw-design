const baseColumns = [
  { id: 'counterparty', label: 'Counterparty', question: 'Who is the counterparty to this agreement?', icon: 'building' },
  { id: 'term', label: 'Term & renewal', question: 'What is the initial term and does the agreement renew?', icon: 'clock' },
  { id: 'notice', label: 'Termination notice', question: 'What notice is required for termination or non-renewal?', icon: 'mail' },
  { id: 'liability', label: 'Liability cap', question: 'What express liability cap appears in the clause?', icon: 'shield' },
  { id: 'law', label: 'Governing law', question: 'Which governing law is expressly stated?', icon: 'scale' },
  { id: 'risk', label: 'Review signal', question: 'Which point merits a closer look?', icon: 'info' }
];

const cell = (answer, source, quote, observation = '') => ({ answer, source, quote, observation });
const documents = [
  {
    id: 'msa-01', title: 'Master services agreement', filename: 'Aster × Helios · MSA.pdf', pages: 14, category: 'Professional services', risk: 'review',
    cells: {
      counterparty: cell('Helios Trading Ltd', '§ 1.1 · p. 2', 'This agreement is made between Aster Advisory Ltd (the Provider) and Helios Trading Ltd (the Client).', 'The clause identifies Helios Trading Ltd as the Client.'),
      term: cell('12 months', '§ 3.1 · p. 3', 'The Services commence on 1 January 2027 and continue for twelve months. Any extension must be agreed in writing by both parties.', 'No automatic renewal appears in this clause.'),
      notice: cell('60 days', '§ 9.2 · p. 9', 'Either party may terminate this agreement for convenience by giving the other party not less than sixty days’ prior written notice.', 'The clause applies to either party and requires written notice.'),
      liability: cell('No express cap in clause', '§ 11.1 · p. 11', 'Each party shall be responsible for losses directly caused by its breach of this agreement. Neither party shall be liable for indirect or consequential loss.', 'The clause excludes certain loss but states no monetary cap. Review the full agreement for other limitations.'),
      law: cell('Cyprus', '§ 14.1 · p. 14', 'This agreement and any non-contractual obligations arising out of it shall be governed by the laws of the Republic of Cyprus.'),
      risk: cell('Review needed', '§ 11.1 · p. 11', 'Each party shall be responsible for losses directly caused by its breach of this agreement. Neither party shall be liable for indirect or consequential loss.', 'The clause has no express monetary liability cap. Seek instructions on the intended allocation of risk.')
    }
  },
  {
    id: 'licence-02', title: 'Software licence', filename: 'Aurora × Nicos · Licence.pdf', pages: 18, category: 'Technology', risk: 'confirm',
    cells: {
      counterparty: cell('Nicos Systems Ltd', '§ 1.1 · p. 2', 'Aurora Operations Ltd (the Customer) appoints Nicos Systems Ltd (the Licensor) to provide the licensed software described in Schedule 1.'),
      term: cell('24 months · auto-renews', '§ 4.1 · p. 4', 'The initial licence term is twenty-four months. It shall renew for successive twelve-month periods unless either party gives notice in accordance with clause 4.2.', 'The renewal is automatic for successive twelve-month periods.'),
      notice: cell('90 days before renewal', '§ 4.2 · p. 4', 'A party that does not wish to renew shall give written notice at least ninety days before expiry of the then-current licence term.', 'This is a non-renewal notice, not an express termination-for-convenience right.'),
      liability: cell('Previous 12 months’ fees', '§ 12.3 · p. 13', 'Subject to clause 12.4, each party’s aggregate liability shall not exceed the fees paid or payable under this agreement in the twelve months preceding the event giving rise to the claim.', 'The cross-reference to clause 12.4 requires further review; it is outside this extract.'),
      law: cell('England & Wales', '§ 17.1 · p. 18', 'This agreement and any dispute arising from it shall be governed by the laws of England and Wales.'),
      risk: cell('Confirm position', '§ 4.2 · p. 4', 'A party that does not wish to renew shall give written notice at least ninety days before expiry of the then-current licence term.', 'Confirm the commercial renewal instruction and diary the notice deadline. The liability carve-outs also need the full document.')
    }
  },
  {
    id: 'distribution-03', title: 'Distribution agreement', filename: 'Cedar × Bluewater · Distribution.pdf', pages: 21, category: 'Distribution', risk: 'review',
    cells: {
      counterparty: cell('Bluewater Retail Ltd', '§ 1.2 · p. 2', 'Cedar Products Ltd appoints Bluewater Retail Ltd as distributor of the Products in the Territory described in Schedule 2.'),
      term: cell('36 months', '§ 5.1 · p. 5', 'The appointment begins on the Effective Date and continues for thirty-six months unless terminated earlier in accordance with this agreement.'),
      notice: cell('30 days · supplier only', '§ 15.2 · p. 16', 'The Supplier may terminate the appointment for convenience upon thirty days’ written notice to the Distributor.', 'The clause grants the convenience termination right to the Supplier only.'),
      liability: cell('€50,000 aggregate', '§ 18.1 · p. 19', 'Subject to liability that cannot lawfully be limited, the Supplier’s total aggregate liability under this agreement shall not exceed fifty thousand euro (€50,000).', 'The cap is expressed for the Supplier; the clause does not specify an equivalent cap for the Distributor.'),
      law: cell('Cyprus', '§ 20.1 · p. 21', 'The parties agree that the laws of the Republic of Cyprus govern this agreement.'),
      risk: cell('Review needed', '§ 15.2 · p. 16', 'The Supplier may terminate the appointment for convenience upon thirty days’ written notice to the Distributor.', 'A supplier-only convenience termination right may need discussion against the distributor’s investment and planning assumptions.')
    }
  },
  {
    id: 'consultancy-04', title: 'Consultancy agreement', filename: 'Meridian × Orion · Consultancy.pdf', pages: 9, category: 'Professional services', risk: 'clear',
    cells: {
      counterparty: cell('Orion Design Ltd', '§ 1.1 · p. 1', 'This agreement records the appointment of Orion Design Ltd (the Consultant) by Meridian Projects Ltd (the Client).'),
      term: cell('6 months · no renewal', '§ 2.1 · p. 2', 'The appointment lasts for six months from the Commencement Date and shall expire without automatic renewal.'),
      notice: cell('30 days · mutual', '§ 7.1 · p. 7', 'Either party may end the appointment by giving thirty days’ written notice to the other party.'),
      liability: cell('Total fees paid', '§ 8.2 · p. 8', 'Except for fraud and liability that cannot lawfully be excluded or limited, the Consultant’s aggregate liability shall not exceed the total fees paid under this agreement.', 'The clause states a cap and express exceptions. It does not establish whether that position suits the client.'),
      law: cell('Cyprus', '§ 9.1 · p. 9', 'This agreement shall be governed by the laws of the Republic of Cyprus.'),
      risk: cell('No additional flag', '§§ 2.1, 7.1 & 8.2', 'The appointment lasts for six months and shall expire without automatic renewal. Either party may end the appointment by giving thirty days’ written notice. The Consultant’s aggregate liability shall not exceed the total fees paid.', 'No additional issue is flagged in the cited clauses. Review the full agreement against the client’s requirements.')
    }
  },
  {
    id: 'data-05', title: 'Data services agreement', filename: 'Atlas × Cygnus · Data services.pdf', pages: 16, category: 'Technology', risk: 'review',
    cells: {
      counterparty: cell('Cygnus Cloud Ltd', '§ 1.1 · p. 2', 'Atlas Analytics Ltd (the Customer) engages Cygnus Cloud Ltd (the Provider) to perform the Services set out in Schedule A.'),
      term: cell('12 months · auto-renews', '§ 3.1 · p. 3', 'The initial term is twelve months. The agreement automatically renews for further twelve-month terms unless a party gives the notice required by clause 3.2.'),
      notice: cell('15 days before renewal', '§ 3.2 · p. 3', 'A party may prevent renewal by delivering written notice no later than fifteen days before the end of the then-current term.', 'Confirm operational ownership of this relatively short non-renewal window.'),
      liability: cell('Annual fees · carve-outs', '§ 13.2 · p. 13', 'Each party’s aggregate liability is capped at the annual fees payable. This cap shall not apply to breach of confidentiality, misuse of personal data, fraud or liability that cannot lawfully be limited.', 'Confidentiality and misuse of personal data are outside the stated cap in this clause.'),
      law: cell('Cyprus', '§ 16.1 · p. 16', 'The laws of the Republic of Cyprus govern this agreement and its interpretation.'),
      risk: cell('Review needed', '§ 13.2 · p. 13', 'This cap shall not apply to breach of confidentiality, misuse of personal data, fraud or liability that cannot lawfully be limited.', 'Review the uncapped categories and obtain the client’s position on an appropriate allocation of risk.')
    }
  },
  {
    id: 'supply-06', title: 'Framework supply agreement', filename: 'Olive × Grove · Supply.pdf', pages: 12, category: 'Supply', risk: 'confirm',
    cells: {
      counterparty: cell('Grove Materials Ltd', '§ 1.1 · p. 1', 'Olive Manufacturing Ltd (the Buyer) and Grove Materials Ltd (the Supplier) enter into this framework for the supply of the Goods.'),
      term: cell('Rolling · no fixed expiry', '§ 2.1 · p. 2', 'This framework takes effect on signature and continues until terminated under clause 10. Accepted purchase orders remain binding in accordance with their terms.'),
      notice: cell('60 days · mutual', '§ 10.1 · p. 10', 'Either party may terminate this framework on sixty days’ written notice. Termination does not cancel purchase orders accepted before the effective termination date.', 'Accepted orders survive termination of the framework.'),
      liability: cell('Affected order value', '§ 11.2 · p. 11', 'The Supplier’s aggregate liability in respect of a purchase order shall not exceed the price payable for that purchase order, except for fraud or liability that cannot lawfully be limited.'),
      law: cell('Cyprus', '§ 12.1 · p. 12', 'This framework and each purchase order are governed by the laws of the Republic of Cyprus.'),
      risk: cell('Confirm position', '§ 10.1 · p. 10', 'Termination does not cancel purchase orders accepted before the effective termination date.', 'Confirm the intended treatment of open orders and whether the per-order liability allocation matches the client’s requirements.')
    }
  }
];

const riskLabels = { review: 'Review needed', confirm: 'Confirm position', clear: 'No additional flag' };

export function toCSV(headers, rows) {
  const quote = value => {
    const text = String(value ?? '');
    const safeText = /^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  };
  return [headers, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
}

export function normalizeMatrixState(value) {
  const saved = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const customIds = new Set();
  const customColumns = (Array.isArray(saved.customColumns) ? saved.customColumns : []).filter(col => {
    if (!col || !/^custom-[a-z0-9-]+$/.test(col.id) || typeof col.label !== 'string' || typeof col.question !== 'string' || customIds.has(col.id)) return false;
    customIds.add(col.id); return true;
  }).map(col => ({ id: col.id, label: col.label.slice(0, 40), question: col.question.slice(0, 300), icon: 'message-square' }));
  const columnIds = new Set([...baseColumns, ...customColumns].map(col => col.id));
  const validKeys = new Set(documents.flatMap(row => [...columnIds].map(id => `${row.id}:${id}`)));
  const reviewKeys = new Set(documents.flatMap(row => baseColumns.map(col => `${row.id}:${col.id}`)));
  const visibleColumns = [...new Set((Array.isArray(saved.visibleColumns) ? saved.visibleColumns : baseColumns.map(col => col.id)).filter(id => columnIds.has(id)))];
  const notes = Object.fromEntries(Object.entries(saved.notes && typeof saved.notes === 'object' ? saved.notes : {}).filter(([key, note]) => validKeys.has(key) && typeof note === 'string').map(([key, note]) => [key, note.slice(0, 3000)]));
  const reviewed = Object.fromEntries(Object.entries(saved.reviewed && typeof saved.reviewed === 'object' ? saved.reviewed : {}).filter(([key, marked]) => reviewKeys.has(key) && marked === true));
  return { customColumns, visibleColumns, notes, reviewed };
}

export function render(container, ctx) {
  const e = ctx.escape;
  const ic = (name, size = 17) => ctx.icon(name, size);
  let state = normalizeMatrixState(ctx.storage.get('matrix-state', {}));
  let query = '';
  let risk = 'all';
  let selected = new Set();
  let active = null;
  let menu = '';
  let closeActiveModal = null;
  let lastSaveSucceeded = true;
  const noteDrafts = new Map();
  const noteFor = key => noteDrafts.has(key) ? noteDrafts.get(key) : state.notes[key] || '';
  const allColumns = () => [...baseColumns, ...state.customColumns];
  const visibleColumns = () => allColumns().filter(c => state.visibleColumns.includes(c.id));
  const keyFor = (row, col) => `${row.id}:${col.id}`;
  const updateSaveStatus = () => {
    const status = container.querySelector('.matrix-local-status');
    const label = noteDrafts.size ? 'Notes not saved' : lastSaveSucceeded ? 'Saved locally' : 'Change not saved';
    if (status && status.textContent.trim() !== label) status.innerHTML = `${ic(lastSaveSucceeded && !noteDrafts.size ? 'check' : 'info', 12)}${label}`;
  };
  const save = next => {
    try { lastSaveSucceeded = ctx.storage.set('matrix-state', next) !== false; }
    catch { lastSaveSucceeded = false; ctx.toast('These changes could not be saved in this browser.'); }
    if (lastSaveSucceeded) state = next;
    updateSaveStatus();
    return lastSaveSucceeded;
  };
  const saveNote = (key, value) => {
    noteDrafts.set(key, value);
    const result = save({ ...state, notes: { ...state.notes, [key]: value } });
    if (result) noteDrafts.delete(key);
    updateSaveStatus();
    return result;
  };
  const matchRows = () => documents.filter(row => (risk === 'all' || row.risk === risk) && `${row.title} ${row.filename} ${row.category} ${Object.values(row.cells).map(c => c.answer).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  const getCell = (row, col) => row.cells[col.id] || { answer: 'Not extracted', source: '', quote: '', observation: 'Your question is saved. Automatic extraction is unavailable.' };
  const reviewedCount = () => documents.reduce((total, row) => total + baseColumns.filter(col => state.reviewed[keyFor(row, col)]).length, 0);

  ctx.setHeader('Review table');

  function draw() {
    container.innerHTML = `<section class="matrix-page" aria-label="Contract review workspace">
      <div class="matrix-context"><button data-nav="/library">${ic('arrow-left', 14)}Library</button><span>/</span><span>Document review</span><span class="matrix-local-status" role="status" aria-live="polite">${ic('check', 12)}Saved locally</span></div>
      <div class="matrix-title-row"><div><div class="matrix-eyebrow">VENDOR AGREEMENTS </div><h1>Contract review</h1><p>Six agreements. The details that deserve your attention.</p></div><div class="matrix-title-actions"><button class="btn small" data-matrix-add>${ic('plus', 15)}Add question</button><div class="matrix-menu-wrap"><button class="btn small primary" data-matrix-menu="export" aria-haspopup="menu" aria-expanded="false">${ic('download', 15)}Export CSV${ic('chevron-down', 12)}</button><div class="matrix-popover matrix-export-menu" data-matrix-popover="export" hidden></div></div></div></div>
      <div class="matrix-summary"><span>${ic('files', 14)}<strong>6</strong> documents</span><span>${ic('grid', 14)}<strong data-question-count>${allColumns().length}</strong> questions</span><span class="matrix-summary-review">${ic('check', 14)}<strong data-reviewed-count>${reviewedCount()}</strong> / 36 cells reviewed</span></div>
      <div class="matrix-layout"><section class="matrix-table-panel" aria-label="Contract review matrix">
        <div class="matrix-toolbar"><label class="matrix-search">${ic('search', 15)}<input type="search" data-matrix-search placeholder="Search documents or answers" aria-label="Search documents or extracted answers"></label><div class="matrix-toolbar-right"><label class="matrix-risk-filter">${ic('filter', 14)}<span class="matrix-sr-only">Filter by review signal</span><select data-matrix-risk aria-label="Filter by review signal"><option value="all">All signals</option><option value="review">Review needed</option><option value="confirm">Confirm position</option><option value="clear">No additional flag</option></select></label><div class="matrix-menu-wrap"><button class="matrix-toolbar-button" data-matrix-menu="columns" aria-haspopup="dialog" aria-expanded="false">${ic('columns', 15)}Columns</button><div class="matrix-popover matrix-columns-menu" data-matrix-popover="columns" hidden></div></div></div></div>
        <div class="matrix-selection-bar" hidden><span data-selection-text></span><button data-matrix-clear-selection>Clear</button><button data-matrix-export="selected">${ic('download', 13)}Export selected</button></div>
        <div class="matrix-table-scroll" tabindex="0" role="region" aria-label="Review table, scroll horizontally for more columns"><table class="matrix-table"><caption class="matrix-sr-only">Contract review. Select an answer to inspect its source excerpt.</caption><thead></thead><tbody></tbody></table><div class="matrix-no-results" hidden></div></div>
        <div class="matrix-table-footer"><span data-row-count></span><span>${ic('info', 12)}Select an answer to inspect its source</span></div>
      </section><aside class="matrix-source-panel" aria-labelledby="matrix-source-heading" hidden></aside></div>
      <p class="matrix-disclosure">${ic('monitor', 13)}Your notes, review marks and columns are saved in this browser.</p>
    </section>`;
    drawTable(); drawColumnMenu(); drawExportMenu();
  }

  function drawTable() {
    const rows = matchRows();
    const columns = visibleColumns();
    if (active && !rows.some(row => row.id === active.row.id)) dismissSource();
    updateSourceNavigation();
    const selectedVisible = rows.filter(row => selected.has(row.id)).length;
    container.querySelector('thead').innerHTML = `<tr><th class="matrix-document-column" scope="col"><div class="matrix-document-head"><input type="checkbox" data-matrix-select-all aria-label="Select all visible documents" ${rows.length && selectedVisible === rows.length ? 'checked' : ''} ${rows.length ? '' : 'disabled'}><span>Document <small>${rows.length}</small></span></div></th>${columns.map(col => `<th scope="col" data-matrix-column-heading="${e(col.id)}" tabindex="-1" class="matrix-col-${col.id.startsWith('custom-') ? 'custom' : col.id}"><span class="matrix-column-title">${ic(col.icon || 'message-square', 13)}<span title="${e(col.question)}">${e(col.label)}</span>${col.id.startsWith('custom-') ? '<span class="matrix-custom-dot" title="Custom question; no extraction"></span>' : ''}</span></th>`).join('')}<th class="matrix-add-column" scope="col"><button class="icon-btn" data-matrix-add aria-label="Add a question column">${ic('plus', 15)}</button></th></tr>`;
    container.querySelector('tbody').innerHTML = rows.map(row => `<tr class="${selected.has(row.id) ? 'matrix-row-selected' : ''}"><th scope="row" class="matrix-document-column"><div class="matrix-document-cell"><input type="checkbox" data-matrix-select="${row.id}" aria-label="Select ${e(row.title)}" ${selected.has(row.id) ? 'checked' : ''}><span class="matrix-document-icon">${ic('file-text', 19)}<small>PDF</small></span><button data-matrix-cell="${row.id}:liability" class="matrix-document-link"><strong>${e(row.title)}</strong><span>${e(row.filename.split(' · ')[0])} <i>·</i> ${row.pages} pages</span></button></div></th>${columns.map(col => renderCell(row, col)).join('')}<td class="matrix-add-column"></td></tr>`).join('');
    container.querySelector('[data-matrix-select-all]').indeterminate = selectedVisible > 0 && selectedVisible < rows.length;
    const empty = container.querySelector('.matrix-no-results'); empty.hidden = !!rows.length;
    empty.innerHTML = rows.length ? '' : `${ic('search', 27)}<h2>No matching documents</h2><p>Try another word or clear the review signal filter.</p><button class="btn small" data-matrix-reset>Clear filters</button>`;
    container.querySelector('[data-row-count]').textContent = `${rows.length} of ${documents.length} documents`;
    container.querySelector('[data-question-count]').textContent = allColumns().length;
    container.querySelector('[data-reviewed-count]').textContent = reviewedCount();
    updateSelection();
  }

  function renderCell(row, col) {
    const value = getCell(row, col); const key = keyFor(row, col); const customCol = col.id.startsWith('custom-');
    return `<td><button class="matrix-cell ${active?.key === key ? 'matrix-cell-active' : ''} ${customCol ? 'matrix-cell-unextracted' : ''}" data-matrix-cell="${key}" aria-label="${e(col.label)} for ${e(row.title)}: ${e(value.answer)}. ${customCol ? 'View question' : 'Inspect source'}"><span class="matrix-cell-answer">${col.id === 'risk' ? `<span class="matrix-risk-chip matrix-risk-${row.risk}"><i></i>${e(value.answer)}</span>` : e(value.answer)}</span><span class="matrix-cell-bottom"><span class="matrix-cell-source">${customCol ? 'Custom question' : e(value.source)}</span><span class="matrix-cell-indicators"><span class="matrix-cell-note" title="Note added" ${noteFor(key).trim() ? '' : 'hidden'}>${ic('message-square', 11)}</span>${state.reviewed[key] ? `<span class="matrix-cell-reviewed" title="Marked reviewed">${ic('check', 12)}</span>` : ''}</span></span></button></td>`;
  }

  function drawColumnMenu() {
    container.querySelector('[data-matrix-popover="columns"]').innerHTML = `<div role="dialog" aria-label="Visible columns"><div class="matrix-popover-title">Visible columns <span>${visibleColumns().length} of ${allColumns().length}</span></div>${allColumns().map(col => `<label class="matrix-column-option"><input type="checkbox" data-matrix-column="${col.id}" ${state.visibleColumns.includes(col.id) ? 'checked' : ''}><span>${e(col.label)}</span>${col.id.startsWith('custom-') ? '<small>Custom</small>' : ''}</label>`).join('')}<button class="matrix-popover-reset" data-matrix-show-all>Show all columns</button></div>`;
  }

  function drawExportMenu() {
    container.querySelector('[data-matrix-popover="export"]').innerHTML = `<div role="menu" aria-label="Export review table"><button role="menuitem" data-matrix-export="all">${ic('grid', 15)}<span>All documents</span><small>6</small></button><button role="menuitem" data-matrix-export="selected" ${selected.size ? '' : 'disabled'}>${ic('check', 15)}<span>Selected documents</span><small>${selected.size}</small></button><p>Visible columns, source references, review marks and notes.</p></div>`;
  }

  function updateSelection() {
    const bar = container.querySelector('.matrix-selection-bar'); bar.hidden = !selected.size;
    container.querySelector('[data-selection-text]').textContent = `${selected.size} ${selected.size === 1 ? 'document' : 'documents'} selected`;
    drawExportMenu();
  }

  function setMenu(value) {
    menu = value;
    container.querySelectorAll('[data-matrix-popover]').forEach(el => { el.hidden = el.dataset.matrixPopover !== value; });
    container.querySelectorAll('[data-matrix-menu]').forEach(el => el.setAttribute('aria-expanded', String(el.dataset.matrixMenu === value)));
    if (value) { const panel = container.querySelector(`[data-matrix-popover="${value}"]`); (panel.querySelector('input') || panel.querySelector('button:not(:disabled)'))?.focus(); }
  }

  function openSource(key) {
    const [rowId, colId] = key.split(':'); const row = documents.find(item => item.id === rowId); const col = allColumns().find(item => item.id === colId);
    if (!row || !col) return;
    setMenu(''); active = { key, row, col }; drawTable(); drawSource();
    container.querySelector('[data-matrix-close-source]').focus({ preventScroll: true });
    if (window.matchMedia('(max-width:970px)').matches) container.querySelector('.matrix-source-panel').scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
  }

  function drawSource(preserveScroll = false) {
    if (!active) return;
    const scrollTop = preserveScroll ? container.querySelector('.matrix-source-content')?.scrollTop || 0 : 0;
    const { row, col, key } = active; const value = getCell(row, col); const isCustom = col.id.startsWith('custom-');
    const panel = container.querySelector('.matrix-source-panel'); panel.hidden = false; container.querySelector('.matrix-layout').classList.add('matrix-has-source');
    panel.innerHTML = `<div class="matrix-source-top"><span>${ic('file-search', 16)}Inspect answer</span><button class="icon-btn" data-matrix-close-source aria-label="Close source panel">${ic('x', 17)}</button></div>
      <div class="matrix-source-content"><div class="matrix-source-document">${ic('file-text', 17)}<span>${e(row.title)}<small>${e(row.filename)}</small></span></div><div class="matrix-source-divider"></div><span class="matrix-source-eyebrow">${isCustom ? 'CUSTOM QUESTION' : 'ANSWER'}</span><h2 id="matrix-source-heading">${e(col.label)}</h2><p class="matrix-source-question">${e(col.question)}</p><div class="matrix-extracted-answer ${isCustom ? 'matrix-awaiting-answer' : ''}">${col.id === 'risk' ? `<span class="matrix-risk-chip matrix-risk-${row.risk}"><i></i>${e(value.answer)}</span>` : e(value.answer)}</div>
      ${isCustom ? `<div class="matrix-no-source">${ic('clock', 24)}<h3>No extraction connected</h3><p>This question is saved as a new column. Automatic extraction is unavailable.</p></div>` : `<div class="matrix-clause-heading"><h3>Source excerpt</h3><span>${e(value.source)}</span></div><blockquote class="matrix-source-clause">${e(value.quote)}</blockquote><div class="matrix-excerpt-label">${ic('info', 11)}Clause excerpt</div>${value.observation ? `<div class="matrix-observation"><h3>Review context</h3><p>${e(value.observation)}</p></div>` : ''}`}
      <button class="matrix-review-toggle ${state.reviewed[key] ? 'matrix-is-reviewed' : ''}" data-matrix-review aria-pressed="${!!state.reviewed[key]}" ${isCustom ? 'disabled' : ''}>${ic(state.reviewed[key] ? 'check' : 'circle-check', 16)}${state.reviewed[key] ? 'Marked as reviewed' : isCustom ? 'Awaiting an extracted answer' : 'Mark as reviewed'}${!isCustom ? `<span>${state.reviewed[key] ? 'Undo' : '↵'}</span>` : ''}</button>
      <div class="matrix-note-area"><label for="matrix-cell-note">Your note <span data-matrix-note-status>${noteDrafts.has(key) ? 'Not saved' : state.notes[key]?.trim() ? 'Saved locally' : 'Only in this browser'}</span></label><textarea id="matrix-cell-note" data-matrix-note maxlength="3000" rows="4" placeholder="Add a question, instruction or point to follow up…">${e(noteFor(key))}</textarea><p>Notes save as you type.</p><button class="btn small" data-matrix-retry-note ${noteDrafts.has(key) ? '' : 'hidden'}>Retry saving note</button></div></div>
      <div class="matrix-source-footer"><span data-matrix-source-position></span><div><button class="icon-btn" data-matrix-prev aria-label="Inspect previous document" >${ic('arrow-left', 15)}</button><button class="icon-btn" data-matrix-next aria-label="Inspect next document" >${ic('arrow-right', 15)}</button></div></div>`;
    panel.querySelector('.matrix-source-content').scrollTop = scrollTop;
    updateSourceNavigation();
  }

  function updateSourceNavigation() {
    if (!active) return;
    const rows = matchRows(), index = rows.findIndex(row => row.id === active.row.id);
    const position = container.querySelector('[data-matrix-source-position]');
    if (position) position.textContent = `Document ${index + 1} of ${rows.length}${rows.length < documents.length ? ' matching' : ''}`;
    const prev = container.querySelector('[data-matrix-prev]'), next = container.querySelector('[data-matrix-next]');
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= rows.length - 1;
  }

  function dismissSource() {
    active = null;
    container.querySelector('.matrix-source-panel').hidden = true;
    container.querySelector('.matrix-layout').classList.remove('matrix-has-source');
  }

  function closeSource() {
    const key = active?.key; dismissSource(); drawTable();
    const trigger = key && container.querySelector(`[data-matrix-cell="${key}"]`);
    (trigger || container.querySelector('[data-matrix-search]'))?.focus({ preventScroll: true });
  }

  function addQuestion() {
    setMenu('');
    closeActiveModal = ctx.modal({ title: 'Add a question', body: `<form class="matrix-question-form"><p>Choose another detail to track across your document set.</p><label>Column name<input class="field" name="label" placeholder="e.g. Assignment rights" maxlength="40" required autofocus></label><label>Your question<textarea class="field" name="question" rows="3" placeholder="Can either party assign the agreement without consent?" maxlength="300" required></textarea></label><div class="matrix-question-notice">${ic('info', 16)}<span>This adds an empty column. Automatic extraction is unavailable.</span></div><p class="matrix-question-error" data-question-error role="alert" hidden>This question could not be saved. Your text is still here; try again after making space in browser storage.</p><div class="matrix-question-actions"><button class="btn" type="button" data-question-cancel>Cancel</button><button class="btn primary" type="submit">Add column</button></div></form>`, onMount(dialog, close) {
      dialog.querySelector('[data-question-cancel]').onclick = close;
      const form = dialog.querySelector('form');
      form.addEventListener('input', event => event.target.setCustomValidity?.(''));
      form.addEventListener('submit', event => {
        event.preventDefault(); const label = form.elements.label.value.trim(); const question = form.elements.question.value.trim();
        if (!label || !question) { const input = !label ? form.elements.label : form.elements.question; input.setCustomValidity('Enter a value to continue.'); input.reportValidity(); return; }
        const column = { id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, label, question, icon: 'message-square' };
        if (!save({ ...state, customColumns: [...state.customColumns, column], visibleColumns: [...state.visibleColumns, column.id] })) { form.querySelector('[data-question-error]').hidden = false; return; }
        close(); drawColumnMenu(); drawTable(); ctx.toast('Question added. Automatic extraction is unavailable.');
        const tableScroll = container.querySelector('.matrix-table-scroll'); tableScroll.scrollLeft = tableScroll.scrollWidth;
        container.querySelector(`[data-matrix-column-heading="${column.id}"]`)?.focus({ preventScroll: true });
      });
    } });
  }

  function exportCSV(scope) {
    const rows = scope === 'selected' ? documents.filter(row => selected.has(row.id)) : documents;
    if (!rows.length) return;
    const columns = visibleColumns();
    const headers = ['Document', ...columns.map(col => col.label), 'Source references', 'Reviewed fields', 'Notes', 'Dataset'];
    const records = rows.map(row => [row.title, ...columns.map(col => getCell(row, col).answer), columns.filter(col => getCell(row, col).source).map(col => `${col.label}: ${getCell(row, col).source}`).join('\n'), columns.filter(col => state.reviewed[keyFor(row, col)]).map(col => col.label).join('; '), columns.filter(col => noteFor(keyFor(row, col)).trim()).map(col => `${col.label}: ${noteFor(keyFor(row, col))}`).join('\n'), 'Vendor agreements']);
    ctx.download(`neolaw-contract-review-${scope}.csv`, '\uFEFF' + toCSV(headers, records), 'text/csv;charset=utf-8'); setMenu(''); container.querySelector('[data-matrix-menu="export"]')?.focus({ preventScroll: true }); ctx.toast(`${rows.length} ${rows.length === 1 ? 'document exported' : 'documents exported'} as CSV`);
  }

  function onClick(event) {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-matrix-cell')) openSource(button.dataset.matrixCell);
    if (button.hasAttribute('data-matrix-menu')) setMenu(menu === button.dataset.matrixMenu ? '' : button.dataset.matrixMenu);
    if (button.hasAttribute('data-matrix-add')) addQuestion();
    if (button.hasAttribute('data-matrix-export')) exportCSV(button.dataset.matrixExport);
    if (button.hasAttribute('data-matrix-close-source')) closeSource();
    if (button.hasAttribute('data-matrix-clear-selection')) { selected.clear(); drawTable(); const selectAll = container.querySelector('[data-matrix-select-all]'); (selectAll && !selectAll.disabled ? selectAll : container.querySelector('[data-matrix-search]'))?.focus({ preventScroll: true }); }
    if (button.hasAttribute('data-matrix-reset')) { query = ''; risk = 'all'; container.querySelector('[data-matrix-search]').value = ''; container.querySelector('[data-matrix-risk]').value = 'all'; drawTable(); container.querySelector('[data-matrix-search]')?.focus({ preventScroll: true }); }
    if (button.hasAttribute('data-matrix-show-all')) { save({ ...state, visibleColumns: allColumns().map(col => col.id) }); drawTable(); drawColumnMenu(); container.querySelector('[data-matrix-show-all]')?.focus({ preventScroll: true }); }
    if (button.hasAttribute('data-matrix-review') && active && !active.col.id.startsWith('custom-')) { save({ ...state, reviewed: { ...state.reviewed, [active.key]: !state.reviewed[active.key] } }); drawTable(); drawSource(true); container.querySelector('[data-matrix-review]').focus({ preventScroll: true }); }
    if (button.hasAttribute('data-matrix-retry-note') && active) { saveNote(active.key, noteFor(active.key)); drawSource(true); (noteDrafts.has(active.key) ? container.querySelector('[data-matrix-retry-note]') : container.querySelector('[data-matrix-note]'))?.focus({ preventScroll: true }); }
    if ((button.hasAttribute('data-matrix-prev') || button.hasAttribute('data-matrix-next')) && active) { const rows = matchRows(), index = rows.indexOf(active.row) + (button.hasAttribute('data-matrix-prev') ? -1 : 1); if (rows[index]) openSource(`${rows[index].id}:${active.col.id}`); }
  }
  function onInput(event) {
    if (event.target.hasAttribute('data-matrix-search')) { query = event.target.value; drawTable(); }
    if (event.target.hasAttribute('data-matrix-note') && active) {
      const result = saveNote(active.key, event.target.value);
      container.querySelector('[data-matrix-note-status]').textContent = result === false ? 'Could not save' : 'Saved locally';
      container.querySelector('[data-matrix-retry-note]').hidden = result;
      container.querySelectorAll(`[data-matrix-cell="${active.key}"]`).forEach(cell => { const marker = cell.querySelector('.matrix-cell-note'); if (marker) marker.hidden = !event.target.value.trim(); });
    }
  }
  function onChange(event) {
    const input = event.target;
    if (input.hasAttribute('data-matrix-risk')) { risk = input.value; drawTable(); }
    if (input.hasAttribute('data-matrix-select')) { const id = input.dataset.matrixSelect; input.checked ? selected.add(id) : selected.delete(id); drawTable(); container.querySelector(`[data-matrix-select="${id}"]`)?.focus({ preventScroll: true }); }
    if (input.hasAttribute('data-matrix-select-all')) { matchRows().forEach(row => input.checked ? selected.add(row.id) : selected.delete(row.id)); drawTable(); container.querySelector('[data-matrix-select-all]').focus({ preventScroll: true }); }
    if (input.hasAttribute('data-matrix-column')) {
      const id = input.dataset.matrixColumn;
      const next = input.checked ? [...new Set([...state.visibleColumns, id])] : state.visibleColumns.filter(value => value !== id);
      if (save({ ...state, visibleColumns: next }) && active?.col.id === id && !next.includes(id)) dismissSource();
      input.checked = state.visibleColumns.includes(id); drawTable();
      container.querySelector('.matrix-popover-title').querySelector('span').textContent = `${visibleColumns().length} of ${allColumns().length}`;
    }
  }
  function onKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); if (menu) { const previous = menu; setMenu(''); container.querySelector(`[data-matrix-menu="${previous}"]`).focus({ preventScroll: true }); } else if (active) closeSource(); }
    if (menu === 'export' && event.key === 'Tab') { const previous = menu; setMenu(''); container.querySelector(`[data-matrix-menu="${previous}"]`).focus({ preventScroll: true }); }
    if (menu === 'export' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const options = [...container.querySelector('[data-matrix-popover="export"]').querySelectorAll('button:not(:disabled)')];
      const index = options.indexOf(document.activeElement); event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
  }
  function onFocusOut(event) {
    if (menu && event.relatedTarget && !container.querySelector(`[data-matrix-popover="${menu}"]`).closest('.matrix-menu-wrap').contains(event.relatedTarget)) setMenu('');
  }
  function outside(event) { if (menu && !event.target.closest('.matrix-menu-wrap')) setMenu(''); }
  container.addEventListener('click', onClick); container.addEventListener('input', onInput); container.addEventListener('change', onChange); container.addEventListener('keydown', onKeydown); container.addEventListener('focusout', onFocusOut); document.addEventListener('click', outside);
  draw();
  return () => { closeActiveModal?.(); container.removeEventListener('click', onClick); container.removeEventListener('input', onInput); container.removeEventListener('change', onChange); container.removeEventListener('keydown', onKeydown); container.removeEventListener('focusout', onFocusOut); document.removeEventListener('click', outside); };
}
