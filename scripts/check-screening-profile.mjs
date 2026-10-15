import assert from 'node:assert/strict';
import {profileHeaderHTML,profileComparisonHTML,profileViewModel,profileRecords,profileSections} from '../modules/screening-profile.js';

let passed=0;
function check(label,test){test();passed++;console.log(`PASS ${label}`);}
const checkedAt='2026-10-13T08:00:00Z';
const record=(id,sourceId='eu',other={})=>({record:{id,sourceId,name:'Alex Morgan',type:'person',aliases:[],countries:['Cyprus'],datesOfBirth:['1980-01-01'],sourceUrl:'https://example.org/official/'+id,...other},score:100,matchKind:'Exact name',nameMatched:'Alex Morgan'});
const official=(entries=[])=>['eu','ofac','un','uk','cy','bis','au','ca','ch'].map(id=>({id,status:'completed',matchCount:entries.filter(e=>e.record.sourceId===id).length,candidates:entries.filter(e=>e.record.sourceId===id),checkedAt}));
const report=(entries=[])=>({id:'test-current',query:{name:'Alex Morgan',type:'person',country:'Cyprus',dob:'1980-01-01',mode:'search'},createdAt:checkedAt,requiresOfficial:true,matches:entries,totalMatches:entries.length,decisions:{},research:{schemaVersion:6,status:'completed',mode:'search',officialChecks:official(entries),opensanctions:{status:'not_configured'},phases:[]}});

check('identical names remain separate source records and the header contains only supplied identity',()=>{
  const r=report([record('eu:a'),record('eu:b','eu',{datesOfBirth:['1995-02-02']}),record('uk:a','uk')]);
  r.research.opensanctions={status:'completed',possibleMatches:1,candidates:[{id:'candidate-1',name:'Alex Morgan',birthDates:['1960-02-02'],countries:['Russia'],topics:['role.pep'],positions:['Mayor'],schema:'Person'}]};
  const model=profileViewModel(r);
  assert.equal(model.records.length,4);
  assert.equal(model.sections.find(s=>s.id==='matches').count,4);
  assert.equal(model.sections.find(s=>s.id==='roles').count,1);
  const header=profileHeaderHTML(r,{showSummary:false});
  assert.match(header,/Supplied identity · not verified/);
  assert.doesNotMatch(header,/1995-02-02|1960-02-02|Mayor|Russia/);
  assert.match(header,/no verified portrait/);
  assert.doesNotMatch(header,/<img/);
});

check('failed checks cannot contribute stale candidates or be shown as a complete negative',()=>{
  const r=report([record('eu:stale')]);
  r.research.officialChecks[0]={id:'eu',status:'failed',matchCount:1,candidates:[record('eu:stale')]};
  r.research.opensanctions={status:'failed',possibleMatches:1,candidates:[{id:'os:stale',name:'Alex Morgan',topics:['role.pep']}]};
  assert.equal(profileRecords(r).length,0);
  assert.equal(profileViewModel(r).summary.incomplete,true);
  assert.match(profileHeaderHTML(r),/Checks incomplete/);
  const roles=profileSections(r).find(s=>s.id==='roles');
  assert.equal(roles.count,null);assert.equal(roles.status,'incomplete');
  assert.match(profileComparisonHTML(r),/missing records do not verify identity or clear the client/);
});

check('passport differences, exact matches and absent source identifiers remain distinct',()=>{
  const r=report([record('eu:match','eu',{passportNumbers:['AB001122']}),record('uk:conflict','uk',{passportNumbers:['AB009999']}),record('un:missing','un')]);
  r.query.passportNumber='AB 001122';
  const html=profileComparisonHTML(r,{initialLimit:1});
  assert.match(html,/AB 001122/);assert.match(html,/AB009999/);assert.match(html,/Not supplied by source/);
  assert.match(html,/is-match/);assert.match(html,/is-review/);assert.match(html,/is-missing/);
  assert.match(html,/Compare 2 more source records/);
  assert.match(html,/<details/);
  assert.equal((html.match(/<article /g)||[]).length,3);
  const header=profileHeaderHTML(r,{showSummary:false});
  assert.doesNotMatch(header,/AB 001122/);assert.match(header,/•••• 1122/);
});

check('passport number agreement does not override a different name or date of birth',()=>{
  const match={...record('eu:identifier','eu',{name:'Different Person',datesOfBirth:['1962-01-01'],passportNumbers:['AB001122']}),score:0,nameMatched:'Different Person',identifierMatch:'passportNumber',matchKind:'Exact passport number'};
  const r=report([match]);r.query.passportNumber='AB001122';
  const html=profileComparisonHTML(r);
  assert.match(html,/this alone does not confirm identity/);
  assert.match(html,/Different Person/);assert.match(html,/1962-01-01/);
  assert.ok((html.match(/is-review/g)||[]).length>=2);
  assert.doesNotMatch(html,/100%|Confirmed identity/);
});

