import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Element} from './dom-double.mjs';
import {escape,icon,storage} from '../core.js';
import {renderChat} from '../chat.js';
import {render as renderCases} from '../modules/cases.js';
import {mountCasePanel} from '../modules/chat-case-panel.js';
import {CASES} from '../modules/case-data.js';

// No browser connection; inspect options supplied to scroll/animation callbacks.
Element.prototype.hasAttribute=function(key){return Object.hasOwn(this.attrs,key)};
Element.prototype.getAttribute=function(key){return this.attrs[key]??null};
Element.prototype.scrollIntoView=function(options){this.lastScroll=options};
Element.prototype.animate=function(){this.animationCalls=(this.animationCalls||0)+1};
let reduced=true,viewport=1200,checks=0;const data=new Map();
const body=new Element('body'),header=new Element('header');body.append(header);
globalThis.document={body,activeElement:null,getElementById:id=>body.querySelector('#'+id),createElement:tag=>new Element(tag)};
globalThis.localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
globalThis.matchMedia=query=>({matches:query.includes('prefers-reduced-motion')?reduced:viewport<=Number(query.match(/max-width:\s*(\d+)px/)?.[1]||0)});
globalThis.window={matchMedia,addEventListener(){},removeEventListener(){}};
globalThis.location={hash:'#/cases'};globalThis.history={pushState(_state,_title,hash){location.hash=hash}};
globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.cancelAnimationFrame=()=>{};globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
const setHeader=(_title,html='')=>{header.innerHTML=html};
function check(label,run){run();checks++;console.log('PASS '+label)}
check('Clause navigation honors reduced motion without dropping focus or the normal highlight',()=>{
 for(const reduce of [true,false]){
  reduced=reduce;storage.set('chats',[{id:'motion-chat',title:'Motion fixture',tool:'review',messages:[],files:[]}]);
  const container=new Element('main');body.append(container);const cleanup=renderChat(container,{route:['chat','motion-chat'],params:new URLSearchParams(),setHeader,refreshSidebar(){}});
  container.querySelector('[data-sample]').click();container.querySelector('[data-clause="liability"]').click();
  const clause=container.querySelector('#clause-liability');assert.equal(clause.lastScroll.behavior,reduce?'auto':'smooth');assert.equal(clause.animationCalls||0,reduce?0:1);assert.strictEqual(document.activeElement,clause);
  cleanup();container.remove();
 }
});
check('Chat citation reading uses instant source navigation when reduced motion is requested',()=>{
 for(const reduce of [true,false]){
  reduced=reduce;const panel=new Element('aside');body.append(panel);const item=CASES[0],block=item.sectionRefs.holding[0];
  const cleanup=mountCasePanel(panel,item,{view:'decision',block});assert.equal(panel.querySelector('#chat-source-'+block).lastScroll.behavior,reduce?'auto':'smooth');cleanup();panel.remove();
 }
});
check('Case source references and find-in-decision honor reduced motion',()=>{
 for(const reduce of [true,false]){
  reduced=reduce;const item=CASES[0],block=item.sectionRefs.holding[0],container=new Element('main');body.append(container);
  const cleanup=renderCases(container,{route:['cases'],params:new URLSearchParams(`q=προμελέτη&case=${item.id}&view=decision&paragraph=${block}`),setHeader,storage,escape,icon,toast(){},navigate(){},startChat(){}});
  assert.equal(container.querySelector('#cases-paragraph-'+block).lastScroll.behavior,reduce?'auto':'smooth');
  const search=container.querySelector('[data-field="source-search"]');search.value='προμελέτη';search.emit('input');assert.equal(container.querySelector('.cases-source-paragraphs mark').lastScroll.behavior,reduce?'auto':'smooth');
  cleanup();container.remove();
 }
});
check('Case reader modal state matches the earlier narrow-layout breakpoint',()=>{
 const css=readFileSync(new URL('../modules/cases.css',import.meta.url),'utf8'),chatCSS=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.ok(css.includes('@media(max-width:840px)'));assert.ok(chatCSS.includes('@media(max-width:840px)'));
 for(const width of [801,813,840,841]){
  viewport=width;const container=new Element('main');body.append(container);const cleanup=renderCases(container,{route:['cases'],params:new URLSearchParams('q=murder&case=case-01'),setHeader,storage,escape,icon,toast(){},navigate(){},startChat(){}});
  assert.equal(container.querySelector('.cases-list-column').inert,width<=840);assert.equal(container.querySelector('.cases-detail-panel').attrs['aria-modal'],String(width<=840));cleanup();container.remove();
 }
});
console.log(`\n${checks} motion/responsive callback checks passed. CSS geometry and animations have not been browser-verified.`);
