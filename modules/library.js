import {workflowSamples as samples} from './workflow-samples.js';
import {contractItems} from './contract-library.js';

const tools = [
  ['review', 'Review a document', 'Find the clauses that deserve a closer look.', 'scan', 'Review', 'Review the attached document. Create a source-linked issue list covering material risks, unclear language and missing protections. Separate observations from recommendations and identify questions that require client instructions.'],
  ['edit', 'Edit & refine', 'Turn a working draft into clear, precise language.', 'pencil', 'Drafting', 'Edit the attached draft for clarity, consistency and precision. Preserve its commercial intent. Show proposed wording alongside the original, explain material changes and flag anything that needs an instruction.'],
  ['resolution', 'Draft resolutions', 'Move from agreed terms to a decision-ready draft.', 'building', 'Transactions', 'Prepare draft board resolutions from the supplied term sheet and company details. Identify the decisions, required approvals and execution steps. Use placeholders for missing facts and include a short assumptions list.'],
  ['compare', 'Compare versions', 'See what changed, and why the change matters.', 'git-compare', 'Review', 'Compare the two supplied document versions. Reconcile changes by clause, distinguish drafting changes from substantive changes, and explain the possible effect of each material revision. Refer to both source versions.'],
  ['translate', 'Translate a document', 'Bridge languages while preserving legal meaning.', 'languages', 'Drafting', 'Translate the supplied document between English and Greek, preserving its structure, defined terms and legal meaning. Provide a bilingual terminology table and flag expressions that have no straightforward equivalent.'],
  ['pleading', 'Check a pleading', 'Bring structure and consistency to your next filing.', 'scale', 'Litigation', 'Check the supplied pleading for internal consistency, chronology, defined parties, factual support and requested relief. Identify gaps without inventing facts or authorities, and list questions for the responsible lawyer.'],
  ['opinion', 'Structure an opinion', 'Give a complex legal question a clear framework.', 'file-text', 'Research', 'Build a first-draft opinion framework from the supplied facts and legal question. Separate facts, assumptions, issues, applicable sources, analysis and provisional conclusions. Flag propositions that require legal research.'],
  ['draft', 'Draft from a brief', 'Give your instructions a considered first draft.', 'pen-line', 'Drafting', 'Create a first draft from the supplied brief. Follow the requested format and tone, use explicit placeholders for missing information and finish with a concise list of assumptions and decisions needed.'],
  ['chronology', 'Build a chronology', 'Bring scattered events into a single, useful timeline.', 'clock', 'Litigation', 'Extract a chronology from the supplied documents. For each event, give the date, actors, concise description and source reference. Distinguish confirmed dates from inferred dates and identify inconsistencies.']
].map(([id, title, description, icon, category, prompt]) => ({ id, type: 'tools', title, description, icon, category, prompt, tool: id }));

const skills = [
  { id: 'skill-chronology', title: 'Matter chronology', description: 'Organize facts, dates and evidence into a working timeline.', icon: 'clock', category: 'Litigation', tool: 'chronology', prompt: 'Create an evidence-linked matter chronology from the supplied material. Use columns for date, event, parties, source and confidence. Flag conflicting dates and undated events separately.' },
  { id: 'skill-obligations', title: 'Obligations & deadlines', description: 'Make the who, what and when in a contract easy to follow.', icon: 'list-checks', category: 'Review', tool: 'review', prompt: 'Extract contractual obligations into a table: responsible party, obligation, trigger, deadline, dependency and exact source clause. Keep express obligations separate from inferred follow-up actions.' },
  { id: 'skill-template', title: 'Draft from a template', description: 'Adapt an established structure to the facts of a new matter.', icon: 'files', category: 'Drafting', tool: 'draft', prompt: 'Adapt the supplied template to the new matter instructions. Preserve required boilerplate, update matter-specific details, flag conflicting instructions and retain clear placeholders for missing information.' },
  { id: 'skill-assessment', title: 'Initial case assessment', description: 'Map the issues, evidence and questions that come next.', icon: 'scale', category: 'Litigation', tool: 'opinion', prompt: 'Prepare an initial case assessment from the supplied facts and documents. Outline the issues, competing positions, available evidence, gaps and next enquiries. Do not predict an outcome or invent authorities.' },
  { id: 'skill-privilege', title: 'Privilege review preparation', description: 'Build a preliminary log for a lawyer’s privilege assessment.', icon: 'shield', category: 'Review', tool: 'review', prompt: 'Prepare a preliminary privilege review log from the supplied documents. Record document date, author, recipients, subject, possible privilege indicators and questions for legal review. Do not make a final privilege determination.' },
  { id: 'skill-client-update', title: 'Client update', description: 'Translate matter activity into a clear, useful update.', icon: 'mail', category: 'Drafting', tool: 'draft', prompt: 'Draft a concise client update from the supplied matter notes. Explain progress, current status, upcoming dates and decisions needed in plain English. Separate confirmed developments from matters still under review.' },
  { id: 'skill-notices', title: 'Notice requirements', description: 'Recipients, delivery methods and time limits.', icon: 'mail', category: 'Review', tool: 'review', prompt: 'Extract notice requirements from the supplied agreement. Record the notice type, trigger, period, permitted delivery methods, recipient, address and deemed receipt rule with source clauses. Flag missing details and separate calendar calculations from assumptions.' },
  { id: 'skill-cross-references', title: 'Cross-reference check', description: 'Catch broken references before a draft goes out.', icon: 'files', category: 'Drafting', tool: 'edit', prompt: 'Check internal references in the supplied draft, including clauses, schedules and annexes. Identify missing targets, inconsistent numbering and references whose subject does not match. Give the original reference, the source location and a proposed correction only where the intended target is clear.' },
  { id: 'skill-evidence-map', title: 'Evidence map', description: 'Connect each allegation to the supporting record.', icon: 'scale', category: 'Litigation', tool: 'opinion', prompt: 'Map the material allegations in the supplied matter to supporting and contradicting evidence. Create a table of issue, proposition, source, opposing evidence and remaining gap. Distinguish what a document actually records from inference and identify the next factual enquiry.' }

].map(item => ({ ...item, type: 'skills' }));

