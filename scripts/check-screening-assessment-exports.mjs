import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {officialPortals} from '../modules/screening-view-model.js';
import {recordAssessment} from '../modules/screening-assessment.js';
import {assessmentExportSummary,buildReportHTML,preparePDFReport,exportReportJSON} from '../modules/screening-export.js';
const folder=new URL('../work/pre-api-hardening/',import.meta.url);fs.mkdirSync(folder,{recursive:true});
const when='2026-10-14T03:00:00Z';
export function fixture(){
 const report={id:'synthetic-case-review-example',createdAt:when,query:{name:'SYNTHETIC REVIEW EXAMPLE',type:'person',country:'Cyprus'},requiresOfficial:true,notes:'Synthetic demonstration only. This is not a real person or a screening result.',matches:[],totalMatches:0,sourceSnapshots:[],decisions:{},research:{schemaVersion:7,mode:'search',status:'partial',query:{name:'SYNTHETIC REVIEW EXAMPLE',type:'person',country:'Cyprus'},officialChecks:officialPortals.map(p=>({...p,status:'completed',matchCount:0,candidates:[],checkedAt:when,method:p.id==='cy'?'live_portal':'official_dataset'})),opensanctions:{status:'not_configured'},worldbank:{status:'completed',totalResults:0,candidates:[]},gleif:{status:'not_applicable'},phases:[]}};
 report.research.officialChecks[0].status='failed';report.research.officialChecks[0].error='Synthetic transport failure.';
 let reviewed=recordAssessment(report,{status:'needs_information',reviewer:'Demonstration reviewer',reason:'The EU check failed in this synthetic example. Retry the missing source before concluding this scoped review.',nextReviewDate:'2026-10-16',findingsReviewed:false},when);
 reviewed=structuredClone(reviewed);reviewed.research.officialChecks[0].status='completed';delete reviewed.research.officialChecks[0].error;reviewed.research.status='completed';
 return recordAssessment(reviewed,{status:'review_recorded',reviewer:'Demonstration reviewer',reason:'All nine official checks and the World Bank check completed in this synthetic example. No candidate entries were returned. PEP provider coverage, wider web research and ownership verification remain outside the scope of this saved check; this is not client approval.',nextReviewDate:'2026-10-16',findingsReviewed:true},'2026-10-14T03:10:00Z');
}
const initial=fixture(),before=structuredClone(initial),stale=structuredClone(initial);
stale.research.officialChecks[1].status='failed';stale.research.officialChecks[1].error='Synthetic later interruption.';
const changed=assessmentExportSummary(stale,{now:when});assert.equal(changed.status,'open');assert.equal(changed.label,'Review needs updating');assert.equal(changed.recorded.status,'review_recorded');
const html=buildReportHTML(stale);
for(const value of ['Case review outcome','Review needs updating','Previous recorded outcome','No candidate entries were returned','Outcome history · 2 saved revisions','Scope when recorded','not authenticated','Next review'])assert.ok(html.includes(value),value);
const hostile=structuredClone(initial);hostile.assessmentLog[0].reason='<script>bad()</script>';
assert.ok(!buildReportHTML(hostile).includes('<script>bad()'));assert.ok(buildReportHTML(hostile).includes('&lt;script&gt;'));
const deep=structuredClone(initial);delete deep.assessmentLog;deep.research.mode='deep';
deep.research.phases=['identity','media','ownership'].map(id=>({id,title:id,status:'completed',text:'| Field | Finding |\n| --- | --- |\n| Identity | Unresolved [1] |\n',citations:[{url:'https://example.org/synthetic',title:'Synthetic citation',start:54,end:57}],summary:{finding:'Synthetic finding; identity remains unresolved.'}}));
const deepReviewed=recordAssessment(deep,{status:'review_recorded',reviewer:'Synthetic reviewer',reason:'Completed-source review; unresolved web identity is not attributed to the client.',findingsReviewed:true},when),prepared=preparePDFReport(deepReviewed);
assert.notEqual(prepared.research.phases[0].text,deepReviewed.research.phases[0].text);
assert.deepEqual(prepared.assessmentLog,deepReviewed.assessmentLog);assert.deepEqual(prepared.assessmentOriginalPhases[0].citations,deepReviewed.research.phases[0].citations);
const bridge=spawnSync(process.execPath,[new URL('./screening-assessment-summary.mjs',import.meta.url).pathname],{input:JSON.stringify(prepared),encoding:'utf8'});assert.equal(bridge.status,0,bridge.stderr);assert.equal(JSON.parse(bridge.stdout).stale,false,'PDF table formatting must not stale a valid review');
// Exercise the actual evidence-download payload using detached local objects.
let blob;const oldDocument=globalThis.document,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldTimeout=globalThis.setTimeout;
try{
 URL.createObjectURL=value=>(blob=value,'blob:fixture');URL.revokeObjectURL=()=>{};globalThis.setTimeout=()=>0;
 globalThis.document={createElement:()=>({click(){},remove(){}}),body:{append(){}}};
 assert.equal(exportReportJSON(stale),true);const json=JSON.parse(await blob.text());
 assert.equal(json.caseReview.status,'open');assert.equal(json.caseReview.stale,true);assert.deepEqual(json.assessmentLog,stale.assessmentLog);
 assert.equal(json.schema,'neolaw.screening-report.v1');assert.equal(json.caseReview.log.length,2);
}finally{globalThis.document=oldDocument;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;globalThis.setTimeout=oldTimeout;}
assert.deepEqual(initial,before,'Export must not mutate the original evidence or outcome history');
fs.writeFileSync(new URL('assessment-current.json',folder),JSON.stringify(initial,null,2));
fs.writeFileSync(new URL('assessment-stale.json',folder),JSON.stringify(stale,null,2));
fs.writeFileSync(new URL('assessment-pdf-payload.json',folder),JSON.stringify(prepared,null,2));
fs.writeFileSync(new URL('assessment-outcome.html',folder),buildReportHTML(initial));
console.log('PASS 7 export scenarios: effective stale status, full HTML history, escaping, unchanged PDF table evidence, immutable events, actual JSON payload, explicit local-review scope. Synthetic data only.');
