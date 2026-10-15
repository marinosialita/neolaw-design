import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createScreeningHistory, parseScreeningReportBackup} from '../modules/screening-history.js';
const require = createRequire(import.meta.url);
const {IDBFactory, IDBObjectStore} = require(process.env.NEOLAW_TEST_INDEXEDDB || '/tmp/neolaw-storage-check/node_modules/fake-indexeddb');
const report = (id, extra={}) => ({id, query:{name:'Synthetic ' + id,type:'person'},createdAt:'2026-10-13T12:00:00Z',matches:[],sourceSnapshots:[],decisions:{},notes:'', ...extra});
const backup = value => JSON.stringify({...value,schema:'neolaw.screening-report.v1'});
const repositories=[];
const legacy = values => ({value:structuredClone(values),get(){return structuredClone(this.value);},set(){throw Error('Legacy history must never be overwritten.');}});
const make = (options={}) => {const repo=createScreeningHistory({indexedDB:new IDBFactory(),legacyStorage:legacy([]),channelFactory:()=>null,...options});repositories.push(repo);return repo;};
const rawRead = (factory,store,id) => new Promise((resolve,reject)=>{const request=factory.open('neolaw.screening-history',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction([store],'readonly'),get=id?tx.objectStore(store).get(id):tx.objectStore(store).getAll();let value;get.onsuccess=()=>value=get.result;tx.oncomplete=()=>{db.close();resolve(value);};tx.onabort=()=>{db.close();reject(tx.error);};};});
const legacyKey = 'neolaw.design.screening-reports';
const browserStorage = raw => {
  const values = new Map([['neolaw.design.chats','Keep all chats'],['another-app','Keep unrelated data']]);
  if (raw !== null) values.set(legacyKey,raw);
  return {values, getItem:key=>values.get(key)??null, removeItem:key=>values.delete(key)};
};
let passed=0,failed=0;
async function check(name, fn){try{await fn();console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name+'\n'+error.stack);failed++;}}
console.log('Report storage · isolated fake IndexedDB transactions; no real browser data, API calls, or accuracy claims.');

