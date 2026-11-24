import { afterAll, describe, expect, it } from 'vitest';
import { analyzeGame, type Search } from '../../src/analysis/pipeline';
import {
  DEFAULT_SETTINGS,
  type AnalysisSettings,
  type GameAnalysis,
} from '../../src/analysis/types';
import { sanToUci } from '../../src/import/normalize';
import type { Game, Side } from '../../src/import/types';
import { nodePool } from '../support/node-engine';

// Depths are pinned low so the golden results are stable and the suite is fast.
const SETTINGS: AnalysisSettings = {
  ...DEFAULT_SETTINGS,
  fastDepth: 10,
  fastMovetime: 5000,
  deepDepth: 12,
  deepMovetime: 5000,
};

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

const pool = nodePool(2);
afterAll(() => pool.terminate());
const search: Search = (r, s) => pool.search(r, s);

describe('analyzeGame with Stockfish', () => {
  it('marks a move that allows mate in one as a blunder', async () => {
    // 3...Nf6?? allows 4.Qxf7#.
    const game = makeGame(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'], 'black');
    const a = await analyzeGame(game, { search, settings: SETTINGS });
    expect(a.status).toBe('done');
    const blunders = a.reviews.filter((r) => r.class === 'blunder');
    expect(blunders.map((r) => r.ply)).toEqual([5]);
    expect(blunders[0]?.san).toBe('Nf6');
    // Any move that guards f7 or blocks the queen stops the mate.
    expect(['g7g6', 'd8e7', 'd8f6']).toContain(blunders[0]?.lines[0]?.pv[0]);
    // The last position is checkmate, which needs no engine call.
    expect(a.evals[7]).toEqual({ kind: 'mate', value: 0 });
  }, 60_000);

  it('marks a hung queen as a blunder', async () => {
    // 1.e4 e5 2.Nf3 Qh4?? 3.Nxh4 drops Black's queen for nothing.
    const game = makeGame(['e4', 'e5', 'Nf3', 'Qh4', 'Nxh4'], 'black');
    const a = await analyzeGame(game, { search, settings: SETTINGS });
    const r = a.reviews.find((x) => x.ply === 3);
    expect(r?.class).toBe('blunder');
    expect(r?.drop).toBeGreaterThan(0.5);
  }, 60_000);

  it('does not flag the opponent and stays quiet in a normal opening', async () => {
    const game = makeGame(
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'],
      'white',
    );
    const a = await analyzeGame(game, { search, settings: SETTINGS });
    expect(a.reviews.filter((r) => r.class === 'blunder' || r.class === 'mistake')).toEqual([]);
    expect(a.reviews.every((r) => r.mover === 'white')).toBe(true);
  }, 60_000);

  it('resumes after a pause without redoing finished positions', async () => {
    const game = makeGame(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7'], 'white');
    const ctrl = new AbortController();
    let saved: GameAnalysis | undefined;
    let finishedSearches = 0;
    const counting: Search = async (r, s) => {
      const result = await search(r, s);
      if (++finishedSearches === 3) ctrl.abort(new DOMException('Paused', 'AbortError'));
      return result;
    };
    await expect(
      analyzeGame(game, {
        search: counting,
        settings: SETTINGS,
        signal: ctrl.signal,
        checkpointEvery: 1,
        onCheckpoint: (a) => void (saved = structuredClone(a)),
      }),
    ).rejects.toThrow();
    expect(saved?.status).toBe('partial');
    const finished = saved!.evals.filter((e) => e !== null).length;
    expect(finished).toBeGreaterThan(0);

    let resumedCalls = 0;
    const a = await analyzeGame(game, {
      search: (r, s) => (resumedCalls++, search(r, s)),
      settings: SETTINGS,
      resume: saved!,
    });
    expect(a.status).toBe('done');
    expect(a.evals.every((e) => e !== null)).toBe(true);
    expect(resumedCalls).toBeLessThan(game.uci.length + 1);
  }, 60_000);

  it('uses imported Lichess evals instead of a fast pass', async () => {
    const san = ['e4', 'e5', 'Nf3', 'Qh4', 'Nxh4'];
    const game = makeGame(san, 'black', {
      // White-side evals after each ply, as Lichess sends them.
      importedEvals: [
        { kind: 'cp', value: 30 },
        { kind: 'cp', value: 30 },
        { kind: 'cp', value: 25 },
        { kind: 'cp', value: 900 },
        { kind: 'cp', value: 880 },
      ],
    });
    const reqs: number[] = [];
    const a = await analyzeGame(game, {
      search: (r, s) => (reqs.push(r.multipv ?? 1), search(r, s)),
      settings: SETTINGS,
    });
    // One fast search for the start position, then deep searches only.
    expect(reqs.filter((m) => m === 1).length).toBeLessThanOrEqual(2);
    expect(a.reviews.find((r) => r.ply === 3)?.class).toBe('blunder');
  }, 60_000);
});
