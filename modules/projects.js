import {readComposerDraft, writeComposerDraft, clearComposerDraft} from './composer-drafts.js';
import {createScreeningHistory} from './screening-history.js';
import {executiveSummary} from './research-evidence.js';
import {assessmentSummary} from './screening-assessment.js';
import {formatDate} from './screening-view-model.js';

const NOW = '2026-10-11T15:30:00.000Z';
const MAX_TEXT_BYTES = 250000;
const matterTypes = ['Commercial', 'Employment', 'Dispute resolution', 'Real estate', 'General'];

function makeSeeds(originalCopy = false) {
  const projects = [
    {
      id: 'aurora-acquisition', name: 'Aurora · Acquisition', description: 'Share purchase agreement, due diligence and closing documents.', type: 'Commercial', color: 'cyan', pinned: true, updatedAt: NOW,
      chats: [
        { id: 'aurora-risk-review', title: 'SPA · key risks and negotiation points', preview: 'Review of warranties, limitation of liability and conditions precedent.', prompt: 'Review the key risks in the demonstration Aurora share purchase agreement.', pinned: true, updatedAt: NOW },
        { id: 'aurora-checklist', title: 'Prepare the closing checklist', preview: 'A working checklist of documents, approvals and outstanding actions.', prompt: 'Prepare a closing checklist for this fictional acquisition.', pinned: false, updatedAt: '2026-10-10T09:15:00.000Z' },
        { id: 'aurora-warranties', title: 'Compare the warranty positions', preview: 'Buyer and seller positions for the next draft.', prompt: 'Compare buyer and seller warranty positions for a fictional acquisition.', pinned: false, updatedAt: '2026-10-09T12:30:00.000Z' }
      ],
      files: [
        { id: 'aurora-spa', name: 'Share purchase agreement · v3.pdf', type: 'application/pdf', size: 482000, addedAt: '2026-10-10T10:00:00.000Z', sample: true, content: 'ΠΡΟΣΧΕΔΙΟ ΣΥΜΦΩΝΙΑΣ ΑΓΟΡΑΠΩΛΗΣΙΑΣ ΜΕΤΟΧΩΝ\n\nΣυνθετικό παράδειγμα — δεν αφορά πραγματική συναλλαγή.\n\n1. Αντικείμενο\nΟ Πωλητής συμφωνεί να μεταβιβάσει το σύνολο των μετοχών της υποθετικής Aurora Trading Ltd στον Αγοραστή, υπό τις προϋποθέσεις ολοκλήρωσης.\n\n2. Προϋποθέσεις ολοκλήρωσης\nΗ ολοκλήρωση τελεί υπό την παράδοση των συμφωνημένων εταιρικών εγκρίσεων και την επιβεβαίωση ότι δεν υφίσταται ουσιώδης παραβίαση των εγγυήσεων.\n\n3. Εγγυήσεις\nΟ Πωλητής παρέχει εγγυήσεις για την κυριότητα των μετοχών, τα εταιρικά αρχεία και την πληρότητα των γνωστοποιημένων ουσιωδών συμβάσεων.\n\nΣημεία προς συζήτηση: εύρος γνώσης του Πωλητή, συνολικό όριο ευθύνης και διαδικασία γνωστοποίησης απαιτήσεων.' },
        { id: 'aurora-dd', name: 'Due diligence · working notes.md', type: 'text/markdown', size: 8400, addedAt: '2026-10-09T11:00:00.000Z', sample: true, content: '# Aurora — σημειώσεις νομικού ελέγχου\n\nΣυνθετικό υλικό επίδειξης.\n\n## Εταιρικά\n- Να επιβεβαιωθούν τα εταιρικά αρχεία και η εξουσιοδότηση υπογραφής.\n- Να ελεγχθούν τυχόν δικαιώματα τρίτων επί των μετοχών.\n\n## Συμβάσεις\n- Να καταγραφούν οι ρήτρες αλλαγής ελέγχου στις ουσιώδεις συμβάσεις.\n- Να διευκρινιστούν οι απαιτούμενες συναινέσεις πριν από την ολοκλήρωση.\n\n## Εκκρεμότητες\n- Ενημερωμένος κατάλογος ουσιωδών συμβάσεων.\n- Συμφωνημένο disclosure letter.\n\nΟι παραπάνω σημειώσεις είναι υποθετικές και δεν αποτελούν νομική συμβουλή.' },
        { id: 'aurora-disclosure', name: 'Disclosure letter · draft.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 126000, addedAt: '2026-10-08T10:00:00.000Z', sample: true }
      ]
    },
    {
      id: 'helios-employment', name: 'Helios · Employment', description: 'Employment terms, internal policies and a practical review of obligations.', type: 'Employment', color: 'blue', pinned: false, updatedAt: '2026-10-10T14:10:00.000Z',
      chats: [
        { id: 'helios-policy', title: 'Review the remote working policy', preview: 'Questions to clarify before circulating the policy.', prompt: 'Review a fictional remote working policy and identify questions for the client.', pinned: false, updatedAt: '2026-10-10T14:10:00.000Z' },
        { id: 'helios-terms', title: 'Summarise the employment terms', preview: 'A clear outline for internal review.', prompt: 'Summarise the fictional employment terms for internal review.', pinned: false, updatedAt: '2026-10-08T12:00:00.000Z' }
      ],
      files: [
        { id: 'helios-policy-file', name: 'Remote working policy.pdf', type: 'application/pdf', size: 216000, addedAt: '2026-10-10T08:30:00.000Z', sample: true, content: 'ΠΟΛΙΤΙΚΗ ΤΗΛΕΡΓΑΣΙΑΣ — ΣΥΝΘΕΤΙΚΟ ΔΕΙΓΜΑ\n\nΣκοπός: ο καθορισμός ενός πλαισίου για εργασία εκτός γραφείου.\n\nΗ τηλεργασία συμφωνείται γραπτώς με τον υπεύθυνο ομάδας. Το συμφωνημένο ωράριο και οι υποχρεώσεις διαθεσιμότητας αποτυπώνονται στην ατομική συμφωνία.\n\nΟ εργοδότης καθορίζει τον απαραίτητο εξοπλισμό και τις διαδικασίες πρόσβασης στα εταιρικά συστήματα. Ο εργαζόμενος αναφέρει εγκαίρως τεχνικά ζητήματα και ακολουθεί τις σχετικές εσωτερικές διαδικασίες.\n\nΣημεία για περαιτέρω επεξεργασία: κάλυψη εξόδων, διαδικασία επιστροφής στο γραφείο και πρακτική εφαρμογή του ωραρίου.\n\nΤο παρόν αποτελεί αποκλειστικά φανταστικό κείμενο επίδειξης.' },
        { id: 'helios-terms-file', name: 'Employment agreement · template.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 96000, addedAt: '2026-10-08T10:00:00.000Z', sample: true }
      ]
    },
    {
      id: 'cedar-dispute', name: 'Cedar · Commercial dispute', description: 'Contract correspondence, the chronology and preparation for the next steps.', type: 'Dispute resolution', color: 'slate', pinned: false, updatedAt: '2026-10-09T10:00:00.000Z',
      chats: [
        { id: 'cedar-chronology', title: 'Build a chronology of the dispute', preview: 'Organise the fictional correspondence into a clear timeline.', prompt: 'Prepare a chronology for the fictional Cedar commercial dispute.', pinned: true, updatedAt: '2026-10-09T10:00:00.000Z' },
        { id: 'cedar-issues', title: 'Map the issues for review', preview: 'Performance, notice requirements and the available evidence.', prompt: 'Map the issues in a fictional contractual performance dispute.', pinned: false, updatedAt: '2026-10-07T13:00:00.000Z' }
      ],
      files: [
        { id: 'cedar-contract', name: 'Services agreement.pdf', type: 'application/pdf', size: 348000, addedAt: '2026-10-08T09:00:00.000Z', sample: true },
        { id: 'cedar-timeline', name: 'Matter chronology.txt', type: 'text/plain', size: 3200, addedAt: '2026-10-09T09:00:00.000Z', sample: true, content: 'CEDAR — ΥΠΟΘΕΤΙΚΟ ΙΣΤΟΡΙΚΟ\n\nΤο σύνολο των γεγονότων και ονομάτων είναι συνθετικό.\n\n3 Σεπτεμβρίου 2026\nΤα μέρη συμφωνούν το χρονοδιάγραμμα παροχής υπηρεσιών.\n\n14 Σεπτεμβρίου 2026\nΟ πελάτης ζητά διευκρινίσεις για το πρώτο παραδοτέο.\n\n18 Σεπτεμβρίου 2026\nΟ πάροχος αποστέλλει αναθεωρημένο σχέδιο και προτείνει συνάντηση.\n\n24 Σεπτεμβρίου 2026\nΤα μέρη ανταλλάσσουν θέσεις για την ερμηνεία των προδιαγραφών.\n\nΕπόμενο βήμα: αντιπαραβολή των εγγράφων με τις σχετικές συμβατικές υποχρεώσεις και επιβεβαίωση του ιστορικού.' }
      ]
    }
  ];
  if (originalCopy) return projects;
  // Rewrite only the application-owned starter material, never uploaded file text.
  const update = text => text
    .replace('the demonstration Aurora', 'the Aurora')
    .replace('this fictional acquisition', 'this acquisition')
    .replace('a fictional acquisition', 'an acquisition')
    .replace('a fictional remote working policy', 'the remote working policy')
    .replace('the fictional employment terms', 'the employment terms')
    .replace('the fictional correspondence', 'the correspondence')
    .replace('the fictional Cedar commercial dispute', 'the Cedar commercial dispute')
    .replace('a fictional contractual performance dispute', 'a contractual performance dispute')
    .replace('Συνθετικό παράδειγμα — δεν αφορά πραγματική συναλλαγή.\n\n', '')
    .replace('της υποθετικής Aurora', 'της Aurora')
    .replace('Συνθετικό υλικό επίδειξης.\n\n', '')
    .replace('\n\nΟι παραπάνω σημειώσεις είναι υποθετικές και δεν αποτελούν νομική συμβουλή.', '')
    .replace('ΠΟΛΙΤΙΚΗ ΤΗΛΕΡΓΑΣΙΑΣ — ΣΥΝΘΕΤΙΚΟ ΔΕΙΓΜΑ', 'ΠΟΛΙΤΙΚΗ ΤΗΛΕΡΓΑΣΙΑΣ')
    .replace('\n\nΤο παρόν αποτελεί αποκλειστικά φανταστικό κείμενο επίδειξης.', '')
    .replace('CEDAR — ΥΠΟΘΕΤΙΚΟ ΙΣΤΟΡΙΚΟ', 'CEDAR — ΙΣΤΟΡΙΚΟ ΥΠΟΘΕΣΗΣ')
    .replace('Το σύνολο των γεγονότων και ονομάτων είναι συνθετικό.\n\n', '');
  for (const project of projects) {
    for (const chat of project.chats) {
      chat.prompt = update(chat.prompt);
      chat.preview = update(chat.preview);
    }
    for (const file of project.files) if (typeof file.content === 'string') file.content = update(file.content);
  }
  return projects;
}

function bytes(size) { return size < 1000 ? `${size} B` : size < 1000000 ? `${Math.round(size / 1000)} KB` : `${(size / 1000000).toFixed(1)} MB`; }
function date(value) { return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

export function ensureProjects(storage) {
  let projects = storage.get('projects', null);
  if (!Array.isArray(projects)) {
    projects = makeSeeds();
    storage.set('projects', projects);
  }
  const previousSeeds = makeSeeds(true), currentSeeds = makeSeeds();
  let copyUpdated = false;
  projects.forEach(project => {
    if (!Array.isArray(project.chats)) project.chats = [];
    if (!Array.isArray(project.files)) project.files = [];
    const previous = previousSeeds.find(seed => seed.id === project.id);
    const current = currentSeeds.find(seed => seed.id === project.id);
    if (!previous || !current) return;
    for (const collection of ['chats', 'files']) {
      const fields = collection === 'chats' ? ['prompt', 'preview'] : ['content'];
      for (const item of project[collection]) {
        const oldItem = previous[collection].find(seed => seed.id === item.id);
        const newItem = current[collection].find(seed => seed.id === item.id);
        if (!oldItem || !newItem) continue;
        for (const field of fields) {
          if (typeof oldItem[field] === 'string' && item[field] === oldItem[field] && item[field] !== newItem[field]) {
            item[field] = newItem[field];
            copyUpdated = true;
          }
        }
      }
    }
  });
  if (copyUpdated) {
    try { storage.set('projects', projects); } catch { /* The updated copy remains available for this visit. */ }
  }
  return projects;
}

export function render(container, ctx) {
  let projects = ensureProjects(ctx.storage);
  const storedProjects = ctx.storage.get('projects', []);
  let savedProjects = Array.isArray(storedProjects) ? structuredClone(storedProjects) : [];
  const e = ctx.escape;
  const icon = (name, size = 18) => ctx.icon(name, size);
  let query = '';
  let filter = 'all';
  let sort = 'updated';
  let activeMenu = null;
  let disposed = false;
  let current = projects.find(p => p.id === ctx.route[1]);
  const draftKey = current ? 'project:' + current.id : null;
  let submitting = false;
  // Membership belongs to the canonical report; the project keeps no second copy.
  const screeningHistory = current ? ctx.screeningHistory || createScreeningHistory({legacyStorage:ctx.storage}) : null;
  let screeningReports = [], screeningState = 'loading', screeningQuery = '';
  let screeningRefresh = null, screeningRefreshAgain = false;
  const stopScreeningUpdates = screeningHistory?.subscribe?.(event => {
    if (disposed) return;
    if (event.type === 'external-change') { void loadScreenings(true); return; }
    if (['saved', 'refreshed'].includes(event.type) && !['loading', 'refreshing'].includes(screeningState)) {
      screeningReports = screeningHistory.list(); screeningState = 'ready'; drawScreenings();
    }
  });

  function loadScreenings(refresh = false) {
    if (!screeningHistory || disposed) return Promise.resolve();
    if (screeningRefresh) { screeningRefreshAgain ||= refresh; return screeningRefresh; }
    const initialLoad = screeningState !== 'ready';
    screeningState = initialLoad ? 'loading' : 'refreshing';
    if (initialLoad) drawScreenings();
    else container.querySelector('[data-screening-list]')?.setAttribute('aria-busy', 'true');
    screeningRefresh = (async () => {
      try {
        // Assign the in-flight promise before invoking an injected repository.
        await Promise.resolve();
        await screeningHistory.ready();
        if (disposed) return;
        if (refresh) await screeningHistory.refresh();
        if (disposed) return;
        screeningReports = screeningHistory.list(); screeningState = 'ready';
      } catch {
        if (disposed) return;
        screeningState = 'error';
      } finally {
        screeningRefresh = null;
        if (!disposed) {
          drawScreenings();
          if (screeningRefreshAgain) { screeningRefreshAgain = false; void loadScreenings(true); }
        }
      }
    })();
    return screeningRefresh;
  }

  function saveDraft() {
    if (!draftKey || disposed || submitting) return;
    const input = container.querySelector('.project-composer textarea');
    if (input) writeComposerDraft(draftKey, {text: input.value, attachments: []});
  }

  function mergeProjectChanges(baseline) {
    const latest = ctx.storage.get('projects', []);
    if (!Array.isArray(latest)) throw new Error('Project storage is unavailable.');
    const before = new Map(baseline.map(project => [project.id, project]));
    const after = new Map(projects.map(project => [project.id, project]));
    const stored = new Map(latest.map(project => [project.id, project]));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const changed = [...new Set([...before.keys(), ...after.keys()])]
      .filter(id => !same(before.get(id), after.get(id)));
    if (changed.some(id => !same(before.get(id), stored.get(id)))) {
      ctx.toast('This project changed in another tab. Your edit has not overwritten it. Reopen the project before applying the change.');
      return null;
    }
    // Keep untouched projects from current storage, including new matters. An
    // overlapping project edit must be resolved explicitly, never last-write-wins.
    for (const id of changed) {
      if (after.has(id)) stored.set(id, after.get(id));
      else stored.delete(id);
    }
    return [...stored.values()];
  }

  function save(message, chatChange, baseline = savedProjects) {
    let previousChats;
    let chatWritten = false;
    try {
      const merged = mergeProjectChanges(baseline);
      if (!merged) return false;
      if (chatChange) {
        const chats = ctx.storage.get('chats', []);
        const index = Array.isArray(chats) ? chats.findIndex(chat => chat.id === chatChange.id) : -1;
        if (index !== -1) {
          previousChats = chats;
          const nextChats = chats.map((chat, i) => i === index ? { ...chat, ...chatChange.changes } : chat);
          if (ctx.storage.set('chats', nextChats) === false) return false;
          chatWritten = true;
        }
      }
      if (ctx.storage.set('projects', merged) === false) {
        if (chatWritten) ctx.storage.set('chats', previousChats);
        return false;
      }
      projects = merged;
      savedProjects = structuredClone(merged);
      if (current) current = projects.find(project => project.id === current.id);
      if (message) ctx.toast(message);
      return true;
    } catch {
      if (chatWritten) { try { ctx.storage.set('chats', previousChats); } catch { /* Retain the current form for a retry. */ } }
      ctx.toast('The change could not be saved. Please try again.');
      return false;
    }
  }
  function touch(project) { project.updatedAt = new Date().toISOString(); }
  function fileKind(file) { const ext = file.name.split('.').pop().toUpperCase(); return /^[A-Z0-9]{1,5}$/.test(ext) ? ext : 'FILE'; }
  function menuButton(kind, id, label) { return `<button class="icon-btn project-menu-trigger" data-menu="${kind}" data-id="${e(id)}" aria-label="${e(label)}" aria-haspopup="menu" aria-expanded="false">${icon('more-horizontal')}</button>`; }

  function draw() {
    const input = container.querySelector('.project-composer textarea');
    const focusedField = document.activeElement && ['.project-composer textarea', '[data-search="chats"]', '[data-search="files"]', '[data-search="screenings"]'].find(selector => container.querySelector(selector) === document.activeElement);
    const activeInput = focusedField ? document.activeElement : null;
    const detailState = current ? {
      prompt: input?.value ?? readComposerDraft(draftKey).text,
      chats: container.querySelector('[data-search="chats"]')?.value || '',
      files: container.querySelector('[data-search="files"]')?.value || '',
      focusedField,
      selectionStart: activeInput?.selectionStart,
      selectionEnd: activeInput?.selectionEnd
    } : null;
    closeMenu();
    if (ctx.route[1] && !current) {
      ctx.setHeader('Projects');
      container.innerHTML = `<div class="project-missing empty-state">${icon('folder', 32)}<h2>Project not found</h2><p>This project is no longer in this browser.</p><button class="btn" data-nav="/projects">Back to projects</button></div>`;
      return;
    }
    current ? drawDetail(detailState) : drawOverview();
  }

  function drawOverview() {
    ctx.setHeader('Projects');
    container.innerHTML = `<section class="project-overview" aria-label="Projects">
      <div class="project-page-title"><div><h1>Projects</h1><p>Keep your matters, conversations and documents together.</p></div><button class="btn primary project-create" data-action="create">${icon('plus', 17)}New project</button></div>
      <div class="project-controls"><div class="project-tabs" role="tablist" aria-label="Project filter"><button role="tab" id="project-tab-all" data-filter="all" aria-controls="project-tabpanel" tabindex="${filter === 'all' ? 0 : -1}" aria-selected="${filter === 'all'}" class="${filter === 'all' ? 'selected' : ''}">All projects <span>${projects.length}</span></button><button role="tab" id="project-tab-pinned" data-filter="pinned" aria-controls="project-tabpanel" tabindex="${filter === 'pinned' ? 0 : -1}" aria-selected="${filter === 'pinned'}" class="${filter === 'pinned' ? 'selected' : ''}">${icon('pin', 14)}Pinned</button></div><div class="project-search-sort"><label class="project-search">${icon('search', 16)}<input data-search="projects" value="${e(query)}" placeholder="Search projects" aria-label="Search projects"><kbd>⌕</kbd></label><select class="project-sort" data-sort aria-label="Sort projects"><option value="updated" ${sort === 'updated' ? 'selected' : ''}>Last updated</option><option value="name" ${sort === 'name' ? 'selected' : ''}>Name A–Z</option></select></div></div>
      <div class="project-grid" id="project-tabpanel" role="tabpanel" aria-labelledby="project-tab-${filter}" tabindex="0" data-project-grid></div>
    </section>`;
    drawCards();
  }

  function drawCards() {
    const matches = projects.filter(p => (filter !== 'pinned' || p.pinned) && `${p.name} ${p.description} ${p.type}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (sort === 'name' ? a.name.localeCompare(b.name) : new Date(b.updatedAt) - new Date(a.updatedAt)));
    const grid = container.querySelector('[data-project-grid]');
    if (!grid) return;
    grid.innerHTML = matches.length ? matches.map(p => `<article class="project-card">
      <div class="project-card-top"><span class="project-folder project-folder-${e(p.color || 'cyan')}">${icon('folder', 24)}</span><div class="project-card-top-actions">${p.pinned ? `<span class="project-pinned" title="Pinned project">${icon('pin', 13)}</span>` : ''}${menuButton('project', p.id, `Options for ${p.name}`)}</div></div>
      <a class="project-card-link" href="#/projects/${encodeURIComponent(p.id)}" data-nav="/projects/${e(p.id)}"><span class="project-type">${e(p.type || 'General')}</span><h2>${e(p.name)}</h2><p>${e(p.description || 'A dedicated space for this matter.')}</p><span class="project-card-open" aria-hidden="true">${icon('arrow-up-right', 18)}</span></a>
      <div class="project-card-counts"><span>${icon('message-square', 15)}${p.chats.length} ${p.chats.length === 1 ? 'chat' : 'chats'}</span><span>${icon('file-text', 15)}${p.files.length} ${p.files.length === 1 ? 'file' : 'files'}</span></div>
      <div class="project-card-footer"><span><span class="project-status-dot"></span>Updated ${date(p.updatedAt)}</span></div>
    </article>`).join('') : `<div class="project-no-results empty-state">${icon(query ? 'search' : 'folder', 28)}<h2>${query ? 'No projects found' : filter === 'pinned' ? 'Your pinned projects will appear here' : 'Make room for your next matter'}</h2><p>${query ? 'Try a different project name or practice area.' : filter === 'pinned' ? 'Pin a project from its menu to keep it close.' : 'Create a project to bring your work together.'}</p>${query ? '<button class="btn small" data-action="clear-search">Clear search</button>' : filter === 'all' ? '<button class="btn small primary" data-action="create">Create a project</button>' : '<button class="btn small" data-filter="all">View all projects</button>'}</div>`;
  }

  function drawDetail(state = {}) {
    ctx.setHeader(current.name);
    container.innerHTML = `<section class="project-detail" aria-label="Project workspace">
      <div class="project-detail-bar"><button class="project-back" data-nav="/projects">${icon('arrow-left', 15)}All projects</button><div class="project-detail-meta"><span>${e(current.type || 'General')}</span><button class="icon-btn ${current.pinned ? 'project-is-pinned' : ''}" data-action="pin-current" aria-label="${current.pinned ? 'Unpin' : 'Pin'} project" aria-pressed="${!!current.pinned}">${icon('pin', 16)}</button>${menuButton('project', current.id, 'Project options')}</div></div>
      <section class="project-start" aria-label="Start a project chat"><span class="project-composer-mark">${icon('sparkles', 21)}</span><h1>What would you like to work on?</h1><p>Start a conversation, with this matter in view.</p>
        <form class="project-composer"><textarea name="prompt" rows="2" placeholder="Ask a question or describe a task…" aria-label="New project chat prompt" required>${e(state.prompt || '')}</textarea><div class="project-composer-bottom"><div class="project-context-pill">${icon('folder', 14)}<span>${e(current.name)}</span></div><div class="project-composer-actions"><button class="icon-btn" type="button" data-action="upload" aria-label="Add files to project">${icon('paperclip', 17)}</button><button class="project-send" type="submit" aria-label="Start project chat" ${state.prompt?.trim() ? '' : 'disabled'}>${icon('arrow-up', 19)}</button></div></div></form>
        <div class="project-suggestions"><button data-prompt="Summarise the key facts and outstanding questions in this matter.">${icon('align-left', 14)}Summarise this matter</button><button data-prompt="Help me identify the key issues to review in this matter.">${icon('scan', 14)}Identify key issues</button><button data-prompt="Draft a practical next-steps checklist for this matter.">${icon('list-checks', 14)}Plan next steps</button></div>
      </section>
      <div class="project-workspace-grid">
        <section class="project-resource-panel"><div class="project-resource-heading"><h2>Chats <span>${current.chats.length}</span></h2><button class="project-text-action" data-action="new-chat">${icon('plus', 14)}New chat</button></div><label class="project-resource-search">${icon('search', 15)}<input placeholder="Search chats" aria-label="Search project chats" data-search="chats" value="${e(state.chats || '')}"></label><div class="project-resource-list" data-chat-list></div></section>
        <section class="project-resource-panel"><div class="project-resource-heading"><h2>Files <span>${current.files.length}</span></h2><button class="project-text-action" data-action="upload">${icon('plus', 14)}Add files</button></div><label class="project-resource-search">${icon('search', 15)}<input placeholder="Search files" aria-label="Search project files" data-search="files" value="${e(state.files || '')}"></label><div class="project-resource-list" data-file-list></div></section>
      </div>
      <section class="project-resource-panel project-screenings" aria-label="Project screenings">
        <div class="project-resource-heading"><h2>Screenings <span data-screening-count aria-label="Saved screenings">…</span></h2><a class="project-text-action" href="#/screening?project=${encodeURIComponent(current.id)}" data-nav="/screening?project=${encodeURIComponent(current.id)}">${icon('plus', 14)}New screening</a></div>
        <label class="project-resource-search">${icon('search', 15)}<input placeholder="Search saved screenings" aria-label="Search project screenings" data-search="screenings" value="${e(screeningQuery)}"></label>
        <div class="project-resource-list" data-screening-list></div>
      </section>
      <input class="project-file-input" type="file" multiple accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.rtf" aria-label="Choose project files">
    </section>`;
    drawChats(state.chats || ''); drawFiles(state.files || ''); drawScreenings();
    if (state.focusedField) {
      const input = container.querySelector(state.focusedField);
      input?.focus({preventScroll: true});
      if (Number.isInteger(state.selectionStart)) input?.setSelectionRange(state.selectionStart, state.selectionEnd);
    }
  }

  function drawChats(search) {
    const chats = current.chats.filter(c => c.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));
    container.querySelector('[data-chat-list]').innerHTML = chats.length ? chats.map(chat => `<div class="project-chat-row"><a class="project-row-main" href="#/chat/${encodeURIComponent(chat.id)}?project=${encodeURIComponent(current.id)}" data-nav="/chat/${e(chat.id)}?project=${encodeURIComponent(current.id)}"><span class="project-chat-icon">${icon('message-square', 17)}</span><span class="project-row-copy"><span class="project-row-title">${e(chat.title)}</span><span class="project-row-subtitle">${chat.pinned ? '<span class="project-row-pin">Pinned</span><span>·</span>' : ''}${date(chat.updatedAt)}<span>·</span><span>Project chat</span></span></span></a>${menuButton('chat', chat.id, `Options for ${chat.title}`)}</div>`).join('') : `<div class="project-list-empty">${icon(search ? 'search' : 'message-square', 25)}<h3>${search ? 'No matching chats' : 'A fresh conversation starts here'}</h3><p>${search ? 'Try another word from the chat title.' : 'Ask your first question in the composer above.'}</p></div>`;
  }

  function drawFiles(search) {
    const files = current.files.filter(f => f.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
    container.querySelector('[data-file-list]').innerHTML = files.length ? files.map(file => `<div class="project-file-row"><button class="project-row-main" data-preview="${e(file.id)}"><span class="project-file-icon project-file-${fileKind(file).toLowerCase()}">${icon('file-text', 18)}<span>${fileKind(file)}</span></span><span class="project-row-copy"><span class="project-row-title">${e(file.name)}</span><span class="project-row-subtitle">${bytes(file.size)}<span>·</span>${date(file.addedAt)}</span></span></button>${menuButton('file', file.id, `Options for ${file.name}`)}</div>`).join('') : `<div class="project-list-empty">${icon(search ? 'search' : 'file-text', 25)}<h3>${search ? 'No matching files' : 'Give this matter some context'}</h3><p>${search ? 'Try another word from the file name.' : 'Add documents and notes to keep them together.'}</p>${search ? '' : '<button class="btn small" data-action="upload">Add files</button>'}</div>`;
  }

  function drawScreenings() {
    const list = container.querySelector('[data-screening-list]');
    if (!list || !current || disposed) return;
    const count = container.querySelector('[data-screening-count]');
    list.setAttribute('aria-busy', String(['loading', 'refreshing'].includes(screeningState)));
    if (screeningState === 'loading') {
      count.textContent = '…';
      list.innerHTML = '<div class="project-screening-message" role="status">Loading saved screenings…</div>';
      return;
    }
    if (screeningState === 'error') {
      count.textContent = '—';
      list.innerHTML = '<div class="project-screening-message" role="alert"><strong>Saved screenings could not be loaded.</strong><p>Your reports have not been changed.</p><button class="btn small" data-action="retry-screenings">Try again</button></div>';
      return;
    }
    const linked = screeningReports.filter(report => report?.query?.projectId === current.id)
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    count.textContent = String(linked.length);
    const matches = linked.filter(report => `${report.query?.name || ''} ${report.query?.country || ''}`.toLocaleLowerCase().includes(screeningQuery.trim().toLocaleLowerCase()));
    list.innerHTML = matches.length ? matches.map(report => {
      const summary = executiveSummary(report), assessment = assessmentSummary(report);
      const route = `/screening?report=${encodeURIComponent(report.id)}&project=${encodeURIComponent(current.id)}`;
      return `<a class="project-screening-row" href="#${e(route)}" data-nav="${e(route)}" data-project-report="${e(report.id)}"><span class="project-screening-icon">${icon('shield-check', 19)}</span><span class="project-row-copy"><span class="project-row-title">${e(report.query.name)}</span><span class="project-row-subtitle">${e(formatDate(report.createdAt, true))}<span>·</span>${report.research?.mode === 'search' ? 'Standard search' : report.research ? 'Deep search' : 'Saved screening'}</span><span class="project-screening-result">${e(summary.title)}</span></span><span class="project-screening-outcome${assessment.due || assessment.stale ? ' is-attention' : ''}">${e(assessment.label)}${assessment.due ? '<small>Review due</small>' : ''}</span><span class="project-screening-arrow" aria-hidden="true">${icon('arrow-up-right', 16)}</span></a>`;
    }).join('') : `<div class="project-screening-message">${icon(screeningQuery ? 'search' : 'shield-check', 23)}<strong>${screeningQuery ? 'No matching screenings' : 'No saved screenings yet'}</strong><p>${screeningQuery ? 'Try another name or country.' : 'Choose Save to project on a screening result, or start a screening here.'}</p></div>`;
  }

  function projectDialog(project) {
    const projectId = project?.id;
    const close = ctx.modal({
      title: project ? 'Edit project' : 'Create a project',
      body: `<form class="project-dialog-form"><p class="project-dialog-intro">A focused space for a matter and everything that belongs to it.</p><label>Project name<input class="field" name="name" placeholder="e.g. Aster · Corporate advisory" value="${e(project?.name || '')}" maxlength="80" required autofocus></label><label>Description <span class="project-optional">optional</span><textarea class="field" name="description" rows="3" placeholder="A short description of the matter" maxlength="240">${e(project?.description || '')}</textarea></label><label>Practice area<select class="field" name="type">${matterTypes.map(type => `<option ${project?.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></label><div class="project-dialog-actions"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn primary" type="submit">${project ? 'Save changes' : 'Create project'}</button></div></form>`,
      onMount: dialog => {
        const form = dialog.querySelector('form');
        form.querySelector('[data-cancel]').addEventListener('click', () => close());
        form.addEventListener('submit', event => {
          event.preventDefault(); const values = new FormData(form); const name = values.get('name').trim();
          if (!name) { form.elements.name.setCustomValidity('Enter a project name.'); form.elements.name.reportValidity(); return; }
          if (projectId) {
            // An upload can replace the collection while this dialog is open.
            const target = projects.find(item => item.id === projectId);
            if (!target) { ctx.toast('This project is no longer available. Your changes were not saved.'); return; }
            const before = { name: target.name, description: target.description, type: target.type, updatedAt: target.updatedAt };
            Object.assign(target, { name, description: values.get('description').trim(), type: values.get('type') }); touch(target);
            if (!save('Project updated')) { Object.assign(target, before); return; }
            ctx.refreshSidebar?.(); close(); draw();
          }
          else { const created = { id: uid('project'), name, description: values.get('description').trim(), type: values.get('type'), color: 'cyan', pinned: false, updatedAt: new Date().toISOString(), chats: [], files: [] }; projects.push(created); if (!save('Project created')) { projects.pop(); return; } ctx.refreshSidebar?.(); close(); ctx.navigate(`/projects/${created.id}`); }
        });
        form.elements.name.addEventListener('input', () => form.elements.name.setCustomValidity(''));
      }
    });
  }

  function renameChat(chat) {
    const projectId = current.id, chatId = chat.id;
    const close = ctx.modal({ title: 'Rename chat', body: `<form class="project-dialog-form"><label>Chat name<input class="field" name="name" value="${e(chat.title)}" maxlength="120" required autofocus></label><div class="project-dialog-actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary">Save name</button></div></form>`, onMount: dialog => {
      const form = dialog.querySelector('form'); form.querySelector('[data-cancel]').addEventListener('click', () => close());
      form.addEventListener('submit', event => { event.preventDefault(); const name = form.elements.name.value.trim(); if (!name) { form.elements.name.setCustomValidity('Enter a chat name.'); form.elements.name.reportValidity(); return; }
        const project = projects.find(item => item.id === projectId), target = project?.chats.find(item => item.id === chatId);
        if (!target) { ctx.toast('This chat is no longer in the project. Your changes were not saved.'); return; }
        const title = target.title, updatedAt = project.updatedAt; target.title = name; touch(project);
        if (!save('Chat renamed', { id: chatId, changes: { title: name } })) { target.title = title; project.updatedAt = updatedAt; return; }
        ctx.refreshSidebar?.(); close(); draw(); });
      form.elements.name.addEventListener('input', () => form.elements.name.setCustomValidity(''));
    } });
  }

  function moveChat(chat) {
    const projectId = current.id, chatId = chat.id;
    const destinations = projects.filter(p => p.id !== current.id);
    const close = ctx.modal({ title: 'Move chat', body: `<form class="project-dialog-form"><p class="project-dialog-intro">Move “${e(chat.title)}” to another project.</p>${destinations.length ? `<label>Destination project<select class="field" name="destination">${destinations.map(p => `<option value="${e(p.id)}">${e(p.name)}</option>`).join('')}</select></label>` : '<p class="muted">Create another project first to move this chat.</p>'}<div class="project-dialog-actions"><button class="btn" type="button" data-cancel>Cancel</button>${destinations.length ? '<button type="submit" class="btn primary">Move chat</button>' : ''}</div></form>`, onMount: dialog => {
      const form = dialog.querySelector('form'); form.querySelector('[data-cancel]').addEventListener('click', () => close());
      form.addEventListener('submit', event => { event.preventDefault(); const source = projects.find(p => p.id === projectId), target = projects.find(p => p.id === form.elements.destination.value), freshChat = source?.chats.find(item => item.id === chatId);
        if (!source || !target || !freshChat || source.id === target.id) { ctx.toast('The chat or destination is no longer available. Nothing was moved.'); return; }
        const previous = { chats: source.chats, targetChats: target.chats, updatedAt: source.updatedAt, targetUpdatedAt: target.updatedAt };
        source.chats = source.chats.filter(c => c.id !== chatId); target.chats = [...target.chats, freshChat]; touch(source); touch(target);
        if (!save(`Chat moved to ${target.name}`, { id: chatId, changes: { projectId: target.id } })) { source.chats = previous.chats; target.chats = previous.targetChats; source.updatedAt = previous.updatedAt; target.updatedAt = previous.targetUpdatedAt; return; }
        ctx.refreshSidebar?.(); close(); draw(); });
    } });
  }

  function previewFile(file) {
    const text = typeof file.content === 'string';
    ctx.modal({ title: file.name, body: `<div class="project-file-preview"><div class="project-preview-meta"><span class="project-preview-kind">${fileKind(file)}</span><span>${bytes(file.size)}</span><span>Added ${date(file.addedAt)}</span></div>${text ? `<pre class="project-preview-text" tabindex="0">${e(file.content)}</pre>` : `<div class="project-preview-unavailable">${icon('file-text', 36)}<h3>Preview unavailable</h3><p>File content is not available. Only the file details have been saved.</p><p>Add a .txt or .md file up to 250 KB to preview its text here.</p></div>`}${text ? '<div class="project-dialog-actions"><button class="btn small" data-download>Download text</button></div>' : ''}</div>`, onMount: dialog => { dialog.querySelector('[data-download]')?.addEventListener('click', () => ctx.download(file.name.replace(/\.[^.]+$/, '') + '.txt', file.content)); } });
  }

  async function addFiles(fileList) {
    const incoming = Array.from(fileList || []); if (!incoming.length) return;
    const destinationId = current.id;
    const additions = [];
    for (const file of incoming) {
      const textFormat = file.type.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(file.name);
      let content;
      if (textFormat && file.size <= MAX_TEXT_BYTES) { try { content = await file.text(); } catch { /* Keep the file metadata when reading is unavailable. */ } }
      additions.push({ id: uid('file'), name: file.name, type: file.type || 'application/octet-stream', size: file.size, addedAt: new Date().toISOString(), ...(content !== undefined ? { content } : {}) });
    }
    // File reads may finish after a route change or another project edit.
    // Merge into the latest persisted collection instead of overwriting it.
    const latest = ctx.storage.get('projects', projects);
    const destination = Array.isArray(latest) && latest.find(project => project.id === destinationId);
    if (!destination) { ctx.toast('This project is no longer available. The files were not added.'); return; }
    const baseline = structuredClone(latest);
    destination.files = [...(destination.files || []), ...additions]; touch(destination);
    const previous = projects;
    projects = latest;
    if (!save(`${incoming.length} ${incoming.length === 1 ? 'file added' : 'files added'}`, undefined, baseline)) { projects = previous; return; }
    if (!disposed) { current = destination; draw(); ctx.refreshSidebar?.(); }
  }

  function closeMenu() {
    if (!activeMenu) return;
    activeMenu.trigger.setAttribute('aria-expanded', 'false'); activeMenu.node.remove(); activeMenu = null;
  }

  function openMenu(trigger) {
    const same = activeMenu?.trigger === trigger; closeMenu(); if (same) return;
    const { menu: kind, id } = trigger.dataset;
    const item = kind === 'project' ? projects.find(p => p.id === id) : kind === 'chat' ? current.chats.find(c => c.id === id) : current.files.find(f => f.id === id);
    if (!item) return;
    const options = kind === 'project' ? [['edit', 'pencil', 'Edit project'], ['pin', 'pin', item.pinned ? 'Unpin project' : 'Pin project']] : kind === 'chat' ? [['rename', 'pencil', 'Rename chat'], ['pin', 'pin', item.pinned ? 'Unpin chat' : 'Pin chat'], ['move', 'folder', 'Move to project']] : [['preview', 'eye', 'Preview file'], ['remove', 'trash-2', 'Remove file']];
    const node = document.createElement('div'); node.className = 'project-dropdown'; node.setAttribute('role', 'menu'); node.setAttribute('aria-label', `${kind} actions`);
    node.innerHTML = options.map(([action, glyph, label]) => `<button role="menuitem" class="${action === 'remove' ? 'project-menu-danger' : ''}" data-menu-action="${action}">${icon(glyph, 15)}${label}</button>`).join('');
    trigger.parentElement.append(node); trigger.setAttribute('aria-expanded', 'true'); activeMenu = { node, trigger };
    node.querySelector('button').focus();
    node.addEventListener('click', event => {
      const button = event.target.closest('[data-menu-action]'); if (!button) return; const action = button.dataset.menuAction; event.stopPropagation(); closeMenu();
      if (action === 'edit') projectDialog(item);
      if (action === 'rename') renameChat(item);
      if (action === 'move') moveChat(item);
      if (action === 'pin') {
        item.pinned = !item.pinned;
        if (!save(item.pinned ? `${kind === 'project' ? 'Project' : 'Chat'} pinned` : `${kind === 'project' ? 'Project' : 'Chat'} unpinned`, kind === 'chat' ? { id: item.id, changes: { pinned: item.pinned } } : undefined)) { item.pinned = !item.pinned; trigger.focus(); return; }
        ctx.refreshSidebar?.(); draw();
        const restored = [...container.querySelectorAll('[data-menu]')].find(button => button.dataset.menu === kind && button.dataset.id === item.id);
        (restored || container.querySelector('[role="tab"][aria-selected="true"]'))?.focus();
      }
      if (action === 'preview') previewFile(item);
      if (action === 'remove') {
        const previous = current.files, updatedAt = current.updatedAt;
        current.files = current.files.filter(file => file.id !== item.id); touch(current);
        if (!save('File removed from this project')) { current.files = previous; current.updatedAt = updatedAt; trigger.focus(); return; }
        draw(); container.querySelector('[data-search="files"]')?.focus();
      }
    });
    node.addEventListener('keydown', event => {
      const buttons = [...node.querySelectorAll('button')]; const index = buttons.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus(); }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); buttons[event.key === 'Home' ? 0 : buttons.length - 1].focus(); }
      if (event.key === 'Tab') { closeMenu(); trigger.focus(); }

    });
  }

  function onClick(event) {
    const trigger = event.target.closest('[data-menu]'); if (trigger) { event.stopPropagation(); openMenu(trigger); return; }
    const button = event.target.closest('[data-action]');
    if (button?.dataset.action === 'create') projectDialog();
    if (button?.dataset.action === 'retry-screenings') void loadScreenings(true);
    if (button?.dataset.action === 'clear-search') { query = ''; drawOverview(); container.querySelector('[data-search="projects"]').focus(); }
    if (button?.dataset.action === 'upload') container.querySelector('.project-file-input').click();
    if (button?.dataset.action === 'new-chat') container.querySelector('.project-composer textarea').focus();
    if (button?.dataset.action === 'pin-current') {
      current.pinned = !current.pinned;
      if (!save(current.pinned ? 'Project pinned' : 'Project unpinned')) { current.pinned = !current.pinned; return; }
      ctx.refreshSidebar?.(); draw(); container.querySelector('[data-action="pin-current"]').focus();
    }
    const tab = event.target.closest('[data-filter]'); if (tab) { filter = tab.dataset.filter; drawOverview(); container.querySelector(`#project-tab-${filter}`).focus(); }
    const preview = event.target.closest('[data-preview]'); if (preview) previewFile(current.files.find(f => f.id === preview.dataset.preview));
    const suggestion = event.target.closest('[data-prompt]'); if (suggestion) { const input = container.querySelector('.project-composer textarea'); input.value = suggestion.dataset.prompt; saveDraft(); container.querySelector('.project-send').disabled = false; input.focus(); }
  }
  function onInput(event) {
    if (event.target.matches('[data-search="projects"]')) { query = event.target.value; closeMenu(); drawCards(); }
    if (event.target.matches('[data-search="chats"]')) { closeMenu(); drawChats(event.target.value); }
    if (event.target.matches('[data-search="files"]')) { closeMenu(); drawFiles(event.target.value); }
    if (event.target.matches('[data-search="screenings"]')) { screeningQuery = event.target.value; drawScreenings(); }
    if (event.target.matches('.project-composer textarea')) { saveDraft(); container.querySelector('.project-send').disabled = !event.target.value.trim(); }
  }
  function onChange(event) {
    if (event.target.matches('[data-sort]')) { sort = event.target.value; closeMenu(); drawCards(); }
    if (event.target.matches('.project-file-input')) addFiles(event.target.files);
  }
  function onSubmit(event) {
    if (!event.target.matches('.project-composer')) return;
    event.preventDefault(); const prompt = event.target.elements.prompt.value.trim();
    if (!prompt || submitting || disposed) return;
    // Navigation can clean up this view synchronously inside startChat.
    // Keep the draft until acceptance, without resaving it during cleanup.
    saveDraft(); submitting = true;
    let result;
    try { result = ctx.startChat({ prompt, tool: 'project', projectId: current.id, title: prompt.length > 65 ? prompt.slice(0, 62) + '…' : prompt }); }
    finally { submitting = false; }
    if (result === false) return;
    clearComposerDraft(draftKey);
    if (!disposed) { event.target.elements.prompt.value = ''; container.querySelector('.project-send').disabled = true; }
  }
  function onKeydown(event) {
    if (event.target.matches('[role="tab"][data-filter]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      filter = event.key === 'Home' ? 'all' : event.key === 'End' ? 'pinned' : filter === 'all' ? 'pinned' : 'all';
      drawOverview(); container.querySelector(`#project-tab-${filter}`).focus();
    }
    if (event.key === 'Escape' && activeMenu) { const trigger = activeMenu.trigger; closeMenu(); trigger.focus(); }
    if (event.target.matches('.project-composer textarea') && event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); event.target.form.requestSubmit(); }
  }
  const outside = event => { if (activeMenu && !activeMenu.node.contains(event.target) && !activeMenu.trigger.contains(event.target)) closeMenu(); };
  container.addEventListener('click', onClick); container.addEventListener('input', onInput); container.addEventListener('change', onChange); container.addEventListener('submit', onSubmit); container.addEventListener('keydown', onKeydown); document.addEventListener('click', outside);
  draw();
  if (screeningHistory) void loadScreenings();
  return () => { saveDraft(); disposed = true; stopScreeningUpdates?.(); if (screeningHistory && !ctx.screeningHistory) void screeningHistory.close().catch(() => {}); closeMenu(); container.removeEventListener('click', onClick); container.removeEventListener('input', onInput); container.removeEventListener('change', onChange); container.removeEventListener('submit', onSubmit); container.removeEventListener('keydown', onKeydown); document.removeEventListener('click', outside); };
}
