// Unsent drafts live only in this page's memory. Reloading or closing the tab
// clears them; no draft text or staged file content is written to storage.
const drafts=new Map();
const copy=draft=>({text:draft.text,attachments:draft.attachments.map(file=>({...file})),...(draft.contractId?{contractId:draft.contractId}:{})});

export function readComposerDraft(key){return drafts.has(key)?copy(drafts.get(key)):{text:'',attachments:[]}}
export function writeComposerDraft(key,draft){
 if(!draft.text&&!draft.attachments.length&&!draft.contractId){drafts.delete(key);return}
 drafts.set(key,copy(draft));
}
export function clearComposerDraft(key){drafts.delete(key)}