const prompts = [
  { id: 'prompt-lease', title: 'Abstract a commercial lease', description: 'The terms your property team needs, in one table.', icon: 'building', category: 'Transactions', tool: 'review', prompt: 'Prepare a lease abstract with premises, parties, term, rent, review mechanism, deposit, break rights, repairs, assignment and notice provisions. Give a source clause for every entry and write “not located” where a term is missing.' },
  { id: 'prompt-extract', title: 'Extract a document table', description: 'Turn an unstructured document set into usable information.', icon: 'table', category: 'Review', tool: 'review', prompt: 'Extract the requested fields from each supplied document into a single table. Include document name and source location. Preserve original values, flag ambiguous entries and use “not located” instead of guessing.' },
  { id: 'prompt-questions', title: 'Prepare for a client meeting', description: 'Ask the questions that move a matter forward.', icon: 'message-square', category: 'Litigation', tool: 'opinion', prompt: 'Using these matter notes, prepare a focused client meeting agenda. Group questions by issue, explain what each answer would clarify and highlight documents the client should bring.' },
  { id: 'prompt-defined', title: 'Audit defined terms', description: 'Find missing, unused and inconsistent definitions.', icon: 'text', category: 'Review', tool: 'review', prompt: 'Audit the defined terms in this document. List undefined capitalized terms, unused definitions, inconsistent labels and circular definitions. Include source locations and proposed fixes.' },
  { id: 'prompt-correspondence', title: 'Draft a measured response', description: 'Make your position clear in professional correspondence.', icon: 'mail', category: 'Drafting', tool: 'draft', prompt: 'Draft a measured response to the supplied correspondence using our instructions. Address each material point, preserve any stated reservations and identify missing instructions. Do not introduce new admissions or factual claims.' },
  { id: 'prompt-handover', title: 'Prepare a matter handover', description: 'Give the next lawyer a clear place to begin.', icon: 'briefcase', category: 'Drafting', tool: 'draft', prompt: 'Prepare a matter handover from the supplied notes. Cover the client objective, current position, key documents, open issues, upcoming dates and next actions. Identify the source of each deadline.' },
  { id: 'prompt-judgment', title: 'Summarize a judgment', description: 'Facts, reasoning and outcome, with source references.', icon: 'scale', category: 'Research', tool: 'opinion', prompt: 'Summarize the supplied judgment: procedural history, material facts, questions decided, reasoning and final orders. Identify the paragraphs supporting each key point. Keep the actual holding distinct from the parties’ arguments and any observations not necessary to the result.' },
  { id: 'prompt-negotiation', title: 'Prepare negotiation points', description: 'Turn open clauses into decisions for the client.', icon: 'git-compare', category: 'Transactions', tool: 'review', prompt: 'Using the supplied draft and client instructions, prepare a negotiation table with clause, current position, practical concern, proposed position and possible fallback. Flag where a commercial instruction is needed and do not invent a client preference.' },
  { id: 'prompt-instructions', title: 'Identify missing instructions', description: 'A focused list of what you need before drafting.', icon: 'message-square', category: 'Drafting', tool: 'draft', prompt: 'Review the supplied drafting brief and documents. List the material instructions still needed, grouped by parties, commercial terms, timetable and approvals. Explain briefly what each answer affects and distinguish essential questions from optional refinements.' }

].map(item => ({ ...item, type: 'prompts' }));

