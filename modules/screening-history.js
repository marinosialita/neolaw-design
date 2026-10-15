import {validAssessmentEvent} from './screening-assessment.js';
// Device-local report storage. Credentials are never part of this repository.
// Each report is committed independently; an error must remain visible to the reviewer.
export const SCREENING_HISTORY_DB = 'neolaw.screening-history';
export const SCREENING_HISTORY_KEY = 'screening-reports';
const REPORTS = 'reports', META = 'migration';
const LEGACY_STORAGE_KEY = 'neolaw.design.' + SCREENING_HISTORY_KEY, RAW_ARCHIVE = 'legacy-local-storage';
const clone = value => structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validReport = value => object(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 250 && object(value.query) && typeof value.query.name === 'string' && value.query.name.trim() && Array.isArray(value.matches) && Array.isArray(value.sourceSnapshots);
const string = value => typeof value === 'string';
const optional = (value, check) => value == null || check(value);
const arrayOf = check => value => Array.isArray(value) && value.every(check);
const strings = arrayOf(string);
const optionalFields = (value, keys, check) => keys.every(key => optional(value[key], check));
const objects = arrayOf(object);
const textFields = (value, keys) => optionalFields(value, keys, string);
const validQuery = value => object(value) && textFields(value, ['name','type','country','dob','passportNumber','registrationNumber','lei','projectId','mode']);
const validDecision = value => object(value) && textFields(value, ['status','note','reviewer','at']);

function validRecord(record) {
  return object(record) && string(record.id) && string(record.name) &&
    optionalFields(record, ['aliases','weakAliases','countries','datesOfBirth','passportNumbers','registrationNumbers','identifiers','programs','legalSources'], strings) &&
    optional(record.parentLinks, objects);
}
const validMatch = match => object(match) && validRecord(match.record) && optional(match.signals, strings);
function validRelationship(row) {
  return object(row) && string(row.kind) && optionalFields(row,['from','to','related'],objects) &&
    optionalFields(row,['startDate','endDate','percentage','sourceUrls'],strings) &&
    (row.related||[]).every(item=>optionalFields(item,['registrationNumbers','countries'],strings));
}
function validProviderProfileSource(source){
  return object(source)&&string(source.dataset)&&textFields(source,['title','publisher','url'])&&
    optional(source.official,value=>typeof value==='boolean')&&optional(source.values,strings)&&
    optional(source.firstSeen,string)&&optional(source.lastSeen,string)&&optional(source.statementCount,Number.isSafeInteger);
}
function validProviderProfileField(field){
  return object(field)&&string(field.key)&&string(field.label)&&strings(field.values)&&
    optional(field.sources,arrayOf(validProviderProfileSource))&&
    optionalFields(field,['valueCount','statementCount','sourceCount'],Number.isSafeInteger);
}
function validProviderProfile(profile){
  return object(profile)&&textFields(profile,['status','checkedAt','entityId','schema','detail','error'])&&
    optional(profile.fields,arrayOf(validProviderProfileField))&&optional(profile.datasets,strings)&&
    optionalFields(profile,['fieldCount','statementCount','returnedStatements','sourceCount'],Number.isSafeInteger);
}
function validProviderCandidate(candidate) {
  return object(candidate) && string(candidate.id) && string(candidate.name) &&
    optionalFields(candidate,['aliases','countries','birthDates','passportNumbers','registrationNumbers','topics','categories','datasets','wikidataIds','positions'],strings) &&
    optional(candidate.explanations,arrayOf(item=>object(item)&&string(item.feature))) &&
    optional(candidate.profile,validProviderProfile) &&
    optional(candidate.relationships,value=>object(value)&&optional(value.records,arrayOf(validRelationship)));
}
function validPhase(phase) {
  const source=value=>object(value)&&textFields(value,['url','title']);
  return object(phase) && textFields(phase,['id','title','text','status','error']) &&
    optionalFields(phase,['sources','citations'],arrayOf(source)) && optional(phase.warnings,strings) &&
    optional(phase.identity,value=>object(value)&&textFields(value,['candidate','status','reason'])&&optional(value.anchors,objects)) &&
    optional(phase.summary,value=>object(value)&&textFields(value,['finding','nextStep'])&&optional(value.sourceUrls,strings)) &&
    optional(phase.affiliations,arrayOf(row=>object(row)&&optional(row.sourceUrls,strings)));
}
function validResearch(job) {
  const receipt=(value,candidate)=>object(value)&&optional(value.candidates,arrayOf(candidate));
  return object(job) && optional(job.query,validQuery) && optional(job.phases,arrayOf(validPhase)) &&
    optional(job.officialChecks,arrayOf(check=>receipt(check,validMatch))) &&
    optionalFields(job,['worldbank','gleif'],value=>receipt(value,validMatch)) &&
    optional(job.opensanctions,value=>receipt(value,validProviderCandidate)) &&
    optional(job.retrySources,strings) && optional(job.retryHistory,arrayOf(retry=>object(retry)&&optional(retry.sourceIds,strings)&&optional(retry.previousChecks,objects)));
}
function validComparison(value) {
  return object(value) && ['added','changed','notReturned','newlyAvailable','gaps'].every(key=>objects(value[key])) && optional(value.comparedSources,strings);
}

export class ScreeningHistoryError extends Error {
  constructor(code, message, cause) { super(message); this.name = 'ScreeningHistoryError'; this.code = code; if (cause) this.cause = cause; }
}
function storageError(error) {
  if (error instanceof ScreeningHistoryError) return error;
  const quota = error?.name === 'QuotaExceededError';
  return new ScreeningHistoryError(quota ? 'quota' : 'storage', quota
    ? 'Device storage is full. This report is not saved. Download its evidence backup before leaving.'
    : 'The report database could not save this change. Keep this review open and download its evidence backup.', error);
}

/** Validate an exported evidence file without fetching links, starting jobs or changing its evidence. */
export function parseScreeningReportBackup(text) {
  let value;
  try { value = typeof text === 'string' ? JSON.parse(text) : clone(text); }
  catch { throw new ScreeningHistoryError('import', 'Choose a valid NeoLaw evidence JSON file.'); }
  if (value?.schema !== 'neolaw.screening-report.v1' || !validReport(value) || !validQuery(value.query) || !string(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt)) ||
      !textFields(value,['notes','projectName','previousReportId']) ||
      !value.matches.every(validMatch) ||
      value.sourceSnapshots.some(source => !object(source) || typeof source.id !== 'string') ||
      !optional(value.research,validResearch) ||
      !optional(value.decisions,decisions=>object(decisions)&&Object.values(decisions).every(validDecision)) ||
      !optional(value.assessmentLog,arrayOf(validAssessmentEvent)) || !optional(value.reviewLog,arrayOf(validDecision)) || !optional(value.comparison,validComparison)) {
    throw new ScreeningHistoryError('import', 'This file is not a supported NeoLaw screening evidence backup. Nothing was imported.');
  }
  // Older GLEIF backups may omit countries; its reader requires an array. An
  // empty array records no supplied country, never a new identity assertion.
  for (const match of value.research?.gleif?.candidates || []) if (match.record.countries == null) match.record.countries = [];
  return value;
}

