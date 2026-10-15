import assert from 'node:assert/strict';
import {applyResearchReceipt} from '../modules/screening-report-state.js';

const match = (id, sourceId, name) => ({record:{id, sourceId, name}, score:90});
const report = {
  id:'original', createdAt:'2026-10-14T06:00:00Z',
  query:{name:'Original Person',type:'person',projectId:'chosen-project'},
  matches:[match('eu:old','eu','Original Person')],
  decisions:{'eu:old':{status:'investigate',note:'Keep this review'}},
  notes:'Keep saved notes', projectName:'Chosen project',
  reviewLog:[{id:'saved-event'}], assessmentLog:[{id:'saved-assessment'}],
};
const before = structuredClone(report);
const research = {
  id:'accepted-job', mode:'deep', status:'cancelled', officialStatus:'completed',
  officialChecks:[
    {id:'eu',status:'completed',matchCount:1},
    {id:'ofac',status:'completed',matchCount:2,candidates:[
      match('ofac:other','ofac','Another Person'),match('ofac:exact','ofac','Original Person')
    ]},
  ],
};
const next = applyResearchReceipt(report,research,Date.parse(report.createdAt)+125);
assert.deepEqual(report,before,'A receipt must not mutate the prior saved snapshot');
assert.deepEqual(next.matches.map(m=>m.record.id),['eu:old','ofac:exact','ofac:other']);
assert.equal(next.totalMatches,3);
assert.equal(next.initialResultsMs,125);
assert.equal(next.query.mode,'deep');
for(const field of ['decisions','notes','projectName','reviewLog','assessmentLog'])assert.deepEqual(next[field],report[field]);
assert.equal(next.query.projectId,'chosen-project');
assert.equal(next.unsaved,true);
assert.equal(next.officialApplied,research.id);
assert.equal(applyResearchReceipt({...report,initialResultsMs:0},research).initialResultsMs,0,'An immediate result remains zero, not overwritten by later receipts');
assert.equal(applyResearchReceipt({...report,createdAt:'invalid'},research).initialResultsMs,undefined);
assert.equal(applyResearchReceipt(report,research,0).initialResultsMs,undefined,'Negative elapsed times are not measurements');
assert.deepEqual(applyResearchReceipt(report,{id:'job',status:'failed',mode:'search'}).matches,report.matches,'A receipt without source evidence must not erase retained records');
console.log('PASS report projection: original subject ordering, mixed receipts, review preservation, immutable snapshots and bounded timing.');
