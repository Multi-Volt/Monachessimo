import { expect, test, type Page } from '@playwright/test';
import { collectErrors, mockLichess } from './support';

const T0 = new Date('2026-11-24T09:00:00Z').getTime();

/** Safe answers for the two blunder positions in the mocked games. */
async function answerCorrectly(page: Page) {
  const goal = (await page.locator('.drill__goal').innerText()).trim();
  const move = goal.includes('Qh4') ? 'Nc6' : 'g6';
  await page.getByLabel('Type a move').fill(move);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('status')).toContainText('Correct.');
}

test('a daily session from your own games brings missed positions back', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.clock.setFixedTime(T0);
  await mockLichess(page);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 2 of 2 games.')).toBeVisible({ timeout: 90_000 });

  await page.getByRole('link', { name: 'Train' }).click();
  await expect(page.getByText('Daily practice · 1 of 2')).toBeVisible();

  // First drill: play the game move again, take a hint, then give up.
  const goal = (await page.locator('.drill__goal').innerText()).trim();
  const gameMove = goal.match(/You played \d+\.+ (\S+)\./)![1]!;
  await page.getByLabel('Type a move').fill(gameMove);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('status')).toContainText(`${gameMove} is the move from your game.`);
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.locator('.hint-list li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByRole('status')).toContainText('The answer is');
  await expect(page.getByRole('heading', { name: 'Why' })).toBeVisible();
  await page.getByRole('button', { name: 'Next drill' }).click();

  // Second drill solved first try. The missed drill is added to the end.
  await answerCorrectly(page);
  await expect(page.getByText('Daily practice · 2 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Next drill' }).click();

  // The missed drill again.
  await expect(page.locator('.drill__goal')).toHaveText(goal);
  await answerCorrectly(page);
  await page.getByRole('button', { name: 'Finish' }).click();

  await expect(page.getByRole('heading', { name: 'Session done' })).toBeVisible();
  await expect(page.getByText('Missed positions come back in ten minutes')).toBeVisible();
  await expect(page.getByRole('img', { name: '1 day of practice in a row' })).toBeVisible();

  // Solving the positions unlocks their plan drills.
  await page.getByRole('button', { name: 'Check for more drills' }).click();
  await expect(page.getByRole('heading', { name: 'Pick the best plan.' })).toBeVisible();

  // A day later the two solved drills are due again and come first.
  await page.clock.setFixedTime(T0 + 25 * 3_600_000);
  await page.reload();
  await expect(page.getByText(/Daily practice · 1 of \d+/)).toBeVisible();
  await expect(page.locator('.drill__goal')).toContainText('You played');

  // The progress screen charts the puzzle rating and has a table view.
  await page.goto('./#/progress');
  await expect(page.getByRole('heading', { name: /Your progress/ })).toBeVisible();
  await expect(
    page.getByRole('img', { name: /Puzzle rating from 1500 to \d+ over 4 drills/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show as table' }).click();
  await expect(page.locator('.chart__table tbody tr')).toHaveCount(4);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('typed moves are checked for legality', async ({ page }) => {
  test.setTimeout(120_000);
  await mockLichess(page);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 2 of 2 games.')).toBeVisible({ timeout: 90_000 });
  await page.goto('./#/train');
  await page.getByLabel('Type a move').fill('Ke5');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('alert')).toContainText('Ke5 is not a legal move here.');
});
