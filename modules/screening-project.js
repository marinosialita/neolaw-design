import {escape as e,icon} from '../core.js';

// Project membership belongs to the saved report: one record, no copied evidence.
export function mountScreeningProject(host,{ctx,getReport,onAssign}) {
  let disposed=false,closeDialog=null,markup='';
  const projects=()=>{const rows=ctx.storage.get('projects',[]);return Array.isArray(rows)?rows.filter(p=>p?.id&&p?.name):[];};
  function refresh() {
    if(disposed)return;
    const report=getReport(),id=report?.query.projectId,project=projects().find(p=>p.id===id);
    const location=id?`${icon('folder',14)}<span>${report.unsaved?'Project change not saved':project?'Saved in':'Project unavailable'}</span>${project?`<a href="#/projects/${e(encodeURIComponent(id))}" data-nav="/projects/${e(encodeURIComponent(id))}">${e(project.name)}</a>`:`<strong>${e(report.projectName||'Previous project')}</strong>`}`:'';
    const html=`<div class="sc-project-location">${location}<button type="button" data-sc-save-project>${id?'Change project':`${icon('folder',14)}Save to project`}</button></div>`;
    if(html===markup)return;markup=html;host.innerHTML=html;
    host.querySelector('[data-sc-save-project]').onclick=open;
  }
  function open() {
    const originalId=getReport()?.id;if(!originalId)return;
    const current=getReport().query.projectId||'',options=projects();let selected=current,busy=false;
    closeDialog?.();
    closeDialog=ctx.modal({title:current?'Change project':'Save to project',body:`<form class="sc-project-picker"><p>Keep this screening, its evidence and review notes together in a project.</p>${options.length?`<label class="sc-entry-search">${icon('search',16)}<input type="search" aria-label="Find a project" placeholder="Find a project…" autocomplete="off"></label><div class="sc-project-options" role="radiogroup" aria-label="Choose a project">${options.map(p=>`<label class="sc-project-option" data-project-option><input type="radio" name="screeningProject" value="${e(p.id)}" ${p.id===current?'checked':''}>${icon('folder',18)}<span><strong>${e(p.name)}</strong>${p.description?`<small>${e(p.description)}</small>`:''}</span></label>`).join('')}</div><p data-project-empty hidden>No projects match your search.</p>`:'<div class="sc-project-empty">Create a project in Projects, then return to save this screening.</div>'}<p class="sc-project-error" data-project-error role="alert" hidden></p><small class="sc-project-local">Saved on this device, alongside your screening history.</small><div class="sc-project-picker-actions">${current?'<button type="button" class="sc-quiet-button" data-project-unlink>Remove project link</button>':''}<button type="button" class="btn" data-project-cancel>Cancel</button><button type="submit" class="btn primary" ${options.some(p=>p.id===selected)?'':'disabled'}>Save to project</button></div></form>`,onMount(dialog,close){
      const form=dialog.querySelector('form'),submit=form.querySelector('[type="submit"]'),error=form.querySelector('[data-project-error]');
      form.querySelector('[data-project-cancel]').onclick=close;
      const search=form.querySelector('[type="search"]');
      if(search)search.oninput=()=>{const terms=search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);let visible=0;form.querySelectorAll('[data-project-option]').forEach(row=>{row.hidden=!terms.every(term=>row.textContent.toLocaleLowerCase().includes(term));if(!row.hidden)visible++;});form.querySelector('[data-project-empty]').hidden=visible>0;};
      form.querySelectorAll('[name="screeningProject"]').forEach(input=>input.onchange=()=>{selected=input.value;submit.disabled=busy;});
      async function assign(id) {
        if(busy||disposed||getReport()?.id!==originalId)return;
        error.hidden=true;
        const project=id?projects().find(p=>p.id===id):null;
        if(id&&!project){error.textContent='This project is no longer available. Close this window and choose another project.';error.hidden=false;return;}
        busy=true;form.querySelectorAll('button,input').forEach(el=>el.disabled=true);submit.textContent='Saving…';
        try {
          const ok=await onAssign(project);
          if(disposed)return;
          if(!ok)throw Error('The project link was not saved. Retry here, or download a backup before leaving.');
          close();refresh();ctx.toast(project?`Saved to ${project.name}.`:'Project link removed. The screening remains in History.');
        } catch(reason) {if(!disposed&&dialog.isConnected){error.textContent=reason.message||'The project link could not be saved.';error.hidden=false;}}
        finally {busy=false;if(!disposed&&dialog.isConnected){form.querySelectorAll('button,input').forEach(el=>el.disabled=false);submit.disabled=!projects().some(p=>p.id===selected);submit.textContent='Save to project';}}
      }
      form.onsubmit=event=>{event.preventDefault();void assign(selected);};
      form.querySelector('[data-project-unlink]')?.addEventListener('click',()=>void assign(''));
    }});
  }
  refresh();return {refresh,destroy(){disposed=true;closeDialog?.();}};
}
