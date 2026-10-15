import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Element} from './dom-double.mjs';
import {escape} from '../core.js';
import {render} from '../modules/cases.js';
import {CASES,TOPICS} from '../modules/case-data.js';

let passed=0;
function check(label,run){
 const keys=['document','window','location','history','matchMedia','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
 const originals=Object.fromEntries(keys.map(key=>[key,globalThis[key]])),frames=new Map(),timers=new Map(),store=new Map(),listeners=new Map();let frame=0,timer=0,width=700;
 const previousFocus=Element.prototype.focus;Element.prototype.focus=function(options){this.focusOptions=options;previousFocus.call(this,options)};
 const body=new Element('body'),workspace=new Element('section',{id:'workspace'}),container=new Element('main');body.append(workspace);workspace.append(container);
 globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag)};
 globalThis.window={addEventListener(type,fn){listeners.set(type,fn)},removeEventListener(type){listeners.delete(type)},matchMedia:()=>({matches:false})};
 globalThis.location={hash:'#/cases?q=murder'};globalThis.history={pushState(_a,_b,hash){location.hash=hash}};globalThis.matchMedia=()=>({matches:width<=840});
 globalThis.requestAnimationFrame=fn=>{frames.set(++frame,fn);return frame};globalThis.cancelAnimationFrame=id=>frames.delete(id);globalThis.setTimeout=fn=>{timers.set(++timer,fn);return timer};globalThis.clearTimeout=id=>timers.delete(id);
 const paint=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn())};let cleanup;
 const mount=(query='q=murder',atWidth=700)=>{cleanup?.();container.innerHTML='';width=atWidth;location.hash='#/cases?'+query;cleanup=render(container,{escape,params:new URLSearchParams(query),route:['cases'],setHeader(){},storage:{get:(key,fallback)=>store.get(key)??fallback,set(key,value){store.set(key,value);return true}},navigate(){},toast(){},download(){},startChat(){}});return container};
 try{run({mount,container,workspace,paint,frames,resize(atWidth){width=atWidth;listeners.get('resize')?.({type:'resize'})}});passed++;console.log('PASS '+label)}finally{cleanup?.();Element.prototype.focus=previousFocus;for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}

console.log('Case reader focus · queued frame callbacks and static CSS checks, no browser geometry\n');

check('Brief and Decision retain keyboard focus after queued rendering at phone, tablet and desktop widths',({mount,paint})=>{
 for(const width of [390,700,840,1100]){
  const c=mount('q=murder',width);c.querySelector('[data-action="open"]').click();paint();const initial=c.querySelector('#cases-tab-brief');initial.focus();
  initial.emit('keydown',{key:'ArrowRight'});assert.equal(c.querySelector('#cases-tab-decision').attrs['aria-selected'],'true');assert.notStrictEqual(document.activeElement,c.querySelector('.cases-panel-heading h2'));paint();assert.strictEqual(document.activeElement,c.querySelector('#cases-tab-decision'));assert.equal(document.activeElement.isConnected,true);
  document.activeElement.emit('keydown',{key:'ArrowLeft'});paint();assert.strictEqual(document.activeElement,c.querySelector('#cases-tab-brief'));assert.equal(c.querySelector('#cases-tab-brief').attrs['aria-selected'],'true');
  document.activeElement.emit('keydown',{key:'End'});paint();assert.strictEqual(document.activeElement,c.querySelector('#cases-tab-decision'));document.activeElement.emit('keydown',{key:'Home'});paint();assert.strictEqual(document.activeElement,c.querySelector('#cases-tab-brief'));
  assert.equal(c.querySelector('.cases-list-column').inert,width<=840);assert.equal(c.querySelector('.cases-detail-panel').attrs['aria-modal'],String(width<=840));
 }
});

check('Closing before a queued tab paint cancels stale focus and restores the result-list target',({mount,paint,frames})=>{
 const c=mount('q=murder');c.querySelector('[data-action="open"]').click();paint();c.querySelector('#cases-tab-decision').click();assert.equal(frames.size,1);c.querySelector('[data-action="close-panel"]').click();const expected=c.querySelector('.cases-card-title');assert.strictEqual(document.activeElement,expected);assert.equal(c.querySelector('.cases-list-column').inert,false);assert.equal(c.querySelector('.cases-detail-panel').hidden,true);paint();assert.strictEqual(document.activeElement,expected);assert.equal(document.activeElement.isConnected,true);
});

check('Topic chips move focus to the persistent filter, which retains focus even when a subsequent filter has no results',({mount})=>{
 const c=mount('q=murder',1100),year=c.querySelector('[data-field="year"]');year.value=CASES[0].year;year.emit('change');const cardsBefore=c.querySelectorAll('[data-case-card]');assert.ok(cardsBefore.length>0);
 const topic=c.querySelector('[data-action="topic"]'),selected=topic.dataset.topic;topic.focus();topic.click();const filter=c.querySelector('[data-field="topic"]');assert.strictEqual(document.activeElement,filter);assert.equal(filter.value,selected);assert.equal(topic.isConnected,false);assert.equal(filter.isConnected,true);
 const thisYear=CASES.filter(item=>item.year===CASES[0].year);const absentTopic=TOPICS.find(tag=>!thisYear.some(item=>item.tags.includes(tag)));assert.ok(absentTopic);filter.value=absentTopic;filter.emit('change');assert.equal(c.querySelectorAll('[data-case-card]').length,0);assert.ok(c.querySelector('.cases-empty'));assert.strictEqual(document.activeElement,filter);assert.equal(filter.isConnected,true);
 filter.value='';filter.emit('change');assert.ok(c.querySelectorAll('[data-case-card]').length>0);assert.strictEqual(document.activeElement,filter);
});

