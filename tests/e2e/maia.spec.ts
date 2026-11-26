import { expect, test } from '@playwright/test';
import { collectErrors, typeMove } from './support';

test('Maia plays the opponent like a player of the chosen rating', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  await page.goto(`./#/play/fen/${encodeURIComponent(start)}`);
  await page.getByLabel(/^Maia/).check();
  await page.getByLabel(/Plays like a player rated/).fill('1500');
  await expect(page.getByText('Plays like a player rated 1500')).toBeVisible();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page.getByText(/Maia 1500, plays like a player of that rating/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });
  const maia = page.waitForResponse((r) => r.url().includes('/maia/maia-1500.bin'));
  await typeMove(page, 'e4');
  // Maia's network for 1500 loads, it answers, and it is the player's move again.
  expect((await maia).ok()).toBe(true);
  await expect(page.locator('.move-strip__san')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
