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

test.describe('on an unfolded phone', () => {
  // About a Pixel 10 Pro Fold open: a wide screen at a high pixel density.
  test.use({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2.6 });

  test('the 3D board keeps its drawing size within what phone GPUs take', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByLabel(/^3D/).check();
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    await page.goto(`./#/play/fen/${encodeURIComponent(start)}`);
    await page.getByRole('button', { name: 'Start the game' }).click();
    const canvas = page.locator('.board__3d canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    const width = await canvas.evaluate((c) => (c as HTMLCanvasElement).width);
    expect(width).toBeLessThanOrEqual(1280);
  });

  test('a lost GPU context draws a lighter board, then the flat one, and Settings says why', async ({
    page,
  }) => {
    await page.goto('./#/settings');
    await page.getByLabel(/^3D/).check();
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    await page.goto(`./#/play/fen/${encodeURIComponent(start)}`);
    await page.getByRole('button', { name: 'Start the game' }).click();
    const canvas = page.locator('.board__3d canvas');
    const lose = () =>
      canvas.evaluate((c) => {
        const gl = (c as HTMLCanvasElement).getContext('webgl2');
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      });
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    const fullWidth = await canvas.evaluate((c) => (c as HTMLCanvasElement).width);
    await lose();
    // The lighter board draws fewer pixels.
    await expect
      .poll(() => canvas.evaluate((c) => (c as HTMLCanvasElement).width), { timeout: 10_000 })
      .toBeLessThan(fullWidth);
    await lose();
    await expect(page.locator('.board cg-board')).toBeVisible({ timeout: 10_000 });
    await expect(canvas).toBeHidden();
    await page.goto('./#/settings');
    await expect(page.getByText(/The 3D board stopped on this device/)).toBeVisible();
    await expect(page.getByText(/Boards are flat on this device now/)).toBeVisible();
    await page.getByRole('button', { name: 'Try the full 3D board again' }).click();
    await expect(page.getByText(/The 3D board stopped on this device/)).toBeHidden();
  });
});

test.describe('on a GPU known to drop the full board', () => {
  test.use({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2.6 });

  test('starts on the lighter board, says why, and offers the full one', async ({ page }) => {
    // Report the Pixel 10's GPU, as Chrome does there.
    await page.addInitScript(() => {
      const name = 'ANGLE (Imagination Technologies, PowerVR D-Series DXT-48-1536, OpenGL ES 3.2)';
      for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        const get = proto.getParameter;
        proto.getParameter = function (p: number) {
          return p === 0x9246 ? name : get.call(this, p);
        };
      }
    });
    await page.goto('./#/settings');
    await page.getByLabel(/^3D/).check();
    await expect(page.getByText(/is known to stop the full 3D board/)).toBeVisible();
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    await page.goto(`./#/play/fen/${encodeURIComponent(start)}`);
    await page.getByRole('button', { name: 'Start the game' }).click();
    const canvas = page.locator('.board__3d canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    expect(await canvas.evaluate((c) => (c as HTMLCanvasElement).width)).toBeLessThanOrEqual(900);
    await page.goto('./#/settings');
    await page.getByRole('button', { name: 'Try the full 3D board again' }).click();
    await page.goto(`./#/play/fen/${encodeURIComponent(start)}`);
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => canvas.evaluate((c) => (c as HTMLCanvasElement).width))
      .toBeGreaterThan(900);
  });
});
