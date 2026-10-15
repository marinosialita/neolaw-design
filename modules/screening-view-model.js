// Presentation state for official-list screening. A name match is not a risk verdict.
export const sourceOrder = ['eu', 'ofac', 'un', 'uk'];
export const sourceLabels = {eu: 'European Union', ofac: 'United States · OFAC', un: 'United Nations', uk: 'United Kingdom', cy:'Cyprus · Stratlink', bis:'BIS · US export controls', gleif:'GLEIF · Company identity', au:'Australia · DFAT', ca:'Canada · Autonomous sanctions', ch:'Switzerland · SECO'};
export const sourceMarks = {eu: 'EU', ofac: 'US', un: 'UN', uk: 'UK', cy:'CY', bis:'BIS', gleif:'LEI', au:'AU', ca:'CA', ch:'CH'};
export const sourceLinks = {
  au:'https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list',
  ca:'https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx?lang=eng',
  ch:'https://www.seco.admin.ch/de/suche-nach-sanktionsadressaten',
  bis:'https://www.trade.gov/consolidated-screening-list',
  gleif:'https://www.gleif.org/en/lei-data/gleif-api/',
  cy:'https://stratlink.meci.gov.cy/sanction',
  eu: 'https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/overview-sanctions-and-related-resources_en',
  ofac: 'https://ofac.treasury.gov/sanctions-list-service',
  un: 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list',
  uk: 'https://www.gov.uk/government/publications/the-uk-sanctions-list'
};
export const officialPortals = [
  {id:'eu',name:'European Union',url:'https://www.sanctionsmap.eu/#/main'},
  {id:'ofac',name:'United States · OFAC',url:'https://sanctionssearch.ofac.treas.gov/'},
  {id:'un',name:'United Nations',url:'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list'},
  {id:'uk',name:'United Kingdom',url:'https://search-uk-sanctions-list.service.gov.uk/'},
  {id:'cy',name:'Cyprus · Stratlink',url:'https://stratlink.meci.gov.cy/sanction'},
  {id:'bis',name:'BIS · US export controls',url:'https://www.trade.gov/consolidated-screening-list'},
  ...['au','ca','ch'].map(id=>({id,name:sourceLabels[id],url:sourceLinks[id]}))
];
export function safeURL(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function formatDate(value, time = false) {
  if (!value) return 'Not supplied';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not supplied' : new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone:time||String(value).includes('T')?'Asia/Nicosia':'UTC', ...(time ? {hour: '2-digit', minute: '2-digit'} : {})}).format(date);
}
export function sourceState(source, now = Date.now()) {
  if (source?.status !== 'available') return {kind:'unavailable', label:'Not available', ready:false};
  const retrieved = Date.parse(source.retrievedAt),date = Date.parse(source.verifiedAt||source.retrievedAt);
  if (!Number.isFinite(retrieved)||!Number.isFinite(date)||retrieved>date||date>now||now-date>48*60*60*1000) return {kind:'stale', label:'Refresh needed', ready:false};
  return {kind:'available', label:'Snapshot ready', ready:true};
}
export function coverage(sources = []) {
  const all = [...sourceOrder,...['bis','au','ca','ch'].filter(id=>sources.some(s=>s.id===id))].map(id => sources.find(source => source.id === id) || {id, name:sourceLabels[id], status:'unavailable'});
  return {sources:all, ready:all.filter(source => sourceState(source).ready).length, available:all.filter(source=>source.status==='available').length, incomplete:all.some(source=>!sourceState(source).ready)};
}
export function decisionSummary(report) {
  const matches = report?.matches || [], decisions = report?.decisions || {};
  const confirmed = matches.filter(match=>decisions[match.record.id]?.status === 'confirmed').length;
  const dismissed = matches.filter(match=>decisions[match.record.id]?.status === 'dismissed').length;
  const total = Number(report?.totalMatches ?? matches.length);
  return {confirmed, dismissed, pending: Math.max(0, total-confirmed-dismissed), total, shown:matches.length};
}
export function reportLabel(report) {
  if(Array.isArray(report?.research?.officialChecks)){
    const checks=portalsFor(report.research).map(p=>report.research.officialChecks.find(c=>c.id===p.id));
    if(checks.some(c=>c?.status==='completed'&&Number.isSafeInteger(c?.matchCount)&&c.matchCount>0))return 'Official matches to review';
    if(checks.some(c=>c?.status!=='completed'||!Number.isSafeInteger(c?.matchCount)||c.matchCount<0))return 'Official checks incomplete';
  }
  const summary = decisionSummary(report);
  if (!summary.total) return 'No name matches';
  if (summary.pending) return `${summary.pending} to review`;
  return 'Review recorded';
}
export function makeReport(query, result, sources, projectName = '') {
  return {id: globalThis.crypto?.randomUUID?.() || 'screen-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8), query:{...query}, createdAt:new Date().toISOString(), sourceSnapshots:sources.map(source=>({...source})), matches:result.matches, totalMatches:result.totalMatches, decisions:{}, notes:'', projectName};
}

export const portalsFor = job => job?.schemaVersion>=6 || job?.officialChecks?.some(c=>['au','ca','ch'].includes(c.id)) ? officialPortals : job?.schemaVersion>=5 || job?.officialChecks?.some(c=>c.id==='bis') ? officialPortals.slice(0,6) : officialPortals.slice(0,5);
