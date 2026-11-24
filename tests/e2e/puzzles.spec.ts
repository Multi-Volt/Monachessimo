import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { collectErrors, mockLichess, player, typeMove, waitForMoveTurn } from './support';

// Six games where TestPlayer hangs the queen, so hangingPiece and openingError rank.
const games = Array.from({ length: 6 }, (_, i) => ({
  id: `queen00${i}`,
  rated: true,
  variant: 'standard',
  speed: 'blitz',
  status: 'resign',
  createdAt: 1_790_000_000_000 - i * 3_600_000,
  winner: 'white',
  moves: 'e4 e5 Nf3 Qh4 Nxh4',
  clock: { initial: 300, increment: 0 },
  players: { white: player(`Rival${i}`, 1500), black: player('TestPlayer', 1490) },
}));

test('theme puzzles load only the shards the session needs', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  const requested: string[] = [];
  await page.route('**/puzzles/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/puzzles/')[1]!;
    requested.push(path);
    const file = new URL(`../fixtures/puzzles/${path}`, import.meta.url);
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: readFileSync(file, 'utf8'),
      });
    } catch {
      await route.fulfill({ status: 404, body: '' });
    }
  });
  await mockLichess(page, games);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 6 of 6 games.')).toBeVisible({ timeout: 90_000 });

  await page.getByRole('link', { name: 'Train' }).click();
  await expect(page.getByText(/Daily practice · 1 of \d+/)).toBeVisible();
  // The manifest and one shard per ranked weakness theme, nothing else.
  expect(requested.sort()).toEqual([
    'hangingPiece/1500.json',
    'manifest.json',
    'opening/1500.json',
  ]);

  // Skip the drill from the game.
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Next drill' }).click();

  // Move through the session to puzzle 00sHx: Be6+ Kd8 Qf8#.
  const section = page.locator('[data-drill-id]');
  for (let i = 0; i < 10; i++) {
    if ((await section.getAttribute('data-drill-id')) === 'theme:00sHx') break;
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: /Next drill|Finish/ }).click();
  }
  await expect(section).toHaveAttribute('data-drill-id', 'theme:00sHx');
  await expect(page.getByText('White to move')).toBeVisible();

  // A wrong first move is rejected without an engine check.
  await typeMove(page, 'Qxg7');
  await expect(page.getByRole('status')).toContainText('Qxg7 is not the solution.');
  await waitForMoveTurn(page);

  await typeMove(page, 'Be6+');
  // The opponent's reply Kd8 is played for them, then it is White's move again.
  await waitForMoveTurn(page);
  await typeMove(page, 'f7f8');
  await expect(page.getByRole('status')).toContainText('Qf8# completes the puzzle.');
  await expect(page.getByText('This is Lichess puzzle 00sHx, rated 1760.')).toBeVisible();
  expect(requested).toHaveLength(3);
  expect(errors).toEqual([]);
});
