import { expect, test } from '@playwright/test';
import { collectErrors, mockLichess } from './support';

test('imports a range from a Lichess game link to a date', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const urls = await mockLichess(page);
  const start = Date.UTC(2026, 9, 3, 18, 30);
  await page.route('https://lichess.org/game/export/**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ id: 'abcd1234', createdAt: start }),
    });
  });
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByLabel('From one game to another').check();
  await page.getByLabel('or from a Lichess game link').fill('https://lichess.org/abcd1234/white');
  await page.getByLabel('To the date').fill('2026-11-20');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText(/Finished\. Analyzed \d+ of \d+ games\./)).toBeVisible({
    timeout: 90_000,
  });
  const asked = new URL(urls[0]!);
  // The linked game is in the range; the end date counts the whole day.
  expect(asked.searchParams.get('since')).toBe(String(start));
  expect(Number(asked.searchParams.get('until'))).toBeGreaterThan(
    new Date('2026-11-20T00:00').getTime(),
  );
  expect(errors).toEqual([]);
});

test('a range that ends before it starts is refused', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByLabel('From one game to another').check();
  await page.getByLabel('From the date').fill('2026-11-20');
  await page.getByLabel('To the date').fill('2026-11-01');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByRole('alert')).toHaveText('The range ends before it starts.');
});
