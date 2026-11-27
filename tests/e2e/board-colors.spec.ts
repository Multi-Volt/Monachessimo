import { expect, test } from '@playwright/test';
import { collectErrors } from './support';

const squareVar = (page: import('@playwright/test').Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test('board square colors can be changed and are kept', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Board colors' })).toBeVisible();
  expect(await squareVar(page, '--sq-dark')).toBe('#ae8a5c');

  await page.getByLabel('Green').check();
  await expect.poll(() => squareVar(page, '--sq-dark')).toBe('#769656');
  expect(await squareVar(page, '--sq-light')).toBe('#eeeed2');

  await page.getByLabel('Custom').first().check();
  await page.getByLabel('Dark squares').fill('#336699');
  await expect.poll(() => squareVar(page, '--sq-dark')).toBe('#336699');

  await page.reload();
  await expect.poll(() => squareVar(page, '--sq-dark')).toBe('#336699');
  await expect(page.getByLabel('Custom').first()).toBeChecked();
  expect(errors).toEqual([]);
});
