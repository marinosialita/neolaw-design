import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {searchRecords,prepareSearchIndex,normalizeName} from '../modules/screening-engine.js';
import {explainMatch} from '../modules/screening-match.js';
import {executiveSummary} from '../modules/research-evidence.js';

const root=fileURLToPath(new URL('..',import.meta.url)),args=process.argv.slice(2),publisher=args.includes('--publisher-smoke');
const outputIndex=args.indexOf('--output'),output=outputIndex>=0?resolve(args[outputIndex+1]||'work/screening-benchmark/results.json'):null;
const fixtureIndex=args.indexOf('--fixture'),fixturePath=fixtureIndex>=0?resolve(args[fixtureIndex+1]):new URL('./fixtures/screening-benchmark.json',import.meta.url);
const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
const iterations=30,percentile=(values,p)=>values.length?Number([...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)].toFixed(3)):null;
const completedChecks=()=>['eu','ofac','un','uk','cy','bis','au','ca','ch'].map(id=>({id,status:'completed',matchCount:0,candidates:[]}));
const result={at:new Date().toISOString(),fixtureVersion:fixture.version,networkRequests:0,paidRequests:0,purpose:'Controlled fixture benchmark with separate optional publisher-record smoke',provenance:fixture.provenance,cases:[],failures:[]};
const accuracy={targetOpportunities:0,retrievedTargets:0,misses:0,returnedCandidates:0,extraCandidates:0,expectedAmbiguousCandidates:0,unexpectedExtraCandidates:0,noMatchQueries:0,noMatchQueriesWithCandidates:0};
const times=[];
for(const scenario of fixture.cases){
  const sources=fixture.sources.map(source=>({...source,status:scenario.unavailableSources?.includes(source.id)?'unavailable':source.status}));
  const extra=scenario.expansion?Array.from({length:scenario.expansion.count},(_,i)=>({id:`cap:${String(i).padStart(3,'0')}`,sourceId:scenario.expansion.sourceId,name:scenario.expansion.name,type:scenario.expansion.type,aliases:[],countries:[],datesOfBirth:[]})):[];
  const bundle={sources,records:[...fixture.records,...extra]};prepareSearchIndex(bundle);
  const found=searchRecords(bundle,scenario.query),ids=found.matches.map(match=>match.record.id),target=new Set(scenario.targetIds),allowed=new Set(scenario.allowedExtraIds),missing=scenario.targetIds.filter(id=>!ids.includes(id)),additional=ids.filter(id=>!target.has(id));
  const checks=[],assert=(condition,description)=>{checks.push({description,passed:Boolean(condition)});if(!condition)result.failures.push({case:scenario.id,description});};
  if(!scenario.excludeFromAccuracy){
    accuracy.targetOpportunities+=target.size;accuracy.retrievedTargets+=target.size-missing.length;accuracy.misses+=missing.length;accuracy.returnedCandidates+=ids.length;accuracy.extraCandidates+=additional.length;
    accuracy.expectedAmbiguousCandidates+=additional.filter(id=>allowed.has(id)).length;accuracy.unexpectedExtraCandidates+=additional.filter(id=>!allowed.has(id)).length;
    if(!target.size){accuracy.noMatchQueries++;if(ids.length)accuracy.noMatchQueriesWithCandidates++;}
    assert(missing.length===0,'Every labelled target remains retrievable');
    assert(additional.every(id=>allowed.has(id)),'No unexpected extra candidates outside the labelled ambiguity set');
  }
  for(const [id,labels] of Object.entries(scenario.expectDifferences||{}))for(const label of labels){const match=found.matches.find(m=>m.record.id===id);assert(Boolean(match&&explainMatch(match,scenario.query).comparisons.some(row=>row.label===label&&row.status==='review')),`${id}: ${label} difference remains visible`);}
  if(scenario.expectIdentifier)assert(found.matches.some(m=>target.has(m.record.id)&&m.identifierMatch===scenario.expectIdentifier),'Published typed identifier retrieves the target');
  if(scenario.expectWeakAlias)assert(found.matches.some(m=>target.has(m.record.id)&&m.signals.some(s=>/weak; insufficient alone/.test(s))),'Weak alias is not presented as identity confirmation');
  for(const signal of scenario.requireSignals||[])assert(found.matches.some(m=>target.has(m.record.id)&&m.signals.includes(signal)),`Target includes required signal: ${signal}`);
  for(const signal of scenario.forbidSignals||[])assert(!found.matches.some(m=>target.has(m.record.id)&&m.signals.includes(signal)),`Target excludes unsupported signal: ${signal}`);
  if(scenario.unavailableSources){
    assert(found.matches.length===0,'Unavailable source contributes no cached candidate');
    const checks=completedChecks().map(c=>scenario.unavailableSources.includes(c.id)?{...c,status:'failed',error:'Synthetic unavailable source'}:c);
    assert(executiveSummary({query:scenario.query,research:{schemaVersion:6,status:'partial',mode:'search',officialChecks:checks}}).incomplete,'Failed source makes the outcome incomplete');
  }
  if(scenario.interrupted)assert(executiveSummary({query:scenario.query,research:{schemaVersion:6,status:'cancelled',mode:'deep',officialChecks:completedChecks(),phases:[{id:'identity',status:'completed',citations:[],text:''},{id:'media',status:'cancelled'},{id:'ownership',status:'pending'}]}}).incomplete,'Interrupted research remains incomplete');
  if(scenario.expansion){assert(found.totalMatches===101&&found.matches.length===100,'Return cap preserves total matches separately from retrieved records');assert(found.totalMatches>found.matches.length,'Truncation is detectable and cannot represent complete retrieval');}
  const timings=[];for(let i=0;i<iterations;i++){const start=performance.now();searchRecords(bundle,scenario.query);timings.push(performance.now()-start);}times.push(...timings);
  result.cases.push({id:scenario.id,purpose:scenario.purpose,metricScope:scenario.excludeFromAccuracy?'behaviour-only; excluded from candidate precision/recall':'labelled synthetic target retrieval',targetIds:scenario.targetIds,returnedIds:ids,totalMatches:found.totalMatches,retrieved:found.matches.length,missing,extraCandidates:additional,expectedAmbiguous:additional.filter(id=>allowed.has(id)),checks,warmP50Ms:percentile(timings,.5),warmP95Ms:percentile(timings,.95)});
}
result.controlledFixtureMetrics={...accuracy,candidatePrecision:accuracy.returnedCandidates?Number((accuracy.retrievedTargets/accuracy.returnedCandidates).toFixed(4)):null,targetRecall:accuracy.targetOpportunities?Number((accuracy.retrievedTargets/accuracy.targetOpportunities).toFixed(4)):null,warmP50Ms:percentile(times,.5),warmP95Ms:percentile(times,.95),timingIterationsPerCase:iterations,
  interpretation:'Precision is labelled synthetic target records divided by all returned candidates, including expected namesakes. Extra candidates are not automatically product errors: identity review must resolve them. Recall measures only this fixed fixture. Warm timings cover the in-process matcher over the tiny fixture, not browser/API/end-to-end latency or production throughput.'};

