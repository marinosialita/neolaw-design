import {identifierKey} from './screening-identifiers.js';
import {screeningInputIssue,identityNextStep} from './screening-input.js';
import {procurementResult} from './screening-procurement.js';
// Shared evidence interpretation for the dossier, reader and exports.
// A provider citation is traceability, not independent verification of its claim.
import {safeURL, officialPortals, portalsFor} from './screening-view-model.js';
export function officialSummary(job) {
  if(!Array.isArray(job?.officialChecks))return null;
  const checks=portalsFor(job).map(portal=>({...portal,...job.officialChecks.find(c=>c.id===portal.id)})).map(c=>c.status==='completed'&&(!Number.isSafeInteger(c.matchCount)||c.matchCount<0)?{...c,status:'failed',error:'The source did not return a valid result count.'}:c);
  const completed=checks.filter(c=>c.status==='completed').length;
  const entries=checks.reduce((n,c)=>n+(c.status==='completed'&&Number.isSafeInteger(c.matchCount)&&c.matchCount>=0?c.matchCount:0),0);
  return {checks,completed,entries,total:checks.length,incomplete:completed!==checks.length,label:`${completed}/${checks.length} official checks completed`};
}
// Only use an explicit source label. Similar names alone do not establish an
// affiliation, and these presentation fields never replace the original record.
export function recordPresentation(record) {
  const name=String(record?.name||''), affiliate=record?.sourceId==='cy'&&name.match(/^(.*?)\s*Affiliated Entity:\s*(.+)$/i);
  return {name:affiliate?affiliate[2].trim():name, listedWith:affiliate?affiliate[1].trim():'', affiliate:!!affiliate};
}
export function canonicalSource(value) {
  const safe=safeURL(value); if(!safe)return '';
  const url=new URL(safe);url.hash='';
  for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||/^(gclid|fbclid)$/i.test(key))url.searchParams.delete(key);
  return url.href;
}
export function sourceCatalog(job) {
  const sources=new Map();
  for(const phase of job?.phases||[]){
    for(const [kind,values] of [['search',phase.sources||[]],['citation',phase.citations||[]]])for(const source of values){
      const key=canonicalSource(source?.url);if(!key)continue;
      if(!sources.has(key))sources.set(key,{key,url:safeURL(source.url),title:source.title||new URL(key).hostname,cited:false,searched:false,provenance:[],passages:[],phases:[]});
      const item=sources.get(key);
      if(kind==='citation'){item.cited=true;item.url=safeURL(source.url);item.title=source.title||item.title;
        const text=String(phase.text||'');
        if(Number.isInteger(source.start)&&Number.isInteger(source.end)&&source.start>=0&&source.end>source.start&&source.end<=text.length){
          const start=text.lastIndexOf('\n',source.start-1)+1,end=text.indexOf('\n',source.end);
          const passage=text.slice(start,end<0?text.length:end);
          if(!item.passages.some(p=>p.phaseId===phase.id&&p.text===passage))item.passages.push({phaseId:phase.id,phaseTitle:phase.title,text:passage,status:phase.status});
        }
      }else{item.searched=true;item.provenance=[...new Set([...item.provenance,...(source.provenance||['search_returned'])])];}
      if(!item.phases.some(p=>p.id===phase.id))item.phases.push({id:phase.id,title:phase.title,status:phase.status,at:phase.completedAt||phase.startedAt});
    }
  }
  for(const item of sources.values()){const url=new URL(item.url),title=item.title.trim();if(title.length<4||[url.hostname,url.hostname.replace(/^www\./,'')].includes(title))item.title=url.hostname.replace(/^www\./,'')+' · '+(url.pathname.toLowerCase().endsWith('.pdf')?'PDF document':'Source page');}
  return [...sources.values()].sort((a,b)=>Number(b.cited)-Number(a.cited)).map((s,i)=>({...s,number:i+1}));
}
export function sourceCounts(job){const all=sourceCatalog(job);return {all,cited:all.filter(s=>s.cited).length,search:all.filter(s=>s.searched).length,uncited:all.filter(s=>s.searched&&!s.cited).length};}
export function identitySummary(job) {
  const phases=job?.phases||[], assessments=phases.map(p=>p.identity).filter(Boolean), baseline=phases.find(p=>p.id==='identity');
  const legacy=phases.some(p=>p.text&&!p.identity);
  const conflicting=assessments.some(a=>a.status==='conflicting'||a.conflicts?.length);
  const candidates=new Set(assessments.filter(a=>a.candidate).map(a=>a.candidate.trim().toLocaleLowerCase()));
  const disagreement=assessments.some(a=>a.status==='corroborated') && (candidates.size>1 || assessments.some(a=>a.status!=='corroborated'));
  const complete=['identity','media','ownership'].every(id=>phases.find(p=>p.id===id)?.status==='completed');
  const supported=complete&&!legacy&&!disagreement&&assessments.length===phases.length&&assessments.length>0&&assessments.every(a=>a.status==='corroborated'&&a.anchors?.some(v=>v.field==='dob'&&v.value===job?.query?.dob&&safeURL(v.url)));
  const status=conflicting?'conflicting':disagreement?'inconsistent':supported?'corroborated':'unresolved';
  const labels={conflicting:'Conflicting identifiers',inconsistent:'Identity assessments disagree',corroborated:'Candidate identifiers corroborated',unresolved:'Identity unresolved'};
  const note=status==='corroborated'?'Cited identifiers support this candidate. A reviewer must still confirm that the records belong to the client.':status==='conflicting'?'Do not attribute this candidate’s findings to the client while identifying details conflict.':status==='inconsistent'?'The sections do not establish one consistent identity. Keep the candidates separate and resolve the conflicting assessments.':legacy?'This earlier dossier has no structured identity review. Any confident wording in individual sections is unverified; do not treat a name match as the client.':'A name or affiliation alone does not confirm identity. Treat the findings as candidate leads until identifiers are corroborated.';
  return {status,label:labels[status],note,legacy,humanReviewRequired:true};
}
export function identityFinding(job,query=job?.query||{}) {
  const phase=job?.phases?.find(p=>p.id==='identity');
  if(phase&&['partial','failed','cancelled','interrupted'].includes(phase.status)&&!sourceCatalog(job).some(s=>s.cited&&s.phases.some(p=>p.id==='identity')))
    return `Identity not verified. No usable sources were cited to link the web results to ${query.type==='entity'?'this company':'this person'}.`;
  return phase?.summary?.finding||phase?.identity?.reason||identitySummary(job).note;
}
export function phaseIssues(phase) {
  const items=[phase.error,...(phase.warnings||[])].filter(v=>typeof v==='string'&&v.trim());
  if(phase.status==='partial'&&!items.length)items.push('This section returned only partial evidence. The missing evidence was not recorded.');
  if(phase.status==='interrupted')items.push('The saved run cannot be resumed. Completed evidence is retained; unfinished sections were not checked.');
  return [...new Set(items)];
}
export function citationLabel(value,number) {
  // Replace citation syntax, never the substantive words covered by an annotation.
  const trimmed=String(value).trim();
  return /^(?:\(?\[[\s\S]*\]\(https?:\/\/[^\s]+\)\)?|\[[^\]\n]+\]|https?:\/\/\S+|[\uE200-\uE2FF][\s\S]*)$/.test(trimmed)?`[${number}]`:String(value);
}
export function plainEvidence(value){
  // Saved passages can contain Markdown links with escaped brackets and quoted
  // titles. Keep their labels, not raw URLs or presentation syntax. Callers still
  // escape this plain text before rendering it.
  return String(value||'').replace(/\[((?:\\.|[^\]\\])*)\]\(https?:\/\/(?:\\.|[^\s)\\])+(?:\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))?\)/g,(_,label)=>label.replace(/\\([\[\]\\])/g,'$1'))
    .replace(/&#(x[\da-f]+|\d+);/gi,(entity,code)=>{const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return n>=32&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):entity;})
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/^#{1,4}\s+/gm,'').replace(/\*([^*\n]+)\*/g,'$1');
}

