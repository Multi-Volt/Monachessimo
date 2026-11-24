import { expect, test } from '@playwright/test';
import { collectErrors, mockLichess, player } from './support';

// Six games where TestPlayer, as Black, hangs the queen with 2...Qh4.
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

test('dashboard ranks a repeated weakness with its sample size', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await mockLichess(page, games);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 6 of 6 games.')).toBeVisible({ timeout: 90_000 });

  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: /Your weaknesses/ })).toBeVisible();
  await expect(page.getByText('6 of 6 games analyzed for TestPlayer')).toBeVisible();
  const first = page.locator('.weakness').first();
  await expect(first).toContainText('Leaving pieces unprotected');
  await expect(first).toContainText('Based on 6 positions in 6 games');
  await expect(
    page.getByText(/Your most costly habit: you leave a piece where it can be taken/),
  ).toBeVisible();

  await first.getByRole('link', { name: 'Leaving pieces unprotected' }).click();
  await expect(page.getByRole('heading', { name: /Leaving pieces unprotected/ })).toBeVisible();
  await page.locator('.game-row').first().click();
  await expect(page.getByRole('note')).toContainText('2... Qh4');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
