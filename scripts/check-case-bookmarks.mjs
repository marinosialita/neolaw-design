import assert from 'node:assert/strict';
import {Element} from './dom-double.mjs';
import {escape,icon} from '../core.js';
import {render} from '../modules/cases.js';
import {CASES} from '../modules/case-data.js';

// Actual module callbacks with structural DOM only; no browser or persistent user storage.
const store=new Map(),toasts=[],writes=[];let rejected=false,cleanup,root,passed=0;
const body=new Element('body');globalThis.document={body,activeElement:null,createElement:tag=>new Element(tag)};
globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.location={hash:'#/cases'};globalThis.history={pushState(_state,_title,hash){location.hash=hash}};
globalThis.matchMedia=()=>({matches:false});globalThis.requestAnimationFrame=fn=>{fn();return 1};globalThis.cancelAnimationFrame=()=>{};globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
const storage={get(key,fallback){return store.has(key)?structuredClone(store.get(key)):fallback},set(key,value){if(key==='savedCases'&&rejected){toasts.push('Save rejected');return false}writes.push(key);store.set(key,structuredClone(value));return true}};
function mount(query='q=murder'){cleanup?.();root?.remove();root=new Element('main');body.append(root);location.hash='#/cases?'+query;cleanup=render(root,{route:['cases'],params:new URLSearchParams(query),storage,escape,icon,setHeader(){},toast:message=>toasts.push(message),navigate(){},startChat(){},download(){}})}
function check(label,run){cleanup?.();cleanup=null;root?.remove();root=null;store.clear();toasts.length=0;writes.length=0;rejected=false;run();passed++;console.log('PASS '+label)}
const get=selector=>{const node=root.querySelector(selector);assert.ok(node,selector);return node};
const saveButton=id=>get(`.cases-card [data-action="save"][data-id="${id}"]`);
const [first,second]=CASES;
check('Failed bookmark save leaves list and reader unchanged; retry updates both and survives remount',()=>{
 mount();get(`[data-action="open"][data-id="${first.id}"]`).click();const button=saveButton(first.id),reader=get('.cases-detail-panel'),scroll=get('.cases-results-scroll');button.focus();scroll.scrollTop=215;rejected=true;button.click();
 assert.equal(store.get('savedCases'),undefined);assert.equal(button.attrs['aria-pressed'],'false');assert.equal(reader.querySelector('[data-action="save"]').attrs['aria-pressed'],'false');assert.equal(get('[data-saved-count]').textContent,'0');assert.strictEqual(document.activeElement,button);assert.equal(scroll.scrollTop,215);assert.equal(toasts.at(-1),'Save rejected');
 rejected=false;button.click();assert.deepEqual(store.get('savedCases'),[first.id]);assert.equal(button.attrs['aria-pressed'],'true');assert.equal(reader.querySelector('[data-action="save"]').attrs['aria-pressed'],'true');assert.equal(get('[data-saved-count]').textContent,'1');assert.equal(toasts.at(-1),'Case saved');mount();assert.equal(saveButton(first.id).attrs['aria-pressed'],'true');
});
check('Failed removal in Saved retains its card and focus; retry removes it once and focuses the collection tab',()=>{
 store.set('savedCases',[first.id]);mount();get('[data-action="tab"][data-tab="saved"]').click();const button=saveButton(first.id);button.focus();rejected=true;button.click();
 assert.deepEqual(store.get('savedCases'),[first.id]);assert.equal(root.querySelectorAll('[data-case-card]').length,1);assert.strictEqual(document.activeElement,button);assert.equal(button.attrs['aria-pressed'],'true');assert.equal(toasts.at(-1),'Save rejected');
 rejected=false;button.click();assert.deepEqual(store.get('savedCases'),[]);assert.equal(root.querySelectorAll('[data-case-card]').length,0);assert.equal(get('[data-saved-count]').textContent,'0');assert.strictEqual(document.activeElement,get('#cases-tab-saved'));assert.equal(toasts.at(-1),'Removed from saved cases');
});
check('Comparison bookmarks follow the same atomic save and retry behavior',()=>{
 mount(`q=murder&compare=${first.id},${second.id}`);const button=get(`[data-action="save"][data-id="${second.id}"]`);rejected=true;button.click();assert.equal(button.attrs['aria-pressed'],'false');assert.equal(store.get('savedCases'),undefined);assert.equal(toasts.at(-1),'Save rejected');rejected=false;button.click();assert.equal(button.attrs['aria-pressed'],'true');assert.deepEqual(store.get('savedCases'),[second.id]);
 rejected=true;button.click();assert.equal(button.attrs['aria-pressed'],'true');assert.deepEqual(store.get('savedCases'),[second.id]);rejected=false;button.click();assert.equal(button.attrs['aria-pressed'],'false');assert.deepEqual(store.get('savedCases'),[]);
});
check('Malformed bookmarks cannot blank search; legacy IDs and duplicates are normalized without needless rewrites',()=>{
 store.set('savedCases',{old:'demo-01'});mount();assert.equal(root.querySelectorAll('[data-case-card]').length,10);assert.deepEqual(store.get('savedCases'),[]);
 store.set('savedCases',['demo-01',first.id,first.id,second.id]);mount();assert.deepEqual(store.get('savedCases'),[first.id,second.id]);assert.equal(get('[data-saved-count]').textContent,'2');const saves=writes.filter(key=>key==='savedCases').length;mount();assert.equal(writes.filter(key=>key==='savedCases').length,saves);
});
cleanup?.();console.log(`\n${passed} bookmark callback checks passed. Native storage, layout and browser focus remain unverified.`);
