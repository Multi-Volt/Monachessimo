import { expect, test } from '@playwright/test';

test('placeholder page renders at phone width', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Monachessimo' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('early build');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page must not scroll sideways').toBeLessThanOrEqual(0);
  expect(errors, 'no console errors, including CSP violations').toEqual([]);
});