if(publisher){
  const data=JSON.parse(await readFile(resolve(root,'data/screening-sources.json'),'utf8')),smoke={purpose:'Publisher-snapshot retrieval smoke only; record queries come from the same corpus, so these are not independent accuracy labels',sourceFile:'data/screening-sources.json',records:data.records.length,sources:[],probes:0,missedReturnedRecords:0,cappedResults:0,warmP50Ms:null,warmP95Ms:null},timings=[];
  for(const source of data.sources.filter(s=>s.status==='available')){
    const records=data.records.filter(record=>record.sourceId===source.id),eligible=records.filter(r=>normalizeName(r.name).length>=5&&/\p{L}/u.test(normalizeName(r.name))),bundle={sources:[source],records};prepareSearchIndex(bundle);
    const sampled=[...new Set([.1,.35,.65,.9].map(f=>eligible[Math.floor((eligible.length-1)*f)]).filter(Boolean))],probes=[];
    for(const record of sampled){
      const query={name:record.name,type:record.type};searchRecords(bundle,query);
      const start=performance.now(),found=searchRecords(bundle,query),elapsed=performance.now()-start;timings.push(elapsed);smoke.probes++;
      const returned=found.matches.some(m=>m.record.id===record.id),capped=found.totalMatches>found.matches.length;
      if(capped)smoke.cappedResults++;
      if(!returned)smoke.missedReturnedRecords++;
      // Even a cap is recorded honestly as not returned, not counted as a pass.
      probes.push({recordId:record.id,returned,totalMatches:found.totalMatches,retrieved:found.matches.length,capped,warmMs:Number(elapsed.toFixed(3))});
    }
    smoke.sources.push({id:source.id,records:records.length,retrievedAt:source.retrievedAt||null,verifiedAt:source.verifiedAt||null,probes});
  }
  smoke.warmP50Ms=percentile(timings,.5);smoke.warmP95Ms=percentile(timings,.95);smoke.limitations='Tests only records in the stored available snapshots. Does not prove snapshot freshness, publisher connectivity, legal coverage, namesake discrimination, provider API accuracy, or end-to-end speed. Source freshness dates are retained above.';result.publisherSmoke=smoke;
}
result.status=result.failures.length?'failed':'passed';
if(output){await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({status:result.status,fixtureCases:result.cases.length,checks:result.cases.reduce((sum,c)=>sum+c.checks.length,0),failures:result.failures,controlledFixtureMetrics:result.controlledFixtureMetrics,publisherSmoke:result.publisherSmoke?{probes:result.publisherSmoke.probes,missedReturnedRecords:result.publisherSmoke.missedReturnedRecords,cappedResults:result.publisherSmoke.cappedResults,warmP50Ms:result.publisherSmoke.warmP50Ms,warmP95Ms:result.publisherSmoke.warmP95Ms}:undefined,output},null,2));
if(result.failures.length)process.exitCode=1;
