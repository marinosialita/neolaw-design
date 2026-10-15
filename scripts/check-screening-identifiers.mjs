import assert from 'node:assert/strict';
import {searchRecords} from '../modules/screening-engine.js';
import {explainMatch,prioritizeMatches} from '../modules/screening-match.js';
import {identifierValues} from '../modules/screening-identifiers.js';
import {executiveSummary,passportCoverage} from '../modules/research-evidence.js';
const query={name:'Example Individual',type:'person',passportNumber:'AB 001-122',dob:'1970-04-08'};
const record=(id,name,extra={})=>({id,sourceId:'eu',name,type:'person',aliases:[],countries:[],datesOfBirth:[],...extra});
const run=records=>searchRecords({sources:[{id:'eu',status:'available'}],records},query);
let passed=0;const check=(label,fn)=>{fn();passed++;console.log('PASS '+label);};
check('Exact passport can retrieve a different name without confirming identity',()=>{
 const r=run([record('one','Different Name',{passportNumbers:['AB001122'],datesOfBirth:['1980-01-01']})]);
 assert.equal(r.totalMatches,1);assert.equal(r.matches[0].identifierMatch,'passportNumber');assert.equal(r.identifierChecks.passportNumber.exactMatches,1);
 const review=explainMatch(r.matches[0],query);assert.match(review.why,/alone does not confirm/);assert.ok(review.comparisons.some(c=>c.label==='Name'&&c.status==='review'));assert.ok(review.comparisons.some(c=>c.label==='Passport number'&&c.status==='match'));assert.equal(review.conflicts,1);
});
check('A differing passport never silently drops a matching name',()=>{
 const r=run([record('one',query.name,{passportNumbers:['ZZ99999']})]);assert.equal(r.totalMatches,1);assert.match(r.matches[0].signals.join(' '),/Passport number differs/);assert.equal(explainMatch(r.matches[0],query).comparisons.find(c=>c.label==='Passport number').status,'review');
});
check('Missing passport stays missing; bare numbers, tax IDs and national IDs are not passports',()=>{
 const rec=record('one',query.name,{identifiers:['AB001122','National ID: AB001122','Tax ID: AB001122']});
 assert.deepEqual(identifierValues(rec,'passportNumber'),[]);const r=run([rec]);assert.equal(r.identifierChecks.passportNumber.status,'not_available');assert.equal(explainMatch(r.matches[0],query).comparisons.find(c=>c.label==='Passport number').status,'missing');
});
check('Legacy labelled passports are compared as whole numbers, retaining leading zeroes',()=>{
 assert.equal(run([record('one','Different Name',{identifiers:['Passport: AB001122: Fictionland']})]).totalMatches,1);
 assert.equal(run([record('one','Different Name',{passportNumbers:['AB0011223']})]).totalMatches,0);
 assert.equal(run([record('one','Different Name',{passportNumbers:['AB1122']})]).totalMatches,0);
});
check('Company number retrieves the company and remains a jurisdiction-dependent identity lead',()=>{
 const q={name:'Example Company',type:'entity',registrationNumber:'HE 001122'};
 const result=searchRecords({sources:[{id:'eu',status:'available'}],records:[{...record('one','Different Company'),type:'entity',registrationNumbers:['HE001122']}]},q);
 assert.equal(result.totalMatches,1);assert.equal(result.matches[0].identifierMatch,'registrationNumber');assert.match(explainMatch(result.matches[0],q).why,/jurisdiction/);
});
check('Identifier matches remain first when the display prioritizes name matches',()=>{
 const result=run([record('name',query.name),record('passport','Different Name',{passportNumbers:['AB001122']})]);assert.equal(prioritizeMatches(result.matches,query)[0].record.id,'passport');
});
check('Source receipts and provider echoes distinguish passport checks from name checks',()=>{
 const checks=['eu','ofac','un','uk','cy','bis','au','ca','ch'].map(id=>({id,status:'completed',matchCount:0}));
 const job={mode:'search',status:'completed',officialChecks:checks};let report={query,research:job};
 assert.equal(executiveSummary(report).incomplete,true);assert.match(passportCoverage(job,query).text,/No official passport comparison recorded/);
 checks[0].identifierChecks={passportNumber:{status:'compared',exactMatches:0}};assert.equal(passportCoverage(job,query).checked,1);
 job.opensanctions={status:'completed',possibleMatches:0,parsedQuery:{properties:{passportNumber:['AB001122']}}};assert.equal(passportCoverage(job,query).providerAccepted,true);assert.match(executiveSummary(report).items.find(i=>i.label==='Passport').text,/name-only checks/);
 job.opensanctions.status='failed';assert.equal(passportCoverage(job,query).providerAccepted,false);
});
console.log(`${passed} identifier checks passed. Synthetic records only.`);
