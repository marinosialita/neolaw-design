import { escape } from '../core.js';

const words = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu;
const fold = word => word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ');
const stopWords = new Set('find search show me the a an all cases case law decisions decision about on for please with of in is are what how can you related to βρες βρείτε μου υποθέσεις υπόθεση αποφάσεις απόφαση νομολογία σχετικά για τον τη την το των με και σε στο στη του της προς ποια ποιες τι δείξε εμφάνισε θέλω εκ'.split(' ').map(fold));

// Match the complete Greek noun/adjective, not arbitrary words containing its stem.
function keyword(word) {
  const value = fold(word);
  return /^προμελετ(?:η|ησ|εσ|ων|ημενοσ|ημενη|ημενο|ημενου|ημενησ|ημενων|ημενεσ|ημενοι|ημενουσ)$/.test(value) ? 'προμελέτη' : value;
}

/** Plain text in, escaped HTML out. Run before adding controls or other markup. */
export function createCaseHighlighter(query = '') {
  const terms = new Set((String(query).match(words) || []).filter(word => !stopWords.has(fold(word))).map(keyword));
  return (text = '') => {
    const original = String(text);
    if (!terms.size) return escape(original);
    let html = '', cursor = 0;
    for (const match of original.matchAll(words)) {
      html += escape(original.slice(cursor, match.index));
      const value = escape(match[0]);
      html += terms.has(keyword(match[0])) ? `<mark class="cases-query-match">${value}</mark>` : value;
      cursor = match.index + match[0].length;
    }
    return html + escape(original.slice(cursor));
  };
}
