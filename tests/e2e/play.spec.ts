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
  await page.getByLabel(/Start after/).fill('3');
  await page.getByLabel('Refuse mistakes and blunders').check();
  await page.getByRole('button', { name: 'Start the game' }).click();

  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('You play black')).toBeVisible();
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
