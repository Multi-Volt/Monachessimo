import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './support';

/** A fake speech engine: records what is spoken; `local` says whether a device voice exists. */
async function fakeSpeech(page: Page, local: boolean) {
  await page.addInitScript((hasLocal) => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    const voices = [
      {
        voiceURI: 'cloud',
        name: 'Cloud English',
        lang: 'en-US',
        localService: false,
        default: true,
      },
      ...(hasLocal
        ? [
            {
              voiceURI: 'device',
              name: 'Device English',
              lang: 'en-GB',
              localService: true,
              default: false,
            },
          ]
        : []),
    ];
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      voice: unknown = null;
      lang = '';
      constructor(public text: string) {}
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak: (u: SpeechSynthesisUtterance) => spoken.push(`${u.voice?.voiceURI}: ${u.text}`),
        cancel: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  }, local);
}

const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

test('no voice setting when the device has only cloud voices', async ({ page }) => {
  await fakeSpeech(page, false);
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Engine' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Spoken coaching' })).toHaveCount(0);
  await page.goto('./#/learn/rook');
  await expect(page.getByRole('heading', { level: 1, name: 'The rook' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read aloud' })).toHaveCount(0);
});

test('a device voice reads lessons and the coach, never on page load', async ({ page }) => {
  const errors = collectErrors(page);
  await fakeSpeech(page, true);
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Spoken coaching' })).toBeVisible();
  // Only the device voice is offered.
  const options = await page.getByLabel('Voice').locator('option').allTextContents();
  expect(options).toEqual(['Device English (en-GB)']);
  await page.getByLabel('Read every verdict aloud in practice games').check();
  expect(await spoken(page)).toEqual([]);
  await page.getByRole('button', { name: 'Try the voice' }).click();
  expect(await spoken(page)).toEqual(['device: knight f3 develops the knight and attacks e5.']);

  // Opening a lesson reads nothing by itself.
  await page.goto('./#/learn/rook');
  await expect(page.getByRole('heading', { level: 1, name: 'The rook' })).toBeVisible();
  expect(await spoken(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Read aloud' }).click();
  const said = (await spoken(page)).at(-1)!;
  expect(said).toBe(
    'device: The rook moves in straight lines: forwards, backwards, left or right, as many squares as it likes. It cannot jump over other pieces.',
  );
  expect(errors).toEqual([]);
});
