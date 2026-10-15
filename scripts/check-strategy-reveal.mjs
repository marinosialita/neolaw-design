import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {revealStrategyText} from '../modules/strategy-reveal.js';

const require = createRequire(import.meta.url);
const {parseHTML} = require(process.env.NEOLAW_EXPORT_DOM || '/tmp/neolaw-export-check/node_modules/linkedom');
const strategy = 'Η έρευνα εστιάζει στο πώς αποδεικνύεται η προμελέτη και πώς διακρίνεται από την πρόθεση θανάτωσης. Συγκρίνετε τη μαρτυρία, το σκεπτικό και την τελική έκβαση κάθε απόφασης, ιδίως όταν η καταδίκη μετατρέπεται σε ανθρωποκτονία.';
let passed = 0;

function check(label, run) {
  const originalSet = setTimeout, originalClear = clearTimeout, originalNow = Date.now;
  let now = 100000, id = 0;
  const timers = new Map();
  globalThis.setTimeout = (fn, delay = 0)=>{timers.set(++id, {fn, at:now + delay}); return id;};
  globalThis.clearTimeout = key=>timers.delete(key);
  Date.now = ()=>now;
  const advance = milliseconds=>{
    const target = now + milliseconds;
    let safety = 0;
    while (true) {
      const next = [...timers].filter(([,task])=>task.at <= target).sort((a,b)=>a[1].at-b[1].at)[0];
      if (!next) break;
      assert.ok(++safety < 1000, 'Timers must remain bounded.');
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = target;
  };
  const {document} = parseHTML('<html><body><p id="strategy"></p></body></html>');
  const element = document.getElementById('strategy');
  element.textContent = strategy;
  try {
    run({element, advance, timers});
    passed++;
    console.log('PASS ' + label);
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
    Date.now = originalNow;
  }
}

check('Greek strategy types progressively before completion and restores exact text', ({element, advance, timers})=>{
  let completed = 0;
  revealStrategyText(element, {onDone(){completed++;}});
  const typed = element.querySelector('.cases-strategy-typed');
  assert.equal(typed.textContent, 'Η');
  assert.equal(element.getAttribute('aria-busy'), 'true');
  assert.equal(element.classList.contains('is-typing'), true);
  advance(2100);
  assert.ok(typed.textContent.length > 30 && typed.textContent.length < strategy.length);
  assert.equal(completed, 0);
  advance(2100);
  assert.equal(completed, 1);
  assert.equal(element.textContent, strategy);
  assert.equal(element.children.length, 0);
  assert.equal(element.getAttribute('aria-busy'), null);
  assert.equal(element.classList.contains('is-typing'), false);
  assert.equal(timers.size, 0);
});

check('Full paragraph reserves space and has one accessible static copy during typing', ({element, timers})=>{
  const reveal = revealStrategyText(element);
  const reserve = element.querySelector('.cases-strategy-reserve');
  const stream = element.querySelector('.cases-strategy-stream');
  const accessible = element.querySelector('.cases-strategy-accessible');
  assert.equal(reserve.textContent, strategy);
  assert.equal(reserve.getAttribute('aria-hidden'), 'true');
  assert.equal(stream.getAttribute('aria-hidden'), 'true');
  assert.equal(accessible.textContent, strategy);
  assert.equal(accessible.getAttribute('aria-hidden'), null);
  assert.equal(element.querySelectorAll('[aria-live]').length, 0);
  assert.equal(stream.querySelectorAll('.cases-strategy-caret').length, 1);
  reveal.dispose();
  assert.equal(timers.size, 0);
});

check('Finish completes once; dispose restores silently and guards already queued callbacks', ({element, advance, timers})=>{
  let completed = 0;
  let reveal = revealStrategyText(element, {onDone(){completed++;}});
  advance(300);
  reveal.finish(); reveal.finish(); reveal.dispose();
  advance(9000);
  assert.equal(completed, 1);
  assert.equal(element.textContent, strategy);
  assert.equal(timers.size, 0);
  reveal = revealStrategyText(element, {onDone(){completed++;}});
  const stale = [...timers.values()][0].fn;
  reveal.dispose();
  stale();
  assert.equal(completed, 1);
  assert.equal(element.textContent, strategy);
  assert.equal(timers.size, 0);
});

check('Restart disposes the old reveal before reading its text and ignores stale callbacks', ({element, advance, timers})=>{
  let first = 0, second = 0;
  revealStrategyText(element, {onDone(){first++;}});
  advance(120);
  const stale = [...timers.values()][0].fn;
  revealStrategyText(element, {onDone(){second++;}});
  stale();
  assert.equal(timers.size, 1);
  advance(4200);
  assert.equal(first, 0);
  assert.equal(second, 1);
  assert.equal(element.textContent, strategy);
});

check('Reduced motion and zero duration complete immediately without animation timers', ({element, timers})=>{
  let completed = 0;
  const reveal = revealStrategyText(element, {reducedMotion:true, onDone(){completed++;}});
  reveal.finish();
  assert.equal(completed, 1);
  assert.equal(element.textContent, strategy);
  assert.equal(element.children.length, 0);
  assert.equal(timers.size, 0);
  revealStrategyText(element, {duration:0, onDone(){completed++;}});
  assert.equal(completed, 2);
  assert.equal(timers.size, 0);
});

check('Unicode characters stay whole and markup-like input remains plain text', ({element, advance})=>{
  const text = '⚖️ 🧑‍⚖️ Η έρευνα <img src=x onerror=alert(1)> & νομική αρχή.';
  element.textContent = text;
  revealStrategyText(element, {duration:300});
  for (let elapsed = 0; elapsed < 270; elapsed += 30) {
    advance(30);
    const typed = element.querySelector('.cases-strategy-typed');
    assert.ok(Array.from(text).some((_, index)=>Array.from(text).slice(0, index + 1).join('') === typed.textContent));
    assert.equal(element.querySelector('img'), null);
  }
  advance(30);
  assert.equal(element.textContent, text);
  assert.equal(element.querySelector('img'), null);
});

check('Empty and absent strategy complete without throwing or scheduling work', ({element, timers})=>{
  let completed = 0;
  element.textContent = '';
  revealStrategyText(element, {onDone(){completed++;}});
  revealStrategyText(null, {onDone(){completed++;}});
  assert.equal(completed, 2);
  assert.equal(timers.size, 0);
});

console.log(`\n${passed} strategy reveal timing and accessibility groups passed. Inert DOM checks; no browser animation verification.`);
