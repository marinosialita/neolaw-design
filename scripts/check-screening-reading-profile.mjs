import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {officialReadingHTML,sourceReadingHTML,phaseReadingHTML,sourceButtons} from '../modules/screening-reading.js';
import {providerSource} from '../modules/screening-provider.js';
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
const documentFor=html=>parseHTML(`<html><body><aside class="sc-reader">${html}</aside></body></html>`).document;
const baseRecord={id:'synthetic-1',name:'Example Person',sourceId:'eu',type:'person',aliases:[],countries:['CY'],datesOfBirth:['1980-01-01'],passportNumbers:['AA001122'],programs:['Example programme']};
const query={name:'Example Person',type:'person',country:'Cyprus',dob:'1980-01-01',passportNumber:'AA 001-122'};
let passed=0;
function check(label,fn){fn();passed++;console.log('PASS '+label);}
check('An exact passport hit keeps name and birth-date differences visible without a misleading name score',()=>{
 const doc=documentFor(officialReadingHTML({record:{...baseRecord,name:'Different Person',datesOfBirth:['1990-01-01']},identifierMatch:'passportNumber',matchKind:'Exact passport number',score:0},null,query));
 assert.match(doc.body.textContent,/passport number matches a published identifier/);
 assert.match(doc.body.textContent,/2 differ/);assert.match(doc.body.textContent,/name, date of birth/);
 assert.match(doc.body.textContent,/Not identity confirmation/);assert.doesNotMatch(doc.body.textContent,/0% name similarity/);
 assert.equal(doc.querySelectorAll('.sc-compare-row.review').length,2);assert.ok(doc.querySelector('[data-sc-review-identity]'));
});
check('Missing passport data stays distinct from a conflicting published number',()=>{
 const missing=documentFor(officialReadingHTML({record:{...baseRecord,passportNumbers:[]},score:100},null,query));
 const conflict=documentFor(officialReadingHTML({record:{...baseRecord,passportNumbers:['ZZ998877']},score:100},null,query));
 assert.match(missing.querySelector('.sc-compare-row:last-child').textContent,/Needs detail.*Not supplied by source/s);
 assert.match(conflict.querySelector('.sc-compare-row:last-child').textContent,/Differs \/ review.*ZZ998877/s);
 assert.match(conflict.body.textContent,/Resolve the different passport number/);
});
check('Relevant findings precede review actions; full method and aliases remain expandable',()=>{
 const doc=documentFor(officialReadingHTML({record:{...baseRecord,aliases:['Example Alias']},score:95},null,query));
 const content=doc.body.textContent;assert.ok(content.indexOf('What was found')<content.indexOf('What to check next'));
 const method=[...doc.querySelectorAll('details')].find(el=>el.textContent.includes('95% name similarity'));
 assert.ok(method);assert.equal(method.hasAttribute('open'),false);assert.match(method.textContent,/not identity or risk/);
 assert.equal([...doc.querySelectorAll('details')].find(el=>el.textContent.includes('Other names')).hasAttribute('open'),false);
});
check('Source-supplied markup and unsafe links cannot execute',()=>{
 const payload='<img src=x onerror="bad()"><script>bad()</script>';
 const doc=documentFor(officialReadingHTML({record:{...baseRecord,name:payload,reasons:payload,aliases:[payload],legalSources:['javascript:alert(1)','https://example.org/entry']},score:90},null,{...query,name:payload}));
 assert.equal(doc.querySelector('script,img'),null);assert.equal(doc.querySelector('a[href^="javascript:"]'),null);
 assert.match(doc.body.textContent,/<script>/);assert.equal(doc.querySelector('a').getAttribute('rel'),'noopener noreferrer');
});
check('Official source dates are visible and absent dates are not invented',()=>{
 const doc=documentFor(officialReadingHTML({record:baseRecord,score:100},{checkedAt:'2026-10-13T06:00:00Z',retrievedAt:'2026-10-12T00:00:00Z'},query));
 assert.match(doc.querySelector('.sc-profile-provenance').textContent,/Checked.*13 Oct 2026.*List retrieved.*12 Oct 2026/s);
 const noDate=documentFor(officialReadingHTML({record:baseRecord},null,query));assert.equal(noDate.querySelector('.sc-profile-provenance'),null);assert.doesNotMatch(noDate.body.textContent,/NaN|Invalid Date|undefined/);
});
check('Provider roles and categories remain visible while duplicate identifiers and score are secondary',()=>{
 const candidate={id:'provider-1',schema:'Person',name:query.name,score:.98,possibleMatch:true,countries:['CY'],birthDates:['1980-01-01'],passportNumbers:['AA001122'],topics:['role.pep'],positions:['Minister of Example Affairs (2012–2014)'],datasets:['example_pep'],url:'https://example.org/profile',lastSeen:'2026-10-12T00:00:00Z'};
 const doc=documentFor(sourceReadingHTML(providerSource(candidate,{status:'completed',checkedAt:'2026-10-13T00:00:00Z'},query)));
 assert.match(doc.body.textContent,/Politically exposed person/);assert.match(doc.body.textContent,/Minister of Example Affairs/);
 assert.doesNotMatch(doc.body.textContent,/Identifiers to compare/);
 const score=[...doc.querySelectorAll('details')].find(el=>el.textContent.includes('98%'));assert.ok(score);assert.equal(score.hasAttribute('open'),false);
 assert.match(doc.body.textContent,/not itself a finding of wrongdoing/);assert.match(doc.querySelector('.sc-profile-provenance').textContent,/Provider last seen/);
});
check('Web citations preserve allegations and distinguish a cited page with no passage from a search lead',()=>{
 const cited=documentFor(sourceReadingHTML({cited:true,passages:[],phases:[]}));
 assert.match(cited.body.textContent,/was cited, but no supporting passage was saved/);assert.doesNotMatch(cited.body.textContent,/No finding cites this page/);
 const lead=documentFor(sourceReadingHTML({cited:false,passages:[],phases:[]}));assert.match(lead.body.textContent,/No finding cites this page/);
 const media=documentFor(sourceReadingHTML({cited:true,passages:[{phaseId:'media',text:'**Contested allegation**; acquitted in 2019. Identity unresolved. [source](https://example.org/news)'}]}));
 assert.match(media.body.textContent,/Contested allegation; acquitted in 2019. Identity unresolved/);assert.match(media.body.textContent,/not quotations or independently verified findings/);
});
check('Research failures and absent sources never read as a successful identity finding',()=>{
 const html=phaseReadingHTML({query,phases:[{id:'identity',status:'partial',text:'Unverified text',warnings:['No usable inline source citations']} ]},'identity');
 const doc=documentFor(html);assert.match(doc.body.textContent,/Partial evidence/);assert.match(doc.body.textContent,/Identity not verified/);assert.match(doc.body.textContent,/No source citations were saved/);assert.match(doc.body.textContent,/Identity has not been confirmed/);
 assert.equal(doc.querySelector('details').hasAttribute('open'),false);
});
check('Company comparison retains registration jurisdiction and limits parent references to their actual meaning',()=>{
 const record={id:'gleif:1',sourceId:'gleif',type:'entity',name:'Example Company',countries:['CY'],registrationNumbers:['HE001122'],lei:'12345678901234567890',entityStatus:'ACTIVE',leiStatus:'ISSUED',parentLinks:[{kind:'direct-parent',relation:'reporting-exception',url:'https://example.org/exception'}]};
 const doc=documentFor(sourceReadingHTML({company:true,match:{record},query:{name:record.name,type:'entity',country:'Cyprus',registrationNumber:'HE 001122'},result:{totalResults:0}}));
 assert.match(doc.body.textContent,/Registration number/);assert.match(doc.body.textContent,/can repeat across jurisdictions/);assert.match(doc.body.textContent,/not been verified as beneficial ownership/);assert.match(doc.body.textContent,/Results0/);assert.doesNotMatch(doc.body.textContent,/Passport number/);
});
check('Procurement outcomes retain release conditions and do not become asset-freeze conclusions',()=>{
 const record={...baseRecord,sourceId:'wb',debarmentStatus:'Cross-debarred',ineligibilityPeriod:'Ongoing',notesReference:'*10',notesUrl:'https://example.org/notes',reasons:'Published procurement grounds'};
 const doc=documentFor(sourceReadingHTML({procurement:true,match:{record},query,result:{recordCount:0,detail:'Table 1 only'}}));
 for(const phrase of ['Cross-debarred','Ongoing','*10','Published procurement grounds','release conditions','not an asset-freeze determination','Table 1 only'])assert.ok(doc.body.textContent.includes(phrase),phrase);
 assert.equal(doc.querySelector('a').href,'https://example.org/notes');
});
check('Non-SDN, export-control and historic entries keep their distinct restrictions',()=>{
 const nonSDN=documentFor(officialReadingHTML({record:{...baseRecord,sourceId:'ofac',programs:['Non-SDN CMIC']},score:100},null,query));assert.match(nonSDN.body.textContent,/do not interpret it as an SDN asset-freeze entry/);
 const bis=documentFor(officialReadingHTML({record:{...baseRecord,sourceId:'bis',programs:[],licensePolicy:'Presumption of denial',endedAt:'2020-01-01'},score:100},null,query));
 assert.match(bis.body.textContent,/not automatically an asset freeze/);assert.match(bis.body.textContent,/Presumption of denial/);assert.match(bis.body.textContent,/Verify whether any restriction remains in force/);
});
check('Source selectors only render safe traceable URLs and preserve evidence-selection hooks',()=>{
 const doc=documentFor(sourceButtons([{key:'good',title:'Original <source>',url:'https://example.org/record'},{key:'bad',title:'Bad',url:'javascript:alert(1)'},{key:'empty',title:'Empty',url:'not a url'}]));
 assert.equal(doc.querySelectorAll('a').length,1);assert.equal(doc.querySelector('a').getAttribute('data-sc-evidence-source'),'good');assert.equal(doc.querySelector('source'),null);
});
console.log(`${passed} reading-profile checks passed. Synthetic fixtures only; no network or paid requests.`);
