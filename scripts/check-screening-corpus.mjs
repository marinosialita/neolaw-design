import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {searchRecords,normalizeName} from '../modules/screening-engine.js';

// Reproducible publisher-record retrieval smoke test. This is not a labelled
// identity benchmark, a precision/recall estimate or an independent accuracy audit.
const data=JSON.parse(await readFile(new URL('../data/screening-sources.json',import.meta.url),'utf8'));
const result={at:new Date().toISOString(),purpose:'Publisher-record retrieval smoke test, not identity accuracy',networkRequests:0,records:data.records.length,sources:[],failures:[]};
const started=performance.now();let scenarios=0;
for(const source of data.sources.filter(s=>s.status==='available')){
  const records=data.records.filter(r=>r.sourceId===source.id),bundle={sources:[source],records};
  const eligible=records.filter(r=>normalizeName(r.name).length>=5&&/\p{L}/u.test(normalizeName(r.name)));
  const samples=Array.from({length:8},(_,i)=>eligible[Math.floor(i*(eligible.length-1)/7)]);
  let passed=0;
  for(const record of samples){
    const alias=(record.aliases||[]).find(n=>normalizeName(n).length>=5&&!(record.weakAliases||[]).includes(n));
    const probes=[['exact',record.name,{}],['case/punctuation',normalizeName(record.name).toUpperCase().split(' ').join(',  '),{}],['token order',normalizeName(record.name).split(' ').reverse().join(' '),{}],['conflicting identifiers',record.name,{country:'ZZ - synthetic mismatch',dob:'1900-01-01'}],...(alias?[['alias',alias,{}]]:[])];
    for(const [kind,name,extra] of probes){
      scenarios++;
      const found=searchRecords(bundle,{name,type:record.type,...extra});
      const hit=found.matches.find(m=>m.record.id===record.id);
      // Exact ties beyond the documented 100-record return cap are not loss of
      // retrieval; never treat a capped list as complete evidence.
      if(!hit&&found.totalMatches>100&&found.matches.every(m=>m.score>=98)){passed++;continue;}
      try{assert.ok(hit,`${source.id} ${record.id} ${kind}`);if(kind==='conflicting identifiers')assert.ok(hit.signals.length>=2);passed++;}
      catch(error){result.failures.push({source:source.id,recordId:record.id,kind,error:error.message});}
    }
  }
  result.sources.push({id:source.id,records:records.length,sampledRecords:samples.length,passed});
  console.log(`${source.id}: ${passed} retrieval probes passed`);
}
Object.assign(result,{scenarios,elapsedSeconds:Number(((performance.now()-started)/1000).toFixed(2)),status:result.failures.length?'failed':'passed'});
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,scenarios,failures:result.failures.length,elapsedSeconds:result.elapsedSeconds}));
assert.equal(result.failures.length,0,JSON.stringify(result.failures));
