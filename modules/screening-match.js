import {identifierKey,identifierValues} from './screening-identifiers.js';
// Deterministic comparison of supplied details against the returned record.
// Nothing here certifies identity or turns a missing field into a negative.
import {normalizeName,countryKey,dateParts,searchRecords} from './screening-engine.js';
const list=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'&&v.trim()):value?[String(value)]:[];
const idKey=value=>{const key=identifierKey(value);return /[\p{L}\p{N}]/u.test(key)?key:'';};
export function explainMatch(match,query={}) {
  const r=match.record||{}, names=[r.name,...list(r.aliases)].filter(Boolean);
  const exact=names.find(n=>normalizeName(n)===normalizeName(query.name));
  let why=match.matchKind?`${match.matchKind}: “${match.nameMatched||r.name}”.`:'The provider returned this candidate for the supplied name and identifiers.';
  if(exact)why=`The ${exact===r.name?'recorded name':'alias'} matches “${query.name}” after normalising spelling and punctuation.`;
  else if(r.sourceId==='gleif')why='GLEIF returned this company in the recorded-name lookup. Its legal name or alternate name needs comparison.';
  if(r.sourceId==='gleif'&&query.lei)why='Returned by an exact LEI lookup. Check the legal name and registration record before linking it to the client.';
  if(r.sourceId==='gleif'&&!query.lei&&query.registrationNumber)why='Returned by a registration-number lookup. Registration numbers can repeat across jurisdictions.';
  if(match.identifierMatch)why=`The ${match.identifierMatch==='passportNumber'?'passport number':'company registration number'} matches a published identifier after ignoring spaces and hyphens. Compare the name, issuer or jurisdiction and other identifiers; this alone does not confirm identity.`;
  const comparisons=[];
  function row(label,input,values,key=normalizeName) {
    values=list(values); const status=!input||!values.length?'missing':key(input)&&values.some(v=>key(v)===key(input))?'match':'review';
    comparisons.push({label,input:input||'Not supplied',source:values.join(' · ')||'Not supplied by source',status});
  }
  row('Name',query.name,names.length?[exact||match.nameMatched||r.name]:[]);
  row('Country / jurisdiction',query.country,r.countries,countryKey);
  const types={person:'Person',entity:'Company',vessel:'Vessel'};
  if(types[query.type]&&types[r.type]&&!r.typeUnspecified&&query.type!==r.type)
    row('Entity type',types[query.type],types[r.type]);
  // Compare the identifiers the reviewer actually supplied, even when a
  // provider returns a record of a different entity type.
  const company=query.type==='entity'||query.type!=='person'&&r.type==='entity';
  if(company){row('Registration number',query.registrationNumber,identifierValues(r,'registrationNumber'),idKey);row('LEI',query.lei,r.lei,idKey);}
  else {
    row('Date of birth',query.dob,r.datesOfBirth,v=>dateParts(v).full||'partial:'+v);
    const birth=comparisons[comparisons.length-1],input=dateParts(query.dob),dates=list(r.datesOfBirth).map(dateParts);
    if(query.dob&&dates.length&&!dates.some(v=>input.full&&v.full===input.full)&&dates.some(v=>input.year&&v.year===input.year&&(!v.full||!input.full))){birth.status='missing';birth.note='Birth year agrees; a full date is missing, so the date of birth is not confirmed.';}
    if(query.dob&&dates.length&&(input.invalid||dates.every(v=>v.invalid))){birth.status='review';birth.note='An invalid calendar date cannot corroborate identity. Check the supplied date and the original source.';}
    if(query.dob&&dates.length&&(input.calendarUnresolved||dates.every(v=>v.calendarUnresolved))){birth.status='missing';birth.note='The recorded date uses another calendar. Verify a reliable calendar conversion before comparing the birth date.';}
    if(query.passportNumber)row('Passport number',query.passportNumber,identifierValues(r,'passportNumber'),idKey);
  }
  const conflicts=comparisons.filter(c=>c.status==='review'&&c.label!=='Name');
  const next=[];
  if(conflicts.length)next.push(`Resolve the different ${conflicts.map(c=>c.label.toLowerCase()).join(' and ')} before linking this record to the client.`);
  const calendarNote=comparisons.find(c=>c.label==='Date of birth'&&c.note?.includes('another calendar'))?.note;
  if(calendarNote)next.push(calendarNote);
  if(company)next.push('Compare the legal name, company registration number and jurisdiction with a current registry extract.');
  else next.push('Compare the full date of birth and a reliable identity document; a similar name or country is insufficient.');
  const bis=r.sourceId==='bis'||list(r.programs).some(p=>/\bBIS\b/i.test(p)),exportControl=bis||list(r.programs).some(p=>/export[ .-]control/i.test(p));
  if(r.sourceId==='opensanctions'){
    next.push('Open each provider category’s cited original source to verify its authority, current status and applicable measures.');
    next.push('Assess PEP roles, allegations, sanctions and export-control entries separately. A provider tag alone is not a current restriction or a finding of wrongdoing.');
  }else if(r.sourceId==='wb')next.push('Read the World Bank notes and decision. Verify procurement eligibility, release conditions and controlled affiliates separately from sanctions.');
  else if(r.sourceId==='gleif')next.push('GLEIF verifies LEI reference data, not sanctions status or complete beneficial ownership. Review the company register separately.');
  else if(bis)next.push('Read the current BIS entry and Federal Register notice; assess the listed export, licence and end-use restrictions. This is not automatically an asset freeze.');
  else if(exportControl)next.push('Read the originating authority’s current export-control entry and legal notice. Verify its licence, end-use and other applicable restrictions; an export-control label is not automatically an asset freeze.');
  else next.push('Check the current source entry and applicable programme before deciding what restrictions apply.');
  if(r.listingStatusNote)next.unshift(r.listingStatusNote);
  if(r.endedAt&&r.sourceId!=='wb')next.unshift(`The source records an end date of ${r.endedAt}. Verify whether any restriction remains in force; do not treat this as a current prohibition.`);
  return {why,comparisons,next,exportControl,conflicts:conflicts.length,missing:comparisons.filter(c=>c.status==='missing').length,identity:'Identity requires review'};
}
export function rankedCompanyCandidates(result,query={}) {
  const values=result?.status==='completed'?result.candidates||[]:[];
  const matches=searchRecords({sources:[{id:'gleif',status:'available'}],records:values.map(m=>m.record)},query).matches;
  const ranked=new Map(matches.map(m=>[m.record.id,m]));
  return values.map(m=>({...m,...ranked.get(m.record.id)})).sort((a,b)=>(b.score||0)-(a.score||0)||Number(list(b.record.countries).some(c=>countryKey(c)===countryKey(query.country)))-Number(list(a.record.countries).some(c=>countryKey(c)===countryKey(query.country))));
}
export function prioritizeMatches(matches,query={}) {
 const key=normalizeName(query.name),rank=m=>m.identifierMatch?3:normalizeName(m.record?.name)===key?2:(m.record?.aliases||[]).some(n=>normalizeName(n)===key)?1:0;
 return [...matches].sort((a,b)=>rank(b)-rank(a)||(Number(b.score)||0)-(Number(a.score)||0)||String(a.record?.name).localeCompare(String(b.record?.name)));
}
export function restoreReturnedMatches(report) {
  const checks=report?.research?.officialChecks;
  if(!Array.isArray(checks))return report;
  const completed=checks.filter(c=>c.status==='completed'&&Number.isSafeInteger(c.matchCount)&&c.matchCount>=0);
  return {...report,matches:prioritizeMatches(completed.flatMap(c=>matchesForOfficialCheck(report,c)),report.query),totalMatches:completed.reduce((n,c)=>n+c.matchCount,0)};
}

// Candidate storage changed from one report-level array to per-source receipts.
// A refreshed source replaces only its own candidates; an explicit empty array
// must never revive an older match. Failed receipts cannot supply current records.
export function matchesForOfficialCheck(report,check) {
  if(check?.status!=='completed'||!Number.isSafeInteger(check.matchCount)||check.matchCount<0)return [];
  if(Array.isArray(check.candidates))return check.candidates.filter(match=>match?.record);
  if(Object.hasOwn(check,'candidates'))return [];
  if(check.matchCount===0)return [];
  return (report.matches||[]).filter(match=>match?.record?.sourceId===check.id);
}
