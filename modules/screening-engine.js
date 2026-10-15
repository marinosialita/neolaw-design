import {identifierKey,identifierValues} from './screening-identifiers.js';
// Local candidate retrieval over official snapshots. Scores describe name similarity,
// never legal risk or a confirmed identity. Missing/disagreeing details stay visible.
const indexes = new WeakMap();
const transliteration = {
  α:'a',β:'v',γ:'g',δ:'d',ε:'e',ζ:'z',η:'i',θ:'th',ι:'i',κ:'k',λ:'l',μ:'m',ν:'n',ξ:'x',ο:'o',π:'p',ρ:'r',σ:'s',ς:'s',τ:'t',υ:'y',φ:'f',χ:'ch',ψ:'ps',ω:'o',
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',і:'i',ї:'yi',є:'ye',ґ:'g',
  ß:'ss',æ:'ae',œ:'oe',ø:'o',ł:'l',đ:'d',ð:'d',þ:'th'
};

export function normalizeName(value) {
  return String(value ?? '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/ου/gu, 'ou')
    .replace(/[α-ωа-яіїєґßæœøłđðþ]/gu, c => transliteration[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function words(value) { return [...new Set(value.split(' ').filter(Boolean))]; }
function sortedWords(value) { return words(value).sort().join(' '); }
function usableIdentifierKey(value) { const key=identifierKey(value); return /[\p{L}\p{N}]/u.test(key)?key:''; }
// Only join letters separated by an actual apostrophe. Arbitrary spaces are
// never joined (for example, Li Wei must not become an exact match for Liwei).
function joinedApostrophes(value) {
  return normalizeName(String(value ?? '').replace(/(?<=\p{L})['’ʼ](?=\p{L})/gu, ''));
}
function nameForms(value) {
  return [...new Set([normalizeName(value), joinedApostrophes(value)])].map(normalized => ({
    normalized, tokens: words(normalized), sorted: sortedWords(normalized)
  }));
}
function prepare(bundle) {
  if (indexes.has(bundle)) return indexes.get(bundle);
  const allowed = new Set((bundle.sources || []).filter(s => s.status === 'available').map(s => s.id));
  const records = (bundle.records || []).filter(r => allowed.has(r.sourceId)).map(record => ({
    record,
    names: [...new Set([record.name, ...(record.aliases || [])])].filter(Boolean).map((name, i) => {
      const forms=nameForms(name);
      return { name, ...forms[0], forms, alias: i !== 0 };
    })
  }));
  indexes.set(bundle, records);
  return records;
}

// Build reusable name/alias representations before a user starts screening.
export function prepareSearchIndex(bundle) { prepare(bundle); }

// Adjacent transpositions are common typing errors; this is deliberately more
// conservative for very short names to avoid arbitrary two-letter matches.
function similarity(a, b) {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > Math.ceil(Math.max(a.length, b.length) * .22)) return 0;
  let previousPrevious = [], previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], previousPrevious[j - 2] + 1);
    }
    previousPrevious = previous; previous = row;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function nameMatch(query, tokens, sorted, candidate) {
  if (candidate.normalized === query) return { score: candidate.alias ? 99 : 100, matchKind: candidate.alias ? 'Exact alias' : 'Exact name' };
  if (candidate.sorted === sorted) return { score: 98, matchKind: candidate.alias ? 'Alias · reordered name' : 'Reordered name' };
  if (tokens.every(t => candidate.tokens.includes(t)) && tokens.some(t => t.length >= 2)) {
    return { score: tokens.length === 1 ? 86 : Math.round(89 + 6 * tokens.length / candidate.tokens.length), matchKind: candidate.alias ? 'Partial alias' : 'Partial name' };
  }
  if (query.length < 5 || !tokens.some(t => t.length >= 4)) return null;
  // Only a small token set needs edit-distance work; same first letter or a
  // matching second letter admits first-letter substitutions without global DP.
  const used = new Set(); let total = 0;
  for (const token of tokens) {
    let best = 0, at = -1;
    for (let i = 0; i < candidate.tokens.length; i++) {
      const other = candidate.tokens[i];
      const initialSwap = token[0] === other[1] && token[1] === other[0];
      if (used.has(i) || (token[0] !== other[0] && token[1] !== other[1] && !initialSwap)) continue;
      const value = similarity(token, other);
      if (value > best) { best = value; at = i; }
    }
    if (best < .75) return null;
    used.add(at); total += best;
  }
  const mean = total / tokens.length;
  if (mean < .8 || (tokens.length === 1 && mean < .8)) return null;
  return { score: Math.min(94, Math.round(mean * 95 - (candidate.tokens.length > tokens.length ? 3 : 0))), matchKind: candidate.alias ? 'Similar alias' : 'Similar name' };
}

const countryAliases = new Map();
for (const group of [
  ['russia','russian federation','ru','rus'], ['united kingdom','uk','gb','gbr','great britain'],
  ['united states','united states of america','us','usa'], ['cyprus','cy','cyp','κυπρος'],
  ['greece','gr','grc','ελλαδα'], ['iran','iran islamic republic of','ir','irn'],
  ['syria','syrian arab republic','sy','syr'], ['north korea','democratic peoples republic of korea','korea democratic peoples republic of','kp','prk'],
  ['south korea','republic of korea','korea republic of','kr','kor'], ['united arab emirates','uae','ae','are'],
  ['china','peoples republic of china','cn','chn'], ['belarus','by','blr'], ['ukraine','ua','ukr'],
  ['afghanistan','af','afg'], ['iraq','iq','irq'], ['turkey','turkiye','tr','tur'],
  ['democratic republic of the congo','congo democratic republic of the','drc','cd','cod'], ['congo','republic of the congo','cg','cog']
]) for (const name of group) countryAliases.set(normalizeName(name), group[0]);
export function countryKey(value) { const key = normalizeName(value); return countryAliases.get(key) || key; }

export function dateParts(value) {
  const s = String(value || '').trim();
  // SECO preserves non-Gregorian dates with this marker. The numeric year is
  // not a Gregorian birth year and must not become corroborating evidence.
  if(/\bother calendar\b/i.test(s))return {year:null,full:null,calendarUnresolved:true};
  const calendar = (year, month, day) => {
    const y=Number(year),m=Number(month),d=Number(day),leap=y%4===0&&(y%100!==0||y%400===0);
    const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(m<1||m>12||d<1||d>days[m-1])return {year:null,full:null,invalid:true};
    return {year:String(year),full:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
  };
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return calendar(m[1],m[2],m[3]);
  if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) return calendar(m[3],m[2],m[1]);
  if ((m = s.match(/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/i))) {
    const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase()) + 1;
    return calendar(m[3],month,m[1]);
  }
  return { year: (s.match(/\b(?:18|19|20)\d{2}\b/) || [])[0], full: null };
}

function identitySignals(record, query) {
  const signals = [];
  if (query.country?.trim()) {
    const countries = record.countries || [];
    if (!countries.length) signals.push('Country not provided in source');
    else if (countries.some(c => countryKey(c) === countryKey(query.country))) signals.push(`Country matches: ${query.country.trim()}`);
    else signals.push(`Country differs: source lists ${countries.join(', ')}`);
  }
  if (query.dob?.trim()) {
    const dates = (record.datesOfBirth || []).map(dateParts), input = dateParts(query.dob);
    if (!dates.length) signals.push('Date of birth not provided in source');
    else if (input.calendarUnresolved || dates.every(d=>d.calendarUnresolved)) signals.push('Date of birth uses another calendar; conversion requires verification');
    else if (input.full && dates.some(d => d.full === input.full)) signals.push('Date of birth matches');
    else if (input.year && dates.some(d => d.year === input.year && (!d.full || !input.full))) signals.push('Birth year matches; full date unconfirmed');
    else signals.push(`Date of birth differs or needs review: ${record.datesOfBirth.join(', ')}`);
  }
  for(const [field,label] of [['passportNumber','Passport number'],['registrationNumber','Company registration number']])if(query[field]){
    const values=identifierValues(record,field);
    const key=usableIdentifierKey(query[field]);
    signals.push(!values.length?`${label} not provided in source`:key&&values.some(v=>identifierKey(v)===key)?`${label} matches`:`${label} differs; review required`);
  }
  return signals;
}

export function searchRecords(bundle, query = {}) {
  const normalized = normalizeName(query.name);
  if (normalized.length < 2 || !/\p{L}/u.test(normalized)) return { matches: [], totalMatches: 0 };
  const forms = nameForms(query.name),{tokens,sorted}=forms[0], matches = [];
  const fields=['passportNumber','registrationNumber'].filter(field=>query[field]), identifierChecks=Object.fromEntries(fields.map(field=>[field,{status:'not_available',recordsWithIdentifier:0,exactMatches:0,method:'exact_available_fields'}]));
  for (const item of prepare(bundle)) {
    const record = item.record;
    if (query.type && query.type !== 'all' && record.type !== query.type && !record.typeUnspecified) continue;
    let best = null;
    for (const candidate of item.names) {
      const original=nameMatch(normalized,tokens,sorted,candidate);
      if(original&&(!best||original.score>best.score))best={...original,nameMatched:candidate.name};
      for(let qi=0;qi<forms.length;qi++)for(let ci=0;ci<candidate.forms.length;ci++){
        if(!qi&&!ci)continue;
        const form=forms[qi],found=nameMatch(form.normalized,form.tokens,form.sorted,{...candidate,...candidate.forms[ci]});
        if(found){
          found.score=Math.min(found.score,97);
          found.matchKind=candidate.alias?'Alias · punctuation variant':'Punctuation variant';
        }
        if (found && (!best || found.score > best.score)) best = { ...found, nameMatched: candidate.name };
      }
      if (best?.score === 100) break;
    }
    for(const field of fields){
      const values=identifierValues(record,field),check=identifierChecks[field];
      if(values.length){check.recordsWithIdentifier++;check.status='compared';}
      const key=usableIdentifierKey(query[field]);
      if(key&&values.some(v=>identifierKey(v)===key)){
        check.exactMatches++;
        best={...(best||{nameMatched:record.name}),score:best?.score||0,matchKind:field==='passportNumber'?'Exact passport number':'Exact company registration number',identifierMatch:field};
      }
    }
    if (best) {
      const signals = identitySignals(record, query);
      if ((record.weakAliases || []).includes(best.nameMatched)) signals.unshift('Source labels this alias as weak; insufficient alone to confirm identity');
      matches.push({ record, ...best, signals });
    }
  }
  matches.sort((a,b) => Number(!!b.identifierMatch)-Number(!!a.identifierMatch) || b.score - a.score || a.record.name.localeCompare(b.record.name) || a.record.id.localeCompare(b.record.id));
  return { matches: matches.slice(0,100), totalMatches: matches.length, ...(fields.length?{identifierChecks}:{}) };
}