check('historical records, stored review decisions and report dates stay unchanged',()=>{
  const r=report([record('eu:1')]);
  delete r.research.officialChecks[0].candidates;
  r.research.officialChecks.forEach(c=>delete c.candidates);
  r.previousReportId='prior-report';r.createdAt='2025-01-01T12:00:00Z';
  r.decisions={'eu:1':{status:'dismissed',reviewer:'Reviewer',note:'DOB differs'}};
  const original=JSON.stringify(r),model=profileViewModel(r),html=profileComparisonHTML(r);
  assert.equal(model.records.length,1);assert.equal(model.previousReportId,'prior-report');
  assert.match(model.date,/1 Jan 2025/);assert.match(html,/Different identity/);
  assert.match(profileHeaderHTML(r),/Linked follow-up check/);
  assert.equal(profileViewModel({...r,research:{...r.research,retryOf:'previous-job'}}).mode,'Source retry');
  assert.equal(JSON.stringify(r),original);
});
check('mixed historical and refreshed source receipts retain the same candidate set across profile and comparison',()=>{
  const kept=record('eu:kept'),removed=record('uk:removed','uk');
  const r=report([kept,removed]);
  delete r.research.officialChecks.find(c=>c.id==='eu').candidates;
  r.research.officialChecks.find(c=>c.id==='uk').candidates=[];
  r.research.officialChecks.find(c=>c.id==='uk').matchCount=0;
  const ids=profileRecords(r).map(entry=>entry.id);
  assert.deepEqual(ids,['eu:kept']);
  assert.match(profileComparisonHTML(r),/eu:kept/);assert.doesNotMatch(profileComparisonHTML(r),/uk:removed/);
});

check('no research reports do not present unsearched media or PEP as zero findings',()=>{
  const r={id:'old',query:{name:'Alex Morgan'},createdAt:checkedAt,matches:[],sourceSnapshots:[]};
  const sections=profileSections(r);
  assert.equal(sections.find(s=>s.id==='media').count,null);
  assert.equal(sections.find(s=>s.id==='media').status,'not_searched');
  assert.equal(sections.find(s=>s.id==='roles').count,null);
  assert.equal(profileViewModel(r).summary.incomplete,true);
  assert.match(profileHeaderHTML(r),/Checks incomplete/);
});

check('company numbers and LEIs compare by record without implying beneficial ownership',()=>{
  const r=report([]);r.query={name:'Example Company Ltd',type:'entity',country:'Cyprus',registrationNumber:'HE 00123',lei:'TESTLEI123',mode:'search'};
  r.research.gleif={status:'completed',totalResults:1,candidates:[record('lei:1','gleif',{name:'Example Company Ltd',type:'entity',registrationNumbers:['HE00123'],lei:'TESTLEI123',parentLinks:[{url:'https://api.gleif.org/parent'}]})]};
  const html=profileComparisonHTML(r),header=profileHeaderHTML(r,{showSummary:false});
  assert.match(html,/Registration number/);assert.match(html,/HE00123/);assert.match(header,/HE 00123/);
  assert.equal(profileRecords(r)[0].kind,'company');
  assert.match(profileSections(r).find(s=>s.id==='connections').description,/not complete beneficial ownership/);
});

check('source counts deduplicate web URLs without counting search leads as corroboration',()=>{
  const r=report([]);r.query.mode='deep';r.research.mode='deep';
  r.research.phases=[{id:'media',status:'completed',citations:[{url:'https://news.example/story?utm_source=x'},{url:'https://news.example/story'}],sources:[{url:'https://other.example/lead'}]},{id:'ownership',status:'partial',citations:[{url:'https://registry.example/record'}]}];
  const sections=profileSections(r);
  assert.equal(sections.find(s=>s.id==='media').count,1);
  assert.equal(sections.find(s=>s.id==='connections').count,1);
  assert.equal(sections.find(s=>s.id==='connections').status,'incomplete');
  assert.equal(sections.find(s=>s.id==='sources').count,11);
  assert.match(sections.find(s=>s.id==='sources').description,/1 unverified search leads/);
});

check('interrupted research preserves cited evidence while marking incomplete coverage',()=>{
  const r=report([]);r.research.status='interrupted';r.research.mode='deep';
  r.research.phases=[{id:'media',status:'interrupted',citations:[{url:'https://example.org/article'}]}];
  const media=profileSections(r).find(s=>s.id==='media');
  assert.equal(media.count,1);assert.equal(media.status,'incomplete');
  assert.match(profileHeaderHTML(r),/Checks incomplete/);
});

check('safe escaping and URL validation apply to subject, record and provenance',()=>{
  const r=report([record('eu:<script>','eu',{name:'<img src=x onerror=1>',sourceUrl:'javascript:alert(1)',passportNumbers:['<svg onload=1>']})]);
  r.query.name='<script>alert(1)</script>';r.query.passportNumber='TEST';
  const html=profileHeaderHTML(r)+profileComparisonHTML(r);
  assert.doesNotMatch(html,/<script>|<img|<svg onload|href="javascript:/);
  assert.match(html,/&lt;script&gt;/);assert.match(html,/Original link not saved/);
});

check('navigation has stable section contracts and supports a summary-free header',()=>{
  const r=report([]),html=profileHeaderHTML(r,{showSummary:false,activeSection:'sources'});
  assert.deepEqual(profileSections(r).map(s=>s.id),['overview','matches','roles','media','connections','sources']);
  for(const id of ['overview','matches','roles','media','connections','sources'])assert.match(html,new RegExp(`data-sc-section="${id}"`));
  assert.match(html,/data-sc-section="sources" aria-pressed="true"/);
  assert.doesNotMatch(html,/sc-profile-outcome|What to do next/);
});

check('duplicate IDs deduplicate only within a source; unlabeled records remain distinct',()=>{
  const r=report([record('one'),record('one'),record('one','uk'),record('','un'),record('','un')]);
  assert.equal(profileRecords(r).length,4);
  const immutable=JSON.stringify(r);profileHeaderHTML(r);profileComparisonHTML(r);assert.equal(JSON.stringify(r),immutable);
});

console.log(`\n${passed} profile checks passed. Synthetic fixtures only; no accuracy claim or provider requests.`);
