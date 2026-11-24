import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockLichess } from '../e2e/support';

const budget = JSON.parse(readFileSync('perf-budget.json', 'utf8')) as {
  engineReadyMs: number;
  tenGamesSeconds: number;
};

test('engine load and 10-game analysis stay within budget', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const games = readFileSync(new URL('../fixtures/perf-games.ndjson', import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .slice(0, 10)
    .map((l) => JSON.parse(l) as unknown);
  await mockLichess(page, games);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByLabel('Games to import').selectOption('25');
  const start = Date.now();
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 10 of 10 games.')).toBeVisible({
    timeout: budget.tenGamesSeconds * 1000 * 2,
  });
  const seconds = (Date.now() - start) / 1000;
  const engineMs = await page.evaluate(
    () => performance.getEntriesByName('engine-ready')[0]?.duration ?? Number.POSITIVE_INFINITY,
  );
  console.log(JSON.stringify({ engineMs: Math.round(engineMs), seconds }));
  expect(engineMs, 'engine ready time, ms').toBeLessThanOrEqual(budget.engineReadyMs);
  expect(seconds, 'seconds to analyze 10 games').toBeLessThanOrEqual(budget.tenGamesSeconds);
});
