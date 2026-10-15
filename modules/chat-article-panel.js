import { escape as esc, icon } from '../core.js';
import { CASES } from './case-data.js';

const VIEWS = ['article', 'history', 'cases'];
const LABELS = { article: 'Άρθρο', history: 'Ιστορικό τροποποιήσεων', cases: 'Νομολογία' };
let panelSequence = 0;

function sourceUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}

/** Read a captured statutory article beside the chat. No live legal research is performed. */
export function mountArticlePanel(container, item, { view = 'article', onClose = () => {}, onState = () => {}, onCase = () => {} } = {}) {
  const prefix = `chat-article-${++panelSequence}`;
  const originalLabel = container.getAttribute('aria-label');
  const alreadyStyled = container.classList.contains('chat-article-panel');
  const scroll = { article: 0, history: 0, cases: 0 };
  const related = (item.relatedCases || []).map(entry => {
    const decision = CASES.find(candidate => candidate.id === entry.caseId);
    if (!decision) return null;
    const block = Number(entry.block);
    return { ...entry, decision, block: decision.paragraphs.some(paragraph => paragraph.n === block) ? block : 0 };
  }).filter(Boolean);
  const original = sourceUrl(item.sourceUrl);
  const title = `${item.number ? `Άρθρο ${item.number} · ` : ''}${item.title || 'Νομοθεσία'}`;
  let tab = VIEWS.includes(view) ? view : 'article';
  let active = true;
  let frame;
  container.classList.add('chat-article-panel');
  container.setAttribute('aria-label', title);

  const captureNote = () => `<p class="article-source-note">${icon('info', 13)}<span>Ενοποιημένο κείμενο από το CyLaw${item.verifiedOn ? ` · Στιγμιότυπο πηγής: ${esc(item.verifiedOn)}` : ''}. Ελέγξτε την επίσημη πηγή για την ισχύουσα διατύπωση.</span></p>`;

  function article() {
    return `<article class="article-reader" lang="el"><div class="article-reader__label">${icon('book', 14)}<span>${esc(item.lawTitle || 'Νομοθεσία')}</span></div><h3>${esc(item.title || `Άρθρο ${item.number || ''}`)}</h3><div class="article-reader__text">${(item.text || []).map(text => `<p>${esc(text)}</p>`).join('')}</div>${captureNote()}</article>`;
  }

  function history() {
    const entries = item.history || [];
    return `<section class="article-history" lang="el"><div class="article-section-heading"><span>${icon('history', 16)}</span><h3>Καταγεγραμμένες τροποποιήσεις</h3></div><p class="article-history__scope">${esc(item.historyNote || 'Το πλήρες ιστορικό τροποποιήσεων δεν έχει επιβεβαιωθεί σε αυτή την προεπισκόπηση.')}</p>${entries.length ? `<ol class="article-history__list">${entries.map(entry => {
      const href = sourceUrl(entry.url);
      return `<li><span class="article-history__point" aria-hidden="true"></span><div>${entry.date ? `<p class="article-history__date">${esc(entry.date)}</p>` : ''}<h4>${esc(entry.label)}</h4><p>${esc(entry.description)}</p>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Πηγή τροποποίησης ${icon('external', 12)}</a>` : ''}</div></li>`;
    }).join('')}</ol>` : '<p class="article-reader__empty">Δεν υπάρχει καταγεγραμμένο ιστορικό σε αυτή την προεπισκόπηση.</p>'}${captureNote()}</section>`;
  }

  function cases() {
    return `<section class="article-related" lang="el"><div class="article-section-heading"><span>${icon('scale', 16)}</span><h3>Σχετικές αποφάσεις</h3><span class="article-related__count">${related.length}</span></div><p class="article-related__intro">Αποφάσεις από τη συλλογή προεπισκόπησης που παραπέμπουν στο άρθρο.</p>${related.length ? `<div class="article-related__list">${related.map((entry, index) => `<button class="article-related__case" type="button" data-article-case="${index}" aria-label="Άνοιγμα απόφασης: ${esc(entry.decision.displayTitle)}"><span class="article-related__meta">${esc(entry.decision.code)}</span><strong>${esc(entry.decision.displayTitle)}</strong><span class="article-related__court">${esc(entry.decision.court)}</span>${entry.description ? `<span class="article-related__description">${esc(entry.description)}</span>` : ''}<span class="article-related__open">${entry.block ? 'Δείτε το σχετικό απόσπασμα' : 'Δείτε την απόφαση'} ${icon('arrow-right', 14)}</span></button>`).join('')}</div>` : '<p class="article-reader__empty">Δεν έχουν συνδεθεί αποφάσεις για αυτό το άρθρο στην προεπισκόπηση.</p>'}</section>`;
  }

  function draw(focusTab = false) {
    container.innerHTML = `<div class="cases-panel-top"><span class="chat-case-reader-label">${icon('book', 14)} Νομοθεσία</span>${original ? `<a class="cases-original-link" href="${esc(original)}" target="_blank" rel="noopener noreferrer" aria-label="Άνοιγμα άρθρου στο CyLaw">CyLaw ${icon('external', 12)}</a>` : ''}<button class="cases-panel-close" data-close-article aria-label="Κλείσιμο άρθρου">${icon('x', 17)}</button></div><div class="cases-panel-heading"><h2 lang="el" tabindex="-1">${esc(title)}</h2><div class="cases-panel-meta" lang="el">${esc(item.lawTitle || '')}</div></div><div class="cases-panel-navigation"><div class="cases-reader-tabs" role="tablist" aria-label="Προβολή άρθρου">${VIEWS.map(value => `<button id="${prefix}-tab-${value}" type="button" role="tab" aria-controls="${prefix}-content" data-article-view="${value}" tabindex="${value === tab ? 0 : -1}" aria-selected="${value === tab}" class="${value === tab ? 'active' : ''}">${LABELS[value]}</button>`).join('')}</div></div><div class="cases-panel-content" id="${prefix}-content" role="tabpanel" aria-labelledby="${prefix}-tab-${tab}" tabindex="0">${tab === 'history' ? history() : tab === 'cases' ? cases() : article()}</div>`;
    const content = container.querySelector('.cases-panel-content');
    content.scrollTop = scroll[tab];
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!active) return;
      content.scrollTop = scroll[tab];
      const target = focusTab ? container.querySelector(`[data-article-view="${tab}"]`) : container.querySelector('.cases-panel-heading h2');
      target?.focus({ preventScroll: true });
    });
  }

  function switchView(next) {
    if (!VIEWS.includes(next) || next === tab) return;
    if (onState({ view: next }) === false) return;
    scroll[tab] = container.querySelector('.cases-panel-content')?.scrollTop || 0;
    tab = next;
    draw(true);
  }

  function click(event) {
    if (event.target.closest('[data-close-article]')) { onClose(); return; }
    const selected = event.target.closest('[data-article-view]');
    if (selected) { switchView(selected.dataset.articleView); return; }
    const trigger = event.target.closest('[data-article-case]');
    if (!trigger) return;
    const entry = related[Number(trigger.dataset.articleCase)];
    if (entry) onCase(entry.decision.id, entry.block, trigger);
  }

  function keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    const trigger = event.target.closest('[data-article-view]');
    if (!trigger || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = VIEWS.indexOf(tab);
    const next = event.key === 'Home' ? VIEWS[0] : event.key === 'End' ? VIEWS.at(-1) : VIEWS[(index + (event.key === 'ArrowRight' ? 1 : -1) + VIEWS.length) % VIEWS.length];
    switchView(next);
  }

  container.addEventListener('click', click);
  container.addEventListener('keydown', keydown);
  draw();
  return () => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(frame);
    container.removeEventListener('click', click);
    container.removeEventListener('keydown', keydown);
    if (!alreadyStyled) container.classList.remove('chat-article-panel');
    if (originalLabel === null) container.removeAttribute('aria-label');
    else container.setAttribute('aria-label', originalLabel);
  };
}
