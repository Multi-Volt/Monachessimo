import { expect, test } from '@playwright/test';
import { collectErrors } from './support';

for (const [route, heading] of [
  ['#/', 'Train on your own games'],
  ['#/import', 'Train on your own games'],
  ['#/games', 'Your games'],
  ['#/settings', 'Settings'],
  ['#/about', 'About Monachessimo'],
  ['#/analysis', 'Import and analysis'],
  ['#/progress', 'Your progress'],
  ['#/train', 'Daily practice'],
] as const) {
  test(`${route} renders at phone width without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`./${route}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test('empty games list offers an import', async ({ page }) => {
  await page.goto('./#/games');
  await expect(page.getByText('No games yet')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Import games' })).toBeVisible();
});
