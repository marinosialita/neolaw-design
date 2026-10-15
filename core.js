export const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
const shapes = {
 'chevron-left':'<path d="m15 5-7 7 7 7"/>',
 square:'<rect x="6" y="6" width="12" height="12" rx="1"/>',
 search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', x:'<path d="m6 6 12 12M18 6 6 18"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>', 'arrow-right':'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 send:'<path d="M12 20V4m-6 6 6-6 6 6"/>', chevron:'<path d="m9 5 7 7-7 7"/>', 'chevron-down':'<path d="m6 9 6 6 6-6"/>',
 chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-9.5A8.5 8.5 0 0 1 11.5 3h1a8.5 8.5 0 0 1 8.5 8.5Z"/>',
 folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
 book:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15"/>',
 library:'<path d="M4 4v16M9 4v16M14 4v16m3-15 4 15M2 20h20"/>',
 scale:'<path d="M12 3v18M6 21h12M4 7h16M5 7l-3 7h6L5 7Zm14 0-3 7h6l-3-7Z"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
 file:'<path d="M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8l-6-6Zm0 0v6h6M8 13h8M8 17h6"/>',
 edit:'<path d="m15 5 4 4M4 20l4-1L21 6a2.8 2.8 0 0 0-4-4L4 15v5ZM13 20h8"/>',
 compare:'<path d="M10 4H4v16h6M14 4h6v16h-6M8 9h8m-3-3 3 3-3 3M16 16H8m3-3-3 3 3 3"/>',
 language:'<path d="M3 5h12M9 2v3m4 0c-1 6-5 9-10 11m2-8c1 3 4 5 7 7m2 6 4-11 4 11m-7-3h6"/>',
 check:'<path d="m5 12 4 4L20 5"/>', checklist:'<path d="m3 6 2 2 3-4m3 2h10M3 13l2 2 3-4m3 2h10M3 20l2 2 3-4m3 2h10"/>',
 sparkles:'<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Zm7-1v4m-2-2h4"/>',
 workflow:'<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/><path d="M9 6h6a3 3 0 0 1 3 3v6M6 9v9h9"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 pin:'<path d="m8 3 8 0-1 6 4 4H5l4-4-1-6Zm4 10v8"/>',
 bookmark:'<path d="M5 3h14v18l-7-4-7 4V3Z"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 attach:'<path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2m-5 11 7-7"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
 panel:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 plug:'<path d="M9 3v5m6-5v5M7 8h10v4a5 5 0 0 1-10 0V8Zm5 9v4m-7-13h14"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M15 8V3H3v12h5"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>',
 building:'<path d="M5 21V3h14v18M2 21h20M9 7h1m4 0h1M9 11h1m4 0h1m-6 4h1m4 0h1m-4 6v-3h2v3"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
 star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>',
 history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v5l3 2"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18"/>',
 external:'<path d="M14 3h7v7m0-7L10 14m0-11H3v18h18v-7"/>',
 briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12c6 4 12 4 18 0m-9 0v4"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>'
};
const aliases={'message-square':'chat','folder-open':'folder','file-text':'file','file-pen':'edit','file-check':'checklist','file-search':'search','git-compare':'compare','languages':'language','git-branch':'workflow','arrow-up-right':'external','arrow-left':'arrow','chevron-right':'chevron','layout-grid':'grid','circle-check':'check','calendar':'clock','sliders-horizontal':'settings','zap':'sparkles','gavel':'scale','file-diff':'compare','upload-cloud':'upload','clipboard-list':'checklist','book-open':'book','shield-check':'shield','folder-plus':'folder','more-horizontal':'more','pen-line':'edit','square-pen':'edit','plus-circle':'plus'};
Object.assign(aliases,{'message-circle':'chat',columns:'compare',filter:'settings',paperclip:'attach','arrow-up':'send','align-left':'list',scan:'search','list-checks':'checklist',pencil:'edit','trash-2':'trash',files:'copy',table:'grid',text:'list',play:'arrow',monitor:'panel',eye:'search'});
shapes['arrow-left']='<path d="M19 12H5m5-5-5 5 5 5"/>';delete aliases['arrow-left'];
export function icon(name, size=20){return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[aliases[name]||name]||shapes.file}</svg>`;}
export const storage={get(key,fallback){try{return JSON.parse(localStorage.getItem('neolaw.design.'+key))??fallback}catch{return fallback}},set(key,value){try{localStorage.setItem('neolaw.design.'+key,JSON.stringify(value));return true}catch{toast('Local storage is full. This change could not be saved.');return false}}};
let toastTimer;
export function toast(message){let el=document.getElementById('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
export function download(name,text,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type}));let a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function modal({title,body,onMount}){const before=document.activeElement;let el=document.createElement('dialog');el.className='modal';const titleId='dialog-'+Date.now().toString(36);el.setAttribute('aria-labelledby',titleId);el.innerHTML=`<div class="modal-head"><h2 id="${titleId}">${escape(title)}</h2><button class="icon-btn" data-close aria-label="Close dialog">${icon('x')}</button></div><div class="modal-body">${body}</div>`;document.body.append(el);let closed=false;const close=()=>{if(closed)return;closed=true;el.close();el.remove();(before?.isConnected?before:document.getElementById('main'))?.focus({preventScroll:true})};el.querySelector('[data-close]').onclick=close;el.addEventListener('cancel',e=>{e.preventDefault();close()});el.addEventListener('click',e=>{if(e.target===el)close()});el.showModal();onMount?.(el,close);return close;}