const workflows = [
  { id: 'workflow-contract', title: 'Contract first pass', description: 'From a new agreement to a focused review brief.', icon: 'scan', category: 'Review', tool: 'review', duration: '4 steps', prompt: 'Run a first-pass contract review: summarize the deal, extract key obligations, identify material issues with source clauses and prepare a prioritized review brief.', steps: [{ title: 'Understand the agreement', description: 'Identify the parties, purpose and key commercial terms.' }, { title: 'Extract obligations', description: 'Map duties, deadlines and dependencies to their clauses.' }, { title: 'Review material issues', description: 'Separate drafting points from questions for the client.' }, { title: 'Prepare the review brief', description: 'Prioritize findings and propose useful next actions.' }] },
  { id: 'workflow-litigation', title: 'Litigation briefing', description: 'Bring the facts, issues and evidence into focus.', icon: 'scale', category: 'Litigation', tool: 'pleading', duration: '4 steps', prompt: 'Prepare a litigation briefing from the supplied material: build a fact chronology, map issues to evidence, identify gaps and draft a briefing with next enquiries.', steps: [{ title: 'Build the fact pattern', description: 'Identify the parties, key events and disputed facts.' }, { title: 'Map the evidence', description: 'Connect each material proposition to the supplied record.' }, { title: 'Identify open questions', description: 'Highlight missing documents and competing accounts.' }, { title: 'Draft a briefing', description: 'Create a concise working brief for the case team.' }] },
  { id: 'workflow-closing', title: 'Closing pack', description: 'Turn agreed terms into a coordinated set of next steps.', icon: 'briefcase', category: 'Transactions', tool: 'resolution', duration: '5 steps', prompt: 'Prepare a closing pack from the supplied transaction terms: extract conditions, identify approvals, draft resolutions, build a completion checklist and flag open dependencies.', steps: [{ title: 'Extract the agreed terms', description: 'Capture the transaction structure and key dates.' }, { title: 'Identify approvals', description: 'List the proposed approvals for counsel to confirm.' }, { title: 'Draft the resolutions', description: 'Prepare working drafts with explicit placeholders.' }, { title: 'Build the closing checklist', description: 'Assign actions, documents and dependencies.' }, { title: 'Surface open items', description: 'Show what still needs an instruction or confirmation.' }] },
  { id: 'workflow-chronology', title: 'Document chronology', description: 'Connect a document set to a reliable working timeline.', icon: 'clock', category: 'Litigation', tool: 'chronology', duration: '4 steps', prompt: 'Build a source-linked document chronology: extract events, normalize dates, reconcile inconsistencies and produce a timeline with an evidence index.', steps: [{ title: 'Extract dated events', description: 'Read the supplied record for dates, actors and events.' }, { title: 'Normalize the timeline', description: 'Order events and distinguish exact from inferred dates.' }, { title: 'Reconcile discrepancies', description: 'Flag conflicting accounts and missing context.' }, { title: 'Create an evidence index', description: 'Keep the supporting documents close to each event.' }] },
  { id: 'workflow-versions', title: 'Version reconciliation', description: 'Turn two drafts into a clear record of the negotiation.', icon: 'git-compare', category: 'Review', tool: 'compare', duration: '4 steps', prompt: 'Reconcile the supplied document versions: align clauses, identify substantive and drafting changes, explain their effect and produce a negotiation issues table.', steps: [{ title: 'Align the versions', description: 'Match clauses even where numbering has changed.' }, { title: 'Classify the changes', description: 'Separate structural, drafting and substantive revisions.' }, { title: 'Assess the effect', description: 'Explain what each material revision may change.' }, { title: 'Prepare a decision table', description: 'List the points to accept, discuss or seek instructions on.' }] },
  { id: 'workflow-lease', title: 'Lease review', description: 'Key terms, open clauses and tenant instructions.', icon: 'building', category: 'Transactions', tool: 'review', duration: '4 steps', prompt: 'Prepare a lease review from the supplied agreement and client instructions: extract the key terms, map ongoing obligations, identify material points and prepare a client decision list with source references.', steps: [{ title: 'Capture the lease terms', description: 'Identify the premises, term, rent and parties.' }, { title: 'Map ongoing obligations', description: 'Locate repair, payment and insurance responsibilities.' }, { title: 'Review exit and renewal', description: 'Check notice, break and extension provisions.' }, { title: 'Prepare client decisions', description: 'Connect each open point to the clause and instruction needed.' }] },
  { id: 'workflow-notices', title: 'Renewal & notice tracker', description: 'Turn key dates into a clear action schedule.', icon: 'calendar', category: 'Review', tool: 'review', duration: '4 steps', prompt: 'Build a renewal and notice tracker from the supplied agreement. Extract the term and triggers, capture delivery and receipt requirements, calculate dates only where all required inputs are supplied, and list the responsible owner and any unresolved assumptions.', steps: [{ title: 'Find the relevant triggers', description: 'Locate expiry, renewal and termination provisions.' }, { title: 'Capture notice mechanics', description: 'Record recipients, delivery methods and receipt rules.' }, { title: 'Build the date schedule', description: 'Separate express dates from calculations requiring confirmation.' }, { title: 'Assign follow-up actions', description: 'Make missing details and the next owner visible.' }] },
  { id: 'workflow-negotiation', title: 'Negotiation response', description: 'From counterparty changes to a measured reply.', icon: 'git-compare', category: 'Transactions', tool: 'draft', duration: '4 steps', prompt: 'Prepare a negotiation response from the supplied counterparty changes and client instructions: identify changes, map each to the client position, draft a response table and produce measured correspondence without adding unapproved concessions.', steps: [{ title: 'Identify the changes', description: 'Group the counterparty’s material requests by clause.' }, { title: 'Check client instructions', description: 'Distinguish agreed positions from questions still open.' }, { title: 'Prepare a response table', description: 'Show proposed wording, rationale and any fallback.' }, { title: 'Draft the covering reply', description: 'Address the agreed points and reserve outstanding instructions.' }] },
  { id: 'workflow-handover', title: 'Matter handover', description: 'Keep the next lawyer clear on what comes next.', icon: 'briefcase', category: 'Drafting', tool: 'draft', duration: '4 steps', prompt: 'Prepare a matter handover from the supplied notes and documents: summarize the objective and status, index key sources, extract outstanding actions and dates, and produce a concise briefing for the receiving lawyer.', steps: [{ title: 'Establish the current position', description: 'Summarize the client objective and confirmed progress.' }, { title: 'Index the working record', description: 'Identify the key drafts, correspondence and instructions.' }, { title: 'Extract open actions', description: 'Record owners, dates and missing information.' }, { title: 'Write the handover', description: 'Give the receiving lawyer a clear first set of steps.' }] }

].map(item => ({ ...item, type: 'workflows' }));

const matrixTool = { id: 'tool-matrix', type: 'tools', title: 'Review a document set', description: 'Compare key terms across every agreement.', icon: 'table', category: 'Review', tool: 'matrix', prompt: 'Compare key terms across a document set in a source-linked table, identify differences and open the supporting clause for each finding.' };
const screeningTool = { id: 'screening', type: 'tools', title: 'Screen a client', description: 'Sanctions, source evidence & review decisions.', icon: 'shield', category: 'Compliance', tool: 'screening', prompt: 'Screen a person or company against the available sanctions sources and review the evidence for each potential match.' };

export const libraryItems = [...contractItems, ...tools, screeningTool, matrixTool, ...skills, ...prompts, ...workflows];

const tabInfo = {
  contracts: { title: 'Contracts', icon: 'file-text', subtitle: 'Your office’s agreements, organised in one place.' },
  tools: { title: 'Tools', icon: 'grid', subtitle: 'Purpose-built tools for the work in front of you.' },
  skills: { title: 'Skills', icon: 'sparkles', subtitle: 'Repeatable approaches that bring structure to your work.' },
  prompts: { title: 'Prompts', icon: 'message-square', subtitle: 'Thoughtful starting points. Ready for your instructions.' },
  workflows: { title: 'Workflows', icon: 'workflow', subtitle: 'Connected steps for work that takes more than one prompt.' }
};



