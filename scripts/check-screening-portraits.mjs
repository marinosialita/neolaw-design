import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {candidatePortrait,candidateProfileLinks,publicProfileURL,renderCandidatePortrait,mountCandidatePortrait,loadCandidatePortrait,commonsPhotoInfo,wikidataPhotoFile,wikipediaReference,chooseWikipediaReference,wikipediaPhotoFile} from '../modules/screening-portrait.js';
import {providerSource,providerDatasetLabels} from '../modules/screening-provider.js';
const {parseHTML}=createRequire(import.meta.url)(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
const {document}=parseHTML('<html><body><main></main></body></html>');
const candidate={name:'Fixture Candidate',schema:'Person',url:'https://www.opensanctions.org/entities/provider-fixture/',wikidataIds:['Q7747'],wikipediaUrls:['https://en.wikipedia.org/wiki/Fixture'],sourceUrls:['https://publisher.example/candidate']};
const source=providerSource(candidate,{status:'completed'});
const entity={entities:{Q7747:{id:'Q7747',claims:{P18:[{rank:'normal',mainsnak:{snaktype:'value',datatype:'commonsMedia',datavalue:{value:'Fixture image.jpg'}}}]}}}};
const commons={query:{pages:{1:{ns:6,title:'File:Fixture image.jpg',imageinfo:[{thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Fixture.jpg/240px-Fixture.jpg',mime:'image/jpeg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Fixture_image.jpg',extmetadata:{Artist:{value:'<a href="https://example.org">Fixture photographer</a>'},LicenseShortName:{value:'CC BY 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'}}}]}}}};
const response=data=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(data)});
let checks=0;const pass=label=>{checks++;console.log('PASS '+label);};

assert.equal(source.portrait.wikidataId,'Q7747');
assert.equal(candidatePortrait({...candidate,wikidataIds:[]}).wikidataId,null);
assert.equal(candidatePortrait({...candidate,wikidataIds:['Q1','Q2']}).wikidataId,null);
assert.equal(candidatePortrait({...candidate,schema:'Company'}).wikidataId,null);
assert.equal(candidatePortrait({name:'Vladimir Putin',schema:'Person',id:'Q7747',url:'https://www.opensanctions.org/entities/Q7747/'}).wikidataId,null);
pass('Only one explicit person Wikidata property permits photo loading; names, entity IDs and URLs do not infer it');

for(const bad of ['javascript:alert(1)','data:image/png;base64,a','https://a@evil.example/x','https://127.0.0.1/x','https://localhost/x','https://example.org:8443/x','https://example.org\n/x','https://[::1]/x'])assert.equal(publicProfileURL(bad),'');
const refs=candidateProfileLinks({...candidate,sourceUrls:['https://publisher.example/candidate','javascript:bad'],wikipediaUrls:['https://wikipedia.org.evil.example/person','https://en.wikipedia.org/wiki/Fixture']});
assert.equal(refs.length,4);assert.ok(refs.some(link=>link.kind==='wikidata'));
pass('Reference links reject unsafe schemes, credentialed/private destinations and spoofed Wikipedia domains');

const main=document.querySelector('main');let calls=[];
const cleanup=mountCandidatePortrait(main,source,{fetcher:async(url,options)=>{calls.push({url,options});return response(url.includes('wikidata.org')?entity:commons);}});
assert.equal(calls.length,0);assert.equal(main.querySelector('img'),null);
main.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(calls.length,2);assert.equal(new URL(calls[0].url).searchParams.get('ids'),'Q7747');assert.equal(new URL(calls[1].url).searchParams.get('titles'),'File:Fixture image.jpg');
for(const call of calls){assert.equal(call.options.credentials,'omit');assert.equal(call.options.referrerPolicy,'no-referrer');assert.equal(call.options.redirect,'error');assert.doesNotMatch(call.url,/Fixture\+Candidate/);}
assert.match(main.textContent,/Source candidate photo/);assert.match(main.textContent,/does not confirm/);assert.match(main.textContent,/Fixture photographer/);assert.match(main.textContent,/CC BY 4.0/);
assert.equal(main.querySelector('img').getAttribute('referrerpolicy'),'no-referrer');
cleanup();pass('Nothing loads before click; two exact-record public requests have no credentials/referrer and show attribution');

assert.throws(()=>wikidataPhotoFile({entities:{Q2:entity.entities.Q7747}},'Q7747'),/No photo record/);
assert.throws(()=>wikidataPhotoFile({entities:{Q7747:{id:'Q7747',claims:{}}}},'Q7747'),/No source photo/);
const obsolete=structuredClone(entity);obsolete.entities.Q7747.claims.P18[0].rank='deprecated';assert.throws(()=>wikidataPhotoFile(obsolete,'Q7747'),/No source photo/);
pass('Wrong entity, absent P18 and deprecated photo statements do not produce a portrait');

for(const patch of [{thumburl:'https://evil.example/photo.jpg'},{descriptionurl:'javascript:alert(1)'},{mime:'image/svg+xml'},{extmetadata:{Artist:{value:'Author'}}}]){
  const value=structuredClone(commons);Object.assign(value.query.pages[1].imageinfo[0],patch);assert.throws(()=>commonsPhotoInfo(value,'Q7747','Fixture image.jpg'));
}
const thumbnailHost=structuredClone(commons);thumbnailHost.query.pages[1].imageinfo[0].thumburl=thumbnailHost.query.pages[1].imageinfo[0].thumburl.replace('upload.wikimedia.org','thumb.wikimedia.org');assert.match(commonsPhotoInfo(thumbnailHost,'Q7747','Fixture image.jpg').url,/thumb.wikimedia.org/);
pass('Only supported Wikimedia-hosted raster thumbnails with source page and artist/licence can display');

const malicious=structuredClone(commons);malicious.query.pages[1].imageinfo[0].extmetadata.Artist.value='<img src=x onerror=alert(1)>A &lt;script&gt;';
const photo=commonsPhotoInfo(malicious,'Q7747','Fixture image.jpg');assert.equal(photo.artist,'A <script>');
const escapeCleanup=mountCandidatePortrait(main,{...source,title:'<script>bad</script>'},{fetcher:async url=>response(url.includes('wikidata.org')?entity:malicious)});
main.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(main.querySelector('script'),null);assert.equal(main.querySelectorAll('img').length,1);
main.querySelector('img').onerror();assert.match(main.textContent,/could not be displayed/);assert.equal(main.querySelector('button').hidden,false);escapeCleanup();
pass('Metadata is rendered as text, and failed image loading restores source-link fallback');

let resolveRequest;
const cancelCleanup=mountCandidatePortrait(main,source,{fetcher:()=>new Promise(resolve=>{resolveRequest=resolve;})});
main.querySelector('button').click();cancelCleanup();resolveRequest(response(entity));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(main.querySelector('img'),null);
pass('Closing the panel aborts its controller and never injects a late photo');

let invalidCalls=0;await assert.rejects(loadCandidatePortrait('Q1&ids=Q2',{fetcher:async()=>{invalidCalls++;}}));assert.equal(invalidCalls,0);
assert.match(providerDatasetLabels({datasets:['interpol_red_notices','adb_sanctions','ext_icij_offshoreleaks','unknown']}).join(' '),/Public Red Notices.*Public debarment.*Connected subset.*unknown/);
assert.match(source.details.find(item=>item.title==='Dataset meaning').text,/not a separate successful search/);
pass('Invalid identifiers never request data; provider dataset descriptions preserve partial scope and provenance');

const article={query:{pages:{1:{ns:0,title:'Fixture',pageprops:{wikibase_item:'Q7747'},pageimage:'Fixture image.jpg'}}}};
const alternateCalls=[];
const alternate=await loadCandidatePortrait('Q7747',{wikipediaUrl:'https://en.wikipedia.org/wiki/Fixture',fetcher:async(url,options)=>{alternateCalls.push({url,options});const host=new URL(url).hostname;return response(host==='www.wikidata.org'?{error:{code:'maxlag'}}:host==='en.wikipedia.org'?article:commons);}});
assert.equal(alternateCalls.length,3);assert.deepEqual(alternateCalls.map(call=>new URL(call.url).hostname),['www.wikidata.org','en.wikipedia.org','commons.wikimedia.org']);
const wikiParams=new URL(alternateCalls[1].url).searchParams;assert.equal(wikiParams.get('titles'),'Fixture');assert.equal(wikiParams.get('prop'),'pageimages|pageprops');assert.equal(wikiParams.get('pilicense'),'free');assert.equal(wikiParams.has('srsearch'),false);
assert.equal(alternate.method,'wikipedia_pageimage');assert.equal(alternate.recordUrl,'https://en.wikipedia.org/wiki/Fixture');
pass('Explicit Wikidata maxlag permits one exact provider biography lookup, Q-ID comparison and Commons attribution');

for(const change of [{pageprops:{wikibase_item:'Q2'}},{pageprops:{wikibase_item:'Q7747',disambiguation:''}},{ns:4},{missing:''},{pageimage:undefined}]){
  const invalid=structuredClone(article);Object.assign(invalid.query.pages[1],change);assert.throws(()=>wikipediaPhotoFile(invalid,'Q7747'));
}
const multiple=structuredClone(article);multiple.query.pages[2]=structuredClone(multiple.query.pages[1]);assert.throws(()=>wikipediaPhotoFile(multiple,'Q7747'));
pass('Wikipedia fallback rejects mismatched identifiers, disambiguation, non-articles, missing images and multiple results');

for(const value of ['https://en.wikipedia.org.evil.example/wiki/Fixture','https://en.wikipedia.org/w/index.php?title=Fixture','https://en.wikipedia.org/wiki/Special:Search','https://en.wikipedia.org/wiki/Fixture%7COther','https://en.wikipedia.org/wiki/Fixture?search=anything'])assert.equal(wikipediaReference(value),null);
assert.equal(chooseWikipediaReference(['https://en.wikipedia.org/wiki/First','https://en.wikipedia.org/wiki/Second']),null);
assert.equal(chooseWikipediaReference(['https://fr.wikipedia.org/wiki/First','https://de.wikipedia.org/wiki/Second']),null);
assert.equal(chooseWikipediaReference(['https://en.wikipedia.org/wiki/Fixture','https://fr.wikipedia.org/wiki/Fixture']).host,'en.wikipedia.org');
pass('Only an unambiguous provider-linked biography on a validated Wikipedia host can be the alternate source');

for(const failure of [{ok:false,status:403,headers:{get:()=>null}},response({error:{code:'permissiondenied'}}),response({entities:{Q7747:{id:'Q7747',claims:{}}}})]){
  let deniedCalls=0;await assert.rejects(loadCandidatePortrait('Q7747',{wikipediaUrl:'https://en.wikipedia.org/wiki/Fixture',fetcher:async()=>{deniedCalls++;return failure;}}));assert.equal(deniedCalls,1);
}
let noBiographyCalls=0;await assert.rejects(loadCandidatePortrait('Q7747',{fetcher:async()=>{noBiographyCalls++;return response({error:{code:'maxlag'}});}}));assert.equal(noBiographyCalls,1);
pass('Permission failures, missing P18 and absent biography references do not trigger another request');
const alternateCleanup=mountCandidatePortrait(main,source,{fetcher:async url=>response(new URL(url).hostname==='www.wikidata.org'?{error:{code:'maxlag'}}:new URL(url).hostname==='en.wikipedia.org'?article:commons)});
main.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(main.querySelectorAll('img').length,1);assert.match(main.textContent,/Provider-linked Wikipedia biography/);assert.match(main.textContent,/does not confirm/);alternateCleanup();
pass('Mounted candidate panel passes only its linked biography and identifies the alternate record in photo credit');
let loadedPhotos=[];
const notifyCleanup=mountCandidatePortrait(main,source,{fetcher:async url=>response(url.includes('wikidata.org')?entity:commons),onPhotoLoaded:photo=>loadedPhotos.push(photo)});
main.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(loadedPhotos.length,0);
const loadedImage=main.querySelector('img');loadedImage.onload();loadedImage.onload();assert.equal(loadedPhotos.length,1);assert.equal(loadedPhotos[0].wikidataUrl,'https://www.wikidata.org/wiki/Q7747');notifyCleanup();
const lateCleanup=mountCandidatePortrait(main,source,{fetcher:async url=>response(url.includes('wikidata.org')?entity:commons),onPhotoLoaded:photo=>loadedPhotos.push(photo)});
main.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,0));const lateImage=main.querySelector('img');lateCleanup();lateImage.onload();assert.equal(loadedPhotos.length,1);
pass('Only successfully displayed photos notify the overview once; closing the panel blocks late selection');
console.log(`${checks} portrait and source-provenance checks passed`);
