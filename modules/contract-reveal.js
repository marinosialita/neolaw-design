import {escape as esc} from '../core.js';

export const CONTRACT_REVEAL_MS=5600;
export const CONTRACT_REVEAL_EXIT_MS=600;
export const CONTRACT_PAGE_SETTLE_MS=180;

// A visual prelude to the local presentation, with no simulated research claims.
export function contractRevealMarkup(title){
  return `<div class="contract-reveal-scene" aria-hidden="true">
    <div class="contract-reveal-aura"></div><div class="contract-reveal-orbit"></div>
    <div class="contract-reveal-stack">
      <div class="contract-reveal-sheet sheet-back"></div><div class="contract-reveal-sheet sheet-middle"></div>
      <div class="contract-reveal-sheet sheet-front">
        <div class="contract-reveal-monogram"><svg viewBox="-5 0 100 100"><path d="M21 61H0V0H21.5L69 64V0H90V100H69L21 36V61Z"/><rect y="78" width="21" height="22"/></svg></div>
        <div class="contract-reveal-rule"></div>
        <div class="contract-reveal-lines"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="contract-reveal-seal"><span></span><span></span></div>
        <div class="contract-reveal-scan"></div>
      </div>
      <span class="contract-reveal-spark spark-one"></span><span class="contract-reveal-spark spark-two"></span><span class="contract-reveal-spark spark-three"></span>
    </div>
    <div class="contract-reveal-copy"><span class="contract-reveal-eyebrow">NEOLAW</span><div class="contract-reveal-titles"><p class="reveal-title-one">Every detail. Considered.</p><p class="reveal-title-two">Your agreement, taking shape.</p><p class="reveal-title-three">Ready for the first word.</p></div><span class="contract-reveal-contract">${esc(title)}</span></div>
    <div class="contract-reveal-progress"><span></span></div>
  </div>`;
}