export function render(container, ctx) {
  const e = ctx.escape;
  const iconAliases = { scan: 'checklist', pencil: 'edit', files: 'copy', 'list-checks': 'checklist', table: 'grid', text: 'list', play: 'arrow-right' };
  const ic = (name, size = 18) => ctx.icon(iconAliases[name] || name, size);
  let tab = Object.hasOwn(tabInfo, ctx.params?.get('tab')) ? ctx.params.get('tab') : 'tools';
  let query = '';
  let category = 'all';
  let savedOnly = false;
  const storedSaved = ctx.storage.get('library-saved', []);
  let saved = new Set(Array.isArray(storedSaved) ? storedSaved.filter(id => typeof id === 'string') : []);
  const storedPrompts = ctx.storage.get('library-custom-prompts', []);
  let customPrompts = Array.isArray(storedPrompts) ? storedPrompts.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.prompt === 'string') : [];
  let lastDeletedId = null;
  let closeActiveModal = null;
  if (!ctx.embeddedLibrary) ctx.setHeader('Library');

  const collection = () => [...libraryItems, ...customPrompts.filter(item => !item.deletedAt)];
  const deletedPrompts = () => customPrompts.filter(item => item.deletedAt);
  const isSaved = id => saved.has(id);
  const saveButton = item => `<button class="library-save ${isSaved(item.id) ? 'is-saved' : ''}" data-library-save="${item.id}" aria-label="${isSaved(item.id) ? 'Unsave' : 'Save'} ${e(item.title)}" aria-pressed="${isSaved(item.id)}" title="${isSaved(item.id) ? 'Remove from saved' : 'Save to your library'}">${ic('bookmark', 17)}</button>`;

  function card(item) {
    return `<article data-library-item="${e(item.id)}" class="library-card ${ctx.librarySelection?.id === item.id ? 'is-selected' : ''} ${item.type === 'workflows' ? 'library-card-workflow' : ''} ${item.type === 'contracts' ? 'library-card-contract' : ''}">
      <div class="library-card-top"><span class="library-item-icon">${ic(item.icon, 22)}</span>${saveButton(item)}</div>
      <button class="library-card-main" data-library-open="${item.id}"><h3>${e(item.title)}</h3><p>${e(item.description)}</p></button>
      ${item.type === 'contracts' ? `<div class="library-contract-meta"><span>Contract</span><span>${e(item.jurisdiction)}</span>${item.perspectives.length ? `<span>${item.perspectives.map(p => e(p.label)).join(' / ')}</span>` : ''}</div>` : ''}
      ${item.type === 'workflows' ? `<div class="library-step-mini" aria-label="${item.steps.length} connected steps">${item.steps.map((s, i) => `<span title="${e(s.title)}">${i + 1}</span>`).join('')}</div>` : ''}
      <div class="library-card-bottom"><span>${e(item.category)}${item.type === 'workflows' ? `<span class="library-meta-dot">·</span>${item.steps.length} steps` : ''}</span><button class="library-card-go" data-library-open="${item.id}" aria-label="Open ${e(item.title)}">${ic(item.type === 'contracts' ? 'arrow-right' : 'arrow-up-right', 18)}</button></div>
    </article>`;
  }

  function filteredItems() {
    const normalized = query.trim().toLowerCase();
    return collection().filter(item => item.type === tab && (!savedOnly || isSaved(item.id)) && (category === 'all' || item.category === category) && (!normalized || `${item.title} ${item.description} ${item.category} ${item.prompt || ''} ${(item.perspectives || []).map(p => p.label).join(' ')}`.toLowerCase().includes(normalized)));
  }

  function updateResults() {
    const items = filteredItems();
    container.querySelector('.library-results').innerHTML = items.length ? items.map(card).join('') : `<div class="library-empty"><span class="library-empty-icon">${ic(savedOnly ? 'bookmark' : 'search', 26)}</span><h3>${savedOnly && !query ? 'Your next favorite is waiting.' : 'No matches just yet.'}</h3><p>${savedOnly && !query ? 'Save useful starting points with the bookmark on any card.' : 'Try another keyword or clear your filters to see more.'}</p><button class="btn small" data-library-reset>Show all ${tabInfo[tab].title.toLowerCase()}</button></div>`;
    container.querySelector('.library-result-count').textContent = `${items.length} ${items.length === 1 ? tab.slice(0, -1) : tab}`;
    const savedButton = container.querySelector('[data-library-saved-filter]');
    savedButton.classList.toggle('is-active', savedOnly);
    savedButton.setAttribute('aria-pressed', String(savedOnly));
  }

  function draw() {
    const items = collection();
    const categories = [...new Set(items.filter(item => item.type === tab).map(item => item.category))].sort();
    if (category !== 'all' && !categories.includes(category)) category = 'all';
    const lastDeleted = customPrompts.find(item => item.id === lastDeletedId && item.deletedAt);
    container.innerHTML = `<div class="library-page">
      ${ctx.embeddedLibrary ? '<div class="library-explorer-rail">' : ''}
      <div class="library-intro"><div><h1>Library</h1><p>Contracts, tools and expertise. In one place.</p></div>${tab === 'prompts' ? `<div class="library-prompt-heading-actions">${deletedPrompts().length ? `<button class="btn ghost small" data-library-deleted>${ic('trash', 14)} Deleted (${deletedPrompts().length})</button>` : ''}<button class="btn primary" data-library-create>${ic('plus', 16)} New prompt</button></div>` : ''}</div>
      <div class="library-tabs" role="tablist" aria-label="Library categories"${ctx.embeddedLibrary ? ' aria-orientation="vertical"' : ''}>${Object.entries(tabInfo).map(([key, info]) => `<button role="tab" id="library-tab-${key}" aria-controls="library-results" aria-selected="${tab === key}" tabindex="${tab === key ? 0 : -1}" data-library-tab="${key}" class="library-tab ${tab === key ? 'is-active' : ''}">${ic(info.icon, 17)}<span>${info.title}</span><span class="library-tab-count">${items.filter(item => item.type === key).length}</span></button>`).join('')}</div>
      ${ctx.embeddedLibrary ? '</div><div class="library-explorer-list">' : ''}
      <div class="library-section-intro"><p>${e(tabInfo[tab].subtitle)}</p><span class="library-curated">${tab === 'contracts' ? `${ic('building', 13)} Office templates` : `${ic('sparkles', 13)} Created for your practice`}</span></div>
      <div class="library-toolbar"><label class="library-search">${ic('search', 18)}<input type="search" placeholder="Search ${tabInfo[tab].title.toLowerCase()}…" aria-label="Search ${tabInfo[tab].title.toLowerCase()}" value="${e(query)}"><kbd>/</kbd></label><div class="library-filters"><label class="library-category-label"><span class="library-sr-only">Filter by category</span><select aria-label="Filter by category"><option value="all">All categories</option>${categories.map(value => `<option value="${e(value)}" ${value === category ? 'selected' : ''}>${e(value)}</option>`).join('')}</select>${ic('chevron-down', 14)}</label><button class="library-saved-filter" data-library-saved-filter aria-pressed="${savedOnly}">${ic('bookmark', 16)} Saved</button></div></div>
      ${lastDeleted ? `<div class="library-notice" role="status"><span>“${e(lastDeleted.title)}” moved to recently deleted.</span><button class="library-text-button" data-library-undo-delete>Undo</button></div>` : ''}
      <div class="library-results-heading"><span class="library-result-count"></span><span>${tab === 'contracts' ? 'Your office’s templates' : 'Ready when you are'}</span></div>
      <div class="library-results" id="library-results" role="tabpanel" aria-labelledby="library-tab-${tab}"></div>
      <div class="library-footnote"><span class="library-footnote-icon">${ic(tab === 'contracts' ? 'book' : 'sparkles', 17)}</span><div><strong>${tab === 'contracts' ? 'Your office’s know-how.' : 'A starting point, shaped by you.'}</strong><span>${tab === 'contracts' ? 'Cyprus law · Your agreements, in one library.' : 'Add your documents and instructions to make each task fit your matter.'}</span></div></div>
      ${ctx.embeddedLibrary ? '</div>' : ''}
    </div>`;
    updateResults();
  }

  function persistSave(id) {
    const next = new Set(saved);
    if (next.has(id)) next.delete(id); else next.add(id);
    if (ctx.storage.set('library-saved', [...next]) === false) return;
    saved = next;
    updateResults();
  }

  function launch(item, prompt, title = item.title) {
    if (item.tool !== 'matrix' && ctx.startChat({ prompt, tool: item.tool, title, ...(item.tool === 'screening' && ctx.params.get('project') ? {projectId: ctx.params.get('project')} : {}), ...(item.type === 'workflows' ? {workflowId: item.id} : {}) }) === false) return false;
    closeActiveModal?.();
    closeActiveModal = null;
    if (item.tool === 'matrix') { ctx.navigate('/matrix'); return; }
    return true;
  }

  function detail(item, launchPrompt = item.prompt) {
    if (ctx.librarySelection) {
      ctx.librarySelection.id = item.id;
      container.querySelectorAll('[data-library-item]').forEach(card => card.classList.toggle('is-selected', card.dataset.libraryItem === item.id));
    }
    if (item.type === 'contracts') return contractDetail(item);
    if (item.tool === 'matrix') return matrixDetail(item);
    if (item.tool === 'screening') return screeningDetail(item);
    if (item.type === 'workflows') return workflowDetail(item);
    const noun = { tools: 'Tool', skills: 'Skill', prompts: 'Prompt' }[item.type];
    closeActiveModal = ctx.modal({
      title: item.title,
      body: `<div class="library-detail"><div class="library-detail-lead"><span class="library-item-icon">${ic(item.icon, 24)}</span><div><div class="library-detail-meta">${noun}<span>·</span>${e(item.category)}</div><p>${e(item.description)}</p></div></div><div class="library-detail-note">${ic('file-text', 17)}<span>Add your documents in the workspace after starting this task.</span></div><label class="library-input-label" for="library-prompt-input">${item.type === 'prompts' ? 'Your prompt' : 'Starting instructions'}<span>Make them your own</span></label><textarea id="library-prompt-input" class="library-prompt-input" rows="7">${e(launchPrompt)}</textarea><p class="library-input-help">${item.custom ? 'Changes here apply to this launch. Choose Edit saved prompt to update your reusable instructions.' : 'Review and adapt the instructions to your matter before continuing.'}</p>${item.custom ? `<div class="library-custom-controls"><button class="library-text-button" data-custom-edit>${ic('edit', 14)} Edit saved prompt</button><button class="library-text-button library-delete-prompt" data-custom-delete>${ic('trash', 14)} Delete prompt</button></div>` : ''}<div class="library-detail-actions"><button class="btn" data-detail-save aria-pressed="${isSaved(item.id)}">${ic('bookmark', 16)} ${isSaved(item.id) ? 'Saved' : 'Save to library'}</button><button class="btn primary" data-detail-launch>${item.type === 'prompts' ? 'Use prompt' : 'Start task'} ${ic('arrow-right', 16)}</button></div></div>`,
      onMount: root => {
        const field = root.querySelector('#library-prompt-input');
        root.querySelector('[data-detail-save]').addEventListener('click', event => {
          persistSave(item.id);
          event.currentTarget.innerHTML = `${ic('bookmark', 16)} ${isSaved(item.id) ? 'Saved' : 'Save to library'}`;
          event.currentTarget.setAttribute('aria-pressed', String(isSaved(item.id)));
        });
        root.querySelector('[data-detail-launch]').addEventListener('click', () => {
          if (!field.value.trim()) { field.setCustomValidity('Add your instructions to begin.'); field.reportValidity(); return; }
          launch(item, field.value.trim());
        });
        field.addEventListener('input', () => field.setCustomValidity(''));
        root.querySelector('[data-custom-edit]')?.addEventListener('click', () => promptEditor(item, { launchPrompt: field.value }));
        root.querySelector('[data-custom-delete]')?.addEventListener('click', () => deletePrompt(item));
      }
    });
  }

  function contractDetail(item) {
    closeActiveModal = ctx.modal({
      title: item.title,
      body: `<div class="library-contract-detail"><div class="library-contract-lead"><span class="library-item-icon">${ic('file-text', 24)}</span><div><div class="library-detail-meta">Contract<span>·</span>${e(item.category)}</div><p>${e(item.description)}</p></div></div><div class="library-contract-facts"><span>Jurisdiction<strong>${e(item.jurisdiction)}</strong></span><span>Template collection<strong>${e(item.provider)}</strong></span></div>${item.perspectives.length ? `<section class="library-contract-perspectives"><h3>Parties</h3><div>${item.perspectives.map(p => `<span class="library-contract-perspective">${ic('briefcase', 16)}${e(p.label)}</span>`).join('')}</div></section>` : ''}<div class="library-contract-empty"><span>${ic('file-text', 26)}</span><div><h3>${item.kind === 'nda' ? 'Reviewed NDA example' : 'Your office template'}</h3><p>${item.kind === 'nda' ? 'Preview the question flow and your reviewed Greek agreement.' : 'No template added yet. Your office’s agreement will be available here.'}</p></div></div><div class="library-detail-actions"><button class="btn" data-detail-save aria-pressed="${isSaved(item.id)}">${ic('bookmark', 16)} ${isSaved(item.id) ? 'Saved' : 'Save to library'}</button><button class="btn primary" data-contract-select>Use agreement ${ic('arrow-right', 16)}</button></div></div>`,
      onMount: root => {
        root.querySelector('[data-contract-select]').addEventListener('click', () => {
          closeActiveModal?.(); closeActiveModal = null;
          ctx.navigate('/chat?contract=' + encodeURIComponent(item.id));
        });
        root.querySelector('[data-detail-save]').addEventListener('click', event => {
          persistSave(item.id);
          event.currentTarget.innerHTML = `${ic('bookmark', 16)} ${isSaved(item.id) ? 'Saved' : 'Save to library'}`;
          event.currentTarget.setAttribute('aria-pressed', String(isSaved(item.id)));
        });
      }
    });
  }

  function screeningDetail(item) {
    closeActiveModal = ctx.modal({
      title: item.title,
      body: `<div class="library-detail"><div class="library-detail-lead"><span class="library-item-icon">${ic('shield', 24)}</span><div><div class="library-detail-meta">Tool<span>·</span>Compliance</div><p>${e(item.description)}</p></div></div><ul class="library-matrix-features"><li>${ic('search', 17)}<span><strong>Start with a name</strong>Add identifying details for a person or company.</span></li><li>${ic('file-text', 17)}<span><strong>Keep the evidence close</strong>Inspect potential matches alongside their sources.</span></li><li>${ic('checklist', 17)}<span><strong>Record your review</strong>Resolve matches and keep the reasons with your report.</span></li></ul><div class="library-detail-actions"><button class="btn" data-detail-save aria-pressed="${isSaved(item.id)}">${ic('bookmark', 16)} ${isSaved(item.id) ? 'Saved' : 'Save to library'}</button><button class="btn primary" data-screening-open>Open screening ${ic('arrow-right', 16)}</button></div></div>`,
      onMount: root => {
        root.querySelector('[data-detail-save]').addEventListener('click', event => {
          persistSave(item.id);
          event.currentTarget.innerHTML = `${ic('bookmark', 16)} ${isSaved(item.id) ? 'Saved' : 'Save to library'}`;
          event.currentTarget.setAttribute('aria-pressed', String(isSaved(item.id)));
        });
        root.querySelector('[data-screening-open]').addEventListener('click', () => launch(item));
      }
    });
  }

  function matrixDetail(item) {
    closeActiveModal = ctx.modal({
      title: item.title,
      body: `<div class="library-detail"><div class="library-detail-lead"><span class="library-item-icon">${ic('table', 24)}</span><div><div class="library-detail-meta">Tool<span>·</span>Document set review</div><p>${e(item.description)}</p></div></div><div class="library-matrix-preview" aria-hidden="true"><div></div><div>Term</div><div>Notice</div><div>Liability</div><div>Agreement A</div><div>12 months</div><div>30 days</div><div class="library-matrix-highlight">Uncapped</div><div>Agreement B</div><div>24 months</div><div>60 days</div><div>Annual fees</div><div>Agreement C</div><div>12 months</div><div class="library-matrix-highlight">Not located</div><div>€100,000</div></div><ul class="library-matrix-features"><li>${ic('files', 17)}<span><strong>Six contracts</strong>Compare agreement terms in one table.</span></li><li>${ic('file-text', 17)}<span><strong>Open the supporting clause</strong>Click a source cell to inspect the clause behind it.</span></li><li>${ic('settings', 17)}<span><strong>Choose the terms that matter</strong>Change the visible columns and export the table for review.</span></li></ul><div class="library-detail-actions"><button class="btn" data-detail-save aria-pressed="${isSaved(item.id)}">${ic('bookmark', 16)} ${isSaved(item.id) ? 'Saved' : 'Save to library'}</button><button class="btn primary" data-matrix-open>Open document set ${ic('arrow-right', 16)}</button></div></div>`,
      onMount: root => {
        root.querySelector('[data-detail-save]').addEventListener('click', event => {
          persistSave(item.id);
          event.currentTarget.innerHTML = `${ic('bookmark', 16)} ${isSaved(item.id) ? 'Saved' : 'Save to library'}`;
          event.currentTarget.setAttribute('aria-pressed', String(isSaved(item.id)));
        });
        root.querySelector('[data-matrix-open]').addEventListener('click', () => launch(item));
      }
    });
  }

  function persistCustomPrompts(next) {
    if (ctx.storage.set('library-custom-prompts', next) === false) return false;
    customPrompts = next;
    return true;
  }

  function promptEditor(item = null, options = {}) {
    const returnsToLaunch = !!item && Object.hasOwn(options, 'launchPrompt');
    closeActiveModal?.();
    closeActiveModal = ctx.modal({
      title: item ? 'Edit saved prompt' : 'New prompt',
      body: `<form class="library-prompt-form"><p class="library-editor-intro">Keep instructions you use often, ready for your next matter.</p><label class="library-input-label" for="library-custom-title">Prompt name</label><input class="library-custom-title" id="library-custom-title" name="title" value="${e(item?.title || '')}" placeholder="E.g. Prepare a weekly client update" required maxlength="80" autocomplete="off"><label class="library-input-label" for="library-custom-instructions">Instructions</label><textarea class="library-prompt-input" id="library-custom-instructions" name="instructions" placeholder="Describe the task, useful context and the format you want…" rows="8" required maxlength="12000">${e(options.launchPrompt ?? item?.prompt ?? '')}</textarea><p class="library-input-help">Saved in this browser. Creating a prompt does not run a model or process documents.</p><div class="library-detail-actions"><button type="button" class="btn" data-editor-cancel>Cancel</button><button class="btn primary" type="submit">${ic('check', 16)} ${item ? 'Save changes' : 'Create prompt'}</button></div></form>`,
      onMount: (root, close) => {
        const form = root.querySelector('form');
        const titleInput = root.querySelector('#library-custom-title');
        const instructions = root.querySelector('#library-custom-instructions');
        const cancel = () => {
          close();
          closeActiveModal = null;
          if (returnsToLaunch) {
            detail(item, options.launchPrompt);
            document.querySelector('#library-prompt-input')?.focus({ preventScroll: true });
          }
        };
        root.querySelector('[data-editor-cancel]').addEventListener('click', cancel);
        if (returnsToLaunch) {
          root.querySelector('[data-close]')?.addEventListener('click', cancel);
          root.addEventListener('cancel', cancel);
          root.addEventListener('click', event => { if (event.target === root) cancel(); });
        }
        [titleInput, instructions].forEach(input => input.addEventListener('input', () => input.setCustomValidity('')));
        form.addEventListener('submit', event => {
          event.preventDefault();
          for (const input of [titleInput, instructions]) {
            if (!input.value.trim()) { input.setCustomValidity(input === titleInput ? 'Give your prompt a name.' : 'Add the instructions you want to reuse.'); input.reportValidity(); return; }
          }
          const prompt = instructions.value.trim();
          const summary = prompt.replace(/\s+/g, ' ');
          const updated = { id: item?.id || `custom-${crypto.randomUUID()}`, type: 'prompts', title: titleInput.value.trim(), description: summary.length > 105 ? `${summary.slice(0, 102)}…` : summary, prompt, icon: 'message-square', category: 'Your prompts', tool: '', custom: true, updatedAt: new Date().toISOString() };
          const next = item ? customPrompts.map(value => value.id === item.id ? updated : value) : [...customPrompts, updated];
          if (!persistCustomPrompts(next)) return;
          close();
          closeActiveModal = null;
          tab = 'prompts'; query = ''; category = 'all'; savedOnly = false;
          draw();
          container.querySelector(`[data-library-open="${updated.id}"]`)?.focus();
          if (returnsToLaunch) detail(updated);
          ctx.toast(item ? 'Saved prompt updated' : 'Prompt created in this browser');
        });
        titleInput.focus();
      }
    });
  }

  function deletePrompt(item) {
    if (!persistCustomPrompts(customPrompts.map(value => value.id === item.id ? { ...value, deletedAt: new Date().toISOString() } : value))) return;
    lastDeletedId = item.id;
    closeActiveModal?.();
    closeActiveModal = null;
    draw();
    container.querySelector('[data-library-undo-delete]')?.focus();
  }

  function restorePrompt(id, moveFocus = true) {
    const item = customPrompts.find(value => value.id === id && value.deletedAt);
    if (!item || !persistCustomPrompts(customPrompts.map(value => value.id === id ? { ...value, deletedAt: null } : value))) return false;
    if (lastDeletedId === id) lastDeletedId = null;
    draw();
    if (moveFocus) (container.querySelector(`[data-library-open="${id}"]`) || container.querySelector('.library-search input'))?.focus();
    ctx.toast('Prompt restored');
    return true;
  }

  function showDeletedPrompts() {
    closeActiveModal?.();
    closeActiveModal = ctx.modal({
      title: 'Recently deleted prompts',
      body: `<div class="library-deleted-list"><p>Deleted prompts stay in this browser and can be restored.</p>${deletedPrompts().map(item => `<div class="library-deleted-row"><span><strong>${e(item.title)}</strong><small>${e(item.description)}</small></span><button class="btn small" data-restore-prompt="${e(item.id)}">Restore</button></div>`).join('')}</div>`,
      onMount: (root, close) => {
        root.querySelectorAll('[data-restore-prompt]').forEach(button => button.addEventListener('click', () => {
          const restoredId = button.dataset.restorePrompt;
          if (!restorePrompt(restoredId, false)) return;
          button.closest('.library-deleted-row').remove();
          if (!deletedPrompts().length) {
            close(); closeActiveModal = null;
            (container.querySelector(`[data-library-open="${restoredId}"]`) || container.querySelector('.library-search input'))?.focus();
          } else root.querySelector('[data-restore-prompt]')?.focus();
        }));
      }
    });
  }

  function workflowDetail(item) {
    const sample = samples[item.id];
    closeActiveModal = ctx.modal({
      title: item.title,
      body: `<div class="library-workflow-detail"><div class="library-workflow-banner"><span class="library-item-icon">${ic(item.icon, 24)}</span><div><span class="library-detail-meta">Workflow<span>·</span>${item.steps.length} connected steps</span><p>${e(item.description)}</p></div></div><div class="library-workflow-columns"><div class="library-workflow-outline"><div class="library-column-heading">HOW IT WORKS</div><ol class="library-steps">${item.steps.map((step, index) => `<li><span class="library-step-number">${index + 1}</span><div><strong>${e(step.title)}</strong><p>${e(step.description)}</p></div></li>`).join('')}</ol><div class="library-workflow-output">${ic('file-text', 18)}<span>Output format<strong>${e(sample.title.split(' — ')[1])}</strong></span></div></div><div class="library-workflow-config"><div class="library-column-heading">SET UP YOUR WORK</div><label class="library-input-label" for="library-workflow-context">Document context<button class="library-text-button" data-workflow-reset type="button">Reset context</button></label><textarea class="library-prompt-input" id="library-workflow-context" rows="6">${e(sample.context)}</textarea><label class="library-input-label" for="library-workflow-focus">Review perspective</label><select class="library-workflow-select" id="library-workflow-focus"><option>Balanced review</option><option>Client priorities first</option><option>Open issues & next actions</option></select><label class="library-input-label" for="library-workflow-notes">Additional instructions <span>Optional</span></label><input class="library-workflow-notes" id="library-workflow-notes" placeholder="E.g. focus on dates and missing information"><p class="library-sample-disclosure">${ic('info', 15)}<span>The brief uses the default document context. Edited instructions are saved separately; automatic analysis is unavailable.</span></p><div class="library-workflow-buttons"><button class="btn" data-workflow-preview>${ic('play', 16)} View brief</button><button class="btn primary" data-workflow-start>Open workspace ${ic('arrow-right', 16)}</button></div></div></div><div class="library-workflow-result" hidden aria-live="polite"></div></div>`,
      onMount: root => {
        root.classList.add('library-workflow-modal');
        const input = root.querySelector('#library-workflow-context');
        const notes = root.querySelector('#library-workflow-notes');
        const focus = root.querySelector('#library-workflow-focus');
        const result = root.querySelector('.library-workflow-result');
        const assembledPrompt = extra => `${item.prompt}\n\nDocument context:\n${input.value.trim()}\n\nReview perspective: ${focus.value}${notes.value.trim() ? `\nAdditional instructions: ${notes.value.trim()}` : ''}${extra ? `\n\n${extra}` : ''}`;
        root.querySelector('[data-workflow-reset]').addEventListener('click', () => { input.value = sample.context; input.setCustomValidity(''); });
        input.addEventListener('input', () => input.setCustomValidity(''));
        root.querySelector('[data-workflow-start]').addEventListener('click', () => {
          if (!input.value.trim()) { input.setCustomValidity('Add document context or reset the default context.'); input.reportValidity(); return; }
          launch(item, assembledPrompt());
        });
        root.querySelector('[data-workflow-preview]').addEventListener('click', () => {
          const previewButton = root.querySelector('[data-workflow-preview]');
          previewButton.innerHTML = `${ic('check', 16)} Brief opened`;
          result.hidden = false;
          result.innerHTML = `<div class="library-result-top"><span class="library-sample-badge">${ic('sparkles', 13)} WORKFLOW BRIEF</span><span>${e(sample.name)}</span></div><h3>${e(sample.title)}</h3><p>${e(sample.summary)}</p><div class="library-result-table-wrap"><table><thead><tr>${sample.columns.map(col => `<th>${e(col)}</th>`).join('')}</tr></thead><tbody>${sample.rows.map(row => `<tr>${row.map(cell => `<td>${e(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="library-next-action"><span>${ic('arrow-right', 17)}</span><div><strong>Suggested next step</strong><p>${e(sample.next)}</p></div></div><p class="library-output-disclaimer">This brief uses the default document context. Edited instructions are saved separately; automatic analysis is unavailable.</p><div class="library-output-actions"><button class="btn small" data-workflow-download>${ic('download', 15)} Download brief</button><button class="btn small primary" data-workflow-followup>Continue in workspace ${ic('arrow-right', 15)}</button></div>`;
          result.querySelector('[data-workflow-download]').addEventListener('click', () => {
            const brief = `NEOLAW · WORKFLOW BRIEF\n\n${sample.title}\n\n${sample.summary}\n\n${sample.columns.join(' | ')}\n${sample.rows.map(row => row.join(' | ')).join('\n')}\n\nSuggested next step\n${sample.next}\n\nBased on the default document context. Edited instructions are saved separately; automatic analysis is unavailable.\n`;
            ctx.download(`${item.id}-brief.txt`, brief, 'text/plain');
          });
          result.querySelector('[data-workflow-followup]').addEventListener('click', () => {
            if (!input.value.trim()) { input.setCustomValidity('Add document context or reset the default context.'); input.reportValidity(); return; }
            launch(item, assembledPrompt('Provide a practical next-actions list based on the supplied context.'));
          });
          result.setAttribute('tabindex', '-1');
          result.setAttribute('role', 'region');
          result.setAttribute('aria-label', 'Workflow brief');
          result.focus({ preventScroll: true });
          result.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
        });
      }
    });
  }

  function onClick(event) {
    if (event.target.closest('[data-library-create]')) { promptEditor(); return; }
    if (event.target.closest('[data-library-deleted]')) { showDeletedPrompts(); return; }
    if (event.target.closest('[data-library-undo-delete]')) { restorePrompt(lastDeletedId); return; }
    const tabButton = event.target.closest('[data-library-tab]');
    if (tabButton) {
      tab = tabButton.dataset.libraryTab;
      category = 'all';
      query = '';
      if (!ctx.embeddedLibrary) history.replaceState(null, '', `${location.pathname}${location.search}#/library?tab=${tab}`);
      else { closeActiveModal?.(); closeActiveModal = null; }
      draw();
      container.querySelector(`[data-library-tab="${tab}"]`).focus();
      return;
    }
    const save = event.target.closest('[data-library-save]');
    if (save) { const id = save.dataset.librarySave; persistSave(id); (container.querySelector(`[data-library-save="${id}"]`) || container.querySelector('[data-library-saved-filter]'))?.focus(); return; }
    const open = event.target.closest('[data-library-open]');
    if (open) { const item = collection().find(value => value.id === open.dataset.libraryOpen); if (item) detail(item); return; }
    if (event.target.closest('[data-library-saved-filter]')) { savedOnly = !savedOnly; updateResults(); return; }
    if (event.target.closest('[data-library-reset]')) { savedOnly = false; query = ''; category = 'all'; draw(); container.querySelector('.library-search input')?.focus(); }
  }

  function onInput(event) {
    if (event.target.matches('.library-search input')) { query = event.target.value; updateResults(); }
  }

  function onChange(event) {
    if (event.target.matches('.library-category-label select')) { category = event.target.value; updateResults(); }
  }

  function onKeydown(event) {
    const tabKeys = ctx.embeddedLibrary ? ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'] : ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (container.contains(event.target) && event.target.matches('[data-library-tab]') && tabKeys.includes(event.key)) {
      event.preventDefault();
      const keys = Object.keys(tabInfo);
      const current = keys.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : (current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + keys.length) % keys.length;
      container.querySelector(`[data-library-tab="${keys[next]}"]`).click();
    }
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.activeElement?.closest('input, textarea, select, [contenteditable="true"]') && (ctx.embeddedLibrary || !document.querySelector('dialog[open], [role="dialog"]'))) {
      event.preventDefault(); container.querySelector('.library-search input')?.focus();
    }
  }

  const initialItem = collection().find(item => item.id === ctx.params?.get('item') && Object.hasOwn(tabInfo, item.type));
  if (initialItem) tab = initialItem.type;
  draw();
  container.addEventListener('click', onClick);
  container.addEventListener('input', onInput);
  container.addEventListener('change', onChange);
  document.addEventListener('keydown', onKeydown);
  if (initialItem) {
    container.querySelector(`[data-library-open="${initialItem.id}"]`)?.focus();
    detail(initialItem);
  }
  return () => {
    closeActiveModal?.();
    container.removeEventListener('click', onClick);
    container.removeEventListener('input', onInput);
    container.removeEventListener('change', onChange);
    document.removeEventListener('keydown', onKeydown);
  };
}
