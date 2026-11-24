import { describe, expect, it } from 'vitest';
import { makeFen } from 'chessops/fen';
import { fromFen, playUci } from '../detectors/board';
import { positionKey } from '../engine/uci';
import { makeGame } from '../../tests/support/games';
import { gameEnd, refuses, skillFor } from './coach';
import { buildIndex, yourVisits } from './positions';

describe('coach', () => {
  it('refuses a move by strictness', () => {
    const best = { kind: 'cp' as const, value: 50 };
    const slightlyWorse = { kind: 'cp' as const, value: 0 };
    const muchWorse = { kind: 'cp' as const, value: -300 };
    expect(refuses('inaccuracies', best, slightlyWorse)).toBe(false);
    expect(refuses('inaccuracies', best, { kind: 'cp', value: -40 })).toBe(true);
    expect(refuses('mistakes', best, { kind: 'cp', value: -40 })).toBe(false);
    expect(refuses('blunders', best, muchWorse)).toBe(true);
  });

  it('maps rating to Skill Level within 0 to 20', () => {
    expect(skillFor(500)).toBe(0);
    expect(skillFor(1500)).toBe(8);
    expect(skillFor(3000)).toBe(20);
  });

  it('detects mate and threefold repetition', () => {
    const mate = playUci(fromFen('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'), 'd1d8')!;
    expect(gameEnd(mate, [])).toEqual({ kind: 'checkmate', winner: 'white' });
    const pos = fromFen('6k1/8/8/8/8/8/8/R5K1 w - - 0 1');
    const key = positionKey(makeFen(pos.toSetup()));
    expect(gameEnd(pos, [key, 'x', key])).toBeUndefined();
    expect(gameEnd(pos, [key, 'x', key, 'y', key])).toEqual({ kind: 'repetition' });
  });
});

describe('position index', () => {
  it("finds the player's own earlier moves from a position", () => {
    const g1 = makeGame(['e4', 'e5', 'Nf3', 'Nc6'], 'white', {
      id: 'g1',
      result: '1-0',
      playedAt: 2,
    });
    const g2 = makeGame(['e4', 'c5', 'Nf3'], 'white', { id: 'g2', result: '0-1', playedAt: 1 });
    const index = buildIndex([g1, g2]);
    const afterE5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(yourVisits(index, afterE5)).toEqual([
      expect.objectContaining({ gameId: 'g1', san: 'Nf3', outcome: 'won', yourMove: true }),
    ]);
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(yourVisits(index, start).map((v) => v.gameId)).toEqual(['g1', 'g2']);
    // Black's replies are the opponent's moves here, so they are not "yours".
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(yourVisits(index, afterE4)).toEqual([]);
  });
});
