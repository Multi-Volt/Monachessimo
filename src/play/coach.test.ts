import { describe, expect, it } from 'vitest';
import { makeFen } from 'chessops/fen';
import { fromFen, playUci } from '../detectors/board';
import { positionKey } from '../engine/uci';
import { makeGame } from '../../tests/support/games';
import { gameEnd, judgeMove, refuses, skillFor } from './coach';
import { buildIndex, yourVisits } from './positions';

describe('coach', () => {
  it('refuses a move by strictness', () => {
    const best = { kind: 'cp' as const, value: 50 };
    const muchWorse = { kind: 'cp' as const, value: -300 };
    expect(refuses('inaccuracies', best, { kind: 'cp', value: 30 })).toBe(false);
    expect(refuses('inaccuracies', best, { kind: 'cp', value: 0 })).toBe(true);
    expect(refuses('mistakes', best, { kind: 'cp', value: 0 })).toBe(false);
    expect(refuses('blunders', best, muchWorse)).toBe(true);
  });

  it('calls a pawn given away near equality a mistake', () => {
    // +0.3 to -0.7: only 0.18 of winning chances, but a full pawn.
    const v = judgeMove({ kind: 'cp', value: 30 }, { kind: 'cp', value: -70 });
    expect(v.drop).toBeLessThan(0.2);
    expect(v.class).toBe('mistake');
    expect(refuses('mistakes', { kind: 'cp', value: 30 }, { kind: 'cp', value: -70 })).toBe(true);
  });

  it('calls a piece given away a blunder', () => {
    expect(judgeMove({ kind: 'cp', value: 0 }, { kind: 'cp', value: -300 }).class).toBe('blunder');
  });

  it('ignores pawns when the game is already decided', () => {
    expect(judgeMove({ kind: 'cp', value: 900 }, { kind: 'cp', value: 800 }).class).toBeNull();
  });

  it('does not refuse every move in a lost position', () => {
    // Down 5.3, a move that ends 7.3 down loses little of the chances left.
    expect(refuses('mistakes', { kind: 'cp', value: -530 }, { kind: 'cp', value: -730 })).toBe(
      false,
    );
    // Allowing mate is still refused.
    expect(refuses('mistakes', { kind: 'cp', value: -530 }, { kind: 'mate', value: -2 })).toBe(
      true,
    );
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
