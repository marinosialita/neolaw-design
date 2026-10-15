import { icon, prefersReducedMotion } from '../core.js';
import { CASES, TOPICS } from './case-data.js';
import { getCaseStrategy } from './case-strategy.js';
import { revealStrategyText } from './strategy-reveal.js';
import { createCaseHighlighter } from './case-highlight.js';

const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const filler = new Set(normalize('find search show me the a an all cases case law decisions decision about on for please with of in is are what how can you related to murder homicide premeditated premeditation βρες βρείτε μου υποθέσεις υπόθεση αποφάσεις απόφαση νομολογία σχετικά για τον τη την το των με και σε στο στη του της προς ποια ποιες τι δείξε εμφάνισε θέλω φόνος φόνου φόνο εκ προμελέτης προμελέτη προμελετημένος ανθρωποκτονία ανθρωποκτονίας').split(' '));
const shapes = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  down: '<path d="m6 9 6 6 6-6"/>', back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
  arrow: '<path d="M6 18 18 6M6 6h12v12"/>', bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  check: '<path d="m5 12 4 4L19 6"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  chat: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-9.5A8.5 8.5 0 0 1 11.5 3h1a8.5 8.5 0 0 1 8.5 8.5Z"/>',
  compare: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M6 8h3m6 0h3M6 12h3m6 0h3"/>',
  filter: '<path d="M3 6h18M3 12h18M3 18h18M8 3v6m8 0v6M9 15v6"/>',
  book: '<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15"/>',
  brief: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',
  sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
};
const glyph = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.brief}</svg>`;

export function render(container, ctx) {
  const esc = ctx.escape;
  const collectionKey = 'cylaw-real-v1';
  const storedWorkspace = ctx.storage.get('caseWorkspace', {});
  const remembered = storedWorkspace.collectionKey === collectionKey ? storedWorkspace : {};
  const courts = [...new Set(CASES.map(item => item.court).filter(Boolean))];
  const stages = [...new Set(CASES.map(item => item.stage).filter(Boolean))];
  const years = [...new Set(CASES.map(item => item.year || item.date?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const persistedSaved = ctx.storage.get('savedCases', []);
  const validSaved = [...new Set((Array.isArray(persistedSaved) ? persistedSaved : []).filter(id => CASES.some(item => item.id === id)))];
  if (!Array.isArray(persistedSaved) || JSON.stringify(persistedSaved) !== JSON.stringify(validSaved)) ctx.storage.set('savedCases', validSaved);
  let reader = CASES.find(item => item.id === (ctx.params.get('case') || ctx.route[1]));
  const comparison = [...new Set((ctx.params.get('compare') || '').split(','))].map(id => CASES.find(item => item.id === id)).filter(Boolean).slice(0, 3);
  const initialQuery = ctx.params.get('q') ?? (reader || comparison.length ? remembered.q || 'murder' : '');
  const restore = initialQuery && remembered.q === initialQuery;
  const state = {
    q: initialQuery, query: initialQuery, searched: Boolean(initialQuery.trim()),
    tab: restore && remembered.tab === 'saved' ? 'saved' : 'all', topic: restore && TOPICS.includes(remembered.topic) ? remembered.topic : '',
    court: restore && courts.includes(remembered.court) ? remembered.court : '', stage: restore && stages.includes(remembered.stage) ? remembered.stage : '', year: restore && years.includes(remembered.year) ? remembered.year : '',
    dateFrom: restore && /^\d{4}-\d{2}-\d{2}$/.test(remembered.dateFrom || '') ? remembered.dateFrom : '', dateTo: restore && /^\d{4}-\d{2}-\d{2}$/.test(remembered.dateTo || '') ? remembered.dateTo : '',
    sort: restore && ['relevance', 'latest', 'oldest', 'title'].includes(remembered.sort) ? remembered.sort : 'relevance',
    saved: new Set(validSaved), selected: new Set(comparison.length > 1 ? comparison.map(item => item.id) : restore && Array.isArray(remembered.selected) ? remembered.selected.filter(id => CASES.some(item => item.id === id)).slice(0, 3) : []), expanded: new Set([CASES[0]?.id].filter(Boolean)),
    filters: false, sourceSearch: '', readerTab: ctx.params.get('view') === 'decision' || ctx.params.has('paragraph') ? 'decision' : 'brief',
    scroll: restore ? remembered.scroll || 0 : 0,
    strategyExpanded: restore && remembered.strategyExpanded === true,
  };
  let pendingParagraph = Number(ctx.params.get('paragraph'));
  // Unlike the pending focus request, the URL anchor survives a reader redraw.
  let currentParagraph = reader?.paragraphs.some(p => p.n === pendingParagraph) ? pendingParagraph : 0;
  let isComparing = comparison.length > 1;
  let frame;
  const timers = [];
  let pendingSearch = null;
  let disposed = false;
  let strategySourceTrigger = null;
  let strategyReveal = null;
  let highlightResult = createCaseHighlighter(state.query);
  ctx.setHeader('Case Law');
  container.classList.add('cases-module');

  function remember() {
    if (!state.searched) return;
    const scroller = container.querySelector('.cases-results-scroll');
    if (scroller) state.scroll = scroller.scrollTop;
    ctx.storage.set('caseWorkspace', { collectionKey, q: state.query, tab: state.tab, topic: state.topic, court: state.court, stage: state.stage, year: state.year, dateFrom: state.dateFrom, dateTo: state.dateTo, sort: state.sort, scroll: state.scroll, selected: [...state.selected], strategyExpanded: state.strategyExpanded });
  }
  function resultsPath() {
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    return `/cases${params.size ? `?${params}` : ''}`;
  }
  function updateAddress() {
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (reader) {
      params.set('case', reader.id);
      if (state.readerTab === 'decision') params.set('view', 'decision');
      if (state.readerTab === 'decision' && currentParagraph > 0) params.set('paragraph', String(currentParagraph));
    }
    const hash = `#/cases${params.size ? `?${params}` : ''}`;
    if (location.hash !== hash) history.pushState(null, '', hash);
    remember();
  }
  function terms() {
    return normalize(state.query).split(' ').filter(term => term && !filler.has(term)).map(term => ({ appeals: 'appeal', intent: 'planning', witnesses: 'witness', messages: 'digital' }[term] || term));
  }
  const searchIndex = new Map();
  function searchable(item) {
    if (!searchIndex.has(item.id)) searchIndex.set(item.id, normalize([item.code, item.displayTitle, item.title, item.subtitle, item.matter, item.summary, item.principle, ...item.tags, item.outcomeLabel, ...item.paragraphs.map(p => p.text)].join(' ')));
    return searchIndex.get(item.id);
  }
  function results() {
    const queryTerms = terms();
    const items = CASES.filter(item => (state.tab !== 'saved' || state.saved.has(item.id)) && (!state.topic || item.tags.includes(state.topic)) && (!state.court || item.court === state.court) && (!state.stage || item.stage === state.stage) && (!state.year || (item.year || item.date?.slice(0, 4)) === state.year) && (!state.dateFrom || item.date >= state.dateFrom) && (!state.dateTo || item.date <= state.dateTo) && queryTerms.every(term => searchable(item).includes(term)));
    if (state.sort === 'oldest') items.sort((a, b) => a.date.localeCompare(b.date));
    else if (state.sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title, 'el'));
    else if (state.sort === 'relevance') items.sort((a, b) => (a.rank ?? CASES.indexOf(a)) - (b.rank ?? CASES.indexOf(b)));
    else items.sort((a, b) => b.date.localeCompare(a.date));
    return items;
  }
  const dateLabel = item => { const date = new Date(`${item.date}T12:00:00`); return Number.isNaN(date.getTime()) ? item.date || 'Date unavailable' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date); };
  const options = (items, current, label) => `<option value="">${label}</option>${items.map(value => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(value)}</option>`).join('')}`;
  const sourceUrl = item => /^https?:\/\//i.test(item?.sourceUrl || '') ? item.sourceUrl : '';
  const sourceLink = (item, label = 'Original judgment') => sourceUrl(item) ? `<a class="cases-source-link" href="${esc(sourceUrl(item))}" target="_blank" rel="noopener noreferrer">${glyph('arrow', 13)}${esc(label)}<span>${esc(item.sourceName || 'Source')}</span></a>` : '';
  const sectionNumbers = (item, name) => (item.sectionRefs?.[name] || []).filter(n => item.paragraphs.some(p => p.n === n));
  const ref = (n, id = reader?.id) => CASES.find(item => item.id === id)?.paragraphs.some(p => p.n === n) ? `<button class="cases-ref" data-action="reference" data-id="${id}" data-paragraph="${n}" aria-label="Source block ${n}">↗ ${n}</button>` : '';
  const refsFor = (item, name) => sectionNumbers(item, name).map(n => ref(n, item.id)).join(' ');
  const saveButton = item => `<button class="cases-save ${state.saved.has(item.id) ? 'is-saved' : ''}" data-action="save" data-id="${item.id}" aria-label="${state.saved.has(item.id) ? 'Unsave' : 'Save'} ${esc(item.code)}" aria-pressed="${state.saved.has(item.id)}" title="${state.saved.has(item.id) ? 'Saved' : 'Save case'}">${glyph('bookmark', 17)}</button>`;
  const searchForm = () => `<form class="cases-search-box" data-search-form>${glyph('search', 19)}<input aria-label="Search cases" type="search" placeholder="Search cases or a legal question…" value="${esc(state.q)}" autocomplete="off" spellcheck="false" data-field="query"><button type="submit" class="cases-search-submit" aria-label="Search cases">Search ${glyph('arrow', 15)}</button></form>`;

  function strategyMarkup(items) {
    const guide = getCaseStrategy(state.query, items);
    if (!guide) return '';
    const heading = `<span class="cases-strategy-mark">${glyph('sparkle', 15)}</span><span class="cases-strategy-heading"><span>Search strategy</span><strong lang="el">${esc(guide.title)}</strong></span>`;
    return `<section class="cases-strategy" aria-label="Search strategy"><div class="cases-strategy-top">${guide.points.length ? `<button class="cases-strategy-toggle" data-action="strategy-toggle" aria-expanded="${state.strategyExpanded}" aria-controls="cases-strategy-details">${heading}<span class="cases-strategy-disclosure">Research focus ${glyph('down', 13)}</span></button>` : `<div class="cases-strategy-label">${heading}</div>`}</div><p class="cases-strategy-description" lang="el">${esc(guide.description)}</p><div class="cases-strategy-writing" hidden><span>Preparing case results<span aria-hidden="true">…</span></span><button type="button" data-action="finish-strategy">Show cases ${glyph('arrow', 12)}</button></div>${guide.points.length ? `<div class="cases-strategy-details" id="cases-strategy-details" ${state.strategyExpanded ? '' : 'hidden'}><ol>${guide.points.map((point, index) => `<li><span class="cases-strategy-number">${String(index + 1).padStart(2, '0')}</span><div><h3 lang="el">${esc(point.title)}</h3><p lang="el">${esc(point.description)}</p><div class="cases-strategy-sources">${point.references.map(reference => `<button data-action="reference" data-id="${esc(reference.id)}" data-paragraph="${reference.block}" class="cases-strategy-source" aria-label="Open ${esc(reference.title)}, supporting passage in the right panel" lang="el">${esc(reference.label)} ${glyph('arrow', 11)}</button>`).join('')}</div></div></li>`).join('')}</ol></div>` : ''}</section>`;
  }

  function landing() {
    const examples = [['Premeditation', 'φόνος εκ προμελέτης', 'scale'], ['Evidence', 'περιστατική μαρτυρία', 'file'], ['Case reference', 'ECLI:CY:AD:2021:B67', 'book']];
    container.innerHTML = `<section class="cases-search-landing"><div class="nl-cases__col">
      <p class="nl-eyebrow">Case Law</p><h1 class="nl-cases__title">Find the <em>precedent you need.</em></h1><p class="nl-cases__sub">Search court decisions by legal issue, keyword or case reference.</p>
      <form class="nl-search" data-search-form><textarea class="nl-search__input" data-field="query" aria-label="Describe the legal issue or enter a case reference" placeholder="Describe the legal issue or enter a case reference…" rows="2">${esc(state.q)}</textarea><div class="nl-search__bar">
      <details class="nl-filter"><summary class="nl-pill">${icon('scale', 18)}<span data-court-label>All courts</span><span class="nl-pill__chev">${glyph('down', 16)}</span></summary><div class="nl-pop"><label class="nl-pop__title" for="cases-home-court">Court</label><select id="cases-home-court" data-field="court" aria-label="Court">${options(courts, state.court, 'All courts')}</select></div></details>
      <details class="nl-filter"><summary class="nl-pill">${icon('clock', 18)}<span data-date-label>Any date</span><span class="nl-pill__chev">${glyph('down', 16)}</span></summary><div class="nl-pop nl-pop--date"><p class="nl-pop__title">Decision date</p><div class="nl-pop__dates"><label for="cases-home-date-from">Date from<input id="cases-home-date-from" type="date" data-field="date-from" value="${esc(state.dateFrom)}"></label><label for="cases-home-date-to">Date to<input id="cases-home-date-to" type="date" data-field="date-to" value="${esc(state.dateTo)}"></label></div><button type="button" class="nl-pop__clear" data-action="clear-dates">Any date</button></div></details>
      <button type="submit" class="nl-btn-search">${glyph('search', 18)}Search cases</button></div></form>
      <details class="nl-settings"><summary>${icon('settings', 18)}Search settings</summary><div class="nl-settings__panel"><label for="cases-home-sort">Sort by<select id="cases-home-sort" data-field="sort"><option value="relevance">Most relevant (default)</option><option value="latest">Newest first</option><option value="oldest">Oldest first</option></select></label><fieldset class="nl-connected-preview" disabled><legend>Advanced search · unavailable</legend><label>Search mode<select><option>Hybrid (keyword + semantic)</option><option>Semantic (meaning-based)</option><option>Keyword (exact text matching)</option></select></label><div><span>Search depth</span><div class="nl-depth-options" role="group" aria-label="Search depth">${['Quick', 'Balanced', 'Deep', 'Deepest'].map(label => `<button type="button" aria-pressed="${label === 'Balanced'}">${label}</button>`).join('')}</div></div><label><input type="checkbox">Expand query with AI (bilingual EN &amp; GR)</label><p>These controls are not connected. Keyword search is available above.</p></fieldset></div></details>
      <section class="nl-try" aria-labelledby="cases-try-title"><h2 id="cases-try-title">Try a search</h2><div class="nl-try__grid">${examples.map(([title, query, symbol]) => `<button type="button" class="nl-try__card" data-action="home-example" data-query="${esc(query)}">${icon(symbol, 22)}<span class="nl-try__text"><strong>${title}</strong><span>${query}</span></span><span class="nl-try__arrow">${icon('arrow-right', 18)}</span></button>`).join('')}</div></section>
      <p class="nl-preview-note">Explore 10 judgments on murder and premeditation.</p><p class="nl-ai-note nl-cases__note">NeoLaw uses Artificial Intelligence. Always check the sources.</p>
      </div></section>`;
    container.querySelectorAll('.nl-filter').forEach(details => details.addEventListener('toggle', () => { if (details.matches('[open]')) closeHomeFilters(details); }));
  }
  function closeHomeFilters(except = null, restoreFocus = false) {
    container.querySelectorAll('.nl-filter[open]').forEach(details => { if (details !== except) { details.removeAttribute('open'); if (restoreFocus) details.querySelector('summary')?.focus({ preventScroll: true }); } });
  }
  function outsideHomeFilters(event) { if (!event.target.closest('.nl-filter')) closeHomeFilters(); }
  function card(item, index) {
    const expanded = state.expanded.has(item.id);
    return `<article class="cases-card ${state.selected.has(item.id) ? 'is-selected' : ''} ${reader?.id === item.id ? 'is-current' : ''}" data-case-card="${item.id}">
      <div class="cases-card-rail"><label class="cases-checkbox" title="Select for comparison"><input type="checkbox" data-action="select" data-id="${item.id}" ${state.selected.has(item.id) ? 'checked' : ''} aria-label="Select ${esc(item.code)} for comparison"><span>${glyph('check', 11)}</span></label><span class="cases-card-number">${String(index + 1).padStart(2, '0')}</span></div>
      <div class="cases-card-content"><div class="cases-card-meta"><span class="cases-case-code">${esc(item.code)}</span><span>·</span><span>${esc(item.court)}</span><span>·</span><span>${dateLabel(item)}</span></div>
      <div class="cases-card-title-row"><button class="cases-card-title" data-action="open" data-id="${item.id}" lang="el" ${reader?.id === item.id ? 'aria-current="true"' : ''}>${highlightResult(item.displayTitle)}</button>${saveButton(item)}</div><p class="cases-card-subject" lang="el">${highlightResult(item.title)}</p><p class="cases-card-summary" lang="el">${highlightResult(item.summary)}</p>
      <div class="cases-card-labels"><span class="cases-outcome ${esc(item.tone || 'neutral')}"><span></span>${highlightResult(item.outcomeLabel)}</span>${item.tags.map(tag => `<button data-action="topic" data-topic="${esc(tag)}" class="cases-topic-label">${highlightResult(tag)}</button>`).join('')}</div>
      <div class="cases-principle ${expanded ? 'is-open' : ''}"><button class="cases-principle-trigger" data-action="principle" data-id="${item.id}" aria-expanded="${expanded}" aria-controls="principle-${item.id}"><span>${glyph('sparkle', 14)}Key principle</span>${glyph('down', 13)}</button><div class="cases-principle-content" id="principle-${item.id}" ${expanded ? '' : 'hidden'}><p lang="el">${highlightResult(item.principle)} ${refsFor(item, 'principle')}</p></div></div>
      <div class="cases-card-footer"><div class="cases-card-actions"><button class="cases-inline-button" data-action="open" data-id="${item.id}">${glyph('brief', 14)}Brief</button><button class="cases-inline-button" data-action="read" data-id="${item.id}">${glyph('book', 14)}Decision</button><button class="cases-inline-button" data-action="chat" data-id="${item.id}">${glyph('chat', 14)}Chat</button></div><button class="cases-open-link" data-action="open" data-id="${item.id}" aria-label="Open ${esc(item.code)}">${glyph('arrow', 16)}</button></div></div></article>`;
  }
  function workspace(animateStrategy = false) {
    container.innerHTML = `<div class="cases-search-layout ${reader ? 'has-detail' : ''}"><section class="cases-list-column" aria-label="Case search results"><div class="cases-list-chrome"><div class="cases-list-title"><h1>Case Law</h1><button class="cases-new-search" data-action="new-search">New search ${glyph('search', 13)}</button></div>${searchForm()}
      <div class="cases-collection-tabs" role="tablist" aria-label="Case collection"><button id="cases-tab-all" role="tab" aria-controls="cases-results-panel" tabindex="${state.tab === 'all' ? 0 : -1}" aria-selected="${state.tab === 'all'}" data-action="tab" data-tab="all" class="${state.tab === 'all' ? 'active' : ''}">All cases<span>${CASES.length}</span></button><button id="cases-tab-saved" role="tab" aria-controls="cases-results-panel" tabindex="${state.tab === 'saved' ? 0 : -1}" aria-selected="${state.tab === 'saved'}" data-action="tab" data-tab="saved" class="${state.tab === 'saved' ? 'active' : ''}">${glyph('bookmark', 14)}Saved<span data-saved-count>${state.saved.size}</span></button></div>
      <div class="cases-controls"><div class="cases-filter-group"><label class="cases-select-wrap">${glyph('filter', 13)}<select aria-label="Filter by topic" data-field="topic">${options(TOPICS, state.topic, 'All topics')}</select>${glyph('down', 11)}</label><button class="cases-filter-toggle" data-action="filters" aria-expanded="${state.filters}" aria-controls="cases-extra-filters">Filters${glyph('down', 11)}<span class="cases-filter-dot" ${state.court || state.stage || state.year ? '' : 'hidden'}></span></button><button class="cases-reset" data-action="reset-filters" ${state.topic || state.court || state.stage || state.year ? '' : 'hidden'}>Reset</button></div><label class="cases-sort-wrap"><select aria-label="Sort cases" data-field="sort"><option value="relevance" ${state.sort === 'relevance' ? 'selected' : ''}>Relevance</option><option value="latest" ${state.sort === 'latest' ? 'selected' : ''}>Newest first</option><option value="oldest" ${state.sort === 'oldest' ? 'selected' : ''}>Oldest first</option><option value="title" ${state.sort === 'title' ? 'selected' : ''}>Title</option></select>${glyph('down', 11)}</label></div>
      <div class="cases-extra-filters" id="cases-extra-filters" ${state.filters || state.dateFrom || state.dateTo ? '' : 'hidden'}><label>Court<select data-field="court">${options(courts, state.court, 'All courts')}</select></label>${stages.length > 1 ? `<label>Stage<select data-field="stage">${options(stages, state.stage, 'All stages')}</select></label>` : ''}<label>Year<select data-field="year">${options(years, state.year, 'All years')}</select></label><label>Date from<input type="date" data-field="date-from" value="${esc(state.dateFrom)}"></label><label>Date to<input type="date" data-field="date-to" value="${esc(state.dateTo)}"></label></div><div class="cases-results-heading"><span data-results-count role="status"></span><span>Select cases to compare</span></div></div>
      <div class="cases-results-scroll"><div data-case-strategy></div><div class="cases-results" id="cases-results-panel" role="tabpanel" aria-labelledby="cases-tab-${state.tab}"></div><div class="cases-results-end">End of results</div></div><div class="cases-selection-tray" hidden>${glyph('compare', 17)}<span><strong data-selected-count>0</strong> selected</span><button data-action="clear-selection">Clear</button><button data-action="compare" class="cases-tray-compare">Compare ${glyph('arrow', 14)}</button></div>
      </section><aside class="cases-detail-panel" ${reader ? '' : 'hidden'} role="dialog" aria-label="Case details"></aside></div>`;
    if (state.dateFrom || state.dateTo) { state.filters = true; container.querySelector('[data-action="filters"]').setAttribute('aria-expanded', 'true'); }
    const restoredScroll = state.scroll;
    updateResults(false, animateStrategy);
    container.querySelector('.cases-results-scroll').scrollTop = restoredScroll;
    state.scroll = restoredScroll;
    remember();
    if (reader) renderPanel();
  }
  function stopStrategyReveal() {
    const active = strategyReveal;
    strategyReveal = null;
    active?.controller?.dispose();
  }
  function updateResults(resetScroll = true, animateStrategy = false) {
    if (!state.searched || isComparing) return;
    stopStrategyReveal();
    const scroller = container.querySelector('.cases-results-scroll');
    const before = scroller.scrollTop;
    const items = results();
    highlightResult = createCaseHighlighter(state.query);
    container.querySelector('[data-case-strategy]').innerHTML = strategyMarkup(items);
    const list = container.querySelector('.cases-results');
    const count = container.querySelector('[data-results-count]');
    const end = container.querySelector('.cases-results-end');
    const description = container.querySelector('.cases-strategy-description');
    const writing = container.querySelector('.cases-strategy-writing');
    const toggle = container.querySelector('[data-action="strategy-toggle"]');
    list.classList.remove('cases-results-arriving');
    const showCases = (animate = false) => {
      list.innerHTML = items.length ? items.map(card).join('') : `<div class="cases-empty">${glyph(state.tab === 'saved' ? 'bookmark' : 'search', 26)}<h3>${state.tab === 'saved' && !state.saved.size ? 'Your saved cases belong here.' : 'No matching cases.'}</h3><p>${state.tab === 'saved' && !state.saved.size ? 'Use the bookmark beside a case to save it.' : 'Try “murder” or remove a filter.'}</p><button data-action="${state.tab === 'saved' ? 'show-all' : 'example'}" data-query="murder">${state.tab === 'saved' ? 'All cases' : 'Search murder'} ${glyph('arrow', 14)}</button></div>`;
      list.removeAttribute('aria-busy');
      count.innerHTML = `<strong>${items.length}</strong> ${items.length === 1 ? 'case' : 'cases'} found`;
      end.hidden = !items.length;
      if (writing) writing.hidden = true;
      if (toggle) toggle.disabled = false;
      if (animate && !prefersReducedMotion()) list.classList.add('cases-results-arriving');
      updateSelection();
    };
    container.querySelector('[data-saved-count]').textContent = state.saved.size;
    container.querySelector('[data-action="reset-filters"]').hidden = !state.topic && !state.court && !state.stage && !state.year && !state.dateFrom && !state.dateTo;
    container.querySelector('.cases-filter-dot').hidden = !state.court && !state.stage && !state.year && !state.dateFrom && !state.dateTo;
    if (animateStrategy && description && !prefersReducedMotion()) {
      list.innerHTML = ''; list.setAttribute('aria-busy', 'true');
      count.textContent = 'Preparing case results…'; end.hidden = true;
      writing.hidden = false;
      if (toggle) toggle.disabled = true;
      const active = {controller:null, hash:location.hash};
      strategyReveal = active;
      active.controller = revealStrategyText(description, {onDone:() => {
        if (disposed || strategyReveal !== active || location.hash !== active.hash) return;
        strategyReveal = null;
        showCases(true);
      }});
    } else showCases();
    scroller.scrollTop = resetScroll ? 0 : before;
    updateSelection(); remember();
  }
  function updateSelection() {
    const tray = container.querySelector('.cases-selection-tray');
    if (!tray) return;
    tray.hidden = !state.selected.size;
    tray.querySelector('[data-selected-count]').textContent = state.selected.size;
    tray.querySelector('[data-action="compare"]').disabled = state.selected.size < 2;
  }
  function updateCurrent() {
    container.querySelectorAll('[data-case-card]').forEach(card => {
      const current = card.dataset.caseCard === reader?.id;
      card.classList.toggle('is-current', current);
      const title = card.querySelector('.cases-card-title');
      if (current) title.setAttribute('aria-current', 'true'); else title.removeAttribute('aria-current');
    });
  }
  function highlight(text, term) {
    if (!term.trim()) return esc(text);
    const escapedTerm = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.split(new RegExp(`(${escapedTerm})`, 'gi')).map((part, index) => index % 2 ? `<mark>${esc(part)}</mark>` : esc(part)).join('');
  }
  function sourceParagraphs() {
    return reader.paragraphs.map(p => `<section class="cases-source-paragraph" id="cases-paragraph-${p.n}" tabindex="-1" aria-label="Source block ${p.n}"><button data-action="reference" data-id="${reader.id}" data-paragraph="${p.n}" class="cases-paragraph-number" aria-label="Source block ${p.n}">${String(p.n).padStart(2, '0')}</button><div><h4>${esc(p.title || `Source block ${p.n}`)}</h4><p lang="el">${highlight(p.text, state.sourceSearch)}</p></div></section>`).join('');
  }
  const section = (label, body, refs = []) => `<section class="cases-brief-section"><div class="cases-section-label"><h3>${label}</h3><span>${refs.map(n => ref(n)).join('')}</span></div>${body}</section>`;
  function briefBody() {
    const related = (reader.related || []).map(id => CASES.find(item => item.id === id)).filter(Boolean);
    return `<div class="cases-brief-outcome"><span class="cases-outcome ${esc(reader.tone || 'neutral')}"><span></span>${esc(reader.outcomeLabel)}</span></div>${reader.dateNote ? `<p class="cases-date-note">${esc(reader.dateNote)}</p>` : ''}<div class="cases-reader-principle"><div class="cases-section-label"><h3>${glyph('sparkle', 14)}Legal principle</h3><span>${refsFor(reader, 'principle')}</span></div><p lang="el">${esc(reader.principle)}</p></div>
      ${section('Facts', reader.facts.map(fact => `<p lang="el">${esc(fact)}</p>`).join(''), sectionNumbers(reader, 'facts'))}
      ${section('Issue', `<p lang="el">${esc(reader.issue)}</p>`, sectionNumbers(reader, 'issue'))}
      ${section('Holding', `<p lang="el">${esc(reader.holding)}</p>`, sectionNumbers(reader, 'holding'))}
      ${section('Reasoning', `<ol class="cases-reasoning-list">${reader.reasoning.map((reason, index) => `<li><span>${index + 1}</span><p lang="el">${esc(reason)}</p></li>`).join('')}</ol>`, sectionNumbers(reader, 'reasoning'))}
      ${section('Outcome', `<p lang="el">${esc(reader.result)}</p>`, sectionNumbers(reader, 'result'))}
      <section class="cases-takeaway"><div class="cases-section-label"><h3>Takeaway</h3><span>${refsFor(reader, 'takeaway')}</span></div><p lang="el">${esc(reader.takeaway)}</p></section>
      ${reader.quote ? section('From the judgment', `<blockquote lang="el">${esc(reader.quote)}</blockquote>`, sectionNumbers(reader, 'quote')) : ''}
      <details class="cases-brief-details"><summary>Parties & legal basis${glyph('down', 13)}</summary><h4>Parties</h4><p lang="el">${esc(reader.parties)}</p><h4>Legal basis</h4><p lang="el">${esc(reader.legalBasis)}</p></details>
      ${related.length ? `<section class="cases-related"><h3>Related cases</h3>${related.map(item => `<button data-action="open" data-id="${item.id}"><span><small>${esc(item.code)}</small><strong lang="el">${esc(item.displayTitle)}</strong></span>${glyph('arrow', 14)}</button>`).join('')}</section>` : ''}`;
  }
  function renderPanel(focus = false, focusTab = false) {
    const panel = container.querySelector('.cases-detail-panel');
    if (!reader || !panel) return;
    panel.hidden = false;
    container.querySelector('.cases-search-layout').classList.add('has-detail');
    panel.innerHTML = `<div class="cases-panel-top"><button class="cases-back" data-action="close-panel">${glyph('back', 15)}Results</button><span class="cases-case-code">${esc(reader.code)}</span><button class="cases-panel-close" data-action="close-panel" aria-label="Close case details">${glyph('close', 17)}</button></div>
      <div class="cases-panel-heading"><h2 lang="el" tabindex="-1">${esc(reader.displayTitle)}</h2><p>${esc(reader.title)} · ${esc(reader.subtitle)}</p><div class="cases-panel-meta"><span>${esc(reader.court)}</span><span>·</span><span>${dateLabel(reader)}</span></div>${sourceLink(reader)}</div>
      <div class="cases-panel-navigation"><div class="cases-reader-tabs" role="tablist" aria-label="Case detail view"><button id="cases-tab-brief" role="tab" aria-controls="cases-detail-content" tabindex="${state.readerTab === 'brief' ? 0 : -1}" data-action="reader-tab" data-view="brief" aria-selected="${state.readerTab === 'brief'}" class="${state.readerTab === 'brief' ? 'active' : ''}">Brief</button><button id="cases-tab-decision" role="tab" aria-controls="cases-detail-content" tabindex="${state.readerTab === 'decision' ? 0 : -1}" data-action="reader-tab" data-view="decision" aria-selected="${state.readerTab === 'decision'}" class="${state.readerTab === 'decision' ? 'active' : ''}">Decision</button></div><div class="cases-panel-actions">${saveButton(reader)}<button data-action="copy" data-id="${reader.id}" aria-label="Copy brief" title="Copy brief">${glyph('copy', 15)}</button><button data-action="export" data-id="${reader.id}" aria-label="Export brief" title="Export brief">${glyph('download', 15)}</button><button class="cases-panel-chat" data-action="chat" data-id="${reader.id}" aria-label="Chat about this case" title="Chat about this case">${glyph('chat', 15)}</button></div></div>
      <div class="cases-panel-content" id="cases-detail-content" role="tabpanel" aria-labelledby="cases-tab-${state.readerTab}">${state.readerTab === 'brief' ? `<div class="cases-brief-body">${briefBody()}</div>` : `<div class="cases-source-search">${glyph('search', 14)}<input type="search" data-field="source-search" value="${esc(state.sourceSearch)}" aria-label="Find in decision" placeholder="Find in decision"><span data-source-matches role="status"></span></div><div class="cases-source-document"><div class="cases-source-stamp">${esc(reader.sourceName || 'JUDGMENT')} · ${esc(reader.code)}</div><div class="cases-source-provenance">${reader.dateNote ? `<p>${esc(reader.dateNote)}</p>` : ''}${reader.sourceNote ? `<p>${esc(reader.sourceNote)}</p>` : ''}<p>Block numbering is added for navigation; it is not the judgment’s paragraph numbering.</p>${reader.sourceRetrievedAt ? `<small>Retrieved ${esc(reader.sourceRetrievedAt)}</small>` : ''}</div><h3 lang="el">${esc(reader.displayTitle)}</h3><div class="cases-source-paragraphs">${sourceParagraphs()}</div></div>`}</div>`;
    updateCurrent(); syncModal(!focusTab);
    if (state.readerTab === 'decision') updateSourceMatches();
    const paragraph = pendingParagraph;
    pendingParagraph = 0;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (Number.isInteger(paragraph) && paragraph > 0 && reader.paragraphs.some(p => p.n === paragraph)) focusParagraph(paragraph);
      else if (focusTab) panel.querySelector(`#cases-tab-${state.readerTab}`)?.focus({ preventScroll: true });
      else if (focus || isMobile()) panel.querySelector('.cases-panel-heading h2')?.focus({ preventScroll: true });
    });
  }
  function isMobile() { return matchMedia('(max-width: 840px)').matches; }
  function syncModal(focus = true) {
    if (pendingSearch) return;
    const panel = container.querySelector('.cases-detail-panel');
    const list = container.querySelector('.cases-list-column');
    if (panel) panel.setAttribute('aria-modal', String(Boolean(reader && isMobile())));
    if (list) list.inert = Boolean(reader && isMobile());
    if (focus && reader && panel && isMobile() && !panel.contains(document.activeElement)) panel.querySelector('.cases-panel-heading h2')?.focus({ preventScroll: true });
  }
  function openCase(id, view = 'brief', paragraph = 0) {
    const item = CASES.find(value => value.id === id);
    if (!item) return;
    remember(); reader = item; state.readerTab = view; state.sourceSearch = ''; pendingParagraph = Number(paragraph);
    currentParagraph = item.paragraphs.some(p => p.n === pendingParagraph) ? pendingParagraph : 0;
    if (pendingParagraph) state.readerTab = 'decision';
    if (isComparing) { ctx.navigate(`${resultsPath()}${state.query ? '&' : '?'}case=${id}${pendingParagraph ? `&view=decision&paragraph=${pendingParagraph}` : ''}`); return; }
    updateAddress(); renderPanel(true);
  }
  function closePanel() {
    const previous = reader?.id;
    reader = null; pendingParagraph = 0; currentParagraph = 0; cancelAnimationFrame(frame);
    const panel = container.querySelector('.cases-detail-panel');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
    container.querySelector('.cases-search-layout')?.classList.remove('has-detail');
    updateCurrent(); syncModal(); updateAddress();
    (strategySourceTrigger && container.contains(strategySourceTrigger) ? strategySourceTrigger : container.querySelector(`.cases-card-title[data-id="${previous}"]`) || container.querySelector('[data-field="query"]'))?.focus({ preventScroll: true });
    strategySourceTrigger = null;
  }
  function focusParagraph(n) {
    const paragraph = container.querySelector(`#cases-paragraph-${n}`);
    if (!paragraph) return;
    currentParagraph = n; updateAddress();
    container.querySelectorAll('.cases-source-paragraph.is-focused').forEach(node => node.classList.remove('is-focused'));
    paragraph.classList.add('is-focused');
    paragraph.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    paragraph.focus({ preventScroll: true });
    timers.push(setTimeout(() => paragraph.classList.remove('is-focused'), 3200));
  }
  function updateSourceMatches() {
    const matches = container.querySelectorAll('.cases-source-paragraphs mark').length;
    const status = container.querySelector('[data-source-matches]');
    if (status) status.textContent = state.sourceSearch.trim() ? `${matches} ${matches === 1 ? 'match' : 'matches'}` : '';
    return matches;
  }
  function submitSearch() {
    if (pendingSearch || disposed) return;
    if (!state.q.trim()) { ctx.toast('Enter a case, topic or legal question'); container.querySelector('[data-field="query"]')?.focus(); return; }
    if (!validateDates()) return;
    if (strategyReveal) updateResults(false);
    remember(); closeHomeFilters(); cancelAnimationFrame(frame);
    const pending = { query: state.q.trim(), initialSearch: !state.searched, hash: location.hash, timers: [], surfaces: [...container.children].map(node => ({ node, hidden: node.hidden, inert: node.inert })) };
    state.q = pending.query;
    const queryInput = container.querySelector('[data-field="query"]'); if (queryInput) queryInput.value = pending.query;
    pendingSearch = pending;
    for (const { node } of pending.surfaces) { node.hidden = true; node.inert = true; }
    const progress = document.createElement('section');
    progress.className = 'cases-search-progress'; progress.setAttribute('aria-label', 'Case search');
    progress.innerHTML = `<div class="cases-search-progress__body"><div class="cases-search-progress__mark" aria-hidden="true">${glyph('search', 23)}<span></span></div><p class="cases-search-progress__eyebrow">CASE LAW</p><h2>Finding the relevant cases.</h2><p class="cases-search-progress__query">${esc(pending.query)}</p><div class="cases-search-progress__track" aria-hidden="true"><span></span></div><p class="cases-search-progress__status" role="status" aria-live="polite" aria-atomic="true">Searching the case collection</p><div class="cases-search-progress__steps" aria-hidden="true"><span class="is-current">Collection</span><span>Matching</span><span>Results</span></div><p class="cases-search-progress__note">10 judgments · CyLaw</p><button type="button" data-action="cancel-search" class="cases-search-progress__cancel">Cancel search</button></div>`;
    pending.progress = progress; container.append(progress);
    container.classList.add('is-searching');
    progress.querySelector('[data-action="cancel-search"]').focus({ preventScroll: true });
    const stage = (index, text, width) => {
      if (pendingSearch !== pending || disposed) return;
      progress.querySelector('.cases-search-progress__status').textContent = text;
      progress.querySelector('.cases-search-progress__track span').style.width = width;
      progress.querySelectorAll('.cases-search-progress__steps span').forEach((node, i) => { node.classList.toggle('is-current', i === index); node.classList.toggle('is-complete', i < index); });
    };
    pending.timers.push(setTimeout(() => stage(1, 'Matching your query to judgments', '62%'), 950));
    pending.timers.push(setTimeout(() => stage(2, 'Preparing briefs and source links', '88%'), 1800));
    pending.timers.push(setTimeout(() => {
      if (pendingSearch !== pending || disposed) return;
      const stillOnPage = location.hash === pending.hash;
      cancelSearch(false);
      if (!stillOnPage) return;
      completeSearch(pending.query, pending.initialSearch);
    }, 2500));
  }
  function cancelSearch(focus = true) {
    if (!pendingSearch) return;
    const pending = pendingSearch; pendingSearch = null;
    pending.timers.forEach(clearTimeout); pending.progress.remove();
    for (const { node, hidden, inert } of pending.surfaces) { node.hidden = hidden; node.inert = inert; }
    container.classList.remove('is-searching');
    syncModal(false);
    if (focus) (reader && isMobile() ? container.querySelector('.cases-panel-heading h2') : container.querySelector('[data-field="query"]'))?.focus({ preventScroll: true });
  }
  function completeSearch(query, initialSearch) {
    state.strategyExpanded = false; strategySourceTrigger = null;
    state.query = query; state.q = query; state.searched = true; state.scroll = 0;
    state.topic = ''; state.stage = ''; state.year = ''; state.tab = 'all'; state.selected.clear();
    if (!initialSearch) { state.court = ''; state.dateFrom = ''; state.dateTo = ''; }
    reader = null; pendingParagraph = 0; currentParagraph = 0; isComparing = false;
    updateAddress(); state.scroll = 0; workspace(true);
    container.querySelector('[data-field="query"]')?.focus({ preventScroll: true });
  }
  function validateDates() {
    const from = container.querySelector('[data-field="date-from"]'), to = container.querySelector('[data-field="date-to"]');
    from?.setCustomValidity?.(''); to?.setCustomValidity?.('');
    if (state.dateFrom && state.dateTo && state.dateFrom > state.dateTo) {
      const control = to || from;
      control?.closest('details')?.setAttribute('open', '');
      control?.setCustomValidity?.('Choose an end date on or after the start date.'); control?.reportValidity?.(); control?.focus({ preventScroll: true });
      ctx.toast('Choose an end date on or after the start date.'); return false;
    }
    return true;
  }
  function briefText(item) {
    const sourceRefs = name => { const numbers = sectionNumbers(item, name); return numbers.length ? ` [Source blocks ${numbers.join(', ')}]` : ''; };
    return `# ${item.displayTitle}\n\n${item.code}\n${item.court} · ${dateLabel(item)}\n${item.subtitle}\n${item.dateNote || ''}\n\nSource: ${item.sourceName || 'Original judgment'}\n${sourceUrl(item)}\n${item.sourceNote || 'Structured editorial brief of the published judgment.'}\nSource block numbers refer to this reader only; they are not the judgment’s paragraph numbering.\n\n## Legal principle\n${item.principle}${sourceRefs('principle')}\n\n## Facts\n${item.facts.join('\n\n')}${sourceRefs('facts')}\n\n## Issue\n${item.issue}${sourceRefs('issue')}\n\n## Holding\n${item.holding}${sourceRefs('holding')}\n\n## Reasoning\n${item.reasoning.map((reason, index) => `${index + 1}. ${reason}`).join('\n\n')}${sourceRefs('reasoning')}\n\n## Outcome\n${item.result}${sourceRefs('result')}\n\n## Takeaway\n${item.takeaway}${sourceRefs('takeaway')}\n${item.quote ? `\n## From the judgment\n${item.quote}${sourceRefs('quote')}\n` : ''}\n## Parties\n${item.parties}${sourceRefs('parties')}\n\n## Legal basis\n${item.legalBasis}${sourceRefs('legalBasis')}\n`;
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); ctx.toast('Copied to clipboard'); }
    catch {
      const before = document.activeElement; const area = document.createElement('textarea');
      area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select();
      let success = false; try { success = document.execCommand('copy'); } catch {} finally { area.remove(); }
      before?.focus({ preventScroll: true }); ctx.toast(success ? 'Copied to clipboard' : 'Use Export to save a copy');
    }
  }
  function save(id) {
    if (!CASES.some(item => item.id === id)) return;
    const previousFocus = document.activeElement;
    const wasSaved = state.saved.has(id), next = new Set(state.saved);
    if (wasSaved) next.delete(id); else next.add(id);
    if (ctx.storage.set('savedCases', [...next]) === false) return;
    state.saved = next;
    container.querySelectorAll(`[data-action="save"][data-id="${id}"]`).forEach(button => {
      button.classList.toggle('is-saved', !wasSaved); button.setAttribute('aria-pressed', String(!wasSaved));
      button.setAttribute('aria-label', `${wasSaved ? 'Save' : 'Unsave'} ${CASES.find(item => item.id === id).code}`); button.title = wasSaved ? 'Save case' : 'Saved';
    });
    const count = container.querySelector('[data-saved-count]'); if (count) count.textContent = state.saved.size;
    if (state.tab === 'saved' && !isComparing) {
      updateResults(false);
      if (previousFocus?.matches('[data-action="save"]') && !container.contains(previousFocus)) (container.querySelector('[data-action="save"]') || container.querySelector('#cases-tab-saved'))?.focus({ preventScroll: true });
    }
    ctx.toast(wasSaved ? 'Removed from saved cases' : 'Case saved');
  }
  function comparePage() {
    const rows = [
      ['Outcome', item => `<span class="cases-outcome ${esc(item.tone || 'neutral')}">${esc(item.outcomeLabel)}</span><p>${esc(item.result)}</p>${refsFor(item, 'result')}`],
      ['Legal principle', item => `<p>${esc(item.principle)}</p>${refsFor(item, 'principle')}`],
      ['Facts', item => item.facts.map(fact => `<p>${esc(fact)}</p>`).join('')],
      ['Issue', item => `<p>${esc(item.issue)}</p>`],
      ['Reasoning', item => `<ol>${item.reasoning.map(reason => `<li>${esc(reason)}</li>`).join('')}</ol>`],
      ['Takeaway', item => `<p>${esc(item.takeaway)}</p>`],
    ];
    container.innerHTML = `<div class="cases-compare-workspace"><div class="cases-compare-top"><button class="cases-back" data-action="back-results">${glyph('back', 16)}Results</button><div><button class="cases-inline-button" data-action="copy-comparison">${glyph('copy', 15)}Copy</button><button class="cases-inline-button" data-action="export-comparison">${glyph('download', 15)}Export</button></div></div><h1>Compare cases</h1><div class="cases-compare-scroll" tabindex="0" role="region" aria-label="Case comparison"><div class="cases-compare-grid" style="--cases-columns:${comparison.length}"><div class="cases-compare-corner">${comparison.length} cases</div>${comparison.map(item => `<div class="cases-compare-case"><div><span class="cases-case-code">${esc(item.code)}</span>${saveButton(item)}</div><button lang="el" data-action="open" data-id="${item.id}">${esc(item.displayTitle)}</button><p>${esc(item.court)} · ${esc(item.year || item.date?.slice(0, 4))}</p>${item.dateNote ? `<p class="cases-date-note" lang="el">${esc(item.dateNote)}</p>` : ''}${sourceLink(item)}</div>`).join('')}${rows.map(([label, body]) => `<div class="cases-compare-row-label ${label === 'Legal principle' ? 'principle-row' : ''}">${label}</div>${comparison.map(item => `<div class="cases-compare-cell ${label === 'Legal principle' ? 'principle-row' : ''}" lang="el">${body(item)}</div>`).join('')}`).join('')}</div></div></div>`;
  }
  function switchCollection(tab) {
    state.tab = tab;
    container.querySelectorAll('[data-action="tab"]').forEach(button => { const active = button.dataset.tab === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    container.querySelector('.cases-results').setAttribute('aria-labelledby', `cases-tab-${tab}`);
    updateResults(); container.querySelector(`#cases-tab-${tab}`).focus({ preventScroll: true });
  }
  function click(event) {
    const button = event.target.closest('[data-action]'); if (!button || !container.contains(button)) return;
    const { action, id } = button.dataset; const item = CASES.find(value => value.id === id);
    if (pendingSearch) { if (action === 'cancel-search') cancelSearch(); return; }
    if (action === 'open') { strategySourceTrigger = null; openCase(id); }
    else if (action === 'read') { strategySourceTrigger = null; openCase(id, 'decision'); }
    else if (action === 'close-panel') closePanel();
    else if (action === 'back-results') ctx.navigate(resultsPath());
    else if (action === 'new-search') { remember(); ctx.navigate('/cases'); }
    else if (action === 'example') { state.q = button.dataset.query; submitSearch(); }
    else if (action === 'home-example') { state.q = button.dataset.query; const input = container.querySelector('[data-field="query"]'); input.value = state.q; input.focus({ preventScroll: true }); }
    else if (action === 'clear-dates') { state.dateFrom = ''; state.dateTo = ''; for (const field of ['date-from', 'date-to']) { const input = container.querySelector(`[data-field="${field}"]`); input.value = ''; input.setCustomValidity?.(''); } const label = container.querySelector('[data-date-label]'); if (label) label.textContent = 'Any date'; }
    else if (action === 'save') save(id);
    else if (action === 'finish-strategy') {
      strategyReveal?.controller?.finish();
      container.querySelector('.cases-card-title')?.focus({ preventScroll: true });
    }
    else if (action === 'strategy-toggle') {
      if (strategyReveal) return;
      state.strategyExpanded = !state.strategyExpanded;
      button.setAttribute('aria-expanded', String(state.strategyExpanded));
      container.querySelector('#cases-strategy-details').hidden = !state.strategyExpanded;
      remember();
    }
    else if (action === 'reference') {
      if (button.closest('.cases-strategy')) strategySourceTrigger = button;
      const n = Number(button.dataset.paragraph);
      if (reader?.id === id && state.readerTab === 'decision') focusParagraph(n); else openCase(id, 'decision', n);
    }
    else if (action === 'reader-tab') { state.readerTab = button.dataset.view; pendingParagraph = 0; currentParagraph = 0; updateAddress(); renderPanel(false, true); }
    else if (action === 'principle') { const expanded = !state.expanded.has(id); if (expanded) state.expanded.add(id); else state.expanded.delete(id); button.setAttribute('aria-expanded', String(expanded)); button.closest('.cases-principle').classList.toggle('is-open', expanded); button.nextElementSibling.hidden = !expanded; }
    else if (action === 'chat') { remember(); ctx.startChat({ tool: 'case-law', caseId: item.id, title: `${item.code} · Case analysis`, prompt: `Ανάλυσε τη δικαστική απόφαση «${item.displayTitle}» (${item.title}). Ποια πραγματικά περιστατικά στηρίζουν το συμπέρασμα και ποια είναι τα αποδεικτικά όριά του;` }); }
    else if (action === 'topic') { state.topic = button.dataset.topic; const filter = container.querySelector('[data-field="topic"]'); filter.value = state.topic; updateResults(); filter.focus({ preventScroll: true }); }
    else if (action === 'tab') switchCollection(button.dataset.tab);
    else if (action === 'show-all') switchCollection('all');
    else if (action === 'filters') { state.filters = !state.filters; button.setAttribute('aria-expanded', String(state.filters)); container.querySelector('.cases-extra-filters').hidden = !state.filters; }
    else if (action === 'reset-filters') { state.topic = ''; state.court = ''; state.stage = ''; state.year = ''; state.dateFrom = ''; state.dateTo = ''; for (const field of ['topic', 'court', 'stage', 'year', 'date-from', 'date-to']) { const control = container.querySelector(`[data-field="${field}"]`); if (control) { control.value = ''; control.setCustomValidity?.(''); } } updateResults(false); container.querySelector('[data-field="topic"]')?.focus({ preventScroll: true }); }
    else if (action === 'clear-selection') { state.selected.clear(); updateResults(false); (container.querySelector('[data-action="select"]') || container.querySelector('[data-field="query"]'))?.focus({ preventScroll: true }); }
    else if (action === 'compare' && state.selected.size > 1) { remember(); ctx.navigate(`${resultsPath()}${state.query ? '&' : '?'}compare=${[...state.selected].join(',')}`); }
    else if (action === 'copy') copy(briefText(item));
    else if (action === 'export') { ctx.download(`NeoLaw-${item.id}-brief.md`, briefText(item), 'text/markdown;charset=utf-8'); ctx.toast('Brief exported'); }
    else if (action === 'copy-comparison') copy(`# Case comparison\n\n${comparison.map(briefText).join('\n---\n\n')}`);
    else if (action === 'export-comparison') { ctx.download('NeoLaw-case-comparison.md', `# Case comparison\n\n${comparison.map(briefText).join('\n---\n\n')}`, 'text/markdown;charset=utf-8'); ctx.toast('Comparison exported'); }
  }
  function change(event) {
    if (pendingSearch) return;
    const target = event.target;
    if (target.matches('[data-action="select"]')) {
      if (target.checked && state.selected.size >= 3) { target.checked = false; ctx.toast('Select up to three cases'); return; }
      if (target.checked) state.selected.add(target.dataset.id); else state.selected.delete(target.dataset.id);
      target.closest('.cases-card').classList.toggle('is-selected', target.checked); updateSelection(); remember();
    }
    if (['topic', 'court', 'stage', 'year', 'sort', 'date-from', 'date-to'].includes(target.dataset.field)) {
      const field = {'date-from':'dateFrom', 'date-to':'dateTo'}[target.dataset.field] || target.dataset.field;
      state[field] = target.value;
      if (field === 'dateFrom' || field === 'dateTo') { container.querySelectorAll('[data-field="date-from"],[data-field="date-to"]').forEach(control => control.setCustomValidity?.('')); const label = container.querySelector('[data-date-label]'); if (label) label.textContent = state.dateFrom || state.dateTo ? 'Custom dates' : 'Any date'; }
      if (field === 'court') { const label = container.querySelector('[data-court-label]'); if (label) label.textContent = state.court || 'All courts'; }
      updateResults();
    }
  }
  function input(event) {
    if (pendingSearch) return;
    if (event.target.dataset.field === 'query') state.q = event.target.value;
    else if (['date-from', 'date-to'].includes(event.target.dataset.field)) change(event);
    else if (event.target.dataset.field === 'source-search') { state.sourceSearch = event.target.value; container.querySelector('.cases-source-paragraphs').innerHTML = sourceParagraphs(); if (updateSourceMatches()) container.querySelector('.cases-source-paragraphs mark').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' }); }
  }
  function submit(event) { if (event.target.matches('[data-search-form]')) { event.preventDefault(); submitSearch(); } }
  function keydown(event) {
    if (pendingSearch) { if (event.key === 'Escape') { event.preventDefault(); cancelSearch(); } return; }
    if (event.target.matches('textarea[data-field="query"]') && event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); submitSearch(); return; }
    if (event.key === 'Escape' && container.querySelector('.nl-filter[open]')) { event.preventDefault(); closeHomeFilters(null, true); return; }
    if (event.key === 'Escape' && reader && !isComparing) { event.preventDefault(); closePanel(); return; }
    if (event.target.matches('[role="tab"]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const tabs = [...event.target.closest('[role="tablist"]').querySelectorAll('[role="tab"]')]; const index = tabs.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; tabs[next].click(); return;
    }
    if (reader && isMobile() && event.key === 'Tab') {
      const panel = container.querySelector('.cases-detail-panel');
      const focusable = [...panel.querySelectorAll('a[href], button:not(:disabled), input, select, summary, [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
  }
  container.addEventListener('click', click); container.addEventListener('change', change); container.addEventListener('input', input); container.addEventListener('submit', submit); container.addEventListener('keydown', keydown);
  document.addEventListener?.('click', outsideHomeFilters);
  window.addEventListener('resize', syncModal);
  if (isComparing) comparePage(); else if (state.searched) workspace(); else landing();
  return () => { disposed = true; stopStrategyReveal(); cancelSearch(false); remember(); cancelAnimationFrame(frame); timers.forEach(clearTimeout); container.removeEventListener('click', click); container.removeEventListener('change', change); container.removeEventListener('input', input); container.removeEventListener('submit', submit); container.removeEventListener('keydown', keydown); document.removeEventListener?.('click', outsideHomeFilters); window.removeEventListener('resize', syncModal); container.classList.remove('cases-module'); };
}
