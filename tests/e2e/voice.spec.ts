import { expect, test, type Page } from '@playwright/test';
import { collectErrors, typeMove } from './support';

/**
 * A fake speech engine that records what is spoken. Its voices: a cloud
 * voice and a device voice, only the cloud voice, or none listed, as Chrome
 * on Android often reports.
 */
async function fakeSpeech(page: Page, kind: 'both' | 'cloud' | 'none') {
  await page.addInitScript((kind) => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    const voices =
      kind === 'none'
        ? []
        : [
            {
              voiceURI: 'cloud',
              name: 'Cloud English',
              lang: 'en-US',
              localService: false,
              default: true,
            },
            ...(kind === 'both'
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
        speak: (u: SpeechSynthesisUtterance) =>
          spoken.push(`${u.voice?.voiceURI ?? 'default'}: ${u.text}`),
        cancel: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  }, kind);
}

const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

test('cloud voices are offered and marked', async ({ page }) => {
  await fakeSpeech(page, 'cloud');
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Spoken coaching' })).toBeVisible();
  const options = await page.getByLabel('Voice').locator('option').allTextContents();
  expect(options).toEqual(['Cloud English, en-US, may send text online']);
  await page.getByRole('button', { name: 'Try the voice' }).click();
  expect(await spoken(page)).toEqual(['cloud: knight f3 develops the knight and attacks e5.']);
});

test('a browser that lists no voices reads with the default voice', async ({ page }) => {
  await fakeSpeech(page, 'none');
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Spoken coaching' })).toBeVisible();
  await expect(page.getByLabel('Voice')).toHaveCount(0);
  await page.goto('./#/learn/rook');
  await expect(page.getByRole('heading', { level: 1, name: 'The rook' })).toBeVisible();
  expect(await spoken(page)).toEqual([]);
  await page.getByRole('button', { name: 'Read aloud' }).click();
  expect((await spoken(page)).at(-1)).toMatch(/^default: The rook moves/);
});

test('a device voice reads on a tap, and reads by itself only when asked', async ({ page }) => {
  const errors = collectErrors(page);
  await fakeSpeech(page, 'both');
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Spoken coaching' })).toBeVisible();
  // Both voices are offered, the cloud one marked, and the device voice is chosen.
  const options = await page.getByLabel('Voice').locator('option').allTextContents();
  expect(options).toEqual(['Cloud English, en-US, may send text online', 'Device English, en-GB']);
  await page.getByRole('button', { name: 'Try the voice' }).click();
  expect(await spoken(page)).toEqual(['device: knight f3 develops the knight and attacks e5.']);

  // Without automatic reading, opening a lesson reads nothing by itself.
  await page.goto('./#/learn/rook');
  await expect(page.getByRole('heading', { level: 1, name: 'The rook' })).toBeVisible();
  expect(await spoken(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Read aloud' }).click();
  const lesson =
    'device: The rook moves in straight lines: forwards, backwards, left or right, as many squares as it likes. It cannot jump over other pieces.';
  expect((await spoken(page)).at(-1)).toBe(lesson);

  // With it, the lesson text is read when it appears.
  await page.goto('./#/settings');
  await page.getByLabel(/Read aloud automatically/).check();
  await page.goto('./#/learn/rook');
  await expect(page.getByRole('heading', { level: 1, name: 'The rook' })).toBeVisible();
  await expect.poll(async () => (await spoken(page)).slice(2)).toEqual([lesson]);
  expect(errors).toEqual([]);
});

test('with automatic reading, every task and every answer in a lesson is read', async ({
  page,
}) => {
  await fakeSpeech(page, 'both');
  await page.goto('./#/settings');
  await page.getByLabel(/Read aloud automatically/).check();
  await page.goto('./#/learn/checkmate');
  const cont = page.getByRole('button', { name: 'Continue' });
  await cont.click();
  await page.getByRole('button', { name: "Yes, that's checkmate" }).click();
  await page.getByRole('button', { name: 'No, the king can escape' }).click();
  await cont.click();
  await page.getByRole('button', { name: "Yes, that's checkmate" }).click();
  await cont.click();
  await typeMove(page, 'Ra7');
  await typeMove(page, 'Ra8#');
  await expect(page.getByText('Checkmate. Well done.')).toBeVisible();
  // In order, after the opening explanation: question, wrong, right, and so on.
  const said = async () => (await spoken(page)).slice(1).map((s) => s.replace(/^device: /, ''));
  await expect
    .poll(said)
    .toEqual([
      'Is Black checkmated?',
      'Not quite. Try another answer.',
      'Right, no mate. The king can escape to h7.',
      'And this one, is Black checkmated?',
      'Right. The queen gives check, the white king protects her, and every square around the black king is covered.',
      'Checkmate the black king in one move.',
      'Not that move. Try again.',
      'Checkmate. Well done.',
    ]);
});
