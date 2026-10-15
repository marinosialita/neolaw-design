import {copyFile, mkdir, readdir, rm} from 'node:fs/promises';
import {dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');
const extensions = new Set(['.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.ttf']);
const files = ['index.html', 'app.js', 'chat.js', 'core.js', 'styles.css'];

async function collect(directory) {
  for (const entry of await readdir(join(root, directory), {withFileTypes: true})) {
    const relative = join(directory, entry.name);
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) throw new Error(`Public assets cannot be symlinks: ${relative}`);
    if (entry.isDirectory()) await collect(relative);
    else if (extensions.has(extname(entry.name)) || relative === 'assets/nda-reviewed-demo.docx') files.push(relative);
  }
}

await collect('assets');
await collect('modules');
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
for (const file of files) {
  await mkdir(dirname(join(output, file)), {recursive: true});
  await copyFile(join(root, file), join(output, file));
}
await copyFile(join(root, 'cloudflare/_headers'), join(output, '_headers'));
console.log(`Built ${files.length} presentation assets in dist/.`);