function transaction(db, names, mode, run) {
  return new Promise((resolve, reject) => {
    let tx, result, failure;
    try { tx = db.transaction(names, mode); }
    catch (error) { reject(storageError(error)); return; }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || storageError(tx.error));
    tx.onerror = () => { /* onabort is the authoritative commit failure. */ };
    const fail = error => { failure = storageError(error); try { tx.abort(); } catch { reject(failure); } };
    try { run(tx, value => { result = value; }, fail); } catch (error) { fail(error); }
  });
}

/**
 * ready()/refresh()/save() resolve only after committed IndexedDB transactions.
 * list()/get() read cloned, last-committed snapshots after ready().
 * subscribe receives {type:'ready'|'saved'|'refreshed'|'error'|'external-change', id?, error?}.
 * External changes notify only: refresh explicitly, so another tab cannot replace a review draft.
 * readForReview() separates reading evidence from accepting its revision in the UI.
 * No fallback silently claims a localStorage write has succeeded.
 */
export function createScreeningHistory({legacyStorage, indexedDB = globalThis.indexedDB, databaseName = SCREENING_HISTORY_DB, channelFactory} = {}) {
  let db = null, readyPromise = null, pending = Promise.resolve(), closed = false, readyState = false, lastError = null;
  let reports = new Map(), revisions = new Map(), migration = null;
  const listeners = new Set();
  const notify = event => { for (const fn of listeners) { try { fn(event); } catch { /* A view cannot undo a committed transaction. */ } } };
  const makeChannel = channelFactory || (name => typeof globalThis.BroadcastChannel === 'function' ? new BroadcastChannel(name) : null);
  let channel = null;
  try { channel = makeChannel(databaseName); if (channel) channel.onmessage = event => { if (event.data?.type === 'saved') notify({type:'external-change', id:event.data.id}); }; } catch { /* Storage does not depend on cross-tab notifications. */ }
  const enqueue = run => { const task = pending.then(run, run); pending = task.catch(() => {}); return task; };
  const rememberError = error => { lastError = storageError(error); notify({type:'error', error:lastError}); return lastError; };
  const ordered = () => [...reports.values()].sort((a,b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

  function readLegacy() {
    if (legacyStorage) return legacyStorage.get(SCREENING_HISTORY_KEY, []);
    const raw = globalThis.localStorage?.getItem('neolaw.design.' + SCREENING_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  }
  function open() {
    if (!indexedDB?.open) return Promise.reject(new ScreeningHistoryError('unavailable', 'Report storage is unavailable in this browser. Existing evidence remains untouched; export new reviews before leaving.'));
    return new Promise((resolve, reject) => {
      let request, settled = false;
      try { request = indexedDB.open(databaseName, 1); } catch (error) { reject(storageError(error)); return; }
      request.onupgradeneeded = () => { const target = request.result; if (!target.objectStoreNames.contains(REPORTS)) target.createObjectStore(REPORTS, {keyPath:'id'}); if (!target.objectStoreNames.contains(META)) target.createObjectStore(META, {keyPath:'id'}); };
      request.onerror = () => { if (!settled) { settled = true; reject(storageError(request.error)); } };
      request.onblocked = () => { if (!settled) { settled = true; reject(new ScreeningHistoryError('blocked', 'Another tab is blocking the report database update. Close that older tab and retry saving.')); } };
      request.onsuccess = () => {
        if (settled || closed) { request.result.close(); if (!settled) reject(new ScreeningHistoryError('closed', 'The report database was closed.')); return; }
        settled = true; db = request.result;
        db.onversionchange = () => { db?.close(); db = null; readyState = false; readyPromise = null; notify({type:'external-change'}); };
        resolve(db);
      };
    });
  }
  async function readAll({preserveIds = []} = {}) {
    const values = await transaction(db, [REPORTS], 'readonly', (tx, done) => { const request = tx.objectStore(REPORTS).getAll(); request.onsuccess = () => done(request.result); });
    const next = new Map(), nextRevisions = new Map();
    for (const value of values || []) if (validReport(value.report)) { next.set(value.id, value.report); nextRevisions.set(value.id, value.revision); }
    // Merely opening the history list must not grant an old open review the
    // newer revision of another tab. Explicitly reopening that review can refresh it.
    for (const id of preserveIds) if (reports.has(id)) { next.set(id, reports.get(id)); nextRevisions.set(id, revisions.get(id)); }
    reports = next; revisions = nextRevisions;
    return values;
  }
  async function importLegacy(value, {preserveIds = []} = {}) {
    const legacy = Array.isArray(value) ? value : [];
    const serial = JSON.stringify(value ?? []);
    const valid = new Map(); for (const report of legacy) if (validReport(report) && !valid.has(report.id)) valid.set(report.id, report);
    const archived = await transaction(db, [REPORTS, META], 'readwrite', (tx, done, fail) => {
      const meta = tx.objectStore(META), records = tx.objectStore(REPORTS), previous = meta.get('legacy-current');
      previous.onsuccess = () => {
        try {
        if (previous.result?.serial === serial) { done(previous.result.summary); return; }
        const archiveId = 'legacy-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
        const summary = {archiveId, importedAt:new Date().toISOString(), validRecords:valid.size, retainedLegacyEntries:legacy.length, unrecognisedEntries:legacy.length - valid.size, legacyPreserved:true};
        // Preserve the complete original, including old formats and duplicate IDs.
        // Never delete or rewrite the original localStorage value.
        meta.add({id:archiveId, value:clone(value ?? []), summary});
        meta.put({id:'legacy-current', serial, summary});
        for (const report of valid.values()) {
          const existing = records.get(report.id);
          existing.onsuccess = () => { try { if (!existing.result) records.add({id:report.id, revision:1, report:{...clone(report), unsaved:false}, savedAt:summary.importedAt}); } catch (error) { fail(error); } };
        }
        done(summary);
        } catch (error) { fail(error); }
      };
    });
    const committed = await readAll({preserveIds});
    const committedIds = new Set((committed || []).filter(value => validReport(value.report)).map(value => value.id));
    if ([...valid.keys()].some(id => !committedIds.has(id))) throw new ScreeningHistoryError('migration', 'History migration could not be verified. Your original history has been preserved.');
    migration = archived;
  }

  function ready() {
    if (closed) return Promise.reject(new ScreeningHistoryError('closed', 'The report database was closed.'));
    if (readyState && db) return Promise.resolve();
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      let legacy;
      try {
        legacy = readLegacy();
        // Keep readable legacy evidence available even if IndexedDB is blocked.
        if (!reports.size && Array.isArray(legacy)) for (const value of legacy) if (validReport(value) && !reports.has(value.id)) reports.set(value.id, clone(value));
        await open(); await importLegacy(legacy); readyState = true; lastError = null; notify({type:'ready'});
      } catch (error) { readyPromise = null; db?.close(); db = null; throw rememberError(error); }
    })();
    return readyPromise;
  }
  function save(value) {
    let snapshot;
    try { if (!validReport(value)) throw new ScreeningHistoryError('invalid', 'This screening report is incomplete and could not be saved.'); snapshot = {...clone(value), unsaved:false}; }
    catch (error) { return Promise.reject(rememberError(error)); }
    return enqueue(async () => {
      try {
        await ready();
        const expected = revisions.get(snapshot.id) ?? 0;
        const revision = await transaction(db, [REPORTS], 'readwrite', (tx, done, fail) => {
          const records = tx.objectStore(REPORTS), current = records.get(snapshot.id);
          current.onsuccess = () => {
            try {
            if ((current.result?.revision ?? 0) !== expected) { fail(new ScreeningHistoryError('conflict', 'This review changed in another tab. Your changes have not overwritten it. Download this evidence backup, then reopen the saved review.')); return; }
            const revision = expected + 1;
            records.put({id:snapshot.id, revision, report:snapshot, savedAt:new Date().toISOString()}); done(revision);
            } catch (error) { fail(error); }
          };
        });
        reports.set(snapshot.id, snapshot); revisions.set(snapshot.id, revision); lastError = null;
        notify({type:'saved', id:snapshot.id}); try { channel?.postMessage({type:'saved', id:snapshot.id}); } catch { /* The committed report remains saved. */ }
        return clone(snapshot);
      } catch (error) { throw rememberError(error); }
    });
  }

  // Explicit quota recovery only. Ordinary ready() still leaves localStorage
  // untouched. The exact source remains recoverable, including formatting,
  // duplicate IDs and entries not recognised by the report reader.
  function archiveLegacyStorage({storage = globalThis.localStorage} = {}) {
    return enqueue(async () => {
      try {
        if (!storage?.getItem || !storage?.removeItem) throw new ScreeningHistoryError('unavailable', 'Browser history storage is unavailable. The original history has not been changed.');
        const raw = storage.getItem(LEGACY_STORAGE_KEY);
        if (raw === null) return {status:'absent', releasedCharacters:0};
        let value;
        try { value = JSON.parse(raw); }
        catch (error) { throw new ScreeningHistoryError('migration', 'The original browser history could not be read. It has not been changed.', error); }
        await ready();
        // Import missing reports, without adopting newer revisions over an
        // already-open review or replacing newer records in the database.
        await importLegacy(value, {preserveIds:[...reports.keys()]});
        const id = 'legacy-raw-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
        const archive = {id, kind:RAW_ARCHIVE, sourceKey:LEGACY_STORAGE_KEY, archivedAt:new Date().toISOString(), characters:raw.length, raw};
        await transaction(db, [META], 'readwrite', tx => { tx.objectStore(META).add(archive); });
        const verified = await transaction(db, [META], 'readonly', (tx, done) => {
          const request = tx.objectStore(META).get(id); request.onsuccess = () => done(request.result);
        });
        if (verified?.kind !== RAW_ARCHIVE || verified.sourceKey !== LEGACY_STORAGE_KEY || verified.raw !== raw || verified.characters !== raw.length) {
          throw new ScreeningHistoryError('verification', 'The original history backup could not be verified. Browser history has not been removed.');
        }
        // There is no asynchronous work between this last comparison and
        // removal. A changed value belongs to another writer and is retained.
        if (storage.getItem(LEGACY_STORAGE_KEY) !== raw) return {status:'unchanged', releasedCharacters:0, archiveId:id};
        try {
          storage.removeItem(LEGACY_STORAGE_KEY);
          if (storage.getItem(LEGACY_STORAGE_KEY) === raw) throw new Error('The original browser value remains present.');
        } catch (error) {
          throw new ScreeningHistoryError('cleanup', 'The exact history backup is saved, but the original browser copy could not be removed.', error);
        }
        lastError = null;
        return {status:'released', releasedCharacters:raw.length, archiveId:id};
      } catch (error) { throw rememberError(error); }
    });
  }

  function listLegacyArchives() {
    return enqueue(async () => {
      try {
        await ready();
        const values = await transaction(db, [META], 'readonly', (tx, done) => {
          const request = tx.objectStore(META).getAll(); request.onsuccess = () => done(request.result);
        });
        return values.filter(value => value.kind === RAW_ARCHIVE && value.sourceKey === LEGACY_STORAGE_KEY && typeof value.raw === 'string')
          .map(({id, archivedAt, sourceKey, characters}) => ({id, archivedAt, sourceKey, characters}));
      } catch (error) { throw rememberError(error); }
    });
  }

  function readLegacyArchive(id) {
    return enqueue(async () => {
      try {
        await ready();
        const value = await transaction(db, [META], 'readonly', (tx, done) => {
          const request = tx.objectStore(META).get(id); request.onsuccess = () => done(request.result);
        });
        return value?.kind === RAW_ARCHIVE && value.sourceKey === LEGACY_STORAGE_KEY && typeof value.raw === 'string' ? value.raw : null;
      } catch (error) { throw rememberError(error); }
    });
  }

  function readForReview(id) {
    return enqueue(async () => {
      try {
        await ready();
        const entry = await transaction(db, [REPORTS], 'readonly', (tx, done) => {
          const request = tx.objectStore(REPORTS).get(id);
          request.onsuccess = () => done(request.result);
        });
        if (!entry || !validReport(entry.report)) return null;
        return {
          report: clone(entry.report),
          adopt() {
            if (closed) throw new ScreeningHistoryError('closed', 'The report database was closed.');
            if ((revisions.get(id) ?? 0) > entry.revision) {
              throw new ScreeningHistoryError('conflict', 'This review changed while it was opening. Open the saved review again.');
            }
            // The caller accepts only after checking that navigation and drafts
            // are still unchanged. An abandoned read must not unlock stale writes.
            reports.set(id, clone(entry.report));
            revisions.set(id, entry.revision);
            return clone(entry.report);
          }
        };
      } catch (error) { throw rememberError(error); }
    });
  }
  return {
    ready, save, readForReview, archiveLegacyStorage, listLegacyArchives, readLegacyArchive,
    list: () => clone(ordered()),
    get: id => reports.has(id) ? clone(reports.get(id)) : null,
    refresh: (options = {}) => enqueue(async () => { try { await ready(); await readAll(options); lastError = null; notify({type:'refreshed'}); return clone(ordered()); } catch (error) { throw rememberError(error); } }),
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    status: () => ({ready:readyState, error:lastError, count:reports.size, migration:clone(migration), storage:'IndexedDB', deviceOnly:true}),
    close: async () => { await pending; closed = true; db?.close(); db = null; channel?.close(); channel = null; listeners.clear(); }
  };
}
