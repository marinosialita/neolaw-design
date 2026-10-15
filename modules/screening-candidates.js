import {profileRecords} from './screening-profile.js';
import {normalizeName,countryKey,dateParts} from './screening-engine.js';
import {identifierKey,identifierValues,maskedIdentifier} from './screening-identifiers.js';
import {explainMatch} from './screening-match.js';

const strings=value=>(Array.isArray(value)?value:[value]).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim());
const unique=values=>[...new Set(values)];
const overlaps=(a,b)=>a.some(value=>b.includes(value));
const recordOf=entry=>entry.match?.record||{};
const entryKey=entry=>[entry.kind,recordOf(entry).sourceId,entry.id].map(v=>String(v||'')).join(':');
const entityType=record=>['person','entity','vessel'].includes(record.type)?record.type:'';

// A shared reference links source records, not the searched client's identity.
// Do not infer an issuer from nationality/address, or merge on names/birth dates.
export function candidateAnchors(record={},candidate=null) {
  const anchors=[];
  const add=(kind,scope,value,label)=>{
    // Publisher IDs are opaque references: case, punctuation and hyphens may
    // distinguish records. Document-number normalization is inappropriate here.
    const normalized=kind==='source'?String(value):identifierKey(value),issuer=normalizeName(scope);
    if(!normalized||!issuer||/^(?:UNKNOWN|NONE|N\/A|NOTAVAILABLE|NOTKNOWN|NOTSUPPLIED|0+)$/.test(normalized))return;
    anchors.push({key:JSON.stringify([kind,issuer,normalized]),kind,scope,value:normalized,label});
  };
  if(record.id&&record.sourceId&&!record.localReference)add('source',record.sourceId,String(record.id),'Same published source-record reference');
  // OpenSanctions preserves publisher URLs separately from its own profile URL.
  // Only the exact OFAC record endpoint supplies a source identity anchor: never
  // a feed, regulation, domain, news page or arbitrary URL containing an id.
  const ofacReferences=unique((record.sourceId==='ofac'?strings(record.sourceUrl):record.sourceId==='opensanctions'?strings(candidate?.sourceUrls):[]).map(ofacRecordReference).filter(Boolean));
  // Multiple references in a provider record could concern different subjects.
  // Do not use that record as a bridge between them without explicit resolution.
  if(ofacReferences.length===1)add('source-url','OFAC',ofacReferences[0],`Same OFAC source record · UID ${ofacReferences[0]}`);
  // References are stored as standalone strings by these three official parsers.
  // Do not mine free-text allegations or provider prose for cross-source links.
  if(['un','eu','uk'].includes(record.sourceId))for(const value of strings(record.identifiers))
    if(/^(?:QD|TA|KP|GB|CD|SO|CF|YE|SS|IQ|SD)[ie]\.\d{3}$/i.test(value))add('designation','UN',value,`Same UN designation reference · ${value}`);
  const leis=unique(strings(record.lei).map(identifierKey).filter(validLEI));
  if(leis.length===1&&entityType(record)!=='person')add('lei','GLEIF',leis[0],`Same LEI · ${leis[0]}`);
  const passports=identifierValues(record,'passportNumber').map(identifierKey),registrations=identifierValues(record,'registrationNumber').map(identifierKey);
  // Labelled feed identifiers retain the issuing country. Unscoped typed arrays
  // remain available for comparison, but are insufficient for grouping.
  for(const value of strings(record.identifiers)) {
    const match=value.match(/^(Passport(?: number| no\.?)?|(?:Company|Business|Commercial) registration(?: number| no\.?)?)\s*:\s*([^:]+)\s*:\s*([^:]+)$/i);
    if(!match)continue;
    const kind=/^passport/i.test(match[1])?'passport':'registration',number=identifierKey(match[2]),scope=countryKey(match[3]);
    if(!scope||/^(unknown|unspecified|not known|not supplied|n a)$/.test(scope))continue;
    if(!(kind==='passport'?passports:registrations).includes(number))continue;
    if(kind==='passport'&&entityType(record)==='entity')continue;
    if(kind==='registration'&&entityType(record)==='person')continue;
    add(kind,`country:${scope}`,number,kind==='passport'?`Same passport number and recorded issuer · ${match[3].trim()} · ${maskedIdentifier(number)}`:`Same company number and recorded jurisdiction · ${match[3].trim()} · ${number}`);
  }
  const authority=strings(record.registrationAuthority);
  if(authority.length===1&&entityType(record)!=='person')for(const number of registrations)
    add('registration',`authority:${authority[0]}`,number,`Same company number and registry authority · ${authority[0]} · ${number}`);
  return [...new Map(anchors.map(anchor=>[anchor.key,anchor])).values()];
}

function ofacRecordReference(value) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:'||url.hostname!=='sanctionssearch.ofac.treas.gov'||url.port||url.username||url.password||url.pathname!=='/Details.aspx')return '';
    if([...url.searchParams.keys()].some(key=>key!=='id')||url.searchParams.getAll('id').length!==1)return '';
    const id=url.searchParams.get('id');
    return /^[1-9]\d{0,17}$/.test(id)?id:'';
  }catch{return '';}
}

function validLEI(value) {
  if(!/^[A-Z0-9]{18}\d{2}$/.test(value))return false;
  let remainder=0;
  for(const char of value)for(const digit of /[A-Z]/.test(char)?String(char.charCodeAt(0)-55):char)remainder=(remainder*10+Number(digit))%97;
  return remainder===1;
}

