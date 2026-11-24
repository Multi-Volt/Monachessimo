/* global process, console */
// Checks the built site against perf-budget.json. Run after `vite build`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const budget = JSON.parse(readFileSync('perf-budget.json', 'utf8'));
const dir = 'dist/assets';
const files = readdirSync(dir);
const gz = (f) => gzipSync(readFileSync(`${dir}/${f}`)).length / 1024;
const html = readFileSync('dist/index.html', 'utf8');
const entry = /src="[^"]*assets\/(index-[^"]+\.js)"/.exec(html)?.[1];
const css = files.filter((f) => f.endsWith('.css'));
const wasm = files.filter((f) => f.endsWith('.wasm'));

const results = [
  ['Entry JS, gzip KB', entry ? gz(entry) : Infinity, budget.entryJsGzipKb],
  ['CSS, gzip KB', css.reduce((n, f) => n + gz(f), 0), budget.cssGzipKb],
  [
    'Engine WASM, KB',
    wasm.reduce((n, f) => n + statSync(`${dir}/${f}`).size / 1024, 0),
    budget.engineWasmKb,
  ],
];
let failed = false;
for (const [name, value, max] of results) {
  const ok = value <= max;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${value.toFixed(1)} (budget ${max})`);
}
process.exit(failed ? 1 : 0);
