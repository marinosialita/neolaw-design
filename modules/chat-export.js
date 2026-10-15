import {CASES} from './case-data.js';
import {workflowSamples} from './workflow-samples.js';
import {ARTICLES} from './article-data.js';
import {cleanAnswerCopy} from './answer-copy.js';

const casesById = new Map(CASES.map(item => [item.id, item]));
const blockTags = new Set(['ADDRESS','ARTICLE','ASIDE','BLOCKQUOTE','DIV','DL','DT','DD','FIGCAPTION','FIGURE','FOOTER','H1','H2','H3','H4','H5','H6','HEADER','MAIN','NAV','P','SECTION','UL','OL','TABLE']);
const ignoredTags = new Set(['SCRIPT','STYLE','SVG','TEMPLATE','NOSCRIPT','INPUT','SELECT','TEXTAREA','CANVAS']);
const ignoredClasses = ['chat-research-actions','sample-actions','message-actions','clause-actions','chat-source-open'];
const legacyCase = message => /\bdemo[-\s]?\d{1,2}\b/i.test(`${message.text || ''} ${message.html || ''}`);

// A detached template parses markup without putting it into the live document.
// Tests may supply another standards-based HTML parser that returns a DOM root.
function parseMessageHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

/** Preserve the full displayed answer and its source provenance, not its saved one-line summary. */
export function messagePlainText(message, {parseHTML = parseMessageHTML} = {}) {
  if (message.role === 'user') return String(message.text ?? '');
  const legacy = legacyCase(message);
  if (legacy) return 'Archived answer unavailable. Its case references cannot be verified. Start a new research question to access linked judgments.';
  const fallbackText = cleanAnswerCopy(message.text);
  if (!message.html) return fallbackText;
  const root = parseHTML(cleanAnswerCopy(message.html));
  const greek = !!root.querySelector('.chat-research[lang="el"]');
  const sources = new Map();
  const articleSources = new Map();
  const literalBlocks = [];
  const children = node => [...node.childNodes].map(read).join('');
  function source(node, item) {
    if (!sources.has(item.id)) sources.set(item.id, {item, blocks: new Set()});
    const entry = sources.get(item.id);
    const proposed = [node.getAttribute('data-source-block'), ...(node.getAttribute('data-source-blocks') || '').split(',')].map(Number);
    proposed.filter(n => item.paragraphs.some(block => block.n === n)).forEach(n => entry.blocks.add(n));
    return `[${item.rank}]`;
  }
  function read(node) {
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, ' ');
    if (node.nodeType !== 1) return node.nodeType === 11 ? children(node) : '';
    const tag = node.tagName.toUpperCase();
    if (ignoredTags.has(tag) || node.getAttribute('aria-hidden') === 'true' || ignoredClasses.some(name => node.classList.contains(name))) return '';
    const caseId = node.getAttribute('data-case-source');
    const articleId = node.getAttribute('data-article-source');
    if(articleId){const item=ARTICLES.find(article=>article.id===articleId);if(!item)return `[Unavailable article: ${articleId}]`;articleSources.set(item.id,item);return `[${greek?'Άρθρο':'Article'} ${item.number} · ΚΕΦ.154]`;}
    if (caseId) {
      const item = casesById.get(caseId);
      if (!item) return `[Unavailable source: ${caseId}]`;
      const marker = source(node, item);
      return node.classList.contains('chat-source-card') ? `\n\n${item.displayTitle} · ${item.code}\n${item.outcomeLabel} ${marker}\n\n` : marker;
    }
    if (tag === 'BUTTON') return node.hasAttribute('data-clause') ? `\nSource: ${children(node).trim()}\n` : '';
    if (tag === 'SUMMARY' && node.parentElement?.classList.contains('chat-research-more')) return '';
    if (tag === 'BR') return '\n';
    if (tag === 'HR') return '\n\n';
    if (tag === 'PRE') {const token = `\uE000NEOLAW_PRE_${literalBlocks.length}\uE001`; literalBlocks.push(node.textContent); return `\n\n${token}\n\n`;}
    if (node.classList.contains('risk-summary')) return `\n\n${[...node.children].map(read).map(text => text.trim()).filter(Boolean).join(' · ')}\n\n`;
    const text = children(node);
    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      return /^https?:\/\//i.test(href) && text.trim() !== href ? `${text} (${href})` : text;
    }
    if (tag === 'LI') {
      const siblings = [...(node.parentElement?.children || [])].filter(item => item.tagName.toUpperCase() === 'LI');
      const bullet = node.parentElement?.tagName.toUpperCase() === 'OL' ? `${siblings.indexOf(node) + 1}. ` : '- ';
      return `\n${bullet}${text.trim()}\n`;
    }
    if (tag === 'SMALL' && node.parentElement?.tagName.toUpperCase() === 'HEADER') return ` — ${text}`;
    if (tag === 'TR') return `\n${[...node.children].map(read).map(value => value.trim()).join(' | ')}\n`;
    if (tag === 'DEL') return `[ORIGINAL] ${text}`;
    if (tag === 'INS') return `[PROPOSED / TO COMPLETE] ${text}`;
    return blockTags.has(tag) ? `\n\n${text.trim()}\n\n` : text;
  }
  let result = children(root).replace(/[ \t]+/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  literalBlocks.forEach((text, index) => {result = result.replace(`\uE000NEOLAW_PRE_${index}\uE001`, () => text);});
  if (sources.size) {
    const entries = [...sources.values()].sort((a,b) => a.item.rank - b.item.rank).map(({item, blocks}) => {
      const labels = [...blocks].sort((a,b) => a-b);
      return `[${item.rank}] ${item.displayTitle} · ${item.code}\nCyLaw: ${item.sourceUrl}${labels.length ? `\n${greek?'Αποσπάσματα πηγής':'Source blocks'}: ${labels.join(', ')}` : ''}`;
    });
    result += (greek?'\n\nΠηγές\n':'\n\nSources\n') + entries.join('\n\n');
    if ([...sources.values()].some(entry => entry.blocks.size)) result += greek?'\n\nΟι αριθμοί αποσπασμάτων αφορούν την αρίθμηση του αναγνώστη και όχι την επίσημη αρίθμηση παραγράφων της απόφασης.':'\n\nSource block numbers refer to the reader’s extracted text, not official judicial paragraph numbers.';
  }
  if(articleSources.size) result+=(greek?'\n\nΝομοθεσία\n':'\n\nLegislation\n')+[...articleSources.values()].map(item=>`${greek?'Άρθρο':'Article'} ${item.number} · ${item.title}\n${item.lawTitle}\nCyLaw: ${item.sourceUrl}\n${greek?'Έλεγχος πηγής':'Source checked'}: ${item.verifiedOn}`).join('\n\n');
  return result || fallbackText;
}

export function conversationPlainText(messages, options) {
  return 'NEOLAW · CONVERSATION\n\n' + messages.map(message => `${message.role === 'user' ? 'You' : 'NeoLaw'}:\n${messagePlainText(message, options)}`).join('\n\n');
}

export function documentExportFile(docState, paperText = '') {
  if (docState.kind === 'text') {
    let name = String(docState.name || 'attached-document').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/[.\s]+$/g, '').trim();
    if (!/\.txt$/i.test(name)) name = name.replace(/\.[^.]*$/, '') + '.txt';
    if (name === '.txt') name = 'attached-document.txt';
    return {name, text: String(docState.text ?? '')};
  }
  const name=docState.kind==='workflow'&&Object.hasOwn(workflowSamples,docState.workflowId)?docState.workflowId+'-brief':docState.kind==='resolution'?'board-resolution':'document';
  return {name: name + '.txt', text: 'NEOLAW · DOCUMENT\n\n' + paperText};
}
