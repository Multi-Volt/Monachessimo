import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { collectErrors, mockLichess, typeMove } from './support';

test('works in airplane mode after the first visit', async ({ page, context }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await mockLichess(page);
  await page.goto('./');
  await page.getByLabel('Username').fill('TestPlayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await expect(page.getByText('Finished. Analyzed 2 of 2 games.')).toBeVisible({ timeout: 90_000 });

  // Wait for the service worker to install, then load once under its control.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  await page.goto('./#/games');
  await expect(page.locator('.game-row')).toHaveCount(2);

  // The engine runs from the cache: a move outside the saved lines is checked live.
  await page.goto('./#/train');
  // a6 is legal in both drill positions and is not in the saved lines.
  await typeMove(page, 'a6');
  await expect(page.getByRole('status')).toContainText(/Correct\.|Not this one\./, {
    timeout: 30_000,
  });

  // Importing needs the network and says so.
  await page.goto('./#/import');
  await expect(
    page.getByText('You are offline. Connect to the internet to import games.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import games' })).toBeDisabled();
  await context.setOffline(false);
  expect(errors.filter((e) => !e.includes('ERR_INTERNET_DISCONNECTED'))).toEqual([]);
});

test('the offline bundle runs from python3 -m http.server', async ({ page }) => {
  test.skip(!existsSync('dist-offline/index.html'), 'Run npm run build:offline first');
  test.setTimeout(150_000);
  const port = 8765;
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: 'dist-offline',
    stdio: 'ignore',
  });
  try {
    const errors = collectErrors(page);
    await mockLichess(page);
    await expect
      .poll(async () => (await fetch(`http://127.0.0.1:${port}/`).catch(() => undefined))?.status, {
        timeout: 10_000,
      })
      .toBe(200);
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    await page.getByLabel('Username').fill('TestPlayer');
    await page.getByRole('button', { name: 'Import games' }).click();
    await expect(page.getByText('Finished. Analyzed 2 of 2 games.')).toBeVisible({
      timeout: 90_000,
    });
    await page.goto(`http://127.0.0.1:${port}/index.html#/settings`);
    await expect(page.getByText('You are using the offline copy.')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    server.kill();
  }
});
