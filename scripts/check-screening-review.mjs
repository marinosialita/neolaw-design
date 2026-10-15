import assert from 'node:assert/strict';
import {recordDecision} from '../modules/screening-review.js';
import {buildReportHTML,preparePDFReport} from '../modules/screening-export.js';
const rec={id:'test-record',name:'Synthetic review record',sourceId:'eu'};
const initial={id:'review-fixture',query:{name:'Synthetic review fixture'},matches:[{record:rec}],sourceSnapshots:[],decisions:{}};
const first=recordDecision(initial,rec,{status:'investigate',note:'Identifier missing',reviewer:'Test reviewer'},'2026-10-12T21:00:00Z');
const second=recordDecision(first,rec,{status:'dismissed',note:'Different verified registration number',reviewer:'Second test reviewer'},'2026-10-12T21:02:00Z');
assert.deepEqual(initial.decisions,{});assert.equal(first.reviewLog.length,1);assert.equal(second.reviewLog.length,2);
assert.equal(second.reviewLog[0].note,'Identifier missing');assert.equal(second.decisions[rec.id].reviewer,'Second test reviewer');
assert.equal(recordDecision(second,rec,second.decisions[rec.id]),second,'Unchanged save must not manufacture a revision');
const reopened=recordDecision(JSON.parse(JSON.stringify(second)),rec,{status:'investigate',note:'Reopened: supporting evidence needs verification'},'2026-10-12T21:03:00Z');
assert.equal(reopened.reviewLog.length,3);assert.equal(reopened.reviewLog[1].status,'dismissed');assert.equal(reopened.decisions[rec.id].status,'investigate');
const legacy={...initial,decisions:{[rec.id]:{status:'dismissed',note:'Earlier reason',at:'2026-10-11T09:00:00Z'}}};
const migrated=recordDecision(legacy,rec,{status:'investigate',note:'Reopen for review'},'2026-10-12T21:04:00Z');
assert.equal(migrated.reviewLog.length,2);assert.equal(migrated.reviewLog[0].kind,'previous_saved_decision');assert.equal(migrated.reviewLog[0].at,'2026-10-11T09:00:00Z');
assert.throws(()=>recordDecision(initial,rec,{status:'confirmed',note:' '}),/reason/);
assert.throws(()=>recordDecision(initial,rec,{status:'clear',note:'Invalid'}),/valid/);
for(const status of ['constructor','toString','__proto__']) {
  assert.throws(()=>recordDecision(initial,rec,{status,note:'Invalid inherited property'}),/valid/);
}
assert.throws(()=>recordDecision(initial,rec,{status:'investigate',note:'x'.repeat(4001)}),/Shorten/);
const hostile=recordDecision(initial,rec,{status:'investigate',note:'<script>alert(1)</script>',reviewer:'<img src=x onerror=bad()>'});
const html=buildReportHTML(hostile);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<img'));
assert.ok(buildReportHTML(second).includes('Identifier missing'));assert.ok(buildReportHTML(second).includes('not an authenticated audit log'));
assert.deepEqual(preparePDFReport(second).reviewLog,second.reviewLog);
console.log('PASS revision preservation, reopening, legacy migration, no-op saves, validation, escaped exports and PDF payload retention');

// Identical provider captions must retain independent, namespaced review keys.
const {providerSource}=await import('../modules/screening-provider.js');
const one=providerSource({id:'one',name:'Same caption',score:1},{status:'completed'}).match.record;
const two=providerSource({id:'two',name:'Same caption',score:1},{status:'completed'}).match.record;
assert.notEqual(one.id,two.id);assert.equal(one.id,'opensanctions:one');
assert.equal(providerSource({name:'Missing identifier',score:1},{status:'completed'}).match.record.id,'');
let additional={...initial,research:{mode:'search',worldbank:{status:'completed',totalResults:1,candidates:[{record:{id:'wb:one',sourceId:'wb',name:'Procurement candidate'}}]},opensanctions:{status:'completed',candidates:[{id:'one',name:'Provider candidate',score:1}]}}};
additional=recordDecision(additional,{id:'wb:one',sourceId:'wb',name:'Procurement candidate'},{status:'investigate',note:'Check procurement conditions'});
additional=recordDecision(additional,one,{status:'investigate',note:'Check provider identifiers'});
const exported=buildReportHTML({...additional,reviewLog:[]});
for(const note of ['Check procurement conditions','Check provider identifiers'])assert.ok(exported.includes(note));
assert.deepEqual(preparePDFReport(additional).decisions,additional.decisions);
console.log('PASS supplemental IDs, separate same-name candidates and current decisions in print/PDF payloads');

