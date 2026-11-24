import { expect, test, type Page } from '@playwright/test';
import { mockLichess } from './support';

async function touchSquare(page: Page, sq: string, orientation: 'white' | 'black') {
  const box = (await page.locator('.board cg-board').boundingBox())!;
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]) - 1;
  const size = box.width / 8;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  await page.touchscreen.tap(box.x + (col + 0.5) * size, box.y + (row + 0.5) * size);
}

test('tap to move still works after moving to the next drill', async ({ page }) => {
  test.setTimeout(120_000);
  await mockLichess(page);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 2 of 2 games.')).toBeVisible({ timeout: 90_000 });
  await page.goto('./#/train');

  // First drill: tap a move, then give up and go on.
  await touchSquare(page, 'a7', 'black');
  await touchSquare(page, 'a6', 'black');
  await expect(page.getByRole('status')).toContainText('Not this one.', { timeout: 20_000 });
  await page.getByText('Type a move instead').waitFor();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Next drill' }).click();

  // Second drill: tapping must still move pieces.
  await expect(page.getByText('Daily practice · 2 of')).toBeVisible();
  await touchSquare(page, 'a7', 'black');
  await touchSquare(page, 'a6', 'black');
  await expect(page.getByRole('status')).toContainText(/Not this one\.|good|Well played/, {
    timeout: 20_000,
  });
});

test('taps land on the right square after the board moves down the page', async ({ page }) => {
  test.setTimeout(120_000);
  await mockLichess(page);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 2 of 2 games.')).toBeVisible({ timeout: 90_000 });
  await page.goto('./#/train');
  // Let the board measure itself, then push it down the way a longer
  // question does on the next drill.
  await touchSquare(page, 'h8', 'black');
  await page.evaluate(() => {
    const spacer = document.createElement('p');
    spacer.style.height = '60px';
    document.querySelector('.drill__goal')!.after(spacer);
  });
  await touchSquare(page, 'a7', 'black');
  await touchSquare(page, 'a6', 'black');
  await expect(page.getByRole('status')).toContainText(/Not this one\.|good|Well played/, {
    timeout: 20_000,
  });
});
