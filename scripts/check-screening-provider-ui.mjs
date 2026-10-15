import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountProviderConnection,providerEvidence,providerSource,providerCategories,providerExplanationText} from '../modules/screening-provider.js';
import {sourceReadingHTML} from '../modules/screening-reading.js';
const {parseHTML}=createRequire(import.meta.url)(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
const {document,window}=parseHTML('<html><body><main></main></body></html>');
const main=document.querySelector('main'),calls=[];let dialog;
const ctx={providerRequest:async(path,options)=>{calls.push({path,options});return {configured:path.endsWith('connect')&&!path.endsWith('disconnect'),verified:false};},modal:({body,onMount})=>{dialog=document.createElement('dialog');dialog.innerHTML=body;document.body.append(dialog);const close=()=>dialog.remove();onMount(dialog,close);return close;}};
const cleanup=mountProviderConnection(main,ctx);await Promise.resolve();await Promise.resolve();
main.querySelector('button').click();let input=dialog.querySelector('input');
input.value='sk-fixture-key-from-wrong-service';dialog.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
assert.equal(calls.filter(c=>c.path.endsWith('/connect')).length,0);assert.match(dialog.textContent,/looks like an OpenAI key/);assert.equal(input.value,'');
input.value='fixture-opensanctions-key-0000';dialog.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await Promise.resolve();await Promise.resolve();
assert.equal(calls.filter(c=>c.path.endsWith('/connect')).length,1);assert.equal(document.querySelector('input'),null);assert.doesNotMatch(main.textContent,/fixture-opensanctions/);
const candidate={name:'Name <script>bad()</script>',url:'https://www.opensanctions.org/entities/Q1/',score:.8,possibleMatch:true,topics:['role.pol','role.pep','sanction','export.control'],datasets:['fixture']};
assert.deepEqual(providerCategories(candidate),['Politician','Politically exposed person','Sanctions','Export controlled']);
main.innerHTML=providerEvidence({opensanctions:{status:'completed',candidates:[candidate],possibleMatches:1}});assert.equal(main.querySelector('script'),null);assert.match(main.textContent,/\+1 categories/);
const source=providerSource(candidate,{status:'completed'});assert.equal(source.official,false);assert.equal(source.provider,true);assert.match(source.passages[0].text,/not confirmed identity or a risk rating/);
cleanup();console.log('PASS provider form blocks wrong-service keys, clears fields, and distinguishes provider candidates from official records');

assert.match(providerExplanationText({explanations:[{feature:"dob_year_disjoint",score:1,detail:"Birth years: 1980 vs 1965"}]}),/Birth-year difference\nBirth years: 1980 vs 1965/);

const detailed={...candidate,profile:{status:'completed',fieldCount:2,sourceCount:20,statementCount:31,fields:[
  {key:'birthDate',label:'Date of birth',values:['1952-10-07'],sourceCount:20,statementCount:20,sources:[{dataset:'eu_fsf',title:'EU Financial Sanctions Files (FSF)',publisher:'European Commission',official:true,url:'https://www.opensanctions.org/datasets/eu_fsf/',statementCount:1,values:['1952-10-07'],lastSeen:'2026-10-13T00:00:00Z'}]},
  {key:'notes',label:'Descriptions',values:['Provider description <not HTML>'],sourceCount:1,statementCount:1,sources:[{dataset:'gb_fcdos',url:'https://www.opensanctions.org/datasets/gb_fcdos/',statementCount:1,values:['Provider description <not HTML>']}]}
]}};
main.innerHTML=sourceReadingHTML(providerSource(detailed,{status:'completed'}));
assert.match(main.textContent,/Provider profile · 2 fields/);assert.match(main.textContent,/20 sources/);assert.match(main.textContent,/1952-10-07/);
assert.match(main.textContent,/EU Financial Sanctions Files/);assert.match(main.textContent,/official publisher/);
assert.equal(main.querySelectorAll('.sc-provider-fact').length,2);assert.equal(main.querySelector('script'),null);
assert.equal(main.querySelector('.sc-provider-source-list a').getAttribute('href'),'https://www.opensanctions.org/datasets/eu_fsf/');
console.log('PASS provider profile shows full facts with field-level source counts and safe dataset links');
