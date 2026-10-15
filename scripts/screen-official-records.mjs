// Reuse the browser's tested matching rules for the server's official-source stage.
import {searchRecords} from '../modules/screening-engine.js';
let input='';
for await (const chunk of process.stdin) input+=chunk;
const {bundle,query}=JSON.parse(input);
process.stdout.write(JSON.stringify(searchRecords(bundle,query)));
