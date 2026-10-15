// Presentation only: the original strategy remains available to assistive technology.
const activeReveals = new WeakMap();

export function revealStrategyText(element, {onDone, reducedMotion = false, duration = 4200} = {}) {
  if (element) activeReveals.get(element)?.dispose();
  const original = element?.textContent || '';
  const characters = Array.from(original);
  const document = element?.ownerDocument || globalThis.document;
  let settled = false, timer;
  const controller = {finish:()=>settle(true), dispose:()=>settle(false)};

  function settle(notify) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (element) {
      element.textContent = original;
      element.classList.remove('is-typing');
      element.removeAttribute('aria-busy');
      if (activeReveals.get(element) === controller) activeReveals.delete(element);
    }
    if (notify) onDone?.();
  }

  const requestedDuration = Number(duration);
  const runDuration = Number.isFinite(requestedDuration)
    ? Math.max(0, Math.min(12000, requestedDuration)) : 4200;
  if (!element || reducedMotion || !characters.length || !runDuration || !document?.createElement) {
    settle(true);
    return controller;
  }

  function span(className, text, hidden = true) {
    const node = document.createElement('span');
    node.className = className;
    if (hidden) node.setAttribute('aria-hidden', 'true');
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const reserve = span('cases-strategy-reserve', original);
  const stream = span('cases-strategy-stream');
  const typed = span('cases-strategy-typed', '');
  const caret = span('cases-strategy-caret', '');
  const accessible = span('cases-strategy-accessible', original, false);
  stream.append(typed);
  stream.append(caret);
  element.textContent = '';
  for (const node of [reserve, stream, accessible]) element.append(node);
  element.classList.add('is-typing');
  element.setAttribute('aria-busy', 'true');
  activeReveals.set(element, controller);

  const started = Date.now();
  let revealed = 0;
  function tick() {
    if (settled || activeReveals.get(element) !== controller) return;
    const progress = Math.min(1, Math.max(0, (Date.now() - started) / runDuration));
    const count = Math.max(1, Math.floor(characters.length * progress));
    if (count > revealed) {
      typed.textContent = characters.slice(0, count).join('');
      revealed = count;
    }
    if (progress >= 1) settle(true);
    else timer = setTimeout(tick, 30);
  }
  tick();
  return controller;
}
