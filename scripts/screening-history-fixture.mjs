// Test-only async repository port. Real IndexedDB transactions have separate tests.
export function historyFixture(storage){
 const list=()=>storage.get('screening-reports',[]);
 return {list,get:id=>list().find(r=>r.id===id)||null,ready:async()=>{},refresh:async()=>list(),readForReview:async id=>{const report=list().find(r=>r.id===id);return report?{report:structuredClone(report),adopt:()=>structuredClone(report)}:null;},subscribe:()=>()=>{},save:async value=>{const saved={...structuredClone(value),unsaved:false};if(storage.set('screening-reports',[saved,...list().filter(r=>r.id!==value.id)])===false)throw Error('Not saved: the latest evidence could not be saved. Export before leaving.');return saved;}};
}
