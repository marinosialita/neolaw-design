// Local JSON-lines protocol. Public lists stay in memory; queries are never saved.
import readline from 'node:readline';
import {searchRecords,prepareSearchIndex} from '../modules/screening-engine.js';
const lists=new Map();
for await(const line of readline.createInterface({input:process.stdin})) {
  try {
    const request=JSON.parse(line);
    if(request.op==='load') {
      const bundle={sources:[request.meta],records:request.records};
      prepareSearchIndex(bundle);lists.set(request.meta.id,bundle);
      process.stdout.write(JSON.stringify({loaded:request.meta.id})+'\n');
    } else if(request.op==='search'&&lists.has(request.source)) {
      process.stdout.write(JSON.stringify(searchRecords(lists.get(request.source),request.query))+'\n');
    } else throw new Error('Unknown index request');
  } catch { process.stdout.write(JSON.stringify({error:'The prepared index could not complete the request.'})+'\n'); }
}
