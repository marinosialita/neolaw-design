import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {render} from '../modules/cases.js';
import {CASES} from '../modules/case-data.js';
import {getCaseStrategy} from '../modules/case-strategy.js';
import {escape} from '../core.js';

// Source-backed selection and actual module callbacks. This DOM double does not verify
// browser geometry, native keyboard delivery or the visual appearance of the strategy.
const originals=Object.fromEntries(['document','window','location','history','matchMedia','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'].map(key=>[key,globalThis[key]]));
let passed=0;
const clone=value=>JSON.parse(JSON.stringify(value));
const references=strategy=>strategy.points.flatMap(point=>point.references);

function assertSources(strategy,items){
  assert.ok(strategy.title&&strategy.description,'Strategy has a readable heading and description');
  assert.ok(strategy.points.length>0,'Strategy has at least one supported focus point');
  for(const point of strategy.points){
    assert.ok(point.title&&point.description&&point.references.length,'Every focus point is backed by a source');
    for(const reference of point.references){
      const item=items.find(item=>item.id===reference.id);
      assert.ok(item,`Strategy reference ${reference.id} belongs to the visible results`);
      assert.ok(item.paragraphs.some(paragraph=>paragraph.n===Number(reference.block)),`Source block ${reference.block} exists in ${item.id}`);
      assert.ok(reference.label,'Source link has a readable label');
    }
  }
}

function check(label,run){
  const body=new Element('body'),store=new Map(),routes=[],frames=new Map(),timers=new Map();let sequence=0,root,cleanup;
  globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag)};
  globalThis.window={addEventListener(){},removeEventListener(){}};
  globalThis.location={hash:''};globalThis.history={pushState(_data,_title,hash){location.hash=hash;}};
  globalThis.matchMedia=()=>({matches:false});
  globalThis.requestAnimationFrame=callback=>{frames.set(++sequence,callback);return sequence;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  globalThis.setTimeout=callback=>{timers.set(++sequence,callback);return sequence;};globalThis.clearTimeout=id=>timers.delete(id);
  const storage={get:(key,fallback)=>store.has(key)?clone(store.get(key)):fallback,set:(key,value)=>{store.set(key,clone(value));return true;}};
  const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback());};
  const finishSearch=()=>{for(const[id,callback]of[...timers])if(timers.has(id)){timers.delete(id);callback();}root.querySelector('[data-action="finish-strategy"]')?.click();flush();};
  const get=selector=>{const node=root.querySelector(selector);assert.ok(node,`Missing ${selector}`);return node;};
  const mount=path=>{cleanup?.();root?.remove();root=new Element('main');body.append(root);location.hash='#'+path;cleanup=render(root,{escape,params:new URLSearchParams(path.split('?')[1]||''),route:['cases'],storage,setHeader(){},navigate:path=>routes.push(path),toast(){}});flush();};
  const filter=(field,value)=>{const node=get(`[data-field="${field}"]`);node.value=value;node.emit('change');flush();};
  const search=query=>{const input=get('[data-field="query"]');input.value=query;input.emit('input');get('[data-search-form]').emit('submit');finishSearch();};
  try{run({mount,get,filter,search,flush,finishSearch,storage,routes,root:()=>root});passed++;console.log('PASS '+label);}finally{cleanup?.();}
}