await check('Migration preserves every valid report and the untouched complete legacy archive',async()=>{
  const values=[report('a'),report('b',{notes:'Evidence note',passportNumber:'not a credential'}),{unknownLegacyFormat:true},report('a',{notes:'Duplicate retained in archive'})];
  const source=legacy(values),factory=new IDBFactory(),repo=make({indexedDB:factory,legacyStorage:source});await repo.ready();
  assert.equal(repo.list().length,2);assert.equal(repo.get('b').notes,'Evidence note');assert.equal(repo.get('a').notes,'');assert.deepEqual(source.value,values);
  const archive=await rawRead(factory,'migration',repo.status().migration.archiveId);assert.deepEqual(archive.value,values);assert.equal(repo.status().migration.unrecognisedEntries,2);
});
await check('Migration is idempotent and cannot replace a newer IndexedDB review with its legacy copy',async()=>{
  const factory=new IDBFactory(),source=legacy([report('a',{notes:'Old'})]),first=make({indexedDB:factory,legacyStorage:source});await first.ready();await first.save({...first.get('a'),notes:'Current'});
  const second=make({indexedDB:factory,legacyStorage:source});await second.ready();assert.equal(second.get('a').notes,'Current');assert.equal((await rawRead(factory,'migration')).length,2);
});
await check('New reports left by an old browser tab migrate without losing newer database decisions',async()=>{
  const factory=new IDBFactory(),source=legacy([report('a')]),first=make({indexedDB:factory,legacyStorage:source});await first.ready();await first.save({...first.get('a'),notes:'Updated in database'});
  source.value=[report('b'),report('a',{notes:'Older tab'})];const second=make({indexedDB:factory,legacyStorage:source});await second.ready();assert.equal(second.list().length,2);assert.equal(second.get('a').notes,'Updated in database');assert.equal((await rawRead(factory,'migration')).length,3);
});
await check('Explicit recovery archives exact whitespace, duplicate and unknown entries before releasing only its legacy key',async()=>{
  const values=[report('a',{notes:'Ακριβές κείμενο'}),{unknownLegacyFormat:['preserve',null]},report('a',{notes:'Duplicate retained'})];
  const raw=' \n'+JSON.stringify(values,null,3)+'\n\t',storage=browserStorage(raw),factory=new IDBFactory(),repo=make({indexedDB:factory});
  await repo.ready();assert.equal(storage.getItem(legacyKey),raw);
  const result=await repo.archiveLegacyStorage({storage});assert.equal(result.status,'released');assert.equal(result.releasedCharacters,raw.length);assert.ok(result.archiveId);
  assert.equal(storage.getItem(legacyKey),null);assert.equal(storage.getItem('neolaw.design.chats'),'Keep all chats');assert.equal(storage.getItem('another-app'),'Keep unrelated data');
  assert.equal(repo.list().length,1);assert.equal(repo.get('a').notes,values[0].notes);assert.equal(await repo.readLegacyArchive(result.archiveId),raw);
  const archives=await repo.listLegacyArchives();assert.equal(archives.length,1);assert.deepEqual(Object.keys(archives[0]).sort(),['archivedAt','characters','id','sourceKey']);assert.equal(archives[0].sourceKey,legacyKey);assert.equal(archives[0].characters,raw.length);
  const parsedArchive=await rawRead(factory,'migration',repo.status().migration.archiveId);assert.deepEqual(parsedArchive.value,values);
  await repo.close();const reopened=make({indexedDB:factory});await reopened.ready();assert.equal(await reopened.readLegacyArchive(result.archiveId),raw);assert.deepEqual(await reopened.listLegacyArchives(),archives);assert.equal(reopened.get('a').notes,values[0].notes);
  assert.equal(await reopened.readLegacyArchive('missing'),null);assert.equal(await reopened.readLegacyArchive(reopened.status().migration.archiveId),null);
});
await check('Explicit recovery imports missing reports without replacing newer reviews or adopting their revisions over an open draft',async()=>{
  const factory=new IDBFactory(),first=make({indexedDB:factory});await first.ready();await first.save(report('a',{notes:'Original'}));
  const second=make({indexedDB:factory});await second.ready();const draft=second.get('a');await first.save({...first.get('a'),notes:'Newer saved review'});
  const raw=JSON.stringify([report('a',{notes:'Older legacy copy'}),report('b')]),storage=browserStorage(raw);
  await second.archiveLegacyStorage({storage});assert.equal(second.get('a').notes,'Original');assert.equal(second.get('b').id,'b');
  assert.equal((await rawRead(factory,'reports','a')).report.notes,'Newer saved review');
  await assert.rejects(second.save({...draft,notes:'Stale open draft'}),error=>error.code==='conflict');
});
await check('Explicit recovery retains original history if the database is unavailable or the raw archive transaction aborts',async()=>{
  const raw=JSON.stringify([report('a')]),unavailable=make({indexedDB:null}),firstStorage=browserStorage(raw);
  await assert.rejects(unavailable.archiveLegacyStorage({storage:firstStorage}),error=>error.code==='unavailable');assert.equal(firstStorage.getItem(legacyKey),raw);
  const factory=new IDBFactory(),repo=make({indexedDB:factory}),storage=browserStorage(raw),original=IDBObjectStore.prototype.add;
  try {
    IDBObjectStore.prototype.add=function(value,...args){const request=original.call(this,value,...args);if(value?.kind==='legacy-local-storage')this.transaction.abort();return request;};
    await assert.rejects(repo.archiveLegacyStorage({storage}),error=>error.code==='storage');assert.equal(storage.getItem(legacyKey),raw);assert.equal((await repo.listLegacyArchives()).length,0);
  } finally {IDBObjectStore.prototype.add=original;}
  assert.equal((await repo.archiveLegacyStorage({storage})).status,'released');assert.equal(repo.get('a').id,'a');
});
await check('A committed raw-backup mismatch keeps the complete original localStorage value',async()=>{
  const raw='\n'+JSON.stringify([report('a')])+'\n',storage=browserStorage(raw),repo=make(),original=IDBObjectStore.prototype.add;
  try {
    IDBObjectStore.prototype.add=function(value,...args){return original.call(this,value?.kind==='legacy-local-storage'?{...value,raw:value.raw.trim()}:value,...args);};
    await assert.rejects(repo.archiveLegacyStorage({storage}),error=>error.code==='verification');assert.equal(storage.getItem(legacyKey),raw);
  } finally {IDBObjectStore.prototype.add=original;}
});
await check('A legacy value changed while archiving is retained and the archived original stays downloadable',async()=>{
  const raw=JSON.stringify([report('a')]),changed=JSON.stringify([report('a'),report('new-from-old-tab')]),storage=browserStorage(raw),repo=make();let reads=0;
  const get=storage.getItem;storage.getItem=key=>{if(key===legacyKey&&++reads===2)storage.values.set(legacyKey,changed);return get(key);};
  const result=await repo.archiveLegacyStorage({storage});assert.equal(result.status,'unchanged');assert.equal(result.releasedCharacters,0);assert.equal(storage.getItem(legacyKey),changed);assert.equal(await repo.readLegacyArchive(result.archiveId),raw);
  const next=await repo.archiveLegacyStorage({storage});assert.equal(next.status,'released');assert.equal(repo.get('new-from-old-tab').id,'new-from-old-tab');assert.equal(await repo.readLegacyArchive(next.archiveId),changed);
});
await check('Removal failures and ineffective cleanup preserve the browser copy and expose its verified backup',async()=>{
  for(const fail of [()=>{throw new Error('Denied');},()=>{}]){
    const raw=JSON.stringify([report('a')]),storage=browserStorage(raw),repo=make();storage.removeItem=fail;
    await assert.rejects(repo.archiveLegacyStorage({storage}),error=>error.code==='cleanup');assert.equal(storage.getItem(legacyKey),raw);
    const archives=await repo.listLegacyArchives();assert.equal(archives.length,1);assert.equal(await repo.readLegacyArchive(archives[0].id),raw);
  }
});
await check('Absent or malformed legacy data changes no keys and ordinary ready still retains its source',async()=>{
  const storage=browserStorage(null),repo=make({indexedDB:null});assert.deepEqual(await repo.archiveLegacyStorage({storage}),{status:'absent',releasedCharacters:0});assert.equal(repo.status().ready,false);assert.equal(storage.values.size,2);
  const raw='{invalid raw history',malformed=browserStorage(raw),other=make();await assert.rejects(other.archiveLegacyStorage({storage:malformed}),error=>error.code==='migration');assert.equal(malformed.getItem(legacyKey),raw);
  const values=[report('a')],source=legacy(values),ordinary=make({legacyStorage:source});await ordinary.ready();assert.deepEqual(source.value,values);assert.deepEqual(await ordinary.listLegacyArchives(),[]);
});
await check('Snapshots are isolated and saving commits before Saved is emitted',async()=>{
  const repo=make();await repo.ready();const input=report('a'),events=[];repo.subscribe(event=>events.push(event));const saving=repo.save(input);input.notes='Caller changed later';assert.equal(repo.get('a'),null);await saving;
  assert.equal(repo.get('a').notes,'');assert.equal(events.at(-1).type,'saved');let view=repo.get('a');view.notes='Mutated read';assert.equal(repo.get('a').notes,'');view=repo.list();view.length=0;assert.equal(repo.list().length,1);
});
await check('More than localStorage-sized evidence saves by record and survives reopening',async()=>{
  const factory=new IDBFactory(),repo=make({indexedDB:factory});await repo.ready();const text='Evidence '.repeat(700000);await repo.save(report('large',{notes:text}));await repo.save(report('second',{notes:text}));
  const reopened=make({indexedDB:factory});await reopened.ready();assert.equal(reopened.get('large').notes,text);assert.equal(reopened.get('second').notes,text);
});
await check('Concurrent different-report writes from separate tabs preserve both reports',async()=>{
  const factory=new IDBFactory(),first=make({indexedDB:factory}),second=make({indexedDB:factory});await Promise.all([first.ready(),second.ready()]);await Promise.all([first.save(report('a')),second.save(report('b'))]);await first.refresh();assert.deepEqual(first.list().map(r=>r.id).sort(),['a','b']);
});
await check('Same-tab saves serialize without self-conflict and the final snapshot wins',async()=>{
  const repo=make();await repo.ready();await Promise.all(Array.from({length:10},(_,i)=>repo.save(report('a',{notes:'Revision '+i}))));assert.equal(repo.get('a').notes,'Revision 9');
});
await check('Stale same-report writes in a second tab are rejected rather than overwriting a saved review',async()=>{
  const factory=new IDBFactory(),first=make({indexedDB:factory});await first.ready();await first.save(report('a'));const second=make({indexedDB:factory});await second.ready();await first.save(report('a',{notes:'Reviewer one'}));
  await assert.rejects(second.save(report('a',{notes:'Reviewer two'})),error=>error.code==='conflict');assert.equal(first.get('a').notes,'Reviewer one');assert.equal(second.get('a').notes,'');await second.refresh();assert.equal(second.get('a').notes,'Reviewer one');
});
await check('Refreshing history preserves an open review revision so stale evidence cannot overwrite another tab',async()=>{
  const factory=new IDBFactory(),first=make({indexedDB:factory});await first.ready();await first.save(report('a'));const second=make({indexedDB:factory});await second.ready();await first.save(report('a',{notes:'New saved review'}));await first.save(report('b'));
  await second.refresh({preserveIds:['a']});assert.equal(second.get('a').notes,'');assert.equal(second.get('b').id,'b');await assert.rejects(second.save(report('a',{notes:'Old open review'})),error=>error.code==='conflict');await second.refresh();assert.equal(second.get('a').notes,'New saved review');
});
await check('Quota/transaction errors retain the last committed evidence and do not poison later saves',async()=>{
  const repo=make();await repo.ready();await repo.save(report('a',{notes:'Saved'}));const original=IDBObjectStore.prototype.put;
  try {IDBObjectStore.prototype.put=function(value,...args){if(value?.report?.notes==='Fail')throw new DOMException('Full','QuotaExceededError');return original.call(this,value,...args);};await assert.rejects(repo.save(report('a',{notes:'Fail'})),error=>error.code==='quota');assert.equal(repo.get('a').notes,'Saved');assert.match(repo.status().error.message,/not saved/);} finally {IDBObjectStore.prototype.put=original;}
  await repo.save(report('a',{notes:'Recovered'}));assert.equal(repo.get('a').notes,'Recovered');assert.equal(repo.status().error,null);
});
await check('Abandoned review reads do not adopt another tab’s revision or allow stale drafts to overwrite it',async()=>{
  const factory=new IDBFactory(),first=make({indexedDB:factory});await first.ready();await first.save(report('a',{notes:'Original'}));
  const second=make({indexedDB:factory});await second.ready();const draft=second.get('a');
  await first.save(report('a',{notes:'Saved in another tab'}));
  const entry=await second.readForReview('a');assert.equal(entry.report.notes,'Saved in another tab');
  assert.equal(second.get('a').notes,'Original');
  await assert.rejects(second.save({...draft,notes:'Draft typed while opening'}),error=>error.code==='conflict');
  const accepted=entry.adopt();assert.equal(accepted.notes,'Saved in another tab');
  accepted.notes='Review after reopening';await second.save(accepted);
  await first.refresh();assert.equal(first.get('a').notes,'Review after reopening');
});
await check('A review read cannot adopt over a newer same-repository save, and missing IDs are explicit',async()=>{
  const repo=make();await repo.ready();await repo.save(report('a'));
  const entry=await repo.readForReview('a');entry.report.notes='Caller mutation';
  assert.equal(entry.adopt().notes,'');
  await repo.save(report('a',{notes:'Newer committed evidence'}));
  assert.throws(()=>entry.adopt(),error=>error.code==='conflict');
  assert.equal(repo.get('a').notes,'Newer committed evidence');
  assert.equal(await repo.readForReview('absent'),null);
});
await check('Another tab writing after a review read still conflicts after the old read is adopted',async()=>{
  const factory=new IDBFactory(),first=make({indexedDB:factory});await first.ready();await first.save(report('a'));
  const second=make({indexedDB:factory});await second.ready();const entry=await second.readForReview('a');
  await first.save(report('a',{notes:'Concurrent review'}));
  await assert.rejects(second.save({...entry.adopt(),notes:'Stale review'}),error=>error.code==='conflict');
  assert.equal(first.get('a').notes,'Concurrent review');
});
await check('An aborted transaction after put does not announce a save or change the committed cache',async()=>{
  const repo=make();await repo.ready();await repo.save(report('a',{notes:'Original'}));const events=[];repo.subscribe(e=>events.push(e));const original=IDBObjectStore.prototype.put;
  try{IDBObjectStore.prototype.put=function(value,...args){const request=original.call(this,value,...args);if(value?.report?.notes==='Abort')this.transaction.abort();return request;};await assert.rejects(repo.save(report('a',{notes:'Abort'})),error=>error.code==='storage');assert.equal(repo.get('a').notes,'Original');assert.equal(events.some(e=>e.type==='saved'),false);}finally{IDBObjectStore.prototype.put=original;}
  await repo.refresh();assert.equal(repo.get('a').notes,'Original');
});
await check('A failed migration is atomic, leaves legacy data intact, and succeeds on retry',async()=>{
  const factory=new IDBFactory(),source=legacy([report('a'),report('bad')]),repo=make({indexedDB:factory,legacyStorage:source}),original=IDBObjectStore.prototype.add;
  try {IDBObjectStore.prototype.add=function(value,...args){if(value?.id==='bad')throw new DOMException('Full','QuotaExceededError');return original.call(this,value,...args);};await assert.rejects(repo.ready(),error=>error.code==='quota');assert.deepEqual(source.value,[report('a'),report('bad')]);assert.equal((await rawRead(factory,'reports')).length,0);assert.equal((await rawRead(factory,'migration')).length,0);assert.equal(repo.list().length,2);} finally {IDBObjectStore.prototype.add=original;}
  await repo.ready();assert.equal(repo.list().length,2);assert.equal(repo.status().ready,true);
});
await check('Unavailable database exposes readable old evidence but refuses to claim new writes saved',async()=>{
  const repo=make({indexedDB:null,legacyStorage:legacy([report('old')])});await assert.rejects(repo.ready(),error=>error.code==='unavailable');assert.equal(repo.list().length,1);await assert.rejects(repo.save(report('new')),error=>error.code==='unavailable');assert.equal(repo.get('new'),null);
});
await check('Import accepts genuine evidence JSON and rejects wrong schema, malformed records, and invalid JSON',async()=>{
  const original=report('a',{research:{status:'failed',officialChecks:[]},notes:'Keep evidence as recorded'});assert.deepEqual(parseScreeningReportBackup(backup(original)),{...original,schema:'neolaw.screening-report.v1'});
  for(const input of ['nope',JSON.stringify(original),backup({...original,matches:[{record:null}]}),backup({...original,createdAt:'no date'}),backup({...original,research:[]})])assert.throws(()=>parseScreeningReportBackup(input),error=>error.code==='import');
});
await check('Import preserves complete provider facts and rejects malformed field lineage',async()=>{
  const profile={status:'completed',fieldCount:1,statementCount:2,sourceCount:1,fields:[{key:'country',label:'Country',values:['Russia'],sourceCount:1,statementCount:2,sources:[{dataset:'eu_fsf',title:'EU Financial Sanctions Files',publisher:'European Commission',official:true,url:'https://www.opensanctions.org/datasets/eu_fsf/',statementCount:2,values:['Russia']}]}]};
  const value=report('provider-profile',{research:{opensanctions:{status:'completed',candidates:[{id:'Q1',name:'Candidate',profile}]}}});
  assert.deepEqual(parseScreeningReportBackup(backup(value)).research.opensanctions.candidates[0].profile,profile);
  const bad=structuredClone(value);bad.research.opensanctions.candidates[0].profile.fields[0].sources[0].official='yes';
  assert.throws(()=>parseScreeningReportBackup(backup(bad)),error=>error.code==='import');
});
await check('Import rejects malformed nested source, research, provider, comparison and candidate collections',async()=>{
  const row={record:{id:'source-1',name:'Candidate',aliases:[],countries:[]}},candidate={id:'provider-1',name:'Candidate'};
  const mutations=[
    {query:{type:'person'}},{query:{name:'  '}},{matches:[{record:{id:'x'}}]},
    ...[{officialChecks:'bad'},{officialChecks:[null]},{officialChecks:[{candidates:'bad'}]},{officialChecks:[{candidates:[{record:null}]}]},
      {phases:'bad'},{phases:[null]},{phases:[{sources:'bad'}]},{phases:[{sources:[{url:'https://example.org',title:[]}]}]},{phases:[{citations:[null]}]},{phases:[{identity:{candidate:42}}]},{phases:[{identity:{anchors:'bad'}}]},{phases:[{summary:{sourceUrls:'bad'}}]},{phases:[{affiliations:[{sourceUrls:'bad'}]}]},
      {worldbank:{candidates:'bad'}},{worldbank:{candidates:[{record:'bad'}]}},{gleif:{candidates:[{record:{id:'x',name:'Candidate',countries:'CY'}}]}},
      {opensanctions:{candidates:'bad'}},{opensanctions:{candidates:[null]}},{opensanctions:{candidates:[{id:'x'}]}},{opensanctions:{candidates:[{...candidate,topics:'role.pep'}]}},{opensanctions:{candidates:[{...candidate,explanations:[{}]}]}},{opensanctions:{candidates:[{...candidate,relationships:{records:[{kind:'Director',from:'bad'}]}}]}},
      {retryHistory:'bad'},{retryHistory:[{sourceIds:'cy'}]},{retryHistory:[{previousChecks:[null]}]}
    ].map(research=>({research})),
    {matches:[{...row,record:{...row.record,aliases:'name'}}]},{reviewLog:[null]},{decisions:{'source-1':null}},{comparison:{status:'compared',added:[]}}
  ];
  for(const extra of mutations)assert.throws(()=>parseScreeningReportBackup(backup(report('a',extra))),error=>error.code==='import',JSON.stringify(extra));
});
await check('Import preserves unknown fields and historic optional omissions, defaulting only missing GLEIF countries',async()=>{
  const value=report('legacy',{unknownFutureField:{nested:['retained']},research:{futureProvider:{raw:'preserve'},phases:[{id:'identity',text:'Historic unstructured narrative.'}],gleif:{candidates:[{record:{id:'lei-1',name:'Legacy company',unknownValue:17}}]},opensanctions:{candidates:[{id:'provider-1',name:'Older candidate',unknownEvidence:'kept'}]}}});
  const parsed=parseScreeningReportBackup(backup(value));assert.deepEqual(parsed.unknownFutureField,value.unknownFutureField);assert.deepEqual(parsed.research.futureProvider,value.research.futureProvider);assert.equal(parsed.research.phases[0].text,value.research.phases[0].text);assert.equal(parsed.research.opensanctions.candidates[0].unknownEvidence,'kept');assert.deepEqual(parsed.research.gleif.candidates[0].record.countries,[]);assert.equal(parsed.research.gleif.candidates[0].record.unknownValue,17);assert.equal(value.research.gleif.candidates[0].record.countries,undefined);
});
await check('Import rejects scalar and collection type errors that would break the restored review',async()=>{
  const row={record:{id:'gleif-fixture',sourceId:'gleif',type:'entity',name:'Synthetic company',countries:['Cyprus']}};
  const fixture=report('company',{query:{name:'Synthetic company',type:'entity'},research:{gleif:{status:'completed',candidates:[row]}}});
  const malformed=[
    {query:{...fixture.query,country:['Cyprus']}}, {query:{...fixture.query,dob:2000}},
    {query:{...fixture.query,projectId:{id:'project'}}}, {notes:{text:'Note'}},
    {research:{...fixture.research,query:{name:'Synthetic company',country:[]}}},
    {decisions:{'gleif-fixture':{status:'confirmed',note:{text:'Evidence'}}}},
    {reviewLog:[{status:'investigate',reviewer:42}]},
    {matches:[{record:{...row.record,identifiers:'Company registration: 123'}}]},
    {matches:[{record:{...row.record,programs:'Programme'}}]},
    {matches:[{record:{...row.record,legalSources:'https://example.org/record'}}]},
    {research:{opensanctions:{candidates:[{id:'provider-fixture',name:'Synthetic candidate',positions:'Director'}]}}}
  ];
  for(const extra of malformed) assert.throws(()=>parseScreeningReportBackup(backup({...fixture,...extra})),error=>error.code==='import');
  assert.equal(parseScreeningReportBackup(backup(fixture)).research.gleif.candidates[0].record.name,'Synthetic company');
});
await check('External notifications identify changes without replacing unsaved in-memory drafts',async()=>{
  const peers=[];const channelFactory=()=>{const channel={postMessage(value){for(const peer of peers)if(peer!==channel)peer.onmessage?.({data:value});},close(){}};peers.push(channel);return channel;};
  const factory=new IDBFactory(),first=make({indexedDB:factory,channelFactory}),second=make({indexedDB:factory,channelFactory}),events=[];second.subscribe(e=>events.push(e));await Promise.all([first.ready(),second.ready()]);await first.save(report('a'));assert.ok(events.some(e=>e.type==='external-change'&&e.id==='a'));assert.equal(second.get('a'),null);await second.refresh();assert.equal(second.get('a').id,'a');
});
await check('Closing drains queued commits and disallows subsequent writes',async()=>{
  const repo=make();await repo.ready();const saving=repo.save(report('a'));await repo.close();await saving;assert.equal(repo.get('a').id,'a');await assert.rejects(repo.save(report('b')),error=>error.code==='closed');
});
for(const repo of repositories)await repo.close();
console.log(`\n${passed} passed; ${failed} failed.`);if(failed)process.exitCode=1;
