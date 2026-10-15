import {icon, escape as esc} from '../core.js';
import {CASES} from './case-data.js';
import {ARTICLES} from './article-data.js';

export function articleCitation(item,greek=true){return `<button class="chat-citation chat-article-citation" data-article-source="${esc(item.id)}" aria-label="${esc((greek?'Άνοιγμα άρθρου ':'Open article ')+item.number+(greek?' στο δεξί πλαίσιο':' beside the chat'))}">${greek?'Άρθρο':'Article'} ${esc(item.number)} · ΚΕΦ.154 ${icon('arrow',10)}</button>`}
function statutoryFramework(greek){
 const descriptions=greek?[
  'Ορίζει τον φόνο εκ προμελέτης και προβλέπει φυλάκιση διά βίου.',
  'Δίνει τον νομοθετικό ορισμό της προμελέτης.',
  'Ορίζει την ανθρωποκτονία και την παράνομη παράλειψη· είναι κρίσιμο για τη διάκριση από τον φόνο εκ προμελέτης.'
 ]:[
  'Defines premeditated murder and provides for life imprisonment.',
  'Sets out the statutory definition of premeditation.',
  'Defines manslaughter and unlawful omission, framing the distinction from premeditated murder.'
 ];
 return `<section class="chat-statutes"><h3>${greek?'Σχετικά άρθρα του Ποινικού Κώδικα':'Relevant Criminal Code articles'}</h3><ul>${ARTICLES.map((item,index)=>`<li>${articleCitation(item,greek)} <span>${esc(descriptions[index])}</span></li>`).join('')}</ul><p class="chat-research-note">${greek?'Ανοίξτε ένα άρθρο για το κείμενο, επαληθευμένες τροποποιήσεις και αποφάσεις που το αναφέρουν.':'Open an article for its text, verified amendments and judgments that mention it.'}</p></section>`;
}

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const isLegacyCaseReference = value => /\bdemo[-\s]?\d{1,2}\b/i.test(String(value||''));
export const isCaseResearch = value => /murder|homicid|premedit|φονο|προμελετ|νομολογ|case law|criminal case/.test(normalize(value));
export const casePath = (item, block=null) => `/cases?q=murder&case=${encodeURIComponent(item.id)}${block ? `&view=decision&paragraph=${block}` : ''}`;
export function mentionedCases(text) {
 const normalized=normalize(text), matches=[];
 for(const match of normalized.matchAll(/\bcase[\s-]+0?(\d{1,2})\b/g)){const item=CASES[Number(match[1])-1];if(item)matches.push({item,index:match.index})}
 for(const item of CASES)for(const name of [item.code,item.displayTitle,item.id]){if(!name)continue;const index=normalized.indexOf(normalize(name));if(index>=0)matches.push({item,index})}
 return [...new Set(matches.sort((a,b)=>a.index-b.index).map(match=>match.item))];
}
export function caseCitation(item,block,label,blocks=[]){
 if(!item || !item.paragraphs.some(p=>p.n===Number(block)))return '';
 return `<button class="chat-citation" data-case-source="${esc(item.id)}" data-source-block="${block}" data-source-blocks="${blocks.join(',')}" title="${esc(item.displayTitle+' · '+item.code+' · source block '+block)}" aria-label="${esc('Open '+item.displayTitle+', source block '+block+' beside the chat')}">${esc(label||String(item.rank))}${icon('arrow',10)}</button>`;
}
const refs=(item,section)=>{const blocks=item.sectionRefs?.[section]||[];return blocks.length?caseCitation(item,blocks[0],null,blocks):'';};
function sourceCard(item,greek){return `<button class="chat-source-card" data-case-source="${esc(item.id)}"><span class="chat-source-code"><span class="chat-source-number">${item.rank}</span>${esc(item.code)}</span><strong lang="el">${esc(item.displayTitle)}</strong><small lang="el">${esc(item.outcomeLabel)}</small><span class="chat-source-open">${greek?'Άνοιγμα δίπλα στη συζήτηση':'Open beside the chat'} ${icon('arrow-right',13)}</span></button>`}
const action=(label,prompt)=>`<button class="btn small" data-research-prompt="${esc(prompt)}">${esc(label)} ${icon('arrow-right',13)}</button>`;
export function preparedCaseAnswer(text,selectedId='',{language='el'}={}){
 const greek=language!=='en', named=mentionedCases(text), normalized=normalize(text);
 if(isLegacyCaseReference(text)){
  const message=greek?'Η συγκεκριμένη παραπομπή δεν είναι διαθέσιμη. Επιλέξτε μια απόφαση από τη συλλογή για ανάλυση ή σύγκριση.':'That reference is no longer available. Choose a judgment from the collection for analysis or comparison.';
  return {caseId:'',text:message,html:`<p>${esc(message)}</p><div class="chat-research-actions">${action(greek?'Έρευνα με πραγματικές αποφάσεις':'Research real judgments',greek?'Δείξε όλες τις υποθέσεις για φόνο εκ προμελέτης.':'Show all 10 cases on premeditated murder.')}</div>`};
 }
 const all=/\ball (?:ten|10|cases)\b|ολες.{0,15}υποθεσ|και τις 10/.test(normalized);
 const selected=named[0]||(!all&&CASES.find(item=>item.id===selectedId));
 const comparison=/compar|contrast|συγκρι|διαφορες μεταξυ/.test(normalized);
 const evidence=/evidence|αποδεικτικ|μαρτυρι/.test(normalized);
 const note=/research note|briefing|memo|σημειωμα/.test(normalized);
 const lawSection=statutoryFramework(greek),lawText=ARTICLES.map(item=>`${greek?'Άρθρο':'Article'} ${item.number} · ${item.title}\n${item.sourceUrl}`).join('\n');
 const wrap=body=>`<div class="chat-research" lang="${greek?'el':'en'}">${body}</div>`;
 const citationText=item=>`${item.displayTitle} · ${item.code}\n${item.sourceUrl}`;
 if(comparison){
  const left=selected||CASES[0], right=named.find(item=>item.id!==left.id)||CASES.find(item=>left.related?.includes(item.id))||CASES.find(item=>item.id!==left.id);
  const title=greek?'Σύγκριση αποφάσεων':'Comparing the judgments';
  const columns=[left,right].map(item=>{const summaryBlocks=item.sectionRefs.summary||[...new Set([...item.sectionRefs.facts,...item.sectionRefs.holding,...item.sectionRefs.result])];return `<section><h3 lang="el">${esc(item.displayTitle)}</h3><p lang="el">${esc(item.summary)} ${caseCitation(item,summaryBlocks[0],null,summaryBlocks)}</p><h3>${greek?'Κρίση':'Holding'}</h3><p lang="el">${esc(item.holding)} ${refs(item,'holding')}</p><h3>${greek?'Πραγματική έκβαση':'Actual outcome'}</h3><p lang="el">${esc(item.result)} ${refs(item,'result')}</p></section>`}).join('');
  return {caseId:left.id,text:`${lawText}\n\n${title}\n\n${[left,right].map(item=>`${citationText(item)}\n${item.summary}\n${item.holding}\n${item.result}`).join('\n\n')}`,html:wrap(`<h3>${title}</h3>${lawSection}<div class="compare-columns">${columns}</div><div class="chat-source-grid">${[left,right].map(item=>sourceCard(item,greek)).join('')}</div><div class="chat-research-actions">${action(greek?'Ανάλυση αιτιολογίας':'Examine the reasoning',`${greek?'Ποια μαρτυρία στηρίζει την κρίση στην':'Map the evidence in'} ${left.displayTitle};`)}</div>`)};
 }
 if(selected){
  const item=selected, title=note?(greek?'Σημείωμα έρευνας':'Research note'):evidence?(greek?'Αποδεικτικό υλικό και αιτιολογία':'Evidence and reasoning'):(greek?'Ανάλυση της απόφασης':'Case analysis');
  const blocks=[{key:'facts',label:greek?'Πραγματικά περιστατικά':'Facts',content:item.facts.join(' ')},{key:'issue',label:greek?'Νομικό ζήτημα':'Legal issue',content:item.issue},{key:'holding',label:greek?'Κρίση του Δικαστηρίου':'The court’s holding',content:item.holding},...(evidence?[{key:'reasoning',label:greek?'Αιτιολογία':'Reasoning',content:item.reasoning.join(' ')}]:[]),{key:'result',label:greek?'Τελική έκβαση':'Actual outcome',content:item.result}];
  const related=CASES.find(other=>item.related?.includes(other.id))||CASES.find(other=>other.id!==item.id);
  return {caseId:item.id,text:`${lawText}\n\n${title}\n${citationText(item)}\n\n${blocks.map(b=>`${b.label}\n${b.content}`).join('\n\n')}`,html:wrap(`<h3>${title}</h3><p lang="el"><strong>${esc(item.displayTitle)}</strong> · ${esc(item.code)}</p>${lawSection}${blocks.map(b=>`<h3>${b.label}</h3><p lang="el">${esc(b.content)} ${refs(item,b.key)}</p>`).join('')}${item.dateNote?`<p class="chat-research-note">${esc(item.dateNote)}</p>`:''}<div class="chat-source-grid">${sourceCard(item,greek)}</div><div class="chat-research-actions">${action(greek?'Σύγκριση με συναφή απόφαση':'Compare a related judgment',`${greek?'Σύγκρινε':'Compare'} ${item.displayTitle} ${greek?'με':'with'} ${related.displayTitle}.`)}${action(greek?'Όλες οι 10 αποφάσεις':'All 10 judgments',greek?'Δείξε όλες τις υποθέσεις για φόνο εκ προμελέτης.':'Show all 10 cases on premeditated murder.')}</div>`)};
 }
 const featured=CASES.slice(0,4), remaining=CASES.slice(4);
 const intro=greek?'Η προμελέτη πρέπει να αποδεικνύεται χωριστά από την πρόθεση θανάτωσης. Στη συλλογή υπάρχουν τόσο καταδίκες που διατηρήθηκαν όσο και καταδίκες για φόνο εκ προμελέτης που αντικαταστάθηκαν με ανθρωποκτονία.':'Premeditation must be proved separately from the intention to kill. These judgments include both upheld convictions and murder convictions replaced with manslaughter.';
 const points=[CASES[0],CASES[1],CASES[4]].map(item=>`<li><strong lang="el">${esc(item.displayTitle)}.</strong> <span lang="el">${esc(item.principle)}</span> ${refs(item,'principle')}</li>`).join('');
 const outcomes=CASES.slice(0,3).map(item=>`<li><strong lang="el">${esc(item.displayTitle)}:</strong> <span lang="el">${esc(item.result)}</span> ${refs(item,'result')}</li>`).join('');
 return {caseId:'',text:`${lawText}\n\n${intro}\n\n${CASES.map(item=>`${citationText(item)}\n${item.principle}\n${item.result}`).join('\n\n')}`,html:wrap(`<p>${esc(intro)} ${refs(CASES[0],'principle')}</p>${lawSection}<h3>${greek?'Τι προκύπτει από τη νομολογία':'What the judgments establish'}</h3><ul class="chat-research-questions">${points}</ul><h3>${greek?'Οι εκβάσεις έχουν σημασία':'Read the actual outcomes'}</h3><ul class="chat-research-questions">${outcomes}</ul><h3>${greek?'10 αποφάσεις · Πηγές':'10 judgments · Sources'}</h3><div class="chat-source-grid">${featured.map(item=>sourceCard(item,greek)).join('')}</div><details class="chat-research-more"><summary>${greek?'Άλλες 6 αποφάσεις':'6 more judgments'}</summary><div class="chat-source-grid">${remaining.map(item=>sourceCard(item,greek)).join('')}</div></details><div class="chat-research-actions">${action(greek?'Σύγκριση των δύο πρώτων':'Compare the first two',`${greek?'Σύγκρινε':'Compare'} ${CASES[0].displayTitle} ${greek?'με':'with'} ${CASES[1].displayTitle}.`)}${action(greek?'Αποδεικτικό υλικό στην Γαβριήλ':'Evidence in Gavriil',`${greek?'Ποια μαρτυρία στηρίζει την κρίση στην':'Map the evidence in'} ${CASES[4].displayTitle};`)}<button class="btn small" data-nav="/cases?q=murder">${greek?'Άνοιγμα νομολογίας':'Open Case Law'} ${icon('arrow-right',13)}</button></div>`)};
}
