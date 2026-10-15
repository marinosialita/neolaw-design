import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildReportHTML,preparePDFReport,downloadPDF,downloadReport,downloadSnapshot,exportReportJSON} from '../modules/screening-export.js';

// Inert DOM and download callback tests only. Native print/raster output still requires browser QA.
// Setup: npm install --prefix /tmp/neolaw-export-check --ignore-scripts --no-save --no-audit --no-fund linkedom@0.18.13
const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.NEOLAW_EXPORT_DOM||'/tmp/neolaw-export-check/node_modules/linkedom');
const original=Object.fromEntries(['document','window','setTimeout'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const createURL=URL.createObjectURL,revokeURL=URL.revokeObjectURL;
const originalNow=Date.now;
Date.now=()=>Date.parse('2026-10-12T09:00:00Z');
const {document,window}=parseHTML('<html><body></body></html>');
const originalClick=window.HTMLAnchorElement.prototype.click;
const blobs=new Map(),downloads=[],timers=[];
let sequence=0,passed=0;
Object.defineProperty(globalThis,'document',{configurable:true,value:document});
Object.defineProperty(globalThis,'window',{configurable:true,value:window});
Object.defineProperty(globalThis,'setTimeout',{configurable:true,value:callback=>{timers.push(callback);return timers.length;}});
URL.createObjectURL=blob=>{const url=`blob:screening-${++sequence}`;blobs.set(url,blob);return url;};
URL.revokeObjectURL=url=>blobs.delete(url);
window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.getAttribute('download'),blob:blobs.get(this.href)});};
const report={
  id:'screen-2026-0001',query:{name:'Ανδρέας Example',type:'Person',country:'Cyprus',dob:'1970-02-03',projectId:'matter-1'},projectName:'Client intake',createdAt:'2026-10-12T08:15:00Z',
  sourceSnapshots:[
    {id:'eu',name:'European Union',status:'available',retrievedAt:'2026-10-12T07:00:00Z',publishedAt:'2026-10-10',recordCount:4200,url:'https://example.test/eu'},
    {id:'un',name:'United Nations',status:'available',retrievedAt:'2026-10-12T07:01:00Z',publishedAt:'2026-10-09',recordCount:700,url:'https://example.test/un'},
    {id:'uk',name:'United Kingdom',status:'unavailable',error:'The source could not be downloaded.',url:'https://example.test/uk'},
    {id:'ofac',name:'US OFAC',status:'available',retrievedAt:'2026-10-12T07:03:00Z',publishedAt:'2026-10-11',recordCount:18000,url:'https://example.test/us'}
  ],
  matches:[
    {record:{id:'eu-123',sourceId:'eu',name:'Andreas Example',type:'Individual',aliases:['Ανδρέας Example'],countries:['Cyprus'],datesOfBirth:['1970-02-03'],identifiers:[{type:'Passport',value:'XX123'}],programs:['Listed regime'],restrictions:['Asset freeze','Travel Ban'],reasons:'Reason recorded by the source.',listedAt:'2020-01-02',updatedAt:'2026-10-10',addresses:['Nicosia'],sourceUrl:'https://example.test/eu/123'},score:0.87,matchKind:'Alias match',nameMatched:'Ανδρέας Example',signals:['Name and birth date agree']},
    {record:{id:'un-456',sourceId:'un',name:'Andreas E.',aliases:[],countries:['Other country'],sourceUrl:'https://example.test/un/456'},score:82,matchKind:'Similar spelling',signals:['Country differs']}
  ],totalMatches:2,decisions:{'eu-123':{status:'investigate',note:'Check identity documents.',at:'2026-10-12T08:20:00Z'},'un-456':{status:'dismissed',note:'Different person confirmed from birth date.',at:'2026-10-12T08:21:00Z'}},notes:'Review pending identification evidence.'
};
const research={
  id:'research-2026-0001',status:'partial',query:{name:'Ανδρέας Example',country:'Cyprus'},model:'provider-model',startedAt:'2026-10-12T08:30:00Z',completedAt:'2026-10-12T08:32:00Z',
  phases:[
    {id:'identity',title:'Identity and public roles',status:'completed',startedAt:'2026-10-12T08:30:00Z',completedAt:'2026-10-12T08:31:00Z',text:'An official source identifies a director. A matching name is not a confirmed identity.',citations:[{url:'https://example.test/register',title:'Official register',start:0,end:41}],sources:[{url:'https://example.test/register',title:'Official register'},{url:'https://example.test/archive',title:'Search archive'}]},
    {id:'media',title:'Public reporting',status:'failed',startedAt:'2026-10-12T08:31:00Z',completedAt:'2026-10-12T08:32:00Z',text:'',citations:[],sources:[],error:'The search provider timed out.'}
  ],error:'One research stage did not finish.'
};
const parse=html=>parseHTML(html).document;
async function check(label,run){try{await run();passed++;console.log('PASS '+label);}catch(error){process.exitCode=1;console.error('FAIL '+label+' '+error.message);}}
try{

  await check('Procurement HTML and JSON preserve scope and all records without counting them as sanctions',async()=>{
    const worldbank={status:'completed',totalResults:1,candidates:[{score:100,record:{sourceId:'wb',name:'Test <company>',debarmentStatus:'Cross-debarred',listedAt:'2024-01-01',ineligibilityPeriod:'Ongoing',notesReference:'*10',reasons:'Published grounds & qualifiers',sourceUrl:'https://documents.worldbank.org/list',notesUrl:'https://thedocs.worldbank.org/notes.pdf'}}]};
    const value={...report,research:{mode:'search',schemaVersion:7,worldbank}};
    const root=parse(buildReportHTML(value));for(const text of ['World Bank / Procurement','Test <company>','*10','Published grounds & qualifiers','Ongoing','Table 2'])assert.ok(root.body.textContent.includes(text),text);
    assert.equal(root.querySelector('company'),null);assert.equal(exportReportJSON(value),true);assert.deepEqual(JSON.parse(await downloads.at(-1).blob.text()).research.worldbank,worldbank);
    for(const worldbank of [undefined,{status:'failed'},{status:'completed',totalResults:0,candidates:[{}]}]){
      const text=parse(buildReportHTML({...value,research:{...value.research,worldbank}})).body.textContent;
      assert.match(text,/Checks incomplete/);assert.doesNotMatch(text,/0 possible matches;|undefined possible/);
    }
  });
  await check('Printable report retains query, all source dates, evidence, match decisions and reviewer notes',()=>{
    const root=parse(buildReportHTML(report)),content=root.body.textContent;
    for(const expected of ['Ανδρέας Example','Client intake','Cyprus','1970-02-03','12 Oct 2026','10 Oct 2026','9 Oct 2026','11 Oct 2026','4,200','18,000','XX123','Listed regime','Restrictions','Asset freeze','Travel Ban','Reason recorded by the source.','Check identity documents.','Different person confirmed from birth date.','Review pending identification evidence.','0.87 (0–1 scale)','82 (reported score)'])assert.ok(content.includes(expected),expected);
    assert.equal(root.querySelectorAll('.match').length,2);assert.equal(root.querySelectorAll('.source-coverage-table tbody tr').length,4);
    assert.equal(root.querySelectorAll('.source-link a').length,2);assert.ok(root.querySelector('style').textContent.includes('@media print'));
  });
  await check('Missing sources are prominent and no empty match result becomes clearance',()=>{
    const content=parse(buildReportHTML({...report,matches:[],totalMatches:0})).body.textContent;
    for(const expected of ['Checks incomplete','Unavailable','The source could not be downloaded.','not a client approval','not a live clearance','PEP check','adverse-media search','ownership assessment'])assert.ok(content.includes(expected),expected);
    const available={...report,sourceSnapshots:report.sourceSnapshots.map(s=>({...s,status:'available',retrievedAt:'2026-10-12T07:00:00Z'})),matches:[],totalMatches:0};
    assert.ok(parse(buildReportHTML(available)).body.textContent.includes('Checks incomplete'), 'Legacy four-list evidence cannot prove a five-source check');
    assert.ok(parse(buildReportHTML({})).body.textContent.includes('No source snapshots recorded. Coverage is incomplete.'));
  });
  await check('Stale, invalid and missing required sources agree with UI coverage and remain visible in the JSON audit',async()=>{
    const fresh={...report,sourceSnapshots:report.sourceSnapshots.map(s=>({...s,status:'available',retrievedAt:'2026-10-12T07:00:00Z'}))};
    assert.ok(parse(buildReportHTML(fresh)).querySelector('.metrics').textContent.includes('4 / 4'));
    for(const retrievedAt of ['2026-10-10T08:59:59Z','2999-01-01T00:00:00Z','invalid-date','']){
      const stale={...fresh,sourceSnapshots:fresh.sourceSnapshots.map(s=>s.id==='uk'?{...s,retrievedAt}:s)};
      const root=parse(buildReportHTML(stale));assert.ok(root.querySelector('.summary').textContent.includes('Checks incomplete'));
      assert.ok(root.querySelector('tbody').textContent.includes('Refresh needed'));
      assert.ok(root.querySelector('.metrics').textContent.includes('3 / 4'));
      assert.equal(exportReportJSON(stale),true);const saved=JSON.parse(await downloads.at(-1).blob.text());
      assert.equal(saved.coverageComplete,false);assert.equal(saved.sourceReadiness.find(s=>s.sourceId==='uk').kind,'stale');assert.equal(saved.freshnessEvaluatedAt,'2026-10-12T09:00:00.000Z');
    }
    const missing=parse(buildReportHTML({...fresh,sourceSnapshots:fresh.sourceSnapshots.filter(s=>s.id!=='eu')}));
    assert.equal(missing.querySelectorAll('.source-coverage-table tbody tr').length,4);assert.ok(missing.querySelector('.summary').textContent.includes('Checks incomplete'));
    const boundary=parse(buildReportHTML({...fresh,sourceSnapshots:fresh.sourceSnapshots.map(s=>({...s,retrievedAt:'2026-10-10T09:00:00Z'}))}));assert.ok(boundary.querySelector('.metrics').textContent.includes('4 / 4'));
  });
  await check('All resolved matches show review recorded, while omitted or investigate matches stay pending',()=>{
    const resolved={...report,sourceSnapshots:report.sourceSnapshots.map(s=>({...s,status:'available',retrievedAt:'2026-10-12T07:00:00Z'})),decisions:{'eu-123':{status:'confirmed'},'un-456':{status:'dismissed'}}};
    const root=parse(buildReportHTML(resolved));assert.equal(root.querySelector('.summary strong').textContent,'Review recorded');
    assert.ok(root.body.textContent.includes('Review recorded for every potential match.'));
    assert.equal(parse(buildReportHTML({...resolved,totalMatches:20})).querySelector('.summary strong').textContent,'Potential matches require review');
    assert.equal(parse(buildReportHTML({...resolved,decisions:report.decisions})).querySelector('.summary strong').textContent,'Potential matches require review');
    const incomplete=parse(buildReportHTML({...resolved,sourceSnapshots:report.sourceSnapshots}));assert.equal(incomplete.querySelector('.summary strong').textContent,'Coverage incomplete');assert.ok(incomplete.body.textContent.includes('Review recorded for every potential match.'));
  });
  await check('HTML injection, event attributes, credential URLs and non-web links cannot enter the report',()=>{
    const payload='<img src=x onerror="alert(1)"><script>bad()</script> & "';
    const hostile={...report,query:{name:payload},notes:payload,sourceSnapshots:[{id:'evil',name:payload,status:'unavailable',url:'javascript:alert(1)',error:payload}],matches:[{record:{id:'x',name:payload,sourceId:'evil',sourceUrl:'data:text/html,bad',reasons:payload}}],decisions:{x:{status:'investigate',note:payload}}};
    const root=parse(buildReportHTML(hostile));assert.equal(root.querySelectorAll('img,script,[onerror]').length,0);assert.equal(root.querySelectorAll('a').length,0);assert.ok(root.body.textContent.includes(payload));
    const userURL={...report,matches:[{record:{id:'x',name:'Record',sourceUrl:'https://user:password@example.test/source'}}]};
    assert.equal(parse(buildReportHTML(userURL)).querySelectorAll('.source-link a').length,0);
    assert.equal(root.querySelector('meta[http-equiv="Content-Security-Policy"]').getAttribute('content').includes("default-src 'none'"),true);
  });
  await check('Partial match export discloses included count, while inconsistent low totals use actual evidence count',()=>{
    const partial=parse(buildReportHTML({...report,totalMatches:25})).body.textContent;
    assert.ok(partial.includes('2 of 25 potential matches included.'));
    const invalid=parse(buildReportHTML({...report,totalMatches:0}));assert.equal(invalid.querySelector('.metrics b').textContent,'2');
    assert.equal(parse(buildReportHTML({...report,decisions:{}})).querySelectorAll('.match .tag.warning').length,2);
  });
  await check('Blocked print window returns false without misreporting a download',()=>{
    window.open=()=>null;assert.equal(downloadReport(report),false);
    window.open=()=>{throw Error('Blocked');};assert.equal(downloadReport(report),false);
  });
  await check('Print opens escaped report with isolated opener and reusable native print button',async()=>{
    let printed=0,focused=0,written='';
    const popup={closed:false,opener:{},focus(){focused++;},print(){printed++;},close(){this.closed=true;}};
    const proxyDocument={open(){},write(html){written=html;const parsed=parse(html);popup.document=parsed;parsed.close=()=>{};},close(){}};popup.document=proxyDocument;
    window.open=(url,target)=>{assert.equal(url,'');assert.equal(target,'_blank');return popup;};
    assert.equal(downloadReport(report),true);assert.equal(popup.opener,null);assert.ok(written.includes('screen-2026-0001'));
    popup.document.querySelector('#print-report').click();assert.equal(printed,1);assert.equal(focused,1);
    await Promise.resolve();timers.splice(0).forEach(run=>run());assert.equal(printed,2);
  });
  await check('JSON audit export retains exact records, decisions, coverage and a safe filename',async()=>{
    const before=JSON.stringify(report);assert.equal(exportReportJSON({...report,query:{...report.query,name:'../../Client:<name>'}}),true);
    const file=downloads.at(-1),payload=JSON.parse(await file.blob.text());
    assert.match(file.name,/\.json$/);assert.doesNotMatch(file.name,/[<>/\\:]/);assert.equal(file.blob.type,'application/json;charset=utf-8');
    assert.equal(payload.coverageComplete,false);assert.equal(payload.totalMatches,2);assert.deepEqual(payload.matches,report.matches);assert.deepEqual(payload.decisions,report.decisions);assert.ok(payload.scope.includes('not a live clearance'));assert.equal(JSON.stringify(report),before);
    assert.equal(document.querySelectorAll('a[download]').length,0);
  });
  await check('Research findings have dated inline citations and searched sources remain distinct from cited evidence',()=>{
    const root=parse(buildReportHTML({...report,research})),section=root.querySelector('.research'),content=section.textContent;
    assert.ok(content.includes('Research partially completed'));assert.ok(content.includes('1 of 2 stages completed · 1 cited source · 2 search sources'));
    assert.ok(content.includes('12 Oct 2026'));assert.ok(content.includes('One research stage did not finish.'));assert.ok(content.includes('The search provider timed out.'));
    assert.equal(root.querySelector('.summary strong').textContent,'Coverage incomplete');
    assert.equal(section.querySelectorAll('.research-phase').length,2);
    assert.equal(section.querySelector('.research-citation a').getAttribute('href'),'https://example.test/register');
    const textNode=section.querySelector('.research-text').textContent;
    assert.equal(textNode,'An official source identifies a director.[1] A matching name is not a confirmed identity.');
    assert.ok(section.querySelector('.research-citations').textContent.includes('Research run 12 Oct 2026'));
    assert.ok(section.querySelector('.research-source-list').textContent.includes('Search archive · Not cited in findings'));
    assert.ok(content.includes('not comprehensive licensed PEP screening')||content.includes('does not replace comprehensive licensed PEP screening'));
    assert.ok(root.querySelector('.scope').textContent.includes('separate checks'));
    assert.ok(!root.querySelector('.scope').textContent.includes('snapshots only'));
  });
  await check('Research cancellation, running and failure are exported without claiming unfinished stages completed',()=>{
    for(const [status,label] of [['cancelled','Research cancelled'],['running','Research in progress'],['failed','Research failed']]){
      const root=parse(buildReportHTML({...report,research:{...research,status,completedAt:null,phases:[{id:'identity',title:'Identity',status,text:''}]}}));
      const section=root.querySelector('.research');assert.ok(section.textContent.includes(label));assert.ok(section.textContent.includes('0 of 1 stages completed'));
      assert.ok(section.textContent.includes('No findings recorded for this stage.'));assert.ok(!section.textContent.includes('Ended '));
      assert.ok(!section.textContent.includes('Research completed'));assert.match(root.querySelector('.summary').textContent,/incomplete|progress/i);
    }
    const unknown=parse(buildReportHTML({...report,research:{status:'unknown',phases:[]}}));assert.ok(unknown.querySelector('.research').textContent.includes('Research status not recorded'));
    assert.ok(unknown.querySelector('.research').textContent.includes('No research stages were recorded.'));
    assert.equal(parse(buildReportHTML(report)).querySelector('.research'),null);
    assert.equal(parse(buildReportHTML({...report,research:null})).querySelector('.research'),null);
  });
  await check('Research hostile markup, script links and invalid citation offsets cannot mutate or hide findings',()=>{
    const attack='<img src=x onerror="bad()"><script>bad()</script> & "';
    const malicious={...research,error:attack,phases:[{title:attack,status:'completed',completedAt:'<script>date</script>',text:attack,citations:[
      {url:'javascript:bad()',title:attack,start:0,end:4},{url:'https://user:secret@example.test',title:attack,start:0,end:4},{url:'https://example.test/valid',title:attack,start:-1,end:5},{url:'https://example.test/end',title:'Outside text',start:0,end:99999},{url:'https://example.test/string',title:'Wrong type',start:'0',end:'3'}
    ],sources:[{url:'data:text/html,bad',title:attack},{url:'https://example.test/valid',title:attack},{url:'https://example.test/valid',title:'Duplicate'}],error:attack}]};
    const root=parse(buildReportHTML({...report,research:malicious})),section=root.querySelector('.research');
    assert.equal(root.querySelectorAll('script,img,[onerror]').length,0);assert.equal(section.querySelector('.research-text').textContent,attack);
    assert.equal(section.querySelectorAll('.research-citation').length,0);assert.equal(section.querySelectorAll('.research-citations li').length,3);
    assert.equal(section.querySelectorAll('.research-source-list li').length,1);assert.ok(section.querySelector('.research-citations').textContent.includes('Research run Not recorded'));
    assert.ok(![...section.querySelectorAll('a')].some(a=>/javascript:|data:|secret/.test(a.href)));
  });
  await check('Overlapping citations preserve every finding character and uncited findings are explicit',()=>{
    const value='A😀B evidence';
    const phase={title:'Evidence',status:'completed',text:value,citations:[{url:'https://example.test/one',title:'One',start:0,end:4},{url:'https://example.test/two',title:'Two',start:1,end:4},{url:'https://example.test/three',title:'Three',start:0,end:value.length}]};
    const root=parse(buildReportHTML({...report,research:{...research,status:'completed',phases:[phase]}}));
    assert.equal(root.querySelector('.research-text').textContent,'A😀B[1][2] evidence[3]');
    assert.equal(root.querySelectorAll('.research-citation a').length,3);
    const uncited=parse(buildReportHTML({...report,research:{...research,phases:[{...phase,citations:[]}]}}));
    assert.ok(uncited.querySelector('.research-phase').textContent.includes('No source citations were recorded for this stage. Treat its findings as unverified.'));
  });
  await check('PDF retains actual research warnings safely and does not count citation-only URLs as searched sources',()=>{
    const warning='No completed live web-search call was returned for this phase.';
    const attack='<img src=x onerror="bad()">';
    const phase={...research.phases[0],status:'partial',sources:[],warnings:[warning,'The provider did not complete this phase within its response limits.',attack,null,{message:'Unexpected object'},'']};
    const root=parse(buildReportHTML({...report,research:{...research,phases:[phase]}})),section=root.querySelector('.research'),warnings=section.querySelector('.research-warnings');
    assert.equal(warnings.querySelectorAll('li').length,3);assert.ok(warnings.textContent.includes(warning));assert.ok(warnings.textContent.includes(attack));
    assert.equal(root.querySelectorAll('img,[onerror]').length,0);assert.equal(section.querySelector('.research-source-list'),null);
    assert.ok(section.querySelector('.research-summary').textContent.includes('1 cited source · 0 search sources'));
    assert.equal(section.querySelectorAll('.research-citations li').length,1);
    const noWarnings=parse(buildReportHTML({...report,research}));assert.equal(noWarnings.querySelector('.research-warnings'),null);
  });
  await check('JSON keeps the complete research audit without conflating it with sanctions coverage',async()=>{
    const enriched={...report,research},before=JSON.stringify(enriched);assert.equal(exportReportJSON(enriched),true);
    const payload=JSON.parse(await downloads.at(-1).blob.text());assert.deepEqual(payload.research,research);assert.deepEqual(payload.sourceSnapshots,report.sourceSnapshots);
    assert.equal(payload.coverageComplete,false);assert.ok(payload.scope.includes('Sanctions-list snapshots and public-web research are separate checks'));
    assert.equal(JSON.stringify(enriched),before);
  });
  await check('Official checks retain five outcomes, live method, gaps and unconfirmed candidate links',async()=>{
    const officialChecks=[
      {id:'eu',status:'completed',matchCount:0,method:'official_dataset'},
      {id:'ofac',status:'failed',error:'Official feed timed out'},
      {id:'un',status:'completed',matchCount:0},
      {id:'uk',status:'completed',matchCount:0},
      {id:'cy',status:'completed',matchCount:1,method:'live_portal',candidates:[{record:{name:'Candidate <script>bad()</script>',id:'CY.123',sourceUrl:'https://example.test/candidate'},score:91}]}
    ];
    const enriched={...report,matches:[],totalMatches:0,research:{...research,officialChecks}};
    const root=parse(buildReportHTML(enriched)),content=root.body.textContent;
    for(const value of ['4/5 official checks completed','Official feed timed out','Live portal search','1 possible entry','CY.123','identity unconfirmed','Official checks from this search'])assert.ok(content.includes(value),value);
    assert.equal(root.querySelectorAll('script').length,0);
    assert.equal(exportReportJSON(enriched),true);
    assert.deepEqual(JSON.parse(await downloads.at(-1).blob.text()).research.officialChecks,officialChecks);
    const pending=parse(buildReportHTML({...report,research:{...research,officialChecks:[]}})).body.textContent;
    assert.ok(pending.includes('0/5 official checks completed'));
  });
  await check('Print candidates and source receipts share the restored current set without reviving failed evidence',()=>{
    const entry=(sourceId,id,name)=>({record:{sourceId,id,name,type:'person',sourceUrl:'https://example.test/'+id},score:90});
    const kept=entry('eu','eu:legacy','LegacyRetainedSynthetic'),old=entry('ofac','ofac:old','SupersededSynthetic');
    const fresh=entry('ofac','ofac:new','RefreshedSynthetic'),failed=entry('un','un:failed','FailedSynthetic'),empty=entry('uk','uk:empty','EmptyStaleSynthetic');
    const value={...report,query:{name:'Synthetic subject',type:'person'},matches:[kept,old,failed,empty],totalMatches:4,requiresOfficial:true,decisions:{},research:{mode:'search',officialChecks:[
      {id:'eu',status:'completed',matchCount:1},
      {id:'ofac',status:'completed',matchCount:1,candidates:[fresh]},
      {id:'un',status:'failed',matchCount:1,candidates:[failed]},
      {id:'uk',status:'completed',matchCount:0,candidates:[]},
      {id:'cy',status:'completed',matchCount:0,candidates:[]}
    ]}};
    const before=JSON.stringify(value),root=parse(buildReportHTML(value));
    const heading=[...root.querySelectorAll('h2')].find(h=>h.textContent==='Official checks from this search');
    const receipts=heading.parentElement.textContent;
    const matchNames=[...root.querySelectorAll('article.match h3')].map(h=>h.textContent);
    assert.deepEqual(new Set(matchNames),new Set(['LegacyRetainedSynthetic','RefreshedSynthetic']));
    assert.match(receipts,/LegacyRetainedSynthetic/);assert.match(receipts,/RefreshedSynthetic/);
    for(const name of ['SupersededSynthetic','FailedSynthetic','EmptyStaleSynthetic'])assert.ok(!root.body.textContent.includes(name),name);
    assert.equal(JSON.stringify(value),before,'Rendering must not change source receipts or the saved report');
  });
  await check('PDF table cleanup preserves evidence and UTF-16 citations without changing the saved audit',()=>{
    const value='Before 😀\n| Source | Finding |\n|---|---|\n| EU | Greek Α evidence |\nAfter evidence';
    const phrase='Greek Α evidence',start=value.indexOf(phrase),end=start+phrase.length;
    const input={research:{phases:[{text:value,citations:[{start,end,url:'https://example.test/eu'},{start:value.indexOf('After'),end:value.length,url:'https://example.test/after'}]}]}};
    const saved=JSON.stringify(input),result=preparePDFReport(input).research.phases[0];
    assert.doesNotMatch(result.text,/\|/);assert.ok(result.text.includes('EU — Greek Α evidence'));
    assert.equal(result.text.slice(result.citations[0].start,result.citations[0].end),phrase);
    assert.equal(result.text.slice(result.citations[1].start,result.citations[1].end),'After evidence');
    assert.equal(JSON.stringify(input),saved);
  });
  const originalCreate=document.createElement.bind(document);
  await check('PNG summary requests a real PNG download and draws accurate source coverage and match decisions',async()=>{
    const drawn=[];let canvas;
    const context={font:'',fillStyle:'',fillRect(){},strokeRect(){},measureText(value){const px=Number(this.font.match(/(\d+)px/)?.[1]||16);return {width:Array.from(value).length*px*.52};},fillText(value,x,y){drawn.push({value,x,y});}};
    document.createElement=tag=>tag==='canvas'?(canvas={width:0,height:0,getContext:()=>context,toBlob(callback,type){assert.equal(type,'image/png');callback(new Blob(['test PNG callback'],{type}));}}):originalCreate(tag);
    assert.equal(await downloadSnapshot(report),true);
    const file=downloads.at(-1);assert.match(file.name,/\.png$/);assert.equal(file.blob.type,'image/png');
    const content=drawn.map(item=>item.value).join('\n');
    for(const expected of ['NEOLAW','Ανδρέας Example','Coverage incomplete','2 potential matches','3 / 4 sources ready','United Kingdom','Unavailable · not checked','Needs investigation','Different person / entity','Review pending identification evidence.','not a live clearance'])assert.ok(content.includes(expected),expected);
    for(const item of drawn){assert.ok(item.y>=0&&item.y<canvas.height,`Text outside canvas: ${item.value}`);assert.ok(item.x>=0&&item.x<canvas.width);}
    assert.equal(canvas.width,1200);assert.ok(canvas.height>1000);
    drawn.length=0;
    assert.equal(await downloadSnapshot({...report,sourceSnapshots:report.sourceSnapshots.map(s=>s.id==='uk'?{...s,status:'available',retrievedAt:'2026-10-01T00:00:00Z'}:s)}),true);
    assert.ok(drawn.some(item=>item.value==='Refresh needed'));assert.ok(drawn.some(item=>item.value==='Coverage incomplete'));assert.ok(drawn.some(item=>item.value.includes('3 / 4 sources ready')));
    drawn.length=0;
    assert.equal(await downloadSnapshot({...report,sourceSnapshots:report.sourceSnapshots.map(s=>({...s,status:'available',retrievedAt:'2026-10-12T07:00:00Z'})),decisions:{'eu-123':{status:'confirmed'},'un-456':{status:'dismissed'}}}),true);
    assert.ok(drawn.some(item=>item.value==='Review recorded'));
  });
  await check('PNG truncation discloses omitted matches and handles long Unicode subject and notes',async()=>{
    const drawn=[];let canvas;
    const context={font:'',fillRect(){},strokeRect(){},measureText(value){return {width:Array.from(value).length*12};},fillText(value,x,y){drawn.push({value,x,y});}};
    document.createElement=tag=>tag==='canvas'?(canvas={width:0,height:0,getContext:()=>context,toBlob(callback,type){callback(new Blob(['PNG'],{type}));}}):originalCreate(tag);
    const many={...report,query:{name:'Πολύ μεγάλο όνομα '.repeat(25)},matches:Array.from({length:8},(_,index)=>({...report.matches[0],record:{...report.matches[0].record,id:`id-${index}`}})),totalMatches:20,notes:'Μεγάλη σημείωση '.repeat(150)};
    assert.equal(await downloadSnapshot(many),true);const content=drawn.map(item=>item.value).join('\n');
    assert.ok(content.includes('6 of 20 potential matches shown.'));assert.ok(content.includes('…'));
    for(const item of drawn)assert.ok(item.y<canvas.height);
  });
  await check('PNG research summary includes factual progress and source counts, with full evidence directed to the report',async()=>{
    const drawn=[];let canvas;
    const context={font:'',fillRect(){},strokeRect(){},measureText(value){const px=Number(this.font.match(/(\d+)px/)?.[1]||16);return {width:Array.from(value).length*px*.52};},fillText(value,x,y){drawn.push({value,x,y});}};
    document.createElement=tag=>tag==='canvas'?(canvas={width:0,height:0,getContext:()=>context,toBlob(callback,type){callback(new Blob(['PNG'],{type}));}}):originalCreate(tag);
    assert.equal(await downloadSnapshot({...report,research}),true);const content=drawn.map(item=>item.value).join('\n');
    for(const expected of ['Coverage incomplete','PUBLIC-WEB RESEARCH','Research partially completed','1 / 2 stages completed · 1 cited source · 2 search sources','Summary only. Read the full report for findings, stage status and source links.','separate checks'])assert.ok(content.includes(expected),expected);
    for(const item of drawn){assert.ok(item.y>=0&&item.y<canvas.height);assert.ok(item.x>=0&&item.x<canvas.width);}
    const matchY=drawn.find(item=>item.value==='MATCH REVIEW').y,scopeY=drawn.find(item=>item.value.startsWith('Sanctions-list snapshots')).y;
    assert.ok(matchY>drawn.find(item=>item.value==='PUBLIC-WEB RESEARCH').y);assert.ok(scopeY>drawn.find(item=>item.value==='Review pending identification evidence.').y);
    drawn.length=0;assert.equal(await downloadSnapshot({...report,research:{...research,status:'cancelled',phases:[]}}),true);assert.ok(drawn.some(item=>item.value==='Research cancelled'));
  });
  await check('Unavailable canvas and failed PNG encoding return false without a phantom download',async()=>{
    const before=downloads.length;
    document.createElement=tag=>tag==='canvas'?{getContext:()=>null}:originalCreate(tag);assert.equal(await downloadSnapshot(report),false);
    document.createElement=tag=>tag==='canvas'?{getContext:()=>({fillRect(){},strokeRect(){},measureText(){return {width:0};},fillText(){}}),toBlob(callback){callback(null);}}:originalCreate(tag);assert.equal(await downloadSnapshot(report),false);
    assert.equal(downloads.length,before);document.createElement=originalCreate;
  });
  await check('Malformed-query exports retain original evidence with a warning and cannot produce a misleading server PDF',async()=>{
    const malformed={...report,query:{...report.query,name:'Example Individual passport number TEST000111'}};
    assert.match(buildReportHTML(malformed),/Correct the name and repeat this search/);
    await assert.rejects(downloadPDF(malformed),/Correct the name and repeat/);
    assert.equal(exportReportJSON(malformed),true);
    const payload=JSON.parse(await downloads.at(-1).blob.text());
    assert.equal(payload.query.name,malformed.query.name);assert.equal(payload.inputAssessment.code,'passport_in_name');assert.equal(payload.executive.incomplete,true);
  });
  console.log(`\n${passed} screening export checks passed. HTML/JSON content, print callbacks and PNG drawing/download callbacks verified; native print and canvas rendering require browser verification.`);
}finally{
  URL.createObjectURL=createURL;URL.revokeObjectURL=revokeURL;Date.now=originalNow;window.HTMLAnchorElement.prototype.click=originalClick;
  for(const [key,value]of Object.entries(original)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}
