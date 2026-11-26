import { expect, test } from '@playwright/test';
import {
  collectErrors,
  mockLichess,
  player,
  typeMove,
  waitForMoveTurn,
  flatBoard,
} from './support';

test('conversion practice plays against a weakened engine', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  // TestPlayer (White) wins Black's queen on move 3 and keeps a winning position.
  await mockLichess(page, [
    {
      id: 'convert1',
      rated: true,
      variant: 'standard',
      speed: 'rapid',
      status: 'resign',
      createdAt: 1_790_000_000_000,
      winner: 'white',
      moves: 'e4 e5 Nf3 Qh4 Nxh4 Nc6 Nf3 Nf6 Nc3 Bc5',
      clock: { initial: 600, increment: 0 },
      players: { white: player('TestPlayer', 1500), black: player('Rival', 1500) },
    },
  ]);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 1 of 1 games.')).toBeVisible({ timeout: 90_000 });

  await page.goto('./#/train');
  const section = page.locator('[data-drill-id^="conversion:"]');
  await expect(section).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'You are winning. Win it against the engine.' }),
  ).toBeVisible();
  await expect(page.getByText(/Move 1 of 30 · evaluation \+\d/)).toBeVisible();

  // Any legal developing move; the engine answers and it is our move again.
  await typeMove(page, 'd4');
  await expect(page.getByText(/Move 2 of 30/)).toBeVisible({ timeout: 30_000 });
  await waitForMoveTurn(page);
  await page.getByRole('button', { name: 'Stop here' }).click();
  await expect(page.getByRole('status')).toContainText('You stopped the game here.');
  await expect(page.getByRole('heading', { name: 'Why' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('plan picker reveals how each candidate scored', async ({ page }) => {
  await flatBoard(page);
  const errors = collectErrors(page);
  await page.goto('./');
  await page.evaluate(async () => {
    const req = indexedDB.open('monachessimo');
    await new Promise((r) => (req.onsuccess = r));
    const db = req.result as IDBDatabase;
    const tx = db.transaction('drills', 'readwrite');
    tx.objectStore('drills').put({
      id: 'plan:test',
      type: 'plan',
      fen: 'r1b1k2r/pp3ppp/4p3/2q5/6Q1/3BR3/P1P2PPP/R5K1 b kq - 2 15',
      side: 'black',
      goal: 'Pick the best plan.',
      accepted: [{ uci: 'e8g8', score: { kind: 'cp', value: -10 } }],
      line: ['e8g8'],
      bestScore: { kind: 'cp', value: -10 },
      choices: [
        {
          uci: 'e8f8',
          san: 'Kf8',
          score: { kind: 'cp', value: -90 },
          changes: ['Around your king: 1 attacker against 2 defenders, up from 0 against 3.'],
          played: true,
        },
        { uci: 'e8g8', san: 'O-O', score: { kind: 'cp', value: -10 }, changes: [] },
        { uci: 'g7g6', san: 'g6', score: { kind: 'cp', value: -20 }, changes: [] },
      ],
      hints: [],
      explanation: ['In the game you played 15... Kf8.'],
      tags: ['kingSafety'],
      rating: 1500,
      createdAt: 0,
    });
    await new Promise((r) => (tx.oncomplete = r));
  });
  await page.goto('./#/train');
  await expect(page.getByRole('heading', { name: 'Pick the best plan.' })).toBeVisible();
  await page.getByRole('button', { name: 'Kf8' }).click();
  const results = page.locator('.plan__results');
  await expect(results).toContainText('Kf8');
  await expect(results).toContainText('Your choice');
  await expect(results).toContainText('Game move');
  await expect(results.locator('li').first()).toContainText('O-O');
  await expect(results.locator('li').first()).toContainText('Best');
  await expect(results).toContainText('Around your king: 1 attacker against 2 defenders');
  // A missed drill is not repeated in the same session; it comes back tomorrow.
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Session done' })).toBeVisible();
  await expect(page.locator('.plain-list')).toContainText('Missed');
  expect(errors).toEqual([]);
});
