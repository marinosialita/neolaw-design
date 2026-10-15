import assert from 'node:assert/strict';
import {officialPortals} from '../modules/screening-view-model.js';
import {recordDecision} from '../modules/screening-review.js';
import {assessmentLabels,assessmentEvidenceKey,assessmentSummary,recordAssessment,assessmentFormHTML,validAssessmentEvent} from '../modules/screening-assessment.js';

const at='2026-10-14T08:00:00Z',later='2026-10-15T08:00:00Z';
const row=(id='eu:fixture',extra={})=>({record:{id,sourceId:'eu',name:'Synthetic Example',type:'person',datesOfBirth:['1970-02-01'],...extra}});
const report=()=>({id:'synthetic-assessment',createdAt:at,query:{name:'Synthetic Example',type:'person'},sourceSnapshots:[],matches:[],totalMatches:0,decisions:{},research:{schemaVersion:7,mode:'search',status:'completed',officialChecks:officialPortals.map(p=>({...p,status:'completed',matchCount:0,candidates:[],checkedAt:at})),worldbank:{status:'completed',totalResults:0,candidates:[]},gleif:{status:'not_applicable'},opensanctions:{status:'not_configured'},phases:[]}});
const change=(r,fn)=>{const copy=structuredClone(r);fn(copy);return copy;};
const conclusion={status:'review_recorded',reviewer:'Fixture reviewer',reason:'No returned candidates in these recorded sources; wider PEP and ownership checks remain outside scope.',findingsReviewed:true,nextReviewDate:'2026-10-15'};
let passed=0;
const test=(label,fn)=>{fn();passed++;console.log('PASS '+label);};

