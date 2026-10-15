import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {overviewPortraitSource,mountOverviewPortrait,selectOverviewPortrait,reportPortrait,portraitDataURL} from '../modules/screening-profile-portrait.js';
import {providerRecordId} from '../modules/screening-review.js';
const {parseHTML}=createRequire(import.meta.url)('/tmp/neolaw-export-check/node_modules/linkedom');
const candidate={id:'candidate-a',name:'Example Person',schema:'Person',countries:['Cyprus'],birthDates:['1980-01-01'],wikidataIds:['Q42'],url:'https://www.opensanctions.org/entities/example/'};
const report={query:{name:'Example Person',type:'person',country:'Cyprus'},research:{opensanctions:{status:'completed',candidates:[candidate]}},decisions:{}};
let passed=0;const check=async(label,run)=>{await run();passed++;console.log('PASS '+label);};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
await check('Only the unambiguous exact-name candidate is illustrated; identity decision stays unchanged',()=>{
 const original=JSON.stringify(report);assert.equal(overviewPortraitSource(report).title,'Example Person');assert.equal(JSON.stringify(report),original);
 assert.equal(overviewPortraitSource({...report,query:{...report.query,name:'Example Pers'}}),null);
});
await check('A sole above-threshold provider candidate auto-loads despite spelling variation; this never confirms identity',()=>{
 const variant={...report,query:{name:'Example Pers',type:'person'},research:{opensanctions:{status:'completed',candidates:[{...candidate,possibleMatch:true,score:.84}]}}};
 const original=JSON.stringify(variant);assert.equal(overviewPortraitSource(variant).title,'Example Person');assert.equal(JSON.stringify(variant),original);
 for(const c of [{...candidate,possibleMatch:false,score:.5},{...candidate,score:.84}])assert.equal(overviewPortraitSource({...variant,research:{opensanctions:{status:'completed',candidates:[c]}}}),null);
 const ambiguous={...variant,research:{opensanctions:{status:'completed',candidates:[{...candidate,possibleMatch:true},{...candidate,id:'candidate-b',name:'Example Persson',possibleMatch:true,wikidataIds:[]}]}}};
 assert.equal(overviewPortraitSource(ambiguous),null);
 for(const query of [{country:'Germany'},{dob:'1990-01-01'},{type:'entity'}])assert.equal(overviewPortraitSource({...variant,query:{...variant.query,...query}}),null);
 assert.equal(overviewPortraitSource({...variant,decisions:{[providerRecordId(candidate)]:{status:'dismissed'}}}),null);
});
await check('Conflicting DOB, passport or country and rejected identities never choose a header portrait',()=>{
 for(const query of [{country:'Germany'},{dob:'1990-01-01'}])assert.equal(overviewPortraitSource({...report,query:{...report.query,...query}}),null);
 const c={...candidate,passportNumbers:['AB123']};assert.equal(overviewPortraitSource({...report,query:{...report.query,passportNumber:'XY999'},research:{opensanctions:{status:'completed',candidates:[c]}}}),null);
 assert.equal(overviewPortraitSource({...report,decisions:{[providerRecordId(candidate)]:{status:'dismissed'}}}),null);
});
await check('Multiple fitting candidates, failed or limited searches, companies and missing references retain initials',()=>{
 for(const provider of [{status:'failed',candidates:[candidate]},{status:'completed',atLimit:true,candidates:[candidate]},{status:'completed',candidates:[candidate,{...candidate,id:'candidate-b',wikidataIds:[]}]},{status:'completed',candidates:[{...candidate,wikidataIds:[]}]}])assert.equal(overviewPortraitSource({...report,research:{opensanctions:provider}}),null);
 assert.equal(overviewPortraitSource({...report,query:{...report.query,type:'entity'}}),null);
});
await check('Header shows the linked photo and credit; failed pixels restore initials',async()=>{
 const {document}=parseHTML('<div aria-label="Initials only">EP</div>'),el=document.querySelector('div');
 const stop=mountOverviewPortrait(el,report,{resolvePhoto:async()=>({url:'https://upload.wikimedia.org/wikipedia/commons/example.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Example.jpg',artist:'Example photographer',license:'CC BY 4.0'})});await flush();
 assert.ok(el.querySelector('img'));assert.match(el.querySelector('a').getAttribute('aria-label'),/Example photographer.*CC BY 4.0.*Identity not verified/);assert.equal(el.querySelector('img').getAttribute('referrerpolicy'),'no-referrer');el.querySelector('img').onerror();assert.equal(el.textContent,'EP');stop();
});
await check('Changing reports prevents a late image from replacing the next subject',async()=>{
 const {document}=parseHTML('<div>EP</div>'),el=document.querySelector('div');let finish;
 const stop=mountOverviewPortrait(el,report,{resolvePhoto:()=>new Promise(resolve=>finish=resolve)});await flush();stop();el.textContent='ZZ';finish({url:'unused'});await flush();assert.equal(el.textContent,'ZZ');
});
await check('PDF attachment preserves the chosen source credit without changing saved evidence',async()=>{
 const original=JSON.stringify(report),photo={url:'https://upload.wikimedia.org/wikipedia/commons/example.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Example.jpg',artist:'Example artist',license:'CC BY 4.0'};
 const exported=await reportPortrait(report,{resolvePhoto:async source=>{assert.equal(source.title,'Example Person');return photo;},encode:async url=>{assert.equal(url,photo.url);return 'data:image/jpeg;base64,example';}});
 assert.equal(exported.candidateId,providerRecordId(candidate));assert.equal(exported.wikidataId,'Q42');assert.equal(exported.sourceUrl,photo.sourceUrl);assert.equal(exported.artist,photo.artist);assert.equal(JSON.stringify(report),original);
});
await check('Photo failure preserves report export; ambiguous identities do not request a photo',async()=>{
 assert.equal((await reportPortrait(report,{resolvePhoto:async()=>{throw Error('Unavailable');}})).status,'unavailable');
 assert.equal((await reportPortrait(report,{resolvePhoto:async()=>({url:'example'}),encode:async()=>{throw Error('Pixels unavailable');}})).status,'unavailable');
 const ambiguous={...report,research:{opensanctions:{status:'completed',candidates:[candidate,{...candidate,id:'candidate-b'}]}}};
 assert.equal(await reportPortrait(ambiguous,{resolvePhoto:()=>{throw Error('Must not be reached');}}),null);
});
await check('PDF image encoding rejects non-Wikimedia, credentials and non-image paths before any request',async()=>{
 for(const url of ['http://upload.wikimedia.org/wikipedia/commons/image.jpg','https://127.0.0.1/private','https://upload.wikimedia.org@evil.example/wikipedia/commons/image.jpg','https://upload.wikimedia.org/private'])await assert.rejects(portraitDataURL(url));
});
await check('Loading a named candidate photo supports spelling variants, reuses its pixels and survives history serialization',async()=>{
 const variant={...report,query:{...report.query,name:'Example Pers'}},original=JSON.stringify(variant);
 const photo={url:'https://upload.wikimedia.org/wikipedia/commons/example.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Example.jpg',wikidataUrl:'https://www.wikidata.org/wiki/Q42',artist:'Example photographer',license:'CC BY 4.0'};
 assert.equal(overviewPortraitSource(variant),null);
 const selected=selectOverviewPortrait(variant,providerRecordId(candidate),photo);
 assert.equal(JSON.stringify(variant),original);assert.deepEqual(selected.decisions,variant.decisions);assert.deepEqual(selected.query,variant.query);
 assert.equal(selected.overviewPortraitCandidateId,providerRecordId(candidate));assert.equal(JSON.stringify(selected).includes('example.jpg'),false);
 const restored=JSON.parse(JSON.stringify(selected));assert.equal(overviewPortraitSource(restored).title,'Example Person');
 const {document}=parseHTML('<div>EP</div>'),el=document.querySelector('div');const stop=mountOverviewPortrait(el,restored);await flush();
 assert.equal(el.querySelector('img').getAttribute('src'),photo.url);assert.match(el.textContent,/Candidate photo/);assert.match(el.getAttribute('aria-label'),/identity not verified/);stop();
 const attachment=await reportPortrait(restored,{encode:async url=>{assert.equal(url,photo.url);return 'data:image/jpeg;base64,fixture';}});assert.equal(attachment.candidateId,providerRecordId(candidate));
});
await check('Explicit photo choice resolves only illustration ambiguity and cannot override conflicting or dismissed identities',()=>{
 const photo={wikidataUrl:'https://www.wikidata.org/wiki/Q42'},id=providerRecordId(candidate);
 const ambiguous={...report,research:{opensanctions:{status:'completed',candidates:[candidate,{...candidate,id:'candidate-b'}]}}};
 assert.equal(overviewPortraitSource(ambiguous),null);assert.equal(overviewPortraitSource({...ambiguous,overviewPortraitCandidateId:id}).match.record.id,id);
 for(const changed of [
  {...report,query:{...report.query,dob:'1990-01-01'}},
  {...report,decisions:{[id]:{status:'dismissed'}}},
  {...report,research:{opensanctions:{status:'failed',candidates:[candidate]}}},
  {...report,research:{opensanctions:{status:'completed',atLimit:true,candidates:[candidate]}}},
  {...report,research:{opensanctions:{status:'completed',candidates:[candidate,candidate]}}}
 ])assert.equal(selectOverviewPortrait(changed,id,photo),null);
 assert.equal(selectOverviewPortrait(report,'opensanctions:absent',photo),null);assert.equal(selectOverviewPortrait(report,undefined,photo),null);
 assert.equal(selectOverviewPortrait(report,id,{wikidataUrl:'https://www.wikidata.org/wiki/Q2'}),null);
 assert.equal(overviewPortraitSource({...report,overviewPortraitCandidateId:'opensanctions:absent'}),null);
});
console.log(`${passed} overview-photo checks passed. Synthetic fixtures; no network.`);
