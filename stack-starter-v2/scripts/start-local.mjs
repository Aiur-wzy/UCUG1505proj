import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error(`Node 24.x is required. Current: ${process.version}. Install Node 24 or place its Windows distribution in .local/node24 at the repository root.`);
  process.exit(1);
}
const npmCli = path.resolve(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
process.env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`;
const dev = process.argv.includes('--dev');
function npm(args) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!existsSync(path.join(root, 'node_modules/phaser/package.json'))) npm(['ci']);
if (!dev) npm(['run', 'build']);
const url = `http://127.0.0.1:${dev ? 5173 : 4173}/`;
console.log(`\nFlock & Flick: ${url}\nKeep this window open. Press Ctrl+C to stop.\n`);
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
  if (response.ok && (await response.text()).includes('Flock')) {
    console.log('A Flock & Flick server is already running at this address. Open the URL above.');
    process.exit(0);
  }
} catch { /* Nothing listening yet. */ }
const server = spawn(process.execPath, [npmCli, 'run', dev ? 'dev' : 'preview'], { cwd: root, stdio: 'inherit', windowsHide: true });
server.on('error', error => { console.error(error); process.exitCode = 1; });
server.on('exit', code => { process.exitCode = code ?? 0; });
