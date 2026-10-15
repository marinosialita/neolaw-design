import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../cloudflare/worker.js';
import './build-cloudflare.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = await readdir(join(root, 'dist'), {recursive: true});
for (const name of ['index.html', 'modules/contract-reveal.js', 'modules/contract-drafting.css', 'assets/nda-reviewed-demo.docx']) assert.ok(files.includes(name), `Missing ${name}`);
for (const path of files) assert.ok(!/(^|\/)(\.env|\.git|work|outputs|data|node_modules|\.venv)(\/|$)|\.py[co]?$/.test(path), `Private or server file in public output: ${path}`);
for (const file of ['modules/contract-reveal.js', 'modules/contract-drafting.css', 'assets/nda-reviewed-demo.docx']) assert.deepEqual(await readFile(join(root, file)), await readFile(join(root, 'dist', file)), `${file} changed while packaging`);
for (const path of ['/api', '/api/research/status', '/api/research/connect', '/api/screening/start']) {
  for (const method of ['GET', 'POST', 'HEAD']) {
    const response = await worker.fetch(new Request(`https://example.test${path}`, {method}), {ASSETS:{fetch(){throw new Error('API reached static assets');}}});
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (method === 'HEAD') assert.equal(await response.text(), '');
    else assert.equal((await response.json()).code, 'LOCAL_BACKEND_REQUIRED');
  }
}
let forwarded = '';
const response = await worker.fetch(new Request('https://example.test/'), {ASSETS:{fetch(request){forwarded=request.url;return new Response('NeoLaw');}}});
assert.equal(forwarded, 'https://example.test/');
assert.equal(await response.text(), 'NeoLaw');
console.log('PASS: public asset boundary, exact NDA/cinematic packaging, static forwarding, and explicit unavailable hosted APIs.');