// One conservative summary shared by the screen and printable report. No extra
// model call, and no negative finding inferred from missing or unrelated evidence.
export function passportCoverage(job,query={}) {
  if(!query.passportNumber)return null;
  const checks=(job?.officialChecks||[]).filter(c=>c.status==='completed'&&c.identifierChecks?.passportNumber?.status==='compared');
  const exact=checks.reduce((n,c)=>n+(c.identifierChecks.passportNumber.exactMatches||0),0);
  const provider=job?.opensanctions,accepted=provider?.status==='completed'&&provider.parsedQuery?.properties?.passportNumber?.some(v=>identifierKey(v)===identifierKey(query.passportNumber));
  return {checked:checks.length,exact,providerAccepted:!!accepted,text:`${checks.length?`Passport fields compared in ${checks.length} official datasets; ${exact} exact record matches.`:'No official passport comparison recorded.'} ${accepted?'OpenSanctions accepted the passport number.':'No completed OpenSanctions passport check recorded.'} Sources without passport details remain name-only checks. Document authenticity is not verified.`};
}
export function executiveSummary(report) {
  const job=report?.research, query=report?.query||job?.query||{}, inputIssue=screeningInputIssue(query), official=officialSummary(job), deep=job&&job.mode!=='search', identity=identitySummary(job);
  const running=job?.status==='running', officialIncomplete=!official||official.incomplete;
  const researchStale=!!deep&&!!job.researchNeedsRefresh;
  const researchIncomplete=!!deep&&['identity','media','ownership'].some(id=>job.phases?.find(p=>p.id===id)?.status!=='completed');
  const provider=job?.opensanctions, relationshipIncomplete=['partial','failed','cancelled'].includes(provider?.relationshipStatus), providerIncomplete=!!provider&&!['completed','not_configured'].includes(provider.status);
  const gleif=job?.gleif,companyIncomplete=!!gleif&&!['completed','not_applicable'].includes(gleif.status);
  const passport=passportCoverage(job,query),passportIncomplete=!!passport&&!passport.checked&&!passport.providerAccepted;
  const procurement=procurementResult(job),procurementIncomplete=!!procurement&&procurement.status!=='completed';
  const incomplete=!!inputIssue||passportIncomplete||officialIncomplete||researchIncomplete||researchStale||providerIncomplete||relationshipIncomplete||companyIncomplete||procurementIncomplete;
  const researchGaps=deep?['identity','media','ownership'].filter(id=>job.phases?.find(p=>p.id===id)?.status!=='completed').map(id=>{
    const phase=job.phases?.find(p=>p.id===id),label={identity:'Identity',media:'Media & proceedings',ownership:'Ownership & public roles'}[id];
    const issues=phase?phaseIssues(phase):[];
    const detail=issues.some(v=>/No usable inline source citations/i.test(v))?'No usable source citations were saved.':phase?.status==='cancelled'?'Research was stopped.':phase?.status==='interrupted'?'Research was interrupted.':phase?.status==='partial'?'Only partial evidence was returned.':phase?.status==='failed'?'This research section failed.':'This research section has not completed.';
    return {id,label,detail};
  }):[];
  const entries=official?.entries||0, failed=official?.checks.filter(c=>c.status!=='completed').map(c=>c.name)||[];
  const items=[{label:'Sanctions',text:official?`${official.completed}/${official.total} sources checked. ${entries?`${entries} possible ${entries===1?'entry':'entries'} to review; records may overlap.`:'No name matches in the completed checks.'}${officialIncomplete?' Coverage incomplete.':''}`:'Official checks are being prepared.'}];
  if(provider&&provider.status!=='not_configured')items.push({label:'OpenSanctions',text:provider.status==='completed'?`${provider.possibleMatches} provider candidates across sanctions, PEP and other categories.${provider.atLimit?' Result limit reached; related entities may be included.':' Review each candidate’s category and identifiers.'}`:provider.status==='running'||provider.status==='pending'?'Additional provider check in progress.':provider.error||'This additional provider check is incomplete.'});
  if(passport)items.push({label:'Passport',text:passport.text});
  if(gleif&&gleif.status!=='not_applicable')items.push({label:'Company identity',text:gleif.status==='completed'?`${gleif.totalResults} GLEIF records returned. ${gleif.totalResults?'Compare LEI, registration number and jurisdiction; identity remains unconfirmed.':'No LEI record returned; check the company register.'}`:gleif.error||'GLEIF company lookup is in progress.'});
  if(procurement)items.push({label:'Procurement',text:procurement.status==='completed'?`${procurement.totalResults} possible World Bank Table 1 ${procurement.totalResults===1?'match':'matches'}. ${procurement.totalResults?'Compare identity and the debarment period and conditions.':'Other sanctions and controlled affiliates are not fully covered.'}`:procurement.error||(['pending','running'].includes(procurement.status)?'World Bank procurement check is in progress.':'World Bank procurement check is incomplete.')});
  const title=inputIssue?inputIssue.title:running?'Screening in progress':incomplete?'Checks incomplete':entries?'Possible list matches':provider?.possibleMatches?'Provider matches require review':procurement?.totalResults?'Procurement matches require review':'No sanctions name matches found';
  const note=inputIssue?inputIssue.message:researchStale?'Some source checks were retried. Earlier web findings have not been reassessed against the updated evidence.':incomplete?(researchIncomplete&&!officialIncomplete&&!entries?`All ${official.total} official checks returned no name matches. ${researchGaps.map(g=>g.label).join(', ')} research is incomplete; identity remains unverified.`:'A missing or failed check cannot rule out a match.'):entries||procurement?.totalResults?'Compare the identifiers before deciding whether these records belong to the subject.':'No matching names were returned by the completed official checks. This is not client clearance.';
  if(deep){
    items.push({label:'Identity',text:identityFinding(job,query),candidate:identity.status!=='corroborated'});
    for(const id of ['media','ownership']){
      const phase=job.phases?.find(p=>p.id===id), summary=phase?.summary;
      const text=summary?.finding||phase?.identity?.reason||(phase?.status==='running'?'Searching the wider web…':phase?.status==='pending'?'Waiting for web research.':phase?.text?'Detailed evidence is available below. No validated executive finding was saved for this earlier run.':'This area was not completed. No conclusion is available.');
      items.push({label:id==='media'?'Media & proceedings':'Ownership & public roles',text,candidate:!!phase?.text&&identity.status!=='corroborated'&&summary?.relevance!=='unrelated'});
    }
  }else items.push({label:'Identity',text:report.query?.type==='entity'?'Compare the legal name, registration number and jurisdiction. A company name alone is not identity confirmation.':'Names are leads, not confirmed identities. Compare dates of birth, countries and identifiers.'},{label:'Wider web',text:'Not searched. Choose Deep search for media, public roles and ownership research.'});
  const next=inputIssue?inputIssue.next:running?'You can review evidence as it arrives. Unfinished areas remain incomplete.':incomplete?`${officialIncomplete?`Retry the incomplete official checks${failed.length>3?` (${failed.length} sources shown below).`:failed.length?`: ${failed.join(', ')}.`:'.'}`:''}${providerIncomplete?' Retry OpenSanctions; its unfinished check cannot rule out a match.':''}${relationshipIncomplete?' Retry the incomplete provider relationship retrieval in Deep search; matching results are retained.':''}${procurementIncomplete?' Complete the World Bank procurement check.':''}${companyIncomplete?' Complete the GLEIF company lookup.':''}${passportIncomplete?' Complete the passport check through a supported source; a name-only result does not check the passport.':''}${researchStale?' Rerun Deep search to reassess the web findings against the updated source checks.':''}${researchIncomplete?` Complete ${researchGaps.map(g=>g.label).join(', ')} research with traceable sources. ${identity.status!=='corroborated'?identityNextStep(query):''}`:''}`:entries?`Review the official entries${provider?.possibleMatches?' and OpenSanctions candidates':''}, compare identifiers and record whether they belong to the subject.`:procurement?.totalResults?'Review the World Bank candidates, confirm identity and inspect the applicable procurement conditions.':provider?.possibleMatches?'Review the OpenSanctions candidates, their categories and identifiers. Provider matches are not confirmed client identities.':deep&&identity.status!=='corroborated'?identityNextStep(query):'Record your review and download the report. Consider wider web research if the matter requires it.';
  return {title,note,items,next:next.trim(),incomplete,entries,inputIssue,researchGaps};
}