test('No-match outcome is scoped review, never automatic clearance',()=>{
 const initial=report(),next=recordAssessment(initial,conclusion,at),s=assessmentSummary(next,{now:at});
 assert.equal(s.status,'review_recorded');assert.equal(s.canRecord,true);assert.equal(s.progress.total,0);
 assert.equal(s.log.length,1);assert.equal(initial.assessmentLog,undefined);assert.match(s.note,/Not client approval/);
 assert.ok(s.scopeNotes.some(n=>/OpenSanctions was not checked/.test(n)));
 assert.equal(validAssessmentEvent(next.assessmentLog[0]),true);
 assert.ok(!Object.hasOwn(assessmentLabels,'clear'));assert.throws(()=>recordAssessment(initial,{...conclusion,status:'approved'},at),/outcome/);
});
test('Reviewer, reason, attestation and bounded text are required',()=>{
 assert.throws(()=>recordAssessment(report(),{...conclusion,reviewer:' '},at),/reviewer/);
 assert.throws(()=>recordAssessment(report(),{...conclusion,reason:' '},at),/reason/);
 assert.throws(()=>recordAssessment(report(),{...conclusion,reviewer:'x'.repeat(121)},at),/Shorten/);
 assert.throws(()=>recordAssessment(report(),{...conclusion,reason:'x'.repeat(4001)},at),/Shorten/);
 assert.throws(()=>recordAssessment(report(),{...conclusion,findingsReviewed:false},at),/Confirm/);
 assert.throws(()=>recordAssessment(report(),{...conclusion,findingsReviewed:'on'},at),/Confirm/);
});
test('Empty and running drafts cannot be concluded',()=>{
 assert.equal(assessmentSummary({query:{name:'Draft'},matches:[],sourceSnapshots:[]},{now:at}).canRecord,false);
 const r=change(report(),r=>{r.research.status='running';r.assessmentDraft={...conclusion};});
 assert.equal(assessmentSummary(r,{now:at}).status,'open');assert.equal(assessmentSummary(r,{now:at}).recorded,null);
 assert.throws(()=>recordAssessment(r,conclusion,at),/outstanding/);
});
test('All failed/interrupted/incomplete official states block completion',()=>{
 for(const status of ['failed','pending','running','cancelled','interrupted','partial']){
  const r=change(report(),r=>{r.research.officialChecks[0].status=status;});
  assert.ok(assessmentSummary(r,{now:at}).gaps.some(g=>g.code==='official:eu'));
  assert.throws(()=>recordAssessment(r,conclusion,at),/outstanding/);
 }
 const absent=change(report(),r=>{r.research.officialChecks.pop();});assert.equal(assessmentSummary(absent,{now:at}).canRecord,false);
});
test('Incomplete checks can be escalated or sent for information, with exact gaps preserved',()=>{
 const r=change(report(),r=>{r.research.officialChecks[0].status='failed';});
 for(const status of ['needs_information','escalated','open']){
  const next=recordAssessment(r,{...conclusion,status,findingsReviewed:false},at);
  assert.equal(assessmentSummary(next,{now:at}).status,status);
  assert.ok(next.assessmentLog[0].gaps.some(g=>g.code==='official:eu'));
  assert.equal(next.assessmentLog[0].findingsReviewed,false);
 }
});
test('Ambiguous candidates require recorded identity decisions and reasons',()=>{
 let r=change(report(),r=>{r.research.officialChecks[0].matchCount=1;r.research.officialChecks[0].candidates=[row()];});
 assert.equal(assessmentSummary(r,{now:at}).progress.open,1);assert.throws(()=>recordAssessment(r,conclusion,at),/outstanding/);
 r=recordDecision(r,row().record,{status:'investigate',note:'Conflicting date of birth'},at);
 assert.throws(()=>recordAssessment(r,conclusion,at),/outstanding/);
 r=recordDecision(r,row().record,{status:'dismissed',note:'Distinct documented date of birth',reviewer:'Fixture reviewer'},at);
 assert.equal(assessmentSummary(recordAssessment(r,conclusion,at),{now:at}).status,'review_recorded');
 const bad=change(r,r=>{r.decisions['eu:fixture'].note='';});assert.ok(assessmentSummary(bad,{now:at}).gaps.some(g=>g.code==='decision_reasons'));
});
test('Same identity does not manufacture an acceptance outcome',()=>{
 let r=change(report(),r=>{r.research.officialChecks[0].matchCount=1;r.research.officialChecks[0].candidates=[row()];});
 r=recordDecision(r,row().record,{status:'confirmed',note:'Identifiers agree; restrictions require separate consideration'},at);
 const next=recordAssessment(r,{...conclusion,reason:'Matched identity; referred the applicable restrictions to the compliance lead.'},at);
 assert.equal(assessmentSummary(next,{now:at}).label,'Review recorded');assert.match(assessmentSummary(next,{now:at}).note,/Not client approval/);
});
test('Missing IDs, missing rows, inconsistent counts and result limits block final review',()=>{
 for(const mutate of [
  r=>{r.research.officialChecks[0].matchCount=1;},
  r=>{r.research.officialChecks[0].matchCount=1;r.research.officialChecks[0].candidates=[{record:{name:'No ID'}}];},
  r=>{r.research.officialChecks[0].candidates=[row()];},
  r=>{r.research.officialChecks[0].atLimit=true;},
  r=>{r.research.officialChecks[0].matchCount=1;r.research.officialChecks[0].candidates=[null];}
 ])assert.equal(assessmentSummary(change(report(),mutate),{now:at}).canRecord,false);
});
test('Provider failures and requested relationship gaps are not optional coverage',()=>{
 for(const status of ['failed','cancelled','pending','running','partial'])assert.equal(assessmentSummary(change(report(),r=>{r.research.opensanctions={status};}),{now:at}).canRecord,false);
 const r=change(report(),r=>{r.research.opensanctions={status:'completed',possibleMatches:0,candidates:[],relationshipStatus:'partial'};});
 assert.ok(assessmentSummary(r,{now:at}).gaps.some(g=>g.code==='provider_relationships'));
});
test('Possible provider matches are distinct from all returned candidates',()=>{
 let r=change(report(),r=>{r.research.opensanctions={status:'completed',possibleMatches:0,returnedCandidates:1,candidates:[{id:'provider-fixture',name:'Other candidate',possibleMatch:false}]};});
 assert.ok(!assessmentSummary(r,{now:at}).gaps.some(g=>g.code==='opensanctions_evidence'));
 assert.equal(assessmentSummary(r,{now:at}).progress.open,1);
 r=recordDecision(r,{id:'opensanctions:provider-fixture',name:'Other candidate'},{status:'dismissed',note:'Different identity'},at);
 assert.equal(assessmentSummary(r,{now:at}).canRecord,true);
 r.research.opensanctions.returnedCandidates=2;assert.equal(assessmentSummary(r,{now:at}).canRecord,false);
});
test('World Bank, company identity, web sections and changed web context require completed evidence',()=>{
 const mutators=[r=>{r.research.worldbank={status:'failed'};},r=>{r.query.type='entity';r.research.gleif={status:'failed'};},r=>{r.query.type='entity';r.research.gleif={status:'completed',totalResults:2,candidates:[]};},r=>{r.research.mode='deep';r.research.phases=[];},r=>{r.research.mode='deep';r.research.researchNeedsRefresh=true;r.research.phases=['identity','media','ownership'].map(id=>({id,status:'completed'}));}];
 for(const fn of mutators)assert.equal(assessmentSummary(change(report(),fn),{now:at}).canRecord,false);
});
test('Completed web labels without findings and usable citations cannot hide missing evidence',()=>{
 const phases=['identity','media','ownership'].map(id=>({id,status:'completed',text:'Synthetic finding. Identity is unresolved.',citations:[{url:'https://example.org/fixture'}]}));
 const r=change(report(),r=>{r.research.mode='deep';r.research.phases=phases;});
 assert.equal(assessmentSummary(r,{now:at}).canRecord,true);
 const noSources=change(r,r=>{r.research.phases[0].citations=[{url:'javascript:alert(1)'}];});
 assert.ok(assessmentSummary(noSources,{now:at}).gaps.some(g=>g.code==='research_evidence:identity'));
});
test('Draft input is never treated as a recorded assessment',()=>{
 const r=change(report(),r=>{r.assessmentDraft={...conclusion};});assert.equal(assessmentSummary(r,{now:at}).recorded,null);
 const next=recordAssessment(r,conclusion,at);assert.equal(next.assessmentDraft,null);assert.equal(r.assessmentDraft.status,'review_recorded');
});
test('Assessment transitions append without rewriting or mutating previous events',()=>{
 const initial=report(),first=recordAssessment(initial,{...conclusion,status:'needs_information'},at),before=structuredClone(first);
 const second=recordAssessment(first,conclusion,later),third=recordAssessment(second,{...conclusion,status:'open',reason:'Reopened for another identifier',nextReviewDate:''},later);
 assert.deepEqual(first,before);assert.equal(second.assessmentLog.length,2);assert.equal(third.assessmentLog.length,3);
 assert.equal(third.assessmentLog[0].status,'needs_information');assert.equal(third.assessmentLog[1].status,'review_recorded');
 assert.equal(assessmentSummary(third,{now:later}).status,'open');
 assert.equal(recordAssessment(third,{...conclusion,status:'open',reason:'Reopened for another identifier',nextReviewDate:''},later),third);
});
test('Changed names, source evidence and decisions reopen the saved outcome',()=>{
 let r=change(report(),r=>{r.research.officialChecks[0].matchCount=1;r.research.officialChecks[0].candidates=[row()];});
 r=recordDecision(r,row().record,{status:'dismissed',note:'Different known identifier'},at);
 const saved=recordAssessment(r,conclusion,at);
 for(const mutate of [r=>{r.query.country='Cyprus';},r=>{r.research.officialChecks[0].candidates[0].record.datesOfBirth=['1971-02-01'];},r=>{r.decisions['eu:fixture'].status='investigate';},r=>{r.research.officialChecks[0].status='failed';}]){
  const updated=change(saved,mutate),s=assessmentSummary(updated,{now:at});assert.equal(s.stale,true);assert.equal(s.status,'open');assert.equal(s.recorded.status,'review_recorded');assert.deepEqual(updated.assessmentLog,saved.assessmentLog);
 }
});
test('Receipt clocks, portraits, notes, comparison and UI selections do not invalidate a review',()=>{
 const saved=recordAssessment(report(),conclusion,at);
 const cosmetic=change(saved,r=>{r.research.officialChecks[0].checkedAt=later;r.research.completedAt=later;r.updatedAt=later;r.photos={provider:{url:'https://example.org/a.png'}};r.selectedCandidate='x';r.notes='Working note';r.comparison={added:[]};});
 assert.equal(assessmentEvidenceKey(cosmetic),assessmentEvidenceKey(saved));assert.equal(assessmentSummary(cosmetic,{now:at}).stale,false);
});
test('Next review dates validate calendar dates and evaluate in Cyprus time',()=>{
 for(const nextReviewDate of ['2026-02-30','2026-13-01','2026-10-13','tomorrow'])assert.throws(()=>recordAssessment(report(),{...conclusion,nextReviewDate},at),/date/);
 const saved=recordAssessment(report(),conclusion,at);
 assert.equal(assessmentSummary(saved,{now:'2026-10-14T20:59:00Z'}).due,false);
 assert.equal(assessmentSummary(saved,{now:'2026-10-14T21:00:00Z'}).due,true);
 assert.equal(assessmentSummary(saved,{now:'2026-10-14T21:00:00Z'}).overdue,false);
 assert.equal(assessmentSummary(saved,{now:'2026-10-15T21:00:00Z'}).overdue,true);
});
test('Imported outcomes without attestations cannot bypass completion checks',()=>{
 const saved=recordAssessment(report(),conclusion,at);saved.assessmentLog[0].findingsReviewed=false;
 const s=assessmentSummary(saved,{now:at});assert.equal(s.status,'open');assert.equal(s.stale,true);
 assert.equal(validAssessmentEvent({...saved.assessmentLog[0],status:'approved'}),false);
 assert.equal(validAssessmentEvent({...saved.assessmentLog[0],reviewer:''}),false);
 assert.equal(validAssessmentEvent({...saved.assessmentLog[0],nextReviewDate:'2026-02-30'}),false);
});
test('Form escapes reviewer content and exposes compact, labelled controls',()=>{
 const saved=recordAssessment(report(),{...conclusion,reason:'<img src=x onerror=evil()>',reviewer:'<script>bad()</script>'},at);
 const html=assessmentFormHTML(saved,{now:at});assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 assert.match(html,/data-sc-assessment-form/);assert.match(html,/name="findingsReviewed"/);assert.match(html,/Reviewer name/);assert.match(html,/not authenticated/);
 const blocked=assessmentFormHTML(change(report(),r=>{r.research.officialChecks[0].status='failed';}),{now:at});assert.match(blocked,/<option value="review_recorded" disabled>/);
});
console.log(`${passed} assessment workflow scenarios passed. Synthetic local fixtures; no network calls or independent accuracy claims.`);
