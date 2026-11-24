import { expect, test } from '@playwright/test';
import { collectErrors, mockLichess } from './support';

test('import from Lichess, analyze on device, review a blunder', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const urls = await mockLichess(page);

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Train on your own games' })).toBeVisible();

  // Validation before submit.
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Enter a username of 2 to 30')).toBeVisible();

  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByLabel('Games to import').selectOption('25');
  await page.getByRole('button', { name: 'Import games' }).click();

  await expect(page.getByRole('heading', { name: 'Import and analysis' })).toBeVisible();
  await expect(page.getByText('Imported 2 new games for TestPlayer')).toBeVisible();
  expect(urls[0]).toContain('max=25');
  await expect(page.getByText('Finished. Analyzed 2 of 2 games.')).toBeVisible({ timeout: 90_000 });

  await page.getByRole('link', { name: 'Open games' }).click();
  const rows = page.locator('.game-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Lost vs Opponent');
  await expect(rows.first()).toContainText('1 blunder');

  await rows.first().click();
  await expect(page.getByRole('heading', { name: /You vs Opponent/ })).toBeVisible();
  const mistake = page.locator('.mistake-row').first();
  await expect(mistake).toContainText('Blunder');
  await expect(mistake).toContainText('3... Nf6');
  await mistake.click();
  await expect(page.getByRole('note')).toContainText('Best was');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page must not scroll sideways').toBeLessThanOrEqual(0);
  // The board spans the full phone width.
  const board = await page.locator('.board').boundingBox();
  expect(board?.width).toBeGreaterThanOrEqual(359);
  expect(errors).toEqual([]);
});

test('re-import fetches only newer games and keeps analysis', async ({ page }) => {
  test.setTimeout(120_000);
  const urls = await mockLichess(page);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 2 of 2 games.')).toBeVisible({ timeout: 90_000 });

  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Imported 0 new games for TestPlayer')).toBeVisible();
  expect(urls[1]).toContain('since=');
  await expect(page.getByText('Every stored game is analyzed.')).toBeVisible();
});

test('unknown user shows an error', async ({ page }) => {
  await page.route('https://lichess.org/api/games/user/**', (route) =>
    route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}' }),
  );
  await page.goto('./');
  await page.getByLabel('Username').fill('nobody_here');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByRole('alert')).toContainText('Lichess has no user named nobody_here.');
});
