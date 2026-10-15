import {escape as e,icon} from '../core.js';
import {sourceCatalog,canonicalSource} from './research-evidence.js';
import {safeURL} from './screening-view-model.js';

const months='january february march april may june july august september october november december'.split(' ');
function dateTokens(value){
  const text=String(value||'').toLowerCase(),tokens=new Set([...text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)].map(m=>m[0]));
  const add=(y,m,d)=>tokens.add(`${y}-${String(months.indexOf(m)+1).padStart(2,'0')}-${String(Number(d)).padStart(2,'0')}`);
  for(const m of text.matchAll(new RegExp(`\\b(\\d{1,2}) (${months.join('|')}) (\\d{4})\\b`,'g')))add(m[3],m[2],m[1]);
  for(const m of text.matchAll(new RegExp(`\\b(${months.join('|')}) (\\d{1,2}),? (\\d{4})\\b`,'g')))add(m[3],m[1],m[2]);
  return tokens;
}
export function affiliationDate(row,phase){
  const dates=dateTokens(row.asOf),text=phase.text||'',urls=new Set((row.sourceUrls||[]).map(canonicalSource));
  for(const citation of phase.citations||[]){
    if(!urls.has(canonicalSource(citation.url))||!Number.isInteger(citation.start)||citation.start<0||citation.start>=text.length)continue;
    const start=text.lastIndexOf('\n',citation.start-1)+1,end=text.indexOf('\n',citation.start),supported=dateTokens(text.slice(start,end<0?text.length:end));
    if(dates.size&&[...dates].every(d=>supported.has(d)))return row.asOf;
  }
  return 'Source date not established in the cited passage';
}

export function relationshipRecords(job={}){
  const web=(job.phases||[]).filter(p=>p.id==='ownership').flatMap(p=>(p.affiliations||[]).map(a=>({...a,asOf:affiliationDate(a,p),origin:'web',phaseStatus:p.status})));
  const endpointName=(v,c)=>[c.id,c.relationships?.entityId].includes(v.id)?c.name:v.name;
  const provider=(job.opensanctions?.candidates||[]).flatMap((c,index)=>(c.relationships?.records||[]).map(r=>({
    person:(r.from||[]).map(x=>endpointName(x,c)).join(' · ')||c.name,organization:(r.to||[]).map(x=>endpointName(x,c)).join(' · '),role:r.kind,
    asOf:[r.startDate?.join(', '),r.endDate?.length?'Ended '+r.endDate.join(', '):''].filter(Boolean).join(' — ')||'Dates not supplied',
    registrationNumber:(r.related||[]).flatMap(x=>x.registrationNumbers||[]).join(', '),
    jurisdiction:(r.related||[]).flatMap(x=>x.countries||[]).join(', '),
    whyRelevant:`The provider records a ${r.kind.toLowerCase()} relationship for this candidate.${r.percentage?.length?' Recorded interest: '+r.percentage.join(', ')+'%.':''} Direction and details require source review.`,
    nextStep:'Confirm both parties and the dated relationship in the underlying source. A related party’s classification does not transfer automatically.',
    sourceUrls:r.sourceUrls||[],providerUrl:c.relationships.url||c.url,index,origin:'provider',relationship:r,
    checkedAt:c.relationships.checkedAt,phaseStatus:c.relationships.status
  })));
  return [...web,...provider];
}

export function relationshipsHTML(job={}){
  const records=relationshipRecords(job),coverage=job.opensanctions?.relationshipCoverage;
  const pending=job.opensanctions?.relationshipStatus==='running';
  const gaps=(job.opensanctions?.candidates||[]).filter(c=>['failed','partial','cancelled'].includes(c.relationships?.status));
  const catalog=sourceCatalog(job);
  const sourceKey=url=>catalog.find(s=>s.key===canonicalSource(url))?.key;
  const links=a=>(a.sourceUrls||[]).map((url,i)=>safeURL(url)?`<a href="${e(safeURL(url))}" target="_blank" rel="noopener noreferrer" ${sourceKey(url)?`data-sc-evidence-source="${e(sourceKey(url))}"`:''}>${a.origin==='provider'?'Underlying source':'Cited source'} ${i+1} ${icon('arrow',11)}</a>`:'').join('');
  const card=a=>`<article class="sc-affiliation-card"><header><span>${a.origin==='web'?'PUBLIC-WEB AFFILIATION':'PROVIDER RELATIONSHIP'}${a.phaseStatus==='partial'?' · PARTIAL':''}</span><small>Identity unconfirmed</small></header><div class="sc-connection-chain"><strong>${e(a.person)}</strong><span>${e(a.role)} ${icon('arrow',14)}</span><strong>${e(a.organization)}</strong></div><p class="sc-connection-meta">${e([a.jurisdiction,a.registrationNumber?'Registration '+a.registrationNumber:'',a.asOf||'Date not supplied'].filter(Boolean).join(' · '))}</p><p>${e(a.whyRelevant||'A source links this name to the organization. Confirm which person the record describes.')}</p><div class="sc-connection-next"><strong>Check next</strong><span>${e(a.nextStep||'Compare identity and obtain the current official company filing.')}</span></div><footer>${links(a)}${a.origin==='provider'?`<button type="button" data-sr-provider="${a.index}">View candidate ${icon('chevron',12)}</button>`:''}${!a.sourceUrls?.length?'<span>Underlying source URL not supplied; inspect the provider record.</span>':''}</footer></article>`;
  return `${pending?'<p role="status" class="sc-profile-limit">Retrieving the candidates’ recorded relationships…</p>':''}${records.length?`<div class="sc-connection-heading"><h3>Documented candidate connections</h3><span>${records.length} records · not unique people</span></div><p class="sc-profile-limit">These relationships do not establish sanctions, PEP status, beneficial ownership or a match to your client.</p><div class="sc-connection-grid">${records.slice(0,6).map(card).join('')}</div>${records.length>6?`<details class="sc-profile-more"><summary>Show ${records.length-6} more relationship records</summary><div class="sc-connection-grid">${records.slice(6).map(card).join('')}</div></details>`:''}`:''}${coverage?`<p class="sc-profile-limit">Provider details retrieved for ${coverage.completed} of ${coverage.requested} candidates. ${records.length?'':'No structured relationship records returned. '}This is not a complete company-register search.</p>`:''}${gaps.length?`<details class="sc-profile-more"><summary>Relationship coverage gaps · ${gaps.length}</summary>${gaps.map(c=>`<p><strong>${e(c.name)}</strong> · ${e(c.relationships.error||'Relationship response was limited; additional records may exist.')}</p>`).join('')}</details>`:''}`;
}

export function roleGroup(candidate={}){
  const tags=candidate.topics?.length?candidate.topics:candidate.categories||[];
  if(tags.some(t=>/^role\.pep(?:\.|$)/.test(t)||/^(Former )?Politically exposed person$/i.test(t)))return 'PEP classification';
  if(tags.some(t=>t==='role.rca'||t==='Relative / close associate'))return 'Relative / close associate';
  return 'Other recorded roles';
}
