import { expect, test } from '@playwright/test';
import { collectErrors, typeMove } from './support';

// White's knight on d4 is attacked by the bishop on b6 and has no guard.
const FEN = '7k/8/1b6/8/3N4/8/8/R6K w - - 0 1';
const hash = (fen: string) => fen.replace(/ /g, '_').replace(/\//g, '%2F');

test('the Lab analyses a shared position, names the threat and judges a tried move', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto(`./#/lab/${hash(FEN)}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Lab' })).toBeVisible();
  await expect(page.getByText('White to move.')).toBeVisible();

  // Candidate lines from the on-device engine, and the threat behind the position.
  await expect(page.locator('.lab__line').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.lab__threat')).toContainText(
    "If it were Black's move, Black would play Bxd4, taking the knight on d4.",
    {
      timeout: 60_000,
    },
  );

  // A move that ignores the threat gets the coach's explanation.
  await typeMove(page, 'Ra2');
  await expect(page.locator('.coach')).toContainText('already attacked', { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Ra2' })).toBeVisible();
  expect(decodeURIComponent(new URL(page.url()).hash)).toContain('7k/8/1b6/8/3N4/8/R7/7K_b');

  // Step back and edit the board by typing.
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Edit position' }).click();
  await expect(page.getByRole('gridcell', { name: 'd4, white knight' })).toBeVisible();
  await page.getByLabel('Type edits').fill('xd4 Qd1');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('gridcell', { name: 'd1, white queen' })).toBeVisible();
  // Tapping a square with the eraser clears it.
  await page.getByRole('radio', { name: 'Eraser' }).click();
  await page.getByRole('gridcell', { name: 'a1, white rook' }).click();
  await expect(page.getByRole('gridcell', { name: 'a1, empty' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.lab__fen')).toHaveText('7k/8/1b6/8/8/8/8/3Q3K w - - 0 1');

  // An illegal setup cannot be finished.
  await page.getByRole('button', { name: 'Edit position' }).click();
  await page.getByLabel('Type edits').fill('xh8');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Each side needs exactly one king.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Play from here' }).click();
  await expect(page).toHaveURL(/#\/play\/fen\//);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('the Lab editor renders at phone width without overflow', async ({ page }) => {
  await page.goto('./#/lab');
  await page.getByRole('button', { name: 'Edit position' }).click();
  await expect(page.getByRole('grid', { name: 'Board to edit' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/lab-editor.png', fullPage: true });
});
