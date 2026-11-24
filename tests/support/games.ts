import { sanToUci } from '../../src/import/normalize';
import type { Game, Side } from '../../src/import/types';

/** A minimal Game record for tests. */
export function makeGame(san: string[], userColor: Side, extra: Partial<Game> = {}): Game {
  return {
    id: `test:${san.join('')}`,
    source: 'lichess',
    sourceId: 'x',
    url: '',
    owner: 'me',
    userColor,
    white: { name: 'W' },
    black: { name: 'B' },
    speed: 'blitz',
    result: '1/2-1/2',
    playedAt: 0,
    san,
    uci: sanToUci(san)!,
    ...extra,
  };
}
