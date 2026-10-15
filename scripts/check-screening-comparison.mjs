import assert from 'node:assert/strict';
import {explainMatch,rankedCompanyCandidates,restoreReturnedMatches} from '../modules/screening-match.js';
import {officialSummary,executiveSummary} from '../modules/research-evidence.js';
import {officialReadingHTML,sourceReadingHTML} from '../modules/screening-reading.js';
import {searchRecords} from '../modules/screening-engine.js';
import {providerSource} from '../modules/screening-provider.js';
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name);}
const q={name:'Example Company',type:'entity',country:'China',registrationNumber:'123',lei:'300300G4NLFHF8PDPY52'};
const r={id:'bis:1',sourceId:'bis',name:'Example Company',type:'other',typeUnspecified:true,countries:['CN'],programs:['BIS Entity List · export controls']};
test('Unclassified BIS records remain visible for people and companies',()=>{for(const type of ['person','entity'])assert.equal(searchRecords({sources:[{id:'bis',status:'available'}],records:[r]},{name:q.name,type}).matches.length,1);});
test('A matching name never overrides missing registration identifiers',()=>{const v=explainMatch({record:r,matchKind:'Exact name'},q);assert.equal(v.comparisons[0].status,'match');assert.equal(v.comparisons[1].status,'match');assert.equal(v.comparisons[2].status,'missing');assert.equal(v.identity,'Identity requires review');assert.match(v.next.join(' '),/not automatically an asset freeze/);});
test('Conflicting registration and jurisdiction need resolution',()=>{const v=explainMatch({record:{...r,type:'entity',registrationNumber:'999',countries:['CY']}},q);assert.equal(v.conflicts,2);assert.match(v.next[0],/Resolve/);});
test('Person partial birth dates remain unconfirmed without inventing a date difference',()=>{const v=explainMatch({record:{name:'Alex Example',type:'person',datesOfBirth:['1980']}},{name:'Alex Example',type:'person',dob:'1980-01-01'});assert.equal(v.comparisons.at(-1).status,'missing');assert.match(v.comparisons.at(-1).note,/Birth year agrees/);assert.match(v.next.join(' '),/identity document/);});
test('Historic export records explicitly require checking expiry',()=>{const v=explainMatch({record:{...r,endedAt:'2000-01-01'}},q);assert.match(v.next[0],/end date of 2000-01-01/);});
test('Mixed provider categories require their original authorities without defaulting every export entry to BIS',()=>{
 const candidate={id:'mixed-provider',name:'Example Person',schema:'Person',score:1,categories:['Politically exposed person','Sanctions','Export controlled','BIS source tag'],topics:['role.pep','sanction','export.control'],positions:['Example public role']};
 const source=providerSource(candidate,{status:'completed'},{name:'Example Person',type:'person'}),review=explainMatch(source.match,source.query),html=sourceReadingHTML(source);
 assert.match(review.next.join(' '),/each provider category’s cited original source/);assert.match(review.next.join(' '),/PEP roles, allegations, sanctions and export-control entries separately/);assert.doesNotMatch(review.next.join(' '),/Read the current BIS entry|Federal Register/);
 assert.match(html,/Politically exposed person/);assert.match(html,/Export controlled/);assert.match(html,/Example public role/);assert.match(html,/cited original source/);assert.doesNotMatch(html,/Read the current BIS entry|Federal Register notice/);
});
test('Generic export-control programmes stay authority-neutral while an explicit BIS source keeps its guidance',()=>{
 const generic=explainMatch({record:{...r,sourceId:'ca',programs:['Export control-linked']}},q),bis=explainMatch({record:{...r,sourceId:'cy',programs:['BIS Entity List']}},q),unrelated=explainMatch({record:{...r,sourceId:'ca',programs:['ABIS programme']}},q);
 assert.equal(generic.exportControl,true);assert.match(generic.next.join(' '),/originating authority’s current export-control entry/);assert.doesNotMatch(generic.next.join(' '),/BIS|Federal Register/);assert.match(bis.next.join(' '),/current BIS entry and Federal Register notice/);assert.equal(unrelated.exportControl,false);
});
test('Reader escapes source-supplied names and reasons',()=>{const s=officialReadingHTML({record:{...r,name:'<img src=x onerror=bad()>',reasons:'<script>bad()</script>'},score:80},null,q);assert.ok(!s.includes('<script>'));assert.ok(s.includes('&lt;script&gt;'));assert.match(s,/Why it matched/);assert.match(s,/What to check next/);});
test('Historic five-source scope and new six-source scope stay distinct',()=>{const c=['eu','ofac','un','uk','cy'].map(id=>({id,status:'completed',matchCount:0}));assert.equal(officialSummary({officialChecks:c}).total,5);const v=officialSummary({schemaVersion:5,officialChecks:c});assert.equal(v.total,6);assert.equal(v.incomplete,true);});
test('GLEIF failure cannot produce a completed overall review',()=>{const c=['eu','ofac','un','uk','cy','bis'].map(id=>({id,status:'completed',matchCount:0}));const v=executiveSummary({query:q,research:{schemaVersion:5,mode:'search',status:'completed',officialChecks:c,gleif:{status:'failed'}}});assert.equal(v.title,'Checks incomplete');assert.match(v.next,/GLEIF/);});
test('Returned source receipts restore records beyond the old 100-row display cap',()=>{
  const matches=Array.from({length:150},(_,i)=>({record:{id:'cy:'+i,name:'Example '+i},score:80}));
  const before={query:q,matches:matches.slice(0,100),research:{officialChecks:[{id:'cy',status:'completed',matchCount:150,candidates:matches}]}};
  const report=restoreReturnedMatches(before);assert.equal(report.matches.length,150);assert.equal(report.totalMatches,150);assert.equal(before.matches.length,100);
  const failed=restoreReturnedMatches({...before,research:{officialChecks:[{id:'cy',status:'failed',matchCount:999,candidates:matches}]}});assert.equal(failed.matches.length,0);assert.equal(failed.totalMatches,0);
});
test('A source refresh preserves completed legacy candidates but does not revive failures or explicit empty results',()=>{
  const m=(source,id)=>({record:{id,sourceId:source,name:'Synthetic person'},score:100});
  const old=[m('eu','eu:kept'),m('un','un:replaced'),m('uk','uk:removed'),m('ofac','ofac:failed')];
  const report={query:{name:'Synthetic person'},matches:old,decisions:{'eu:kept':{status:'investigate',note:'Preserved review'}},research:{officialChecks:[
    {id:'eu',status:'completed',matchCount:1},
    {id:'un',status:'completed',matchCount:2,candidates:[m('un','un:new')]},
    {id:'uk',status:'completed',matchCount:0,candidates:[]},
    {id:'ofac',status:'failed',matchCount:1}
  ]}};
  const before=JSON.stringify(report),restored=restoreReturnedMatches(report);
  assert.deepEqual(restored.matches.map(m=>m.record.id),['eu:kept','un:new']);
  assert.equal(restored.totalMatches,3,'Receipt totals preserve a possibly truncated retrieved set');
  assert.deepEqual(restored.decisions,report.decisions);assert.equal(JSON.stringify(report),before);
  assert.deepEqual(restoreReturnedMatches({...report,research:{officialChecks:[{id:'eu',status:'completed',matchCount:1,candidates:null}]}}).matches,[],'Malformed explicit data cannot activate legacy fallback');
  assert.deepEqual(restoreReturnedMatches({...report,research:{officialChecks:[{id:'eu',status:'completed',matchCount:0}]}}).matches,[],'A legacy zero-result receipt cannot revive a stale candidate');
  assert.deepEqual(restoreReturnedMatches({...report,research:{officialChecks:[{id:'eu',status:'failed',matchCount:1}]}}).matches,[],'A legacy failure cannot keep stale candidates current');
});
test('Person and company conflicts stay visible without dropping the supplied identifiers',()=>{
  const person={name:'Synthetic subject',type:'person',dob:'1980-01-01',passportNumber:'SYN123'};
  const review=explainMatch({record:{name:person.name,type:'entity',registrationNumber:'SYN456'}},person);
  assert.ok(review.comparisons.some(c=>c.label==='Entity type'&&c.status==='review'));
  assert.ok(review.comparisons.some(c=>c.label==='Date of birth'&&c.input===person.dob));
  assert.ok(review.comparisons.some(c=>c.label==='Passport number'&&c.input===person.passportNumber));
  assert.equal(review.conflicts,1);assert.match(review.next[0],/entity type/);
  const company=explainMatch({record:{name:'Synthetic subject',type:'person'}},{name:'Synthetic subject',type:'entity',registrationNumber:'SYN456'});
  assert.ok(company.comparisons.some(c=>c.label==='Registration number'&&c.input==='SYN456'));
  assert.ok(company.comparisons.some(c=>c.label==='Entity type'&&c.status==='review'));
});
test('A source year explicitly recorded in another calendar cannot corroborate a Gregorian DOB',()=>{
  const record={id:'ch:calendar',sourceId:'ch',name:'Synthetic person',type:'person',datesOfBirth:['2000 (partial/other calendar)']};
  const query={name:record.name,type:'person',dob:'2000-01-01'};
  const match=searchRecords({sources:[{id:'ch',status:'available'}],records:[record]},query).matches[0];
  assert.doesNotMatch(match.signals.join(' '),/Birth year matches|Date of birth matches/);
  const review=explainMatch(match,query),dob=review.comparisons.find(c=>c.label==='Date of birth');
  assert.equal(dob.status,'missing');assert.match(dob.note,/another calendar/);assert.match(review.next.join(' '),/calendar conversion/);
  const withGregorian=explainMatch({record:{...record,datesOfBirth:[...record.datesOfBirth,query.dob]}},query);
  assert.equal(withGregorian.comparisons.find(c=>c.label==='Date of birth').status,'match');
});
console.log(n+' comparison checks passed.');
