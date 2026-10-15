import {render as renderLibrary} from './library.js';

// The same library controls and actions, hosted above the current conversation.
export function openLibraryDialog(ctx, {tab = 'tools'} = {}) {
  const before = document.activeElement;
  const dialog = document.createElement('dialog');
  const headingId = `library-explorer-${Date.now().toString(36)}`;
  const selection = {id: null};
  const originalOverflow = document.body.style.overflow;
  let closed = false;
  let cleanupLibrary = null;
  let activeDetail = null;

  dialog.className = 'library-explorer';
  dialog.setAttribute('aria-labelledby', headingId);
  dialog.innerHTML = `<header class="library-explorer-head"><div><span class="library-explorer-heading-icon">${ctx.icon('library', 20)}</span><h2 id="${headingId}">Library</h2></div><button class="icon-btn" data-close-library aria-label="Close library">${ctx.icon('x', 20)}</button></header><div class="library-explorer-body"><div class="library-explorer-catalog"></div><aside class="library-explorer-preview" aria-label="Library item details"></aside></div>`;
  const catalog = dialog.querySelector('.library-explorer-catalog');
  const preview = dialog.querySelector('.library-explorer-preview');

  function showEmptyPreview() {
    dialog.classList.remove('has-detail');
    preview.innerHTML = `<div class="library-explorer-empty"><span>${ctx.icon('book', 30)}</span><h3>Make it your own.</h3><p>Choose an item to see its details and prepare your next task.</p></div>`;
  }

  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener('hashchange', close);
    dialog.removeEventListener('cancel', onCancel);
    dialog.removeEventListener('click', onBackdrop);
    dialog.removeEventListener('close', close);
    cleanupLibrary?.();
    activeDetail = null;
    dialog.close();
    dialog.remove();
    document.body.style.overflow = originalOverflow;
    (before?.isConnected ? before : document.getElementById('main'))?.focus({preventScroll: true});
  }

  function onCancel(event) {
    event.preventDefault();
    close();
  }

  function onBackdrop(event) {
    if (event.target === dialog) close();
  }

  function inlineDetail({title, body, onMount}) {
    const previousFocus = document.activeElement;
    const selectedId = selection.id;
    const detail = document.createElement('section');
    const detailId = `${headingId}-detail`;
    detail.className = 'library-explorer-detail';
    detail.setAttribute('aria-labelledby', detailId);
    detail.innerHTML = `<header class="library-explorer-detail-head"><h3 id="${detailId}" tabindex="-1">${ctx.escape(title)}</h3><button class="icon-btn" data-close aria-label="Back to library items">${ctx.icon('x', 18)}</button></header><div class="library-explorer-detail-body">${body}</div>`;
    preview.innerHTML = '';
    preview.append(detail);
    activeDetail = detail;
    dialog.classList.add('has-detail');
    let detailClosed = false;
    const closeDetail = () => {
      if (detailClosed) return;
      detailClosed = true;
      if (activeDetail !== detail) return;
      activeDetail = null;
      selection.id = null;
      catalog.querySelectorAll('.library-card.is-selected').forEach(card => card.classList.remove('is-selected'));
      if (closed) return;
      showEmptyPreview();
      const itemButton = selectedId ? [...catalog.querySelectorAll('[data-library-open]')].find(button => button.dataset.libraryOpen === selectedId) : null;
      (previousFocus?.isConnected ? previousFocus : itemButton || catalog.querySelector('.library-search input'))?.focus({preventScroll: true});
    };
    detail.querySelector('[data-close]').onclick = closeDetail;
    detail.querySelector('h3').focus({preventScroll: true});
    onMount?.(detail, closeDetail);
    return closeDetail;
  }

  const embeddedContext = {
    ...ctx,
    embeddedLibrary: true,
    librarySelection: selection,
    params: new URLSearchParams({tab}),
    setHeader() {},
    modal: inlineDetail,
    startChat(...args) {
      const result = ctx.startChat(...args);
      if (result !== false) close();
      return result;
    },
    navigate(...args) {
      const result = ctx.navigate(...args);
      if (result !== false) close();
      return result;
    }
  };

  document.body.append(dialog);
  document.body.style.overflow = 'hidden';
  dialog.querySelector('[data-close-library]').onclick = close;
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('click', onBackdrop);
  dialog.addEventListener('close', close);
  window.addEventListener('hashchange', close);
  try {
    showEmptyPreview();
    dialog.showModal();
    cleanupLibrary = renderLibrary(catalog, embeddedContext);
    catalog.querySelector('.library-search input')?.focus({preventScroll: true});
  } catch (error) {
    close();
    throw error;
  }
  return close;
}
