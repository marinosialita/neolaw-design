// Presentation only: callers persist the complete answer before starting this reveal.
const activeReveals = new WeakMap();
const atomicSelector = 'button,a,input,select,textarea,form,table,details,pre,svg,img,picture,video,audio,canvas,iframe,[role="button"],[data-answer-atom]';
const hasTextNode = node => Array.from(node?.childNodes || []).some(child => child.nodeType === 3 || hasTextNode(child));

export function revealAnswer(body, {scroller, onDone, reducedMotion = false, followScroll} = {}) {
  activeReveals.get(body)?.dispose();
  let settled = false, timer;
  const listeners = [], textRecords = [], elements = [], steps = [];
  const busyBefore = body?.getAttribute?.('aria-busy');
  const classBefore = body?.classList?.contains('answer-revealing');
  let cursor, lastTop = Number(scroller?.scrollTop) || 0;
  let following = followScroll ?? (!scroller || scroller.scrollHeight - lastTop - scroller.clientHeight < 80);
  const controller = {finish:()=>settle(true), dispose:()=>settle(false)};

  function restoreElement(record) {
    if (record.shown) return;
    record.shown = true;
    if (record.hidden === null) record.node.removeAttribute('hidden');
    else record.node.setAttribute('hidden', record.hidden);
    if (record.display) record.node.style.setProperty('display', record.display, record.priority);
    else record.node.style.removeProperty('display');
    if (!record.hadStyle && !record.node.getAttribute('style')) record.node.removeAttribute('style');
  }
  function follow() {
    if (!following || !scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
    lastTop = scroller.scrollTop;
  }
  function settle(notify) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    for (const remove of listeners) remove();
    for (const record of textRecords) record.node.nodeValue = record.text;
    for (const record of elements) restoreElement(record);
    cursor?.remove();
    if (busyBefore === null || busyBefore === undefined) body?.removeAttribute?.('aria-busy');
    else body.setAttribute('aria-busy', busyBefore);
    if (!classBefore) body?.classList?.remove('answer-revealing');
    if (activeReveals.get(body) === controller) activeReveals.delete(body);
    if (notify) { follow(); onDone?.(); }
  }
  // Inert, simplified DOM fixtures have no real Text nodes. Nothing is mutated there.
  if (!body || reducedMotion || !hasTextNode(body)) { settle(true); return controller; }
  activeReveals.set(body, controller);

  function collect(node, ancestors) {
    if (node.nodeType === 3) {
      const text = node.nodeValue || '';
      const words = [...text.matchAll(/\S+\s*/gu)];
      if (!words.length) return;
      const record = {node, text};
      textRecords.push(record);
      for (const match of words) steps.push({node, ancestors, text:text.slice(0, match.index + match[0].length), weight:1});
      return;
    }
    if (node.nodeType !== 1 || node.hidden || /^(SCRIPT|STYLE|TEMPLATE)$/.test(node.tagName)) return;
    const record = {
      node, hidden:node.getAttribute('hidden'), display:node.style.getPropertyValue('display'),
      priority:typeof node.style.getPropertyPriority === 'function' ? node.style.getPropertyPriority('display') : '',
      hadStyle:node.hasAttribute('style'), shown:false
    };
    elements.push(record);
    const chain = [...ancestors, record], children = Array.from(node.childNodes);
    if (node.matches(atomicSelector) || !children.length) {
      const wordCount = (node.textContent.match(/\S+/gu) || []).length;
      steps.push({node, ancestors:chain, weight:Math.max(1, Math.min(12, wordCount))});
    } else {
      const start = steps.length;
      for (const child of children) collect(child, chain);
      if (steps.length === start) steps.push({node, ancestors:chain, weight:1});
    }
  }
  for (const node of Array.from(body.childNodes)) collect(node, []);
  if (!steps.length) { settle(true); return controller; }
  for (const record of textRecords) record.node.nodeValue = '';
  for (const record of elements) { record.node.hidden = true; record.node.style.setProperty('display', 'none', 'important'); }
  body.classList.add('answer-revealing');
  body.setAttribute('aria-busy', 'true');
  cursor = body.ownerDocument.createElement('span');
  cursor.className = 'answer-reveal-cursor';
  cursor.setAttribute('aria-hidden', 'true');

  function listen(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push(()=>target.removeEventListener(type, handler, options));
  }
  listen(scroller, 'scroll', ()=>{
    const top = scroller.scrollTop;
    if (top < lastTop - 2) following = false;
    lastTop = top;
  }, {passive:true});
  listen(scroller, 'wheel', event=>{ if (event.deltaY < 0) following = false; }, {passive:true});
  let touchY;
  listen(scroller, 'touchstart', event=>{touchY=event.touches?.[0]?.clientY;}, {passive:true});
  listen(scroller, 'touchmove', event=>{
    const current = event.touches?.[0]?.clientY;
    if (Number.isFinite(current) && Number.isFinite(touchY) && current > touchY + 2) following = false;
    touchY = current;
  }, {passive:true});
  listen(scroller, 'keydown', event=>{if (['ArrowUp','PageUp','Home'].includes(event.key)) following=false;});

  const totalWeight = steps.reduce((sum, step)=>sum+step.weight, 0);
  const duration = Math.max(3000, Math.min(9000, totalWeight * 26));
  const started = Date.now();
  let index = 0, revealedWeight = 0;
  const layoutKinds = new WeakMap();
  function positionCursor(step) {
    const parent = step.node.parentElement || step.node.parentNode;
    // A caret beside a whole card/control would become another grid or flex item.
    // Keep it in flowing prose and inline citations; cards reveal as complete atoms.
    if (!parent || (step.text === undefined && !step.node.matches?.('.chat-citation'))) {
      cursor.remove(); return;
    }
    let layout = layoutKinds.get(parent);
    if (layout === undefined) {
      const view = body.ownerDocument.defaultView;
      const display = typeof view?.getComputedStyle === 'function'
        ? view.getComputedStyle(parent).display : parent.style?.getPropertyValue('display');
      layout = /(?:grid|flex)$/.test(display || '') || parent.matches?.('.chat-source-grid,.chat-research-actions,.compare-columns,.resolution-fields');
      layoutKinds.set(parent, layout);
    }
    if (layout) cursor.remove();
    else parent.insertBefore(cursor, step.node.nextSibling);
  }
  function advance(target) {
    while (index < steps.length && revealedWeight < target) {
      const step = steps[index++];
      for (const record of step.ancestors) restoreElement(record);
      if (step.text !== undefined) step.node.nodeValue = step.text;
      positionCursor(step);
      revealedWeight += step.weight;
    }
    follow();
    // Layout may clamp scrollTop after hidden future sections are removed.
    if (scroller) lastTop = scroller.scrollTop;
  }
  function tick() {
    if (settled) return;
    const fraction = Math.min(1, Math.max(0, (Date.now()-started)/duration));
    advance(Math.max(1, Math.floor(totalWeight*fraction)));
    if (fraction >= 1 || index >= steps.length) settle(true);
    else timer = setTimeout(tick, 40);
  }
  advance(1);
  timer = setTimeout(tick, 40);
  return controller;
}
