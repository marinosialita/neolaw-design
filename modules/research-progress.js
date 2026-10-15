import { escape as esc, icon } from '../core.js';
import { ARTICLES } from './article-data.js';
import { CASES } from './case-data.js';
import { answerBrand } from './answer-brand.js';

const STAGES = [
  { at: 0, label: 'Αναζητώ στοιχεία για προμελέτη και φόνο εκ προμελέτης.' },
  { at: .2, label: 'Εξετάζω τα άρθρα 203, 204 και 205 του Ποινικού Κώδικα.' },
  { at: .45, label: 'Αναζητώ σχετική νομολογία και τις εκβάσεις των αποφάσεων.' },
  { at: .8, label: 'Συνθέτω την απάντηση με παραπομπές.' }
];

const articles = ['203', '204', '205'].map(number => ARTICLES.find(item => String(item.number) === number)).filter(Boolean);
const linkedCases = (articles.find(item => String(item.number) === '203')?.relatedCases || []).map(reference => {
  const item = CASES.find(candidate => candidate.id === reference.caseId);
  const block = Number(reference.block);
  return item && item.paragraphs.some(paragraph => paragraph.n === block) ? { item, block } : null;
}).filter(Boolean).filter((entry, index, entries) => entries.findIndex(candidate => candidate.item.id === entry.item.id) === index).slice(0, 3);

/** A timed walkthrough of captured sources; the caller controls answer insertion. */
export function mountResearchProgress(host, { duration = 5500, elapsed = 0, onArticle = () => {}, onCase = () => {} } = {}) {
  const total = Number.isFinite(duration) && duration > 0 ? duration : 5500;
  const passed = Number.isFinite(elapsed) ? Math.min(total, Math.max(0, elapsed)) : 0;
  const element = document.createElement('div');
  element.className = 'thinking research-progress';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'false');
  element.setAttribute('lang', 'el');
  element.innerHTML = `<div class="research-progress__header">${answerBrand()}<span class="research-progress__demo">Προεπισκόπηση έρευνας</span></div>
    <div class="research-progress__status"><span class="research-progress__pulse" aria-hidden="true"></span><span data-research-title></span></div>
    <div class="research-progress__track" aria-hidden="true"><span></span></div>
    <div class="research-progress__sources" aria-live="off">
      <section class="research-progress__source-step" data-research-articles hidden><span class="research-progress__step-icon" aria-hidden="true"><span class="research-progress__stage-icon">${icon('book', 14)}</span><span class="research-progress__check">${icon('check', 14)}</span></span><div class="research-progress__source-content"><h3>Ποινικός Κώδικας <span>· Κεφ. 154</span></h3><div class="research-progress__articles">${articles.map(item => `<button type="button" data-research-article="${esc(item.id)}" aria-label="Άνοιγμα άρθρου ${esc(item.number)}: ${esc(item.title)}"><span>Άρθρο ${esc(item.number)}</span>${esc(item.title)}${icon('arrow-right', 12)}</button>`).join('')}</div></div></section>
      <section class="research-progress__source-step" data-research-cases hidden><span class="research-progress__step-icon" aria-hidden="true"><span class="research-progress__stage-icon">${icon('scale', 14)}</span><span class="research-progress__check">${icon('check', 14)}</span></span><div class="research-progress__source-content"><h3>Σχετικές αποφάσεις <span>· CyLaw</span></h3><div class="research-progress__cases">${linkedCases.map(({ item, block }) => `<button type="button" data-research-case="${esc(item.id)}" data-research-block="${block}" aria-label="Άνοιγμα απόφασης: ${esc(item.displayTitle)}" title="${esc(item.displayTitle)} · ${esc(item.code)}"><span>${esc(item.displayTitle)}</span>${icon('arrow-right', 12)}</button>`).join('')}</div></div></section>
    </div>`;
  const title = element.querySelector('[data-research-title]');
  const articleStep = element.querySelector('[data-research-articles]');
  const caseStep = element.querySelector('[data-research-cases]');
  const timers = new Set();
  let disposed = false;
  let current = 0;

  function update(stageIndex, complete = false) {
    if (disposed) return;
    current = stageIndex;
    title.textContent = complete ? 'Η απάντηση με τις πηγές είναι έτοιμη.' : STAGES[stageIndex].label;
    element.classList.toggle('is-ready', complete);
    articleStep.hidden = stageIndex < 1;
    caseStep.hidden = stageIndex < 2;
    articleStep.classList.toggle('is-current', !complete && stageIndex === 1);
    articleStep.classList.toggle('is-complete', complete || stageIndex > 1);
    caseStep.classList.toggle('is-current', !complete && stageIndex === 2);
    caseStep.classList.toggle('is-complete', complete || stageIndex > 2);
  }

  function click(event) {
    if (disposed) return;
    const articleButton = event.target.closest('[data-research-article]');
    if (articleButton && current >= 1 && articles.some(item => item.id === articleButton.dataset.researchArticle)) {
      onArticle(articleButton.dataset.researchArticle, articleButton);
      return;
    }
    const caseButton = event.target.closest('[data-research-case]');
    if (!caseButton || current < 2) return;
    const entry = linkedCases.find(candidate => candidate.item.id === caseButton.dataset.researchCase);
    if (entry) onCase(entry.item.id, entry.block, caseButton);
  }

  const initial = STAGES.reduce((index, stage, candidate) => passed >= total * stage.at ? candidate : index, 0);
  update(initial, passed >= total);
  element.addEventListener('click', click);
  host.append(element);

  function schedule(callback, remaining) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) callback();
    }, remaining);
    timers.add(timer);
  }

  STAGES.forEach((stage, index) => {
    const remaining = total * stage.at - passed;
    if (remaining > 0) schedule(() => update(index), remaining);
  });
  if (passed < total) schedule(() => update(STAGES.length - 1, true), total - passed);

  return {
    element,
    dispose() {
      if (disposed) return;
      disposed = true;
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
      element.removeEventListener('click', click);
      element.remove();
    }
  };
}
