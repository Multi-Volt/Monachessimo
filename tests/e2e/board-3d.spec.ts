import { expect, test } from '@playwright/test';
import { collectErrors } from './support';

test('the 3D board plays a move by tapping a piece and then its square', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('./#/settings');
  await page.getByLabel(/^3D/).check();
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  await page.goto(`./#/play/fen/${encodeURIComponent(start)}`);
  await page.getByRole('button', { name: 'Start the game' }).click();
  const canvas = page.locator('.board__3d canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  // The board exposes where a square's center is drawn, for tests.
  const point = (sq: string) =>
    canvas.evaluate(
      (c, s) =>
        (c as unknown as { squarePoint(s: string): { x: number; y: number } }).squarePoint(s),
      sq,
    );
  // The king on e1 stands in front of e2 from this camera; the pawn is still picked.
  for (const sq of ['e2', 'e4']) {
    const p = await point(sq);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.board-frame [role="img"]')).toHaveAttribute('aria-label', /.+/);
  expect(errors).toEqual([]);
});