function conflictReason(a,b) {
  const typeA=entityType(a),typeB=entityType(b);
  if(typeA&&typeB&&typeA!==typeB)return 'different entity types';
  const dates=r=>unique(strings(r.datesOfBirth).map(dateParts).filter(v=>v.full).map(v=>v.full));
  const dobA=dates(a),dobB=dates(b);
  if(dobA.length&&dobB.length&&!overlaps(dobA,dobB))return 'different full dates of birth';
  const leis=r=>unique(strings(r.lei).map(identifierKey).filter(validLEI));
  const leiA=leis(a),leiB=leis(b);
  return leiA.length&&leiB.length&&!overlaps(leiA,leiB)?'different LEIs':'';
}

function differences(entries) {
  const rows=entries.map(recordOf),result=[];
  const fields=[['recorded names',r=>strings(r.name).map(normalizeName)],['countries / jurisdictions',r=>strings(r.countries).map(countryKey)],['birth dates',r=>strings(r.datesOfBirth).map(v=>dateParts(v).full||v)],['passport numbers',r=>identifierValues(r,'passportNumber').map(identifierKey)],['company numbers',r=>identifierValues(r,'registrationNumber').map(identifierKey)]];
  for(const [label,get] of fields){const known=rows.map(get).filter(v=>v.length);if(known.length>1&&known.some((values,i)=>known.slice(i+1).some(other=>!overlaps(values,other))))result.push(`The sources contain different ${label}; compare the original records.`);}
  const decisions=unique(entries.map(entry=>entry.decision?.status).filter(Boolean));
  if(decisions.length>1)result.push('The saved identity decisions differ across these records. Review each decision; grouping does not change it.');
  return result;
}

export function candidateGroups(report={}) {
  const entries=profileRecords(report),nodes=entries.map((entry,index)=>({entry,index,anchors:candidateAnchors(recordOf(entry),entry.candidate)}));
  const membership=nodes.map((_,index)=>index),sets=nodes.map((_,index)=>new Set([index])),receipts=[],blocked=[];
  const buckets=new Map();
  for(const node of nodes)for(const anchor of node.anchors){if(!buckets.has(anchor.key))buckets.set(anchor.key,[]);buckets.get(anchor.key).push({index:node.index,anchor});}
  // A bridge record must not join two groups with conflicting full DOBs/LEIs.
  for(const [,bucket] of [...buckets].sort(([a],[b])=>a.localeCompare(b))){bucket.sort((a,b)=>entryKey(entries[a.index]).localeCompare(entryKey(entries[b.index])));for(let i=0;i<bucket.length;i++)for(let j=i+1;j<bucket.length;j++){
    const left=bucket[i],right=bucket[j],a=membership[left.index],b=membership[right.index];
    if(a===b){receipts.push({a:left.index,b:right.index,anchor:left.anchor});continue;}
    const conflicts=unique([...sets[a]].flatMap(ai=>[...sets[b]].map(bi=>conflictReason(recordOf(entries[ai]),recordOf(entries[bi])))).filter(Boolean));
    if(conflicts.length){blocked.push({indexes:[...sets[a],...sets[b]],reason:`Kept separate from another returned record despite a shared reference: ${conflicts.join(' and ')} require review.`});continue;}
    const first=Math.min(a,b),second=Math.max(a,b);
    for(const index of sets[second]){sets[first].add(index);membership[index]=first;}sets[second].clear();
    receipts.push({a:left.index,b:right.index,anchor:left.anchor});
  }}
  const groups=sets.filter(set=>set.size).map(set=>{
    const indexes=[...set].sort((a,b)=>a-b),members=indexes.map(index=>entries[index]),links=unique(receipts.filter(link=>set.has(link.a)&&set.has(link.b)).map(link=>link.anchor.label)),diff=unique([...differences(members),...blocked.filter(item=>item.indexes.some(index=>set.has(index))).map(item=>item.reason)]);
    const id=members.map(entryKey).sort().join('|');
    return {id,name:recordOf(members[0]).name||'Unnamed record',entries:members,recordsCount:members.length,sources:unique(members.map(entry=>entry.source)),links,differences:diff,
      next:members.length>1?['Compare the linked records with the client’s identifiers. Review each source’s current classification and restrictions.',...(diff.length?['Resolve the differences before recording an identity decision.']:[])]:['Compare the returned identifiers with the client. No supported cross-source link was found.'],
      identity:'Identity requires review'};
  });
  return {groups,recordCount:entries.length,groupCount:groups.length,linkedGroups:groups.filter(group=>group.recordsCount>1).length,unlinkedCount:groups.filter(group=>group.recordsCount===1).length,
    note:'Linked source records are grouped only by published references or scoped identifiers. Counts are not unique people, risk scores or identity confirmation.'};
}

export function candidateReviewSummary(match,query={}) {
  const review=explainMatch(match,query),different=review.comparisons.filter(row=>row.status==='review'),missing=review.comparisons.filter(row=>row.status==='missing');
  return {...review,whyMatched:review.why,whatDiffers:different.length?different.map(row=>`${row.label}: ${row.source} (you supplied ${row.input}).`):['No difference was found in the details that could be compared. This does not confirm identity.'],
    missingDetails:missing.map(row=>row.note||`${row.label}: ${row.input==='Not supplied'?'not supplied in your search':'not supplied by the source'}.`),whatToVerify:review.next};
}
