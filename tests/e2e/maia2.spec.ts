import { expect, test } from '@playwright/test';
import { collectErrors, typeMove } from './support';

// Plays against Maia-2 below 1100, after downloading it from the setup.
// Needs the model in the build: scripts/fetch-maia2.sh before building.
test('Maia-2 is offered below 1100, downloads, and plays @model', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  await page.goto(`./#/play/fen/${encodeURIComponent(start)}`);
  await page.getByLabel(/Plays like a player rated/).fill('600');
  await expect(
    page.getByText(/To play like a player rated under 1100, download Maia-2/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Download Maia-2' }).click();
  await expect(page.getByRole('button', { name: 'Remove Maia-2' })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page.getByText(/Maia 600, plays like a player of that rating/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });
  await typeMove(page, 'e4');
  await expect(page.locator('.move-strip__san')).toHaveCount(2, { timeout: 60_000 });
  expect(errors).toEqual([]);
});
