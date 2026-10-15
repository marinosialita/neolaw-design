export const identifierKey=value=>String(value||'').normalize('NFKC').replace(/[\s-]/g,'').toUpperCase();
export const maskedIdentifier=value=>value?'•••• '+String(value).replace(/\s/g,'').slice(-4):'';
export function identifierValues(record,field) {
  const typed=field==='passportNumber'?record.passportNumbers:record.registrationNumbers||record.registrationNumber;
  if(typed)return (Array.isArray(typed)?typed:[typed]).filter(v=>typeof v==='string'&&v.trim());
  // Legacy snapshots contain labelled strings. Bare numbers, list IDs, tax IDs,
  // national IDs and prose are deliberately not treated as passports or company IDs.
  const label=field==='passportNumber'?/^passport(?: number| no\.?)?\s*:\s*([^:]+)(?::|$)/i:/^(?:company|business|commercial) registration(?: number| no\.?)?\s*:\s*([^:]+)(?::|$)/i;
  return (record.identifiers||[]).filter(v=>typeof v==='string').map(v=>v.match(label)?.[1]?.trim()).filter(v=>v&&/^[\p{L}\p{N} -]+$/u.test(v));
}