console.log('Case search strategy · source selection and interaction callbacks\n');
try{
  check('Murder and premeditation queries in English and Greek receive supported strategy points',()=>{
    for(const query of ['murder','MURDER cases','homicide','premeditation','φόνος εκ προμελέτης','ΦΟΝΟΣ ΕΚ ΠΡΟΜΕΛΕΤΗΣ','απουσία προμελέτης','ανθρωποκτονία'])assertSources(getCaseStrategy(query,CASES),CASES);
    const absence=getCaseStrategy('απουσία προμελέτης',CASES);
    assert.notEqual(absence.description,getCaseStrategy('murder',CASES).description,'Absence of premeditation gets a relevant research description');
    assert.ok(absence.description.includes('αθώωση'),'Absence of premeditation is distinguished from acquittal');
  });
  check('No strategy is invented for blank, unrelated or zero-result searches',()=>{
    for(const query of ['', '   ', 'case law', 'νομολογία', 'employment dismissal', 'contract damages'])assert.equal(getCaseStrategy(query,CASES),null,query);
    assert.equal(getCaseStrategy('murder',[]),null);
    assert.equal(getCaseStrategy('φόνος εκ προμελέτης',[]),null);
  });
  check('Filtered strategy references only the supplied cases and real source blocks',()=>{
    for(const ids of [['case-01'],['case-05'],['case-01','case-02'],['case-05','case-06']]){
      const items=CASES.filter(item=>ids.includes(item.id));
      assertSources(getCaseStrategy('murder',items),items);
    }
    const strategy=getCaseStrategy('murder',CASES);
    assert.equal(strategy.points.length,3,'Full collection has the three requested research focus points');
    assert.ok(references(strategy).some(reference=>reference.id==='case-01'),'Premeditation distinction cites Onisillou');
    assert.ok(references(strategy).some(reference=>reference.id==='case-05'),'Circumstantial evidence cites Gavriil');
  });
  check('Strategy appears before the case cards with a compact collapsed disclosure',({mount,get,root})=>{
    mount('/cases');assert.equal(root().querySelector('.cases-strategy'),null);
    mount('/cases?q=murder');
    const strategy=get('.cases-strategy'),toggle=get('[data-action="strategy-toggle"]'),details=get('#cases-strategy-details');
    assert.equal(toggle.attrs['aria-expanded'],'false');assert.equal(toggle.attrs['aria-controls'],'cases-strategy-details');assert.equal(details.hidden,true);
    assert.ok(strategy.textContent.includes(getCaseStrategy('murder',CASES).description));
    const html=root().innerHTML;
    assert.ok(html.indexOf('class="cases-strategy')<html.indexOf('data-case-card="'),'Strategy precedes result cards');
    toggle.click();assert.equal(get('[data-action="strategy-toggle"]').attrs['aria-expanded'],'true');assert.equal(get('#cases-strategy-details').hidden,false);
    get('[data-action="strategy-toggle"]').click();assert.equal(get('#cases-strategy-details').hidden,true);
  });
  check('Sort and filter updates preserve expansion while refreshing available references',({mount,get,filter,root})=>{
    mount('/cases?q=murder');get('[data-action="strategy-toggle"]').click();
    filter('sort','oldest');assert.equal(get('#cases-strategy-details').hidden,false);
    filter('year','1991');assert.equal(root().querySelectorAll('[data-case-card]').length,1);assert.equal(get('#cases-strategy-details').hidden,false);
    const citations=get('.cases-strategy').querySelectorAll('[data-action="reference"]');assert.ok(citations.length);
    for(const citation of citations){assert.equal(citation.dataset.id,'case-01');assert.ok(CASES[0].paragraphs.some(p=>p.n===Number(citation.dataset.paragraph)));}
    filter('year','');assert.equal(root().querySelectorAll('[data-case-card]').length,10);assert.equal(get('#cases-strategy-details').hidden,false);
    assert.ok(get('.cases-strategy').querySelectorAll('[data-action="reference"]').some(link=>link.dataset.id==='case-05'));
  });
  check('Expanded strategy survives same-query remount and resets for a newly submitted query',({mount,get,search,storage})=>{
    mount('/cases?q=murder');get('[data-action="strategy-toggle"]').click();
    assert.equal(storage.get('caseWorkspace').strategyExpanded,true);mount('/cases?q=murder');assert.equal(get('#cases-strategy-details').hidden,false);
    search('φόνος εκ προμελέτης');assert.equal(get('#cases-strategy-details').hidden,true);assert.equal(storage.get('caseWorkspace').strategyExpanded,false);
    get('[data-action="strategy-toggle"]').click();mount('/cases?q=homicide');assert.equal(get('#cases-strategy-details').hidden,true);
  });
  check('Strategy citations open their exact source beside the results without losing list position',({mount,get,flush})=>{
    mount('/cases?q=murder');get('[data-action="strategy-toggle"]').click();
    const citation=get('.cases-strategy [data-action="reference"]'),id=citation.dataset.id,block=citation.dataset.paragraph;
    get('.cases-results-scroll').scrollTop=216;citation.click();flush();
    assert.equal(get('.cases-detail-panel').hidden,false);assert.equal(get('.cases-results-scroll').scrollTop,216);
    const params=new URLSearchParams(location.hash.split('?')[1]);assert.equal(params.get('case'),id);assert.equal(params.get('view'),'decision');assert.equal(params.get('paragraph'),block);
    assert.ok(get(`#cases-paragraph-${block}`).classList.contains('is-focused'));assert.equal(document.activeElement,get(`#cases-paragraph-${block}`));
    get('[data-action="close-panel"]').click();flush();assert.equal(get('.cases-results-scroll').scrollTop,216);assert.equal(get('#cases-strategy-details').hidden,false);assert.equal(document.activeElement,citation,'Closing the reader restores focus to the exact strategy citation');
  });
  check('Saved and unrelated result states remove stale murder strategy',({mount,get,root,search})=>{
    mount('/cases?q=murder');get('[data-action="strategy-toggle"]').click();
    get('[data-action="tab"][data-tab="saved"]').click();assert.equal(root().querySelector('.cases-strategy'),null);assert.ok(get('.cases-empty'));
    get('[data-action="tab"][data-tab="all"]').click();assert.ok(get('.cases-strategy'));
    search('unfair dismissal');assert.equal(root().querySelector('.cases-strategy'),null);
    mount('/cases?q=case%20law');assert.equal(root().querySelector('.cases-strategy'),null);
  });
  console.log(`\n${passed} case-strategy groups pass. Browser appearance and geometry remain unverified.`);
}finally{for(const[key,value]of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
