import type { Page } from '@playwright/test';

/** Records page errors and console errors, including CSP violations. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

export const player = (name: string, rating: number) => ({
  user: { name, id: name.toLowerCase() },
  rating,
});

/** Two short rated games for TestPlayer, newest first, as Lichess NDJSON. */
export const lichessGames = [
  {
    id: 'game0002',
    rated: true,
    variant: 'standard',
    speed: 'blitz',
    status: 'mate',
    createdAt: 1_790_000_100_000,
    winner: 'white',
    moves: 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#',
    clock: { initial: 300, increment: 0 },
    players: { white: player('Opponent', 1500), black: player('TestPlayer', 1490) },
  },
  {
    id: 'game0001',
    rated: true,
    variant: 'standard',
    speed: 'rapid',
    status: 'resign',
    createdAt: 1_790_000_000_000,
    winner: 'white',
    moves: 'e4 e5 Nf3 Qh4 Nxh4',
    clock: { initial: 600, increment: 0 },
    players: { white: player('Rival', 1510), black: player('TestPlayer', 1490) },
  },
];

export async function mockLichess(page: Page, games: unknown[] = lichessGames): Promise<string[]> {
  const urls: string[] = [];
  await page.route('https://lichess.org/api/games/user/**', async (route) => {
    urls.push(route.request().url());
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/x-ndjson', 'access-control-allow-origin': '*' },
      body: games.map((g) => JSON.stringify(g)).join('\n') + '\n',
    });
  });
  return urls;
}
