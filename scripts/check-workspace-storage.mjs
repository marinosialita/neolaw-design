import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Element} from './dom-double.mjs';
import {renderChat} from '../chat.js';
import {createScreeningHistory} from '../modules/screening-history.js';
import {hasLegacyScreeningHistory,prepareWorkspaceStorage} from '../modules/workspace-storage.js';

const require=createRequire(import.meta.url);
const {IDBFactory}=require(process.env.NEOLAW_TEST_INDEXEDDB||'/tmp/neolaw-storage-check/node_modules/fake-indexeddb');
const globals=['document','window','location','localStorage','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame'];
const originals=Object.fromEntries(globals.map(key=>[key,globalThis[key]]));
const legacyKey='neolaw.design.screening-reports',chatKey='neolaw.design.chats';
const raw=JSON.stringify([{id:'legacy-evidence',query:{name:'Synthetic fixture'},matches:[],sourceSnapshots:[],notes:'Original evidence. '.repeat(10000)}]);
const entry={id:'quota-chat',title:'WHAT IS MURDER',prompt:'WHAT IS MURDER',messages:[{role:'user',text:'WHAT IS MURDER'}],files:[]};
const records=new Map([[legacyKey,raw],[chatKey,JSON.stringify([entry])],['neolaw.design.projects','[{"id":"preserved-project"}]']]);
const limit=[...records.values()].reduce((sum,value)=>sum+value.length,0)+1000;
const store={getItem:key=>records.get(key)??null,removeItem:key=>records.delete(key),setItem(key,value){const size=[...records.entries()].reduce((sum,[name,text])=>sum+(name===key?0:text.length),value.length);if(size>limit)throw new DOMException('Synthetic quota exhausted','QuotaExceededError');records.set(key,value)}};
const body=new Element('body'),header=new Element('header'),toast=new Element('div',{id:'toast'});body.append(header);body.append(toast);
const tasks=new Map();let timer=0,cleanup;
const flush=()=>{const current=[...tasks.values()];tasks.clear();current.forEach(run=>run())};
const saved=()=>JSON.parse(store.getItem(chatKey))[0];
const mount=()=>{const container=new Element('main');body.append(container);cleanup=renderChat(container,{route:['chat','quota-chat'],params:new URLSearchParams(),setHeader(_title,html=''){header.innerHTML=html},refreshSidebar(){}});return container};
try{
 globalThis.document={body,activeElement:null,getElementById:id=>body.querySelector('#'+id),createElement:tag=>new Element(tag)};
 globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.location={hash:'#/chat/quota-chat'};globalThis.localStorage=store;
 globalThis.setTimeout=run=>{tasks.set(++timer,run);return timer};globalThis.clearTimeout=id=>tasks.delete(id);
 globalThis.requestAnimationFrame=run=>{run();return 1};globalThis.cancelAnimationFrame=()=>{};
 const screen=mount();flush();
 assert.ok(screen.querySelector('#retry-reply'),'Quota failure must retain a retryable message.');
 assert.equal(saved().messages.length,1);assert.equal(saved().pendingReply.text,'WHAT IS MURDER');
 assert.equal(hasLegacyScreeningHistory(store),true);
 const factory=new IDBFactory(),createRepository=()=>createScreeningHistory({indexedDB:factory,channelFactory:()=>null});
 const result=await prepareWorkspaceStorage({store,createRepository});
 assert.equal(result.releasedCharacters,raw.length);assert.equal(hasLegacyScreeningHistory(store),false);
 assert.equal(store.getItem('neolaw.design.projects'),'[{"id":"preserved-project"}]');
 screen.querySelector('#retry-reply').click();flush();
 assert.equal(saved().messages.length,2);assert.equal(saved().messages[1].role,'assistant');assert.equal(saved().pendingReply,undefined);
 assert.ok(screen.querySelector('[data-case-source]'),'Recovered answer must retain clickable case references.');
 assert.equal(screen.querySelector('#retry-reply'),null);
 const answer=saved().messages[1];cleanup();screen.remove();const reopened=mount();
 assert.deepEqual(saved().messages[1],answer);assert.ok(reopened.querySelector('[data-case-source]'));assert.equal(reopened.querySelector('#retry-reply'),null);
 const history=createRepository();try{await history.ready();assert.equal(history.list().length,1);assert.equal(await history.readLegacyArchive(result.archiveId),raw)}finally{await history.close()}
 console.log('PASS full quota → verified archive → retry → saved answer → reopen; original evidence and project preserved.');
 let closed=false;await assert.rejects(prepareWorkspaceStorage({store,createRepository:()=>({archiveLegacyStorage:async()=>{throw Error('Archive unavailable')},close:async()=>{closed=true}})}),/Archive unavailable/);assert.equal(closed,true);
 console.log('PASS recovery errors propagate and close the repository instead of claiming successful storage.');
}finally{cleanup?.();for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
