import { expect, test, type Page } from '@playwright/test';
import { collectErrors, mockLichess } from './support';

/** Centre of a square on the drill board, for either orientation. */
async function squareCenter(page: Page, sq: string, orientation: 'white' | 'black') {
  const box = (await page.locator('.board cg-board').boundingBox())!;
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]) - 1;
  const size = box.width / 8;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  return { x: box.x + (col + 0.5) * size, y: box.y + (row + 0.5) * size };
}

async function tap(page: Page, from: string, to: string, o: 'white' | 'black') {
  const a = await squareCenter(page, from, o);
  const b = await squareCenter(page, to, o);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
}

async function drag(page: Page, from: string, to: string, o: 'white' | 'black') {
  const a = await squareCenter(page, from, o);
  const b = await squareCenter(page, to, o);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

test('drills are played on the board by tapping or dragging', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await mockLichess(page);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 2 of 2 games.')).toBeVisible({ timeout: 90_000 });
  await page.goto('./#/train');
  await expect(page.getByText('Drag a piece, or tap it and then tap where it goes.')).toBeVisible();
  // Typing is tucked away; the board comes first.
  await expect(page.getByLabel('Type a move', { exact: true })).toBeHidden();

  // Tap a7, then a6: wrong, and the piece goes back so the player can try again.
  await tap(page, 'a7', 'a6', 'black');
  await expect(page.getByRole('status')).toContainText('Not this one.', { timeout: 20_000 });
  await expect(page.getByRole('status')).toContainText('Try another move.');
  await expect(page.locator('.board piece.pawn.black').first()).toBeVisible();
  // The wrong move stays on the board for a moment, then the board is playable again.
  await page.getByText('Type a move instead').waitFor();

  // Drag the solving move. Both blunder positions are solved by g6 or Nc6.
  const goal = (await page.locator('.drill__goal').innerText()).trim();
  if (goal.includes('Qh4')) await drag(page, 'b8', 'c6', 'black');
  else await drag(page, 'g7', 'g6', 'black');
  await expect(page.getByRole('status')).toContainText('Correct.', { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('the plan picker accepts a candidate played on the board', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const req = indexedDB.open('monachessimo', 1);
    await new Promise((r) => (req.onsuccess = r));
    const db = req.result as IDBDatabase;
    const tx = db.transaction('drills', 'readwrite');
    tx.objectStore('drills').put({
      id: 'plan:board',
      type: 'plan',
      fen: 'r1b1k2r/pp3ppp/4p3/2q5/6Q1/3BR3/P1P2PPP/R5K1 b kq - 2 15',
      side: 'black',
      goal: 'Pick the best plan.',
      accepted: [{ uci: 'g7g6', score: { kind: 'cp', value: -20 } }],
      line: ['g7g6'],
      bestScore: { kind: 'cp', value: -20 },
      choices: [
        { uci: 'e8f8', san: 'Kf8', score: { kind: 'cp', value: -90 }, changes: [], played: true },
        { uci: 'g7g6', san: 'g6', score: { kind: 'cp', value: -20 }, changes: [] },
      ],
      hints: [],
      explanation: [],
      tags: [],
      rating: 1500,
      createdAt: 0,
    });
    await new Promise((r) => (tx.oncomplete = r));
  });
  await page.goto('./#/train');
  await expect(page.getByRole('heading', { name: 'Pick the best plan.' })).toBeVisible();
  await tap(page, 'g7', 'g6', 'black');
  await expect(page.locator('.plan__results')).toContainText('Your choice');
  await expect(page.locator('.plan__results li.is-picked')).toContainText('g6');
});
