// Unfinished resolution instructions are isolated by chat and kept in page memory.
// Reloading or closing the tab clears them; only a created document is persisted.
const drafts=new Map();

export function readResolutionDraft(key){return drafts.has(key)?{...drafts.get(key)}:null}
export function writeResolutionDraft(key,draft){drafts.set(key,{company:draft.company,decision:draft.decision})}
export function clearResolutionDraft(key){drafts.delete(key)}