const rerun={...initial,id:'new-check',previousReportId:'earlier-check',decisions:{}};
assert.ok(buildReportHTML(rerun).includes('Previous check: earlier-check'));assert.equal(preparePDFReport(rerun).previousReportId,'earlier-check');

const {reviewProgress,reviewProgressText}=await import('../modules/screening-review.js');
for(const status of ['constructor','toString','__proto__']) {
  const progress=reviewProgress({...initial,decisions:{[rec.id]:{status,note:'Malformed saved status'}}});
  assert.equal(progress.counts.unreviewed,1);
  assert.deepEqual(Object.keys(progress.counts),['unreviewed','investigate','confirmed','dismissed']);
  assert.ok(Object.values(progress.counts).every(Number.isFinite));
}
const queueFixture={...additional,matches:[{record:rec},{record:rec},{record:{id:'unreviewed',name:'Same caption'}},{record:{name:'Missing ID'}}],totalMatches:8,decisions:{...additional.decisions,[rec.id]:{status:'confirmed',note:'Test identifiers'},orphan:{status:'dismissed'}}};
let queue=reviewProgress(queueFixture);
assert.equal(queue.total,5);assert.equal(queue.open,4);assert.equal(queue.counts.confirmed,1);assert.equal(queue.counts.investigate,2);assert.equal(queue.unreviewable,1);assert.equal(queue.limited,true);
assert.equal(queue.entries.filter(v=>v.id===rec.id).length,1,'Duplicate source IDs count once');
const limitedProvider=reviewProgress({...initial,matches:[],research:{opensanctions:{status:'completed',atLimit:true,candidates:[{id:'a',name:'Same caption'},{id:'b',name:'Same caption'},{name:'No review ID'}]}}});
assert.equal(limitedProvider.total,3);assert.equal(limitedProvider.unreviewable,1);assert.equal(limitedProvider.limited,true);
for(const state of ['failed','cancelled','running','pending']){
 const p=reviewProgress({...additional,matches:[],research:{worldbank:{...additional.research.worldbank,status:state},opensanctions:{...additional.research.opensanctions,status:state}}});assert.equal(p.total,0);
}
assert.equal(reviewProgress({...additional,matches:[],research:{worldbank:{status:'completed',totalResults:0,candidates:additional.research.worldbank.candidates}}}).total,0);
const stale=reviewProgress({...initial,research:{officialChecks:[{id:'eu',status:'failed',matchCount:1,candidates:[{record:rec}]}]}});assert.equal(stale.total,0);
const allDecided={...additional,matches:[],decisions:{'wb:one':{status:'confirmed',note:'Fixture only'},'opensanctions:one':{status:'dismissed',note:'Fixture only'},'old':{status:'investigate'}}};
assert.equal(reviewProgress(allDecided).open,0);assert.equal(reviewProgress(allDecided).total,2);
assert.match(reviewProgressText(allDecided),/not client approval/);assert.match(buildReportHTML(allDecided),/Recorded identity review/);
const aiOnly=reviewProgress({...initial,research:{phases:[{identity:{status:'corroborated'}}]}});assert.equal(aiOnly.open,1);assert.equal(aiOnly.decided,0);
console.log('PASS review queue: source-ID deduplication, namespaced providers, missing IDs, source failures, result limits, orphan decisions, AI separation and printable scope');
