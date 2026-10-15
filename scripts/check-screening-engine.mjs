import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { searchRecords, normalizeName } from '../modules/screening-engine.js';

// Explicit synthetic identities isolate retrieval behavior from changing lists.
// They are never shipped in the application data bundle.
const person = (id,name,extra={}) => ({ id,sourceId:'un',name,type:'person',aliases:[],countries:[],datesOfBirth:[],...extra });
const bundle = { sources:[{id:'un',status:'available'},{id:'eu',status:'unavailable'}], records:[
  person('test:1','Alexander Example',{aliases:['Sasha Example'],countries:['Russian Federation'],datesOfBirth:['1980-04-09']}),
  person('test:2','Γιάννης Παπαδόπουλος'),
  person('test:3','Владимир Пример'),
  person('test:4','José Núñez'),
  person('test:5','North Star Consulting',{type:'entity',countries:['United Kingdom']}),
  person('test:6','Ocean Beacon',{type:'vessel'}),
  person('test:7','Adam Unknown',{reasons:'Alexander Example appears here but this is not a name field.'}),
  person('test:8','Short Date',{datesOfBirth:['dd/mm/1985']}),
  person('test:9','Long Date',{datesOfBirth:['07 Oct 1952']}),
  person('test:10','Hidden Unavailable',{sourceId:'eu'}),
  person('test:11','Li Wei'),
  person('test:12','Weak Alias Example',{aliases:['Weakhandle'],weakAliases:['Weakhandle']})
] };

let groups=0;
function group(name,fn){ fn(); groups++; console.log(`PASS ${name}`); }
const find = (name,extra={}) => searchRecords(bundle,{name,type:'all',...extra});
group('empty / punctuation-only searches cannot enumerate the lists',()=>{
  for(const q of ['',' ','!','12','a']) assert.equal(find(q).totalMatches,0);
});
group('exact primary and alias search preserve the same official record',()=>{
  assert.equal(find('Alexander Example').matches[0].score,100);
  const alias=find('Sasha Example').matches[0];
  assert.equal(alias.record.id,'test:1'); assert.equal(alias.matchKind,'Exact alias');
  assert.equal(alias.nameMatched,'Sasha Example');
});
group('punctuation, accents, scripts and reordered names',()=>{
  assert.equal(find('Example, Alexander').matches[0].record.id,'test:1');
  assert.equal(find('JOSE NUNEZ').matches[0].record.id,'test:4');
  assert.equal(find('γιαννης παπαδοπουλος').matches[0].record.id,'test:2');
  assert.equal(find('Vladimir Primer').matches[0].record.id,'test:3');
  assert.equal(normalizeName('Γιάννης'),'giannis');
  assert.equal(normalizeName('Κούρος'),'kouros');
});
group('single surname and one typing error yield candidates without unrelated names',()=>{
  assert.equal(find('Exampel').matches[0].record.id,'test:1');
  assert.equal(find('Alexander Exampl').matches[0].record.id,'test:1');
  assert.equal(find('Example').matches.some(m=>m.record.id==='test:7'),false);
  for(const q of ['Examplefax','Zzxqvnomatch','Alex somebody','No']) assert.equal(find(q).totalMatches,0);
  assert.equal(find('Li').matches[0].record.id,'test:11');
  assert.equal(find('L').totalMatches,0);
});
group('weak source aliases carry an explicit identity warning',()=>{
  const result=find('Weakhandle').matches[0];
  assert.equal(result.record.id,'test:12');
  assert.ok(result.signals.some(s=>s.includes('insufficient alone')));
});
group('country and DOB disagreements remain visible; they do not suppress names',()=>{
  const exact=find('Alexander Example',{country:'RU',dob:'1980-04-09'}).matches[0];
  assert.ok(exact.signals.some(s=>s.startsWith('Country matches')));
  assert.ok(exact.signals.includes('Date of birth matches'));
  const different=find('Alexander Example',{country:'Cyprus',dob:'2000-01-01'}).matches[0];
  assert.ok(different.signals.some(s=>s.startsWith('Country differs')));
  assert.ok(different.signals.some(s=>s.startsWith('Date of birth differs')));
  assert.equal(different.score,100);
});
group('missing data and year-only dates are never treated as exact identity matches',()=>{
  const missing=find('Adam Unknown',{country:'Cyprus',dob:'2000-01-01'}).matches[0];
  assert.ok(missing.signals.includes('Country not provided in source'));
  assert.ok(missing.signals.includes('Date of birth not provided in source'));
  assert.ok(find('Short Date',{dob:'1985-12-24'}).matches[0].signals.includes('Birth year matches; full date unconfirmed'));
  assert.ok(find('Long Date',{dob:'1952-10-07'}).matches[0].signals.includes('Date of birth matches'));
});
group('type filters preserve vessels and unavailable sources do not appear checked',()=>{
  assert.equal(find('North Star Consulting',{type:'person'}).totalMatches,0);
  assert.equal(find('Ocean Beacon',{type:'entity'}).totalMatches,0);
  assert.equal(find('Ocean Beacon').matches[0].record.type,'vessel');
  assert.equal(find('Hidden Unavailable').totalMatches,0);
});
group('result cap preserves total count and deterministic ordering',()=>{
  const many={sources:bundle.sources,records:Array.from({length:125},(_,i)=>person(`cap:${i}`,'Common Example'))};
  const result=searchRecords(many,{name:'Common Example'});
  assert.equal(result.matches.length,100); assert.equal(result.totalMatches,125);
  assert.equal(JSON.stringify(result),JSON.stringify(searchRecords(many,{name:'Common Example'})));
});

try {
  const real=JSON.parse(await readFile(new URL('../data/screening-sources.json',import.meta.url),'utf8'));
  group('download bundle schema and provenance',()=>{
    assert.equal(real.schemaVersion,1); assert.equal(real.sources.length,8);
    assert.ok(real.generatedAt); assert.equal(new Set(real.records.map(r=>r.id)).size,real.records.length);
    for(const source of real.sources){
      const count=real.records.filter(r=>r.sourceId===source.id).length;
      assert.equal(source.recordCount,count);
      if(source.status==='available') { assert.ok(count>0); assert.ok(source.retrievedAt); assert.ok(source.downloads.every(d=>d.sha256.length===64)); }
      else { assert.equal(count,0); assert.ok(source.error); }
    }
    for(const r of real.records){
      assert.ok(r.name); assert.ok(['person','entity','vessel','other'].includes(r.type));
      for(const field of ['aliases','countries','datesOfBirth','identifiers','programs','addresses']) assert.ok(Array.isArray(r[field])&&r[field].every(v=>typeof v==='string'));
    }
  });
  const started=performance.now();
  const result=searchRecords(real,{name:'Vladimir Putin',type:'person',country:'Russia',dob:'1952-10-07'});
  const elapsed=performance.now()-started;
  group('real public record retrieval and interaction budget',()=>{
    assert.ok(result.matches.length>0);
    assert.ok(result.matches.some(m=>m.record.name.toLowerCase().includes('putin')));
    assert.ok(elapsed<5000,`Initial search took ${elapsed.toFixed(1)}ms`);
  });
  console.log(`Official bundle: ${real.records.length.toLocaleString()} records, ${result.totalMatches} Putin candidates, first search ${elapsed.toFixed(1)}ms.`);
} catch(error) {
  if(error.code==='ENOENT') console.log('Official bundle not yet present; fixture tests only.');
  else throw error;
}
console.log(`${groups} screening checks passed.`);
