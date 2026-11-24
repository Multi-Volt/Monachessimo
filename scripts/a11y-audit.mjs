/* global process, console */
// Lighthouse accessibility audit of every screen at phone size, with stored
// data so screens like the dashboard and drills have content.
//
// Usage: BASE_PATH=/Monachessimo/ npm run build && node scripts/a11y-audit.mjs
// Needs `npx playwright install chromium`. Lighthouse runs through npx and is
// not a project dependency.
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE_PATH ?? '/';
const PORT = 4174;
const ORIGIN = `http://localhost:${PORT}${BASE}`;
const MIN_SCORE = 95;

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  env: process.env,
});
await new Promise((r) => setTimeout(r, 2500));

// Seed data in a persistent profile, then let Lighthouse open the same
// profile. Lighthouse launches its own Chromium, which is more reliable than
// sharing a browser over the DevTools port.
const profile = mkdtempSync(join(tmpdir(), 'monachessimo-a11y-'));
const context = await chromium.launchPersistentContext(profile, {
  viewport: { width: 360, height: 740 },
});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(ORIGIN);
await page.getByLabel('Username').fill('TestPlayer');
await page.getByRole('button', { name: 'Import games' }).click();
await page.getByText(/Finished. Analyzed \d+ of \d+ games./).waitFor({ timeout: 600_000 });
const firstGameKey = page.evaluate(async () => {
  const req = indexedDB.open('monachessimo');
  const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
  return new Promise((r) => {
    const q = db.transaction('games').objectStore('games').getAllKeys();
    q.onsuccess = () => r(q.result[0]);
  });
});

const firstGame = await firstGameKey;
await context.close();

const routes = [
  ['dashboard', '#/'],
  ['import', '#/import'],
  ['analysis', '#/analysis'],
  ['games', '#/games'],
  ['review', `#/game/${encodeURIComponent(firstGame)}`],
  ['weakness', '#/weakness/openingError'],
  ['train', '#/train'],
  ['progress', '#/progress'],
  ['settings', '#/settings'],
  ['about', '#/about'],
];
mkdirSync('test-results/lighthouse', { recursive: true });
let failed = false;
for (const [name, hash] of routes) {
  const out = `test-results/lighthouse/${name}.json`;
  execFileSync(
    'npx',
    [
      '--yes',
      'lighthouse@13.6.0',
      `${ORIGIN}${hash}`,
      `--chrome-flags=--headless=new --user-data-dir=${profile}`,
      '--only-categories=accessibility',
      '--disable-storage-reset',
      '--form-factor=mobile',
      '--screenEmulation.width=360',
      '--screenEmulation.height=740',
      '--output=json',
      `--output-path=${out}`,
      '--quiet',
    ],
    { stdio: 'inherit', env: { ...process.env, CHROME_PATH: chromium.executablePath() } },
  );
  const report = JSON.parse(readFileSync(out, 'utf8'));
  const score = Math.round(report.categories.accessibility.score * 100);
  const fails = Object.values(report.audits)
    .filter((a) => a.score === 0 && a.scoreDisplayMode === 'binary')
    .map((a) => `${a.id}: ${a.title}`);
  failed ||= score < MIN_SCORE;
  console.log(
    `${score >= MIN_SCORE ? 'ok  ' : 'FAIL'} ${name} ${score}${fails.length ? `  ${fails.join('; ')}` : ''}`,
  );
}
writeFileSync('test-results/lighthouse/done', '');
preview.kill();
process.exit(failed ? 1 : 0);
