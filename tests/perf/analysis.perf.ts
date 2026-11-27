import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockLichess } from '../e2e/support';

test('time to analyze 50 games', async ({ page }) => {
  const games = readFileSync(new URL('../fixtures/perf-games.ndjson', import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as unknown);
  await mockLichess(page, games);
  await page.goto('./');
  const info = await page.evaluate(() => ({
    cores: navigator.hardwareConcurrency,
    ua: navigator.userAgent,
  }));
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByLabel('How many').fill('50');
  const start = Date.now();
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Imported 50 new games')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Finished. Analyzed 50 of 50 games.')).toBeVisible({
    timeout: 60 * 60_000,
  });
  const seconds = (Date.now() - start) / 1000;
  const blunders = await page.evaluate(async () => {
    const req = indexedDB.open('monachessimo');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all: { reviews: { class: string | null }[] }[] = await new Promise((r) => {
      const q = db.transaction('analyses').objectStore('analyses').getAll();
      q.onsuccess = () => r(q.result);
    });
    return all.flatMap((a) => a.reviews).filter((x) => x.class === 'blunder').length;
  });
  console.log(
    JSON.stringify({
      seconds,
      cores: info.cores,
      workers: Math.max(1, Math.min(info.cores - 1, 4)),
      blunders,
    }),
  );
});
