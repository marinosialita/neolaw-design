import {createScreeningHistory} from './screening-history.js';

const LEGACY_REPORTS = 'neolaw.design.screening-reports';

export function hasLegacyScreeningHistory(store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(LEGACY_REPORTS);
    return raw != null && raw !== '[]';
  } catch { return false; }
}

// Release the old Web Storage copy only after the report repository has
// committed and verified its exact backup. Chat writes remain synchronous.
export async function prepareWorkspaceStorage({store = globalThis.localStorage, createRepository = createScreeningHistory} = {}) {
  const history = createRepository();
  try { return await history.archiveLegacyStorage({storage:store}); }
  finally { await history.close(); }
}