check('Source find retains the input node and keyboard focus; its CSS anchors the control within the scrolling reader',({mount,paint,workspace,resize})=>{
 const c=mount(`q=murder&case=${CASES[0].id}&view=decision`,700);paint();const input=c.querySelector('[data-field="source-search"]');input.focus();input.value='προμελέτη';input.emit('input');assert.strictEqual(document.activeElement,input);assert.strictEqual(c.querySelector('[data-field="source-search"]'),input);assert.ok(c.querySelectorAll('.cases-source-paragraphs mark').length>0);assert.match(c.querySelector('[data-source-matches]').textContent,/match/);
 workspace.inert=true;resize(390);assert.equal(workspace.inert,true);assert.equal(c.querySelector('.cases-list-column').inert,true);workspace.inert=false;
 const css=readFileSync(new URL('../modules/cases.css',import.meta.url),'utf8'),rule=css.match(/\.cases-source-search\{([^}]+)\}/)?.[1]||'';assert.match(rule,/position:sticky/);assert.match(rule,/(?:^|;)top:0(?:;|$)/);assert.match(rule,/z-index:2/);assert.match(rule,/background:#f9fbfc/);
});

check('Reset filters focuses the persistent topic selector and retains the result reading position',({mount})=>{
 const c=mount('q=murder',1100),topic=c.querySelector('[data-field="topic"]');topic.value=CASES[0].tags[0];topic.emit('change');
 const scroller=c.querySelector('.cases-results-scroll');scroller.scrollTop=236;
 const reset=c.querySelector('[data-action="reset-filters"]');assert.equal(reset.hidden,false);reset.focus();reset.click();
 assert.equal(reset.hidden,true);assert.strictEqual(document.activeElement,topic);assert.equal(topic.isConnected,true);assert.equal(topic.value,'');assert.deepEqual(topic.focusOptions,{preventScroll:true});
 assert.equal(c.querySelectorAll('[data-case-card]').length,10);assert.equal(scroller.scrollTop,236);
});

check('Clearing a case selection focuses the first rebuilt checkbox without moving result scroll',({mount})=>{
 const c=mount('q=murder',1100);for(const item of CASES.slice(0,2)){const input=c.querySelector(`[data-action="select"][data-id="${item.id}"]`);input.checked=true;input.emit('change')}
 const scroller=c.querySelector('.cases-results-scroll');scroller.scrollTop=281;
 const clear=c.querySelector('[data-action="clear-selection"]');clear.focus();clear.click();
 const first=c.querySelector('[data-action="select"]');assert.strictEqual(document.activeElement,first);assert.equal(first.isConnected,true);assert.deepEqual(first.focusOptions,{preventScroll:true});
 assert.equal(c.querySelector('.cases-selection-tray').hidden,true);assert.ok(c.querySelectorAll('[data-action="select"]').every(input=>!input.checked));assert.equal(scroller.scrollTop,281);
});

check('Clearing a selection with no matching cases focuses Search instead of the hidden tray',({mount})=>{
 const c=mount('q=murder',1100),selected=c.querySelector('[data-action="select"]');selected.checked=true;selected.emit('change');
 c.querySelector('[data-action="filters"]').click();const year=c.querySelector('[data-field="year"]');year.value=CASES[0].year;year.emit('change');
 const inYear=CASES.filter(item=>item.year===CASES[0].year),absentTopic=TOPICS.find(tag=>!inYear.some(item=>item.tags.includes(tag)));assert.ok(absentTopic);
 const topic=c.querySelector('[data-field="topic"]');topic.value=absentTopic;topic.emit('change');assert.equal(c.querySelectorAll('[data-case-card]').length,0);
 const scroller=c.querySelector('.cases-results-scroll'),scroll=scroller.scrollTop,clear=c.querySelector('[data-action="clear-selection"]');clear.focus();clear.click();
 const search=c.querySelector('[data-field="query"]');assert.strictEqual(document.activeElement,search);assert.equal(search.isConnected,true);assert.deepEqual(search.focusOptions,{preventScroll:true});
 assert.equal(c.querySelector('.cases-selection-tray').hidden,true);assert.equal(c.querySelector('[data-selected-count]').textContent,'0');assert.equal(scroller.scrollTop,scroll);
 assert.equal(topic.value,absentTopic);assert.equal(year.value,CASES[0].year);assert.equal(search.value,'murder');
});

console.log(`\n${passed} case-focus groups passed. Sticky positioning, native focus traversal and nested modal appearance still need browser verification.`);
