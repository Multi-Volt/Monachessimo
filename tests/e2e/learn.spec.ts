import { expect, test, type Page } from '@playwright/test';
import { collectErrors, typeMove } from './support';

async function typeSquare(page: Page, sq: string) {
  const input = page.locator('#learn-square');
  if (!(await input.isVisible())) await page.getByText('Type a square instead').click();
  await input.fill(sq);
  await page.getByRole('button', { name: 'Go' }).click();
}

test('a lesson teaches step by step and keeps its stars', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await page.getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Learn/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New to chess' })).toBeVisible();

  // The rook lesson: an explanation, then three star tasks.
  await page.goto('./#/learn/rook');
  await expect(page.getByRole('heading', { level: 1, name: 'The rook' })).toBeVisible();
  await expect(page.getByText('step 1 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  const cont = page.getByRole('button', { name: 'Continue' });
  await expect(cont).toBeDisabled();
  await typeSquare(page, 'a6');
  await expect(page.getByText('All stars in 1 move.')).toBeVisible();
  await cont.click();

  // A square the rook cannot reach is refused.
  await typeSquare(page, 'b7');
  await expect(page.getByText('The piece cannot go to b7.')).toBeVisible();
  await typeSquare(page, 'a6');
  await typeSquare(page, 'f6');
  await expect(page.getByText('All stars in 2 moves.')).toBeVisible();
  await cont.click();

  await typeSquare(page, 'b4');
  await typeSquare(page, 'g4');
  await typeSquare(page, 'g7');
  await expect(page.getByText('All stars in 3 moves.')).toBeVisible();
  await page.getByRole('button', { name: 'Finish lesson' }).click();
  await expect(page.getByText('Lesson complete')).toBeVisible();
  await expect(page.getByRole('img', { name: '3 of 3 stars' })).toBeVisible();

  // The stars are kept in the overview.
  await page.getByRole('link', { name: 'All lessons' }).click();
  await page.locator('.learn__course-title', { hasText: 'The pieces' }).click();
  await expect(
    page
      .locator('.learn__lessons li', { hasText: 'The rook' })
      .getByRole('img', { name: '3 of 3 stars' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('quizzes and find-the-move tasks give feedback', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('./#/learn/checkmate');
  await expect(page.getByRole('heading', { level: 1, name: 'Checkmate' })).toBeVisible();
  const cont = page.getByRole('button', { name: 'Continue' });
  await cont.click();

  // A wrong answer is marked and the task stays open.
  await page.getByRole('button', { name: "Yes, that's checkmate" }).click();
  await expect(page.getByText('Not quite. Try another answer.')).toBeVisible();
  await expect(cont).toBeDisabled();
  await page.getByRole('button', { name: 'No, the king can escape' }).click();
  await expect(page.getByText('Right, no mate. The king can escape to h7.')).toBeVisible();
  await cont.click();
  await page.getByRole('button', { name: "Yes, that's checkmate" }).click();
  await cont.click();

  // m1: a check that is not mate is refused with the reason.
  await expect(page.locator('.learn__text')).toContainText('Checkmate the black king in one move.');
  await typeMove(page, 'Ra7');
  await expect(page.getByText('Not that move. Try again.')).toBeVisible();
  await typeMove(page, 'Ra8#');
  await expect(page.getByText('Checkmate. Well done.')).toBeVisible();
  await cont.click();

  // m2, from a corrected position: the hint rings the piece, then shows the move.
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.getByRole('button', { name: 'Show the move' }).click();
  await typeMove(page, 'Qg8#');
  await expect(page.getByText('Checkmate. Well done.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Learn screens fit a phone screen', async ({ page }) => {
  await page.goto('./#/learn/board');
  await expect(page.getByRole('heading', { level: 1, name: 'The chessboard' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/learn-lesson.png', fullPage: true });
});
