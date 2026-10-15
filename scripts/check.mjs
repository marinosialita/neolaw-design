import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {CASES,TOPICS} from '../modules/case-data.js';
import {libraryItems} from '../modules/library.js';
import {toCSV} from '../modules/matrix.js';
import {escape,icon} from '../core.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const files=['app.js','core.js','chat.js',...readdirSync(resolve(root,'modules')).filter(f=>f.endsWith('.js')).map(f=>'modules/'+f)];
for(const file of files){
 const result=spawnSync(process.execPath,['--check',resolve(root,file)],{encoding:'utf8'});
 assert.equal(result.status,0,`${file}: ${result.stderr}`);
 for(const [,ref] of readFileSync(resolve(root,file),'utf8').matchAll(/from\s+['"](\.[^'"]+)['"]/g))assert.ok(existsSync(resolve(dirname(resolve(root,file)),ref)),`Missing import ${file} → ${ref}`);
}
const manifest=JSON.parse(readFileSync(resolve(root,'outputs/real-cases-manifest.json'),'utf8'));
assert.equal(manifest.provider,'MyNomos');assert.equal(manifest.query,'φόνος εκ προμελέτης');
assert.equal(CASES.length,10);
assert.deepEqual(CASES.map(c=>c.id),manifest.cases.map(c=>c.id));
assert.equal(new Set(CASES.map(c=>c.id)).size,10);
assert.equal(new Set(CASES.map(c=>c.sourceUrl)).size,10);
assert.deepEqual(CASES.map(c=>c.rank),Array.from({length:10},(_,i)=>i+1));
for(const c of CASES){
 const captured=JSON.parse(readFileSync(resolve(root,`outputs/real-case-sources/${c.id}.json`),'utf8'));
 const sourceUrl=new URL(c.sourceUrl);
 assert.equal(sourceUrl.searchParams.get('file')||sourceUrl.pathname,manifest.cases.find(item=>item.id===c.id).path,`${c.id}: original captured result`);
 assert.deepEqual(c.paragraphs.map(p=>[p.n,p.text]),captured.paragraphs.map(p=>[p.n,p.text]),`${c.id}: rendered source text exactly matches captured judgment blocks`);
 assert.ok(c.displayTitle && c.code && !/DEMO/i.test(c.code),`${c.id}: real case identity`);
 assert.match(c.sourceUrl,/^https:\/\/(?:www\.)?cylaw\.org\//,`${c.id}: primary source URL`);
 assert.ok(c.sourceName && c.sourceRetrievedAt && c.sourceNote,`${c.id}: source provenance`);
 assert.match(c.date,/^\d{4}-\d{2}-\d{2}$/);
 assert.ok(!Number.isNaN(Date.parse(c.date)),`${c.id}: valid date`);
 assert.ok(c.paragraphs.length>0,`${c.id}: judgment text`);
 assert.equal(new Set(c.paragraphs.map(p=>p.n)).size,c.paragraphs.length,`${c.id}: unique source blocks`);
 c.paragraphs.forEach(p=>{assert.ok(Number.isInteger(p.n)&&p.n>0);assert.ok(typeof p.text==='string'&&p.text.trim(),`${c.id}: source block ${p.n}`)});
 for(const field of ['principle','summary','issue','holding','result','takeaway','court','outcomeLabel'])assert.ok(typeof c[field]==='string'&&c[field].trim(),`${c.id}: ${field}`);
 for(const field of ['facts','reasoning'])assert.ok(Array.isArray(c[field])&&c[field].length&&c[field].every(text=>typeof text==='string'&&text.trim()),`${c.id}: ${field}`);
 for(const field of ['principle','facts','issue','holding','reasoning','result','takeaway']){
  assert.ok(Array.isArray(c.sectionRefs[field]),`${c.id}: ${field} source references`);
  c.sectionRefs[field].forEach(n=>assert.ok(c.paragraphs.some(p=>p.n===n),`${c.id}: ${field} missing source block ${n}`));
 }
 assert.ok(c.sectionRefs.principle.length&&c.sectionRefs.result.length,`${c.id}: principle/outcome evidence anchors`);
 c.related.forEach(id=>assert.ok(CASES.some(x=>x.id===id)));
 c.tags.forEach(tag=>assert.ok(TOPICS.includes(tag)));
}
assert.equal(new Set(libraryItems.map(i=>i.id)).size,libraryItems.length);
assert.equal(libraryItems.filter(i=>i.type==='contracts').length,12);
assert.equal(libraryItems.filter(i=>i.type==='tools').length,11);
assert.equal(libraryItems.filter(i=>i.type==='skills').length,9);
assert.equal(libraryItems.filter(i=>i.type==='prompts').length,9);
assert.equal(libraryItems.filter(i=>i.type==='workflows').length,9);
assert.ok(libraryItems.some(i=>i.tool==='matrix'));
assert.equal(toCSV(['Name','Note'],[['Έλεγχος','line 1\n"quoted", line 2']]),'"Name","Note"\r\n"Έλεγχος","line 1\n""quoted"", line 2"');
assert.ok(toCSV(['Note'],[['=2+2']]).includes("'=2+2"));
assert.ok(toCSV(['Note'],[['  =2+2']]).includes("'  =2+2"));
assert.equal(escape('<script>"&\''),'&lt;script&gt;&quot;&amp;&#39;');
assert.ok(icon('search').includes('aria-hidden="true"'));
const index=readFileSync(resolve(root,'index.html'),'utf8');
for(const [,ref] of index.matchAll(/(?:href|src)="([^"#:]+)"/g))if(!ref.startsWith('http'))assert.ok(existsSync(resolve(root,ref)),`Missing asset ${ref}`);
for(const css of ['styles.css','modules/projects.css','modules/library.css','modules/cases.css','modules/matrix.css']){
 const text=readFileSync(resolve(root,css),'utf8');assert.equal((text.match(/\{/g)||[]).length,(text.match(/\}/g)||[]).length,css);
}
console.log(`PASS: ${files.length} JavaScript modules, imports, local assets, 10 real judgments / ${CASES.reduce((n,c)=>n+c.paragraphs.length,0)} source blocks, ${libraryItems.length} library entries, CSV escaping and HTML escaping.`);
