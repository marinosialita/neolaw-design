import assert from 'node:assert/strict';
import {formatDate, safeURL, sourceState, coverage, decisionSummary, reportLabel} from '../modules/screening-view-model.js';

assert.equal(formatDate('<img src=x onerror=alert(1)>'), 'Not supplied');
assert.equal(formatDate('not a date'), 'Not supplied');
assert.equal(formatDate(null), 'Not supplied');
assert.equal(formatDate('2026-10-12'), '12 Oct 2026');
assert.equal(formatDate('2026-10-12T21:06:00Z'), '13 Oct 2026');
assert.equal(formatDate('2026-12-01T22:06:00Z'), '2 Dec 2026');
for(const value of ['javascript:alert(1)','data:text/html,hello','https://user:password@example.org/']) assert.equal(safeURL(value),'');
assert.equal(safeURL('https://www.gov.uk/government/publications/the-uk-sanctions-list'),'https://www.gov.uk/government/publications/the-uk-sanctions-list');
const now = Date.now();
assert.equal(sourceState({status:'available',retrievedAt:new Date(now).toISOString()},now).ready,true);
assert.equal(sourceState({status:'available',retrievedAt:new Date(now-49*3600000).toISOString()},now).ready,false);
assert.equal(sourceState({status:'available',retrievedAt:'invalid'},now).ready,false);
assert.equal(coverage([]).incomplete,true);
assert.equal(coverage([]).sources.length,4);
const report={matches:[{record:{id:'eu:1'}},{record:{id:'uk:1'}}],totalMatches:4,decisions:{'eu:1':{status:'dismissed'},'uk:1':{status:'confirmed'}}};
assert.deepEqual(decisionSummary(report),{confirmed:1,dismissed:1,pending:2,total:4,shown:2});
assert.equal(reportLabel(report),'2 to review');
assert.equal(reportLabel({...report,totalMatches:2}),'Review recorded');
assert.equal(reportLabel({matches:[],totalMatches:0}),'No name matches');
console.log('PASS safe dates/links, stale or incomplete coverage, and unresolved omitted matches');

assert.equal(reportLabel({matches:[],research:{officialChecks:[{id:'cy',status:'completed',matchCount:1}]}}),'Official matches to review');
assert.equal(reportLabel({matches:[],research:{officialChecks:[]}}),'Official checks incomplete');
assert.equal(sourceState({status:'available',retrievedAt:'2999-01-01T00:00:00Z'},now).ready,false);

assert.equal(sourceState({status:'available',retrievedAt:'2000-01-01T00:00:00Z',verifiedAt:new Date(now).toISOString()},now).ready,true);
for(const verifiedAt of ['invalid','2999-01-01T00:00:00Z','1999-01-01T00:00:00Z'])assert.equal(sourceState({status:'available',retrievedAt:'2000-01-01T00:00:00Z',verifiedAt},now).ready,false);
assert.equal(reportLabel({matches:[],research:{officialChecks:[{id:'eu',status:'failed',matchCount:999}]}}),'Official checks incomplete');
assert.equal(reportLabel({matches:[],research:{officialChecks:['eu','ofac','un','uk','cy'].map(id=>({id,status:'completed',matchCount:id==='eu'?null:0}))}}),'Official checks incomplete');
