import { expect, test } from '@playwright/test';
import { collectErrors, flatBoard } from './support';

const pawnImage = (page: import('@playwright/test').Page, side: 'white' | 'black') =>
  page.evaluate((s) => {
    const el = document.querySelector(`.piece-preview piece.knight.${s}`);
    return el ? getComputedStyle(el).backgroundImage : '';
  }, side);

test('piece colors can be changed, apply to the boards, and are kept', async ({ page }) => {
  const errors = collectErrors(page);
  await flatBoard(page);
  await expect(page.getByRole('heading', { name: 'Piece colors' })).toBeVisible();
  const before = await pawnImage(page, 'black');
  await page.getByLabel('Cream and crimson').check();
  await expect.poll(() => pawnImage(page, 'black')).not.toBe(before);
  await page.getByLabel('Custom', { exact: true }).nth(1).check();
  await page.getByLabel("Black's pieces").fill('#1f6f3a');
  await page.reload();
  await expect(page.getByLabel("Black's pieces")).toHaveValue('#1f6f3a');
  const start = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  await page.goto(`./#/play/fen/${encodeURIComponent(start)}`);
  await page.getByRole('button', { name: 'Start the game' }).click();
  await page.waitForTimeout(1000);
  await page
    .locator('.board-frame')
    .screenshot({
      path: '/tmp/claude-1000/-home-js-Documents-GitHub-Monachessimo/1f9490a1-7acd-481b-b011-7023526fbdd0/scratchpad/pieces-2d.png',
    });
  expect(errors).toEqual([]);
});
