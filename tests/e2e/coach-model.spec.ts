import { expect, test } from '@playwright/test';
import { collectErrors, typeMove } from './support';

// Runs the real wording model, which is 386 MB, so only when asked:
// COACH_MODEL_E2E=1, with scripts/fetch-coach-model.sh run before the build.
test('the coach model rewrites a refused move in plain sentences @model', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await page.goto('./#/settings');
  await page.getByLabel("Word the coach's explanations with the model").check();
  await expect(page.getByText(/The model is ready/)).toBeVisible({ timeout: 180_000 });

  // After 1.e4 e5 2.Nf3, Black to move; b5 hangs a pawn to the bishop.
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  await page.goto(`./#/play/fen/${encodeURIComponent(fen)}`);
  await page.getByLabel('Refuse mistakes and blunders').check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });
  await typeMove(page, 'b5');
  const coach = page.locator('.coach');
  await expect(coach).toContainText(/Pawn to b5 \(b5\) is a blunder/, { timeout: 30_000 });
  // The template's first point shows at once; the model's sentences replace it.
  const started = Date.now();
  await expect(coach.locator('.coach__text')).toContainText(/[Pp]awn to b5/, { timeout: 120_000 });
  console.log(
    `Model text after ${Date.now() - started} ms:`,
    await coach.locator('.coach__text').textContent(),
  );
  expect(errors).toEqual([]);
});

test('the coach model also words the note on an accepted inaccuracy @model', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await page.goto('./#/settings');
  await page.getByLabel("Word the coach's explanations with the model").check();
  await expect(page.getByText(/The model is ready/)).toBeVisible({ timeout: 180_000 });

  // After 1.e4 e5 2.d4 exd4 3.Nf3 Nc6 4.Nxd4 Nxd4 5.Qxd4: c5 costs about a pawn,
  // an inaccuracy or a mistake depending on the search, and is accepted.
  const fen = 'r1bqkbnr/pppp1ppp/8/8/3QP3/8/PPP2PPP/RNB1KB1R b KQkq - 0 5';
  await page.goto(`./#/play/fen/${encodeURIComponent(fen)}`);
  await page.getByLabel('Refuse blunders only').check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page.getByRole('heading', { name: 'Your move' })).toBeVisible({ timeout: 30_000 });
  await typeMove(page, 'c5');
  const coach = page.locator('.coach');
  await expect(coach).toContainText(/Accepted, but pawn to c5 \(c5\) is an? (inaccuracy|mistake)/, {
    timeout: 30_000,
  });
  await expect(coach.locator('.coach__text')).toContainText(/[Pp]awn to c5/, { timeout: 120_000 });
  console.log('Note text:', await coach.locator('.coach__text').textContent());
  expect(errors).toEqual([]);
});
