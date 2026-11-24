import { expect, test } from '@playwright/test';
import { collectErrors, mockLichess, typeMove } from './support';

test('a practice game sends a blunder back and saves the position as a drill', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await mockLichess(page);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 2 of 2 games.')).toBeVisible({ timeout: 90_000 });

  await page.getByRole('link', { name: 'Play' }).click();
  await expect(page.getByRole('heading', { name: /Practice game/ })).toBeVisible();
  // Start from move 2 of the game vs Rival, before 2...Qh4.
  await page.getByLabel('A move in one of your games').check();
  const select = page.getByLabel('Game', { exact: true });
  const value = await select.locator('option', { hasText: 'Rival' }).getAttribute('value');
  await select.selectOption(value!);
  // The picker previews the position and marks the player's mistakes.
  await expect(page.locator('.game-picker .board')).toBeVisible();
  await expect(page.getByText('Next in your game: 1. e4 (Rival).')).toBeVisible();
  await page.getByRole('button', { name: 'Next mistake' }).click();
  await expect(page.getByLabel(/Start after/)).toHaveValue('3');
  await expect(page.locator('.game-picker__next')).toContainText('2... Qh4?? (your move).');
  await expect(page.locator('.game-picker__next')).toContainText('Blunder');
  // The picker shows who is better in the chosen position, from White's side.
  await expect(
    page.getByRole('img', { name: /^Evaluation of this position: [+−0]/ }),
  ).toBeVisible();
  await page.getByLabel('Refuse mistakes and blunders').check();
  await page.getByRole('button', { name: 'Start the game' }).click();

  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('You play black')).toBeVisible();
  // The evaluation is shown and can be hidden.
  await expect(page.getByRole('img', { name: /^Evaluation before your move: / })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Hide evaluation' }).click();
  await expect(page.getByRole('img', { name: /^Evaluation before your move/ })).toBeHidden();
  await page.getByRole('button', { name: 'Show evaluation' }).click();
  // The position comes from the player's own game.
  await expect(page.getByRole('heading', { name: 'From your games' })).toBeVisible();
  await expect(page.getByText('you played Qh4 and lost')).toBeVisible();

  // The game move hangs the queen; the coach refuses it without giving the answer.
  await typeMove(page, 'Qh4');
  await expect(page.getByRole('status')).toContainText('Not good enough.', { timeout: 30_000 });
  await expect(page.getByRole('status')).not.toContainText('Nc6');
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible();

  // A sound move is accepted and the opponent answers.
  await typeMove(page, 'Nc6');
  await expect(page.getByRole('heading', { name: 'Your opponent is thinking' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });

  // The game survives a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('button', { name: 'Tap again to resign' }).click();
  await expect(page.getByRole('heading', { name: /You resigned/ })).toBeVisible();
  await expect(page.getByText('1 position was saved as drills.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the coach catches pawns given away and says why', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  // After 1.e4 e5 2.Nf3, Black to move.
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  await page.goto(`./#/play/fen/${encodeURIComponent(fen)}`);
  await page.getByLabel('Refuse mistakes and blunders').check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });

  // b5 hangs a pawn to the bishop: a blunder, with the reason.
  await typeMove(page, 'b5');
  const status = page.getByRole('status').filter({ hasText: 'Not good enough.' });
  await expect(status).toContainText('b5 is a blunder.', { timeout: 30_000 });
  await expect(status).toContainText('which takes your pawn on b5');
  await expect(status).toContainText(/It costs about \d\.\d pawns\./);
  await expect(status).not.toContainText('Nc6');

  // Show what happens plays the refused move and the opponent's answer on the board.
  await page.getByText('Type a move instead').waitFor();
  await page.getByRole('button', { name: 'Show what happens' }).click();
  await expect(page.locator('.stepper')).toContainText('You play b5.');
  await page.getByRole('button', { name: 'Forward' }).click();
  await expect(page.locator('.stepper')).toContainText('You play b5, then Bxb5');
  await expect(page.locator('.stepper')).toContainText('1 down');
  await page.getByRole('button', { name: 'Back to your move' }).click();

  // Qf6 gives up a pawn too. Winning chances alone called this an inaccuracy.
  await page.getByText('Type a move instead').waitFor();
  await typeMove(page, 'Qf6');
  await expect(status).toContainText('Qf6 is a mistake.', { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('start links from review and drills open the game', async ({ page }) => {
  test.setTimeout(150_000);
  await mockLichess(page);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 2 of 2 games.')).toBeVisible({ timeout: 90_000 });

  // From game review.
  await page.goto('./#/games');
  await page.locator('.game-row').first().click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('link', { name: 'Practice from here' }).click();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(
    page.getByRole('heading', { name: /Your move|Your opponent is thinking/ }),
  ).toBeVisible();

  // From a finished drill, with a game already running.
  await page.goto('./#/train');
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('link', { name: 'Play it out' }).click();
  await expect(page.getByLabel('The drill position you came from')).toBeChecked();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('from a drill position')).toBeVisible();
});
