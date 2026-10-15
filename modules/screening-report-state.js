import {restoreReturnedMatches} from './screening-match.js';

/**
 * Apply one accepted job receipt to its report, independently of the open view.
 * Source receipts own matching evidence; the report owns project membership,
 * reviewer decisions and notes. A background update must not replace those.
 */
export function applyResearchReceipt(report, research, now = Date.now()) {
  const next = restoreReturnedMatches({
    ...report,
    research,
    query: research.mode === 'deep' ? {...report.query, mode: 'deep'} : report.query,
    unsaved: true,
  });
  const checks = research.officialChecks || [];
  const receivedMatch = checks.some(check =>
    check.status === 'completed' && Number.isSafeInteger(check.matchCount) && check.matchCount > 0
  );
  const elapsed = now - Date.parse(report.createdAt);
  if (report.initialResultsMs == null && receivedMatch && Number.isFinite(elapsed) && elapsed >= 0) {
    next.initialResultsMs = elapsed;
  }
  next.officialApplied = checks.length && !['pending', 'running'].includes(research.officialStatus)
    ? research.id : null;
  return next;
}
