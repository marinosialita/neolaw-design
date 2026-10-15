import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {messagePlainText, conversationPlainText, documentExportFile} from '../modules/chat-export.js';
import {preparedCaseAnswer} from '../modules/case-research.js';
import {CASES} from '../modules/case-data.js';

// Inert HTML parsing only. No browser, network, clipboard or native download is exercised.
// Setup: npm install --prefix /tmp/neolaw-export-check --ignore-scripts --no-save --no-audit --no-fund linkedom@0.18.13
// Override the test parser with NEOLAW_EXPORT_DOM=/absolute/path/to/linkedom.
const require = createRequire(import.meta.url);
let parseHTML;
try {({parseHTML} = require(process.env.NEOLAW_EXPORT_DOM || '/tmp/neolaw-export-check/node_modules/linkedom'));}
catch {throw Error('Install the test-only linkedom parser using the setup command in scripts/check-exports.mjs, or set NEOLAW_EXPORT_DOM.');}
const originalDocument = globalThis.document;
globalThis.document = parseHTML('<html><body></body></html>').document;
let passed = 0;
function check(name, run) {run(); passed++; console.log('PASS ' + name);}
const chatSource = readFileSync(new URL('../chat.js',import.meta.url),'utf8');
function actualToolAnswer(kind) {
  const start = chatSource.indexOf(`else if(kind==='${kind}')`), end = chatSource.indexOf('\n else', start + 1);
  const block = chatSource.slice(start, end);
  const found = block.match(/append\('([^']*)',`([\s\S]*)`\)/);
  assert.ok(found, `Find actual ${kind} answer template`);
  const html = new Function('icon', 'return `'+found[2]+'`')(()=>'');
  return {role:'assistant',text:found[1],html};
}
try {
  check('User text and plain assistant messages retain exact whitespace and literal markup', () => {
    const text = '  First line\r\n\r\n  <literal> & amount €120\t\n';
    assert.equal(messagePlainText({role:'user',text,html:'<p>Do not use this</p>'}),text);
    assert.equal(messagePlainText({role:'assistant',text}),text);
  });
  check('Stored assistant copy is cleaned in exports while identical user text and source documents remain unchanged', () => {
    const oldIntro='Προετοιμασμένη απάντηση από 10 πραγματικές αποφάσεις. Πατήστε μια παραπομπή για να διαβάσετε την πηγή δίπλα στη συζήτηση.';
    const original={role:'assistant',text:'The example review identifies two commercial points.',html:`<p class="chat-research-note">${oldIntro}</p><p>Retained answer.</p>`};
    assert.equal(messagePlainText(original),'Retained answer.');
    assert.equal(original.html,`<p class="chat-research-note">${oldIntro}</p><p>Retained answer.</p>`);
    assert.equal(messagePlainText({role:'assistant',text:original.text}),'The review identifies two commercial points.');
    assert.equal(messagePlainText({role:'user',text:oldIntro}),oldIntro);
    assert.equal(documentExportFile({kind:'text',name:'source.txt',text:oldIntro}).text,oldIntro);
    const fallback=messagePlainText({role:'assistant',text:original.text,html:`<p class="chat-research-note">${oldIntro}</p>`});
    assert.equal(fallback,'The review identifies two commercial points.');
  });
  check('Contract review exports actual findings, risk counts, clause references and prose in text order', () => {
    const text = messagePlainText(actualToolAnswer('review'));
    assert.ok(text.startsWith('I’ve reviewed the consultancy agreement from the Consultant’s perspective.'));
    for (const value of ['1 high risk · 1 to negotiate · 3 clauses checked','Uncapped liability — HIGH','Consider a negotiated cap with appropriate exceptions.','Source: Clause 7','Termination without notice — NEGOTIATE','Source: Clause 9']) assert.ok(text.includes(value), value);
    assert.ok(text.indexOf('Uncapped liability') < text.indexOf('The agreement has no liability cap.'));
    assert.ok(text.indexOf('The agreement has no liability cap.') < text.indexOf('Termination without notice'));
    assert.ok(!text.includes('The example review identifies two commercial points.'));
  });
  check('Comparison and pleading exports preserve every actual detail rather than the one-line saved summary', () => {
    const compare = messagePlainText(actualToolAnswer('compare'));
    assert.ok(compare.includes('EUR 80 → EUR 100 per hour.')); assert.ok(compare.includes('Immediate termination → 30 days’ written notice.'));
    const pleading = messagePlainText(actualToolAnswer('pleading'));
    for (const value of ['Particulars of loss — MISSING','itemised schedule and supporting documents','Paragraph 8 refers to paragraph 12, which is not present.','The defendant’s address remains a placeholder.']) assert.ok(pleading.includes(value),value);
  });
  check('Research exports all ten source identities and CyLaw URLs with validated local source blocks', () => {
    const answer = preparedCaseAnswer('Show all 10 cases on premeditated murder.');
    const text = messagePlainText({role:'assistant',...answer});
    for (const item of CASES) {assert.ok(text.includes(item.displayTitle)); assert.ok(text.includes(item.sourceUrl));}
    for (const item of [CASES[0],CASES[1],CASES[4]]) for (const block of item.sectionRefs.principle) assert.match(text, new RegExp(`Source blocks: [^\\n]*\\b${block}\\b`));
    assert.ok(text.includes('not official judicial paragraph numbers'));
    assert.ok(!text.includes('Compare the first two')); assert.ok(!text.includes('Open beside the chat')); assert.ok(!text.includes('Open Case Law'));
  });
  check('Case eight keeps its published date discrepancy note, source URL and every section anchor', () => {
    const item = CASES[7], answer = preparedCaseAnswer('Explain case 08.');
    const text = messagePlainText({role:'assistant',...answer});
    assert.ok(text.includes(item.dateNote)); assert.ok(text.includes(item.sourceUrl));
    for (const key of ['facts','issue','holding','result']) for (const block of item.sectionRefs[key]) assert.match(text,new RegExp(`Source blocks: [^\\n]*\\b${block}\\b`));
  });
  check('Invalid source blocks are omitted and an old fictional reference is never mapped to a real judgment', () => {
    const item = CASES[0], block = item.sectionRefs.result[0];
    const valid = messagePlainText({role:'assistant',html:`<p>Actual source <button data-case-source="${item.id}" data-source-block="999999" data-source-blocks="${block},-1,0,no">1</button></p>`});
    assert.ok(valid.includes(`Source blocks: ${block}`)); assert.ok(!valid.includes('999999'));
    const legacy = messagePlainText({role:'assistant',text:'Earlier DEMO-01 finding.',html:'<p>A fictional claim <button data-case-source="demo-01">DEMO-01</button></p><button data-research-prompt="anything">Try another answer</button>'});
    assert.ok(legacy.startsWith('Archived answer unavailable.')); assert.ok(legacy.includes('case references cannot be verified')); assert.ok(!legacy.includes('A fictional claim')); assert.doesNotMatch(legacy,/demo|fictional/i);
    assert.ok(!legacy.includes('https://')); assert.ok(!legacy.includes('Try another answer'));
  });
  check('Inline emphasis, entities, lists, links, and literal blocks retain their order and meaning', () => {
    const text = messagePlainText({role:'assistant',html:'<h3>Terms &amp; conditions</h3><p>Pay <strong>€100</strong> within <em>30 days</em>.</p><ol><li>First &lt;term&gt;</li><li>Second <a href="https://example.test/source">source</a></li></ol><pre>  keep spacing\n\n\n  keep blank lines</pre><button>Follow-up action</button><script>bad()</script>'});
    assert.ok(text.includes('Pay €100 within 30 days.')); assert.ok(text.includes('1. First <term>')); assert.ok(text.includes('2. Second source (https://example.test/source)'));
    assert.ok(text.includes('  keep spacing\n\n\n  keep blank lines')); assert.ok(!text.includes('Follow-up action')); assert.ok(!text.includes('bad()'));
  });
  check('Conversation export contains full rich answers and keeps each raw user turn unchanged', () => {
    const user = '  Keep the following exactly:\r\n\r\n  €100  ';
    const answer = actualToolAnswer('compare'); const text = conversationPlainText([{role:'user',text:user}, answer]);
    assert.ok(text.includes('You:\n'+user+'\n\nNeoLaw:')); assert.ok(text.includes('EUR 80 → EUR 100 per hour.'));
    assert.ok(text.startsWith('NEOLAW · CONVERSATION'));
  });
  check('Uploaded text exports exact source contents with a safe original-based .txt filename', () => {
    const raw = '\uFEFF  original\r\n\r\n<literal>& \t\n';
    assert.deepEqual(documentExportFile({kind:'text',name:'Client notes.md',text:raw},'Wrong preview heading'),{name:'Client notes.txt',text:raw});
    assert.deepEqual(documentExportFile({kind:'text',name:'existing.txt',text:''}),{name:'existing.txt',text:''});
    const safe = documentExportFile({kind:'text',name:'../../Unsafe\u0000:<name>.md',text:raw}); assert.equal(safe.name,'Unsafe___name_.txt'); assert.equal(safe.text,raw);
  });
  check('Document exports use the NeoLaw header and appropriate filename', () => {
    assert.deepEqual(documentExportFile({kind:'resolution'},'Board content'),{name:'board-resolution.txt',text:'NEOLAW · DOCUMENT\n\nBoard content'});
    assert.deepEqual(documentExportFile({kind:'pleading'},'Pleading content'),{name:'document.txt',text:'NEOLAW · DOCUMENT\n\nPleading content'});
  });
  console.log(`\n${passed} export fidelity checks passed with an inert HTML parser. Clipboard and browser downloads remain unverified.`);
} finally {if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;}
