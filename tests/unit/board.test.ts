import { describe, expect, it } from 'vitest';
import { parseSquare } from 'chessops/util';
import { fromFen, hangingPieces, see } from '../../src/detectors/board';
import { features } from '../../src/strategy/features';
import { conversionFailure } from '../../src/detectors';
import type { GameAnalysis } from '../../src/analysis/types';
import { makeGame } from '../support/games';

const sq = (s: string) => parseSquare(s)!;

describe('static exchange evaluation', () => {
  it('wins an undefended piece', () => {
    // White rook takes the undefended knight on d5.
    const pos = fromFen('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1');
    expect(see(pos, sq('d5'), 'white')).toBe(3);
  });

  it('loses a rook for a knight defended by a pawn', () => {
    const pos = fromFen('4k3/8/4p3/3n4/8/8/8/3RK3 w - - 0 1');
    expect(see(pos, sq('d5'), 'white')).toBe(-2);
  });

  it('counts x-ray recaptures', () => {
    // Two white rooks against one defender: Rxd5 exd5 Rxd5 wins a knight and a pawn for a rook... -1.
    const pos = fromFen('4k3/8/4p3/3n4/8/8/3R4/3RK3 w - - 0 1');
    expect(see(pos, sq('d5'), 'white')).toBe(-1);
  });

  it('finds hanging pieces', () => {
    const pos = fromFen('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1');
    expect(hangingPieces(pos, 'black')).toEqual([sq('d5')]);
    expect(hangingPieces(pos, 'white')).toEqual([]);
  });
});

describe('features', () => {
  it('counts a full pawn shield for a castled king', () => {
    const f = features(fromFen('6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1'), 'white');
    expect(f.pawnShield).toBe(3);
    expect(f.openFilesNearKing).toBe(0);
  });

  it('counts isolated, doubled and passed pawns', () => {
    // White: a2 isolated, c2 c3 doubled, h4 passed (no black pawns on g or h files).
    const f = features(fromFen('4k3/3p4/8/8/7P/2P5/P1P5/4K3 w - - 0 1'), 'white');
    expect(f.isolatedPawns).toBe(4);
    expect(f.doubledPawns).toBe(1);
    expect(f.passedPawns).toBeGreaterThanOrEqual(2);
    expect(f.pawnIslands).toBe(3);
  });

  it('detects the bishop pair and rooks on open files', () => {
    const f = features(fromFen('4k3/pppp4/8/8/8/8/1PP5/R1B1KB1R w - - 0 1'), 'white');
    expect(f.bishopPair).toBe(1);
    expect(f.rooksOnOpenFiles).toBe(2);
  });
});

function analysisWith(evalsWhiteCp: number[], reviews: GameAnalysis['reviews']): GameAnalysis {
  return {
    gameId: 'g',
    settings: 's',
    status: 'done',
    // Stored evals are from the side to move: negate on Black's turns.
    evals: evalsWhiteCp.map((cp, i) => ({ kind: 'cp', value: i % 2 === 0 ? cp : -cp })),
    best: [],
    flagged: [],
    reviews,
    engineMs: 0,
    updatedAt: 0,
  };
}

const review = (ply: number, drop: number): GameAnalysis['reviews'][number] => ({
  ply,
  mover: 'white',
  san: 'x',
  uci: 'a2a3',
  wcBefore: 0,
  wcAfter: 0,
  drop,
  fastDrop: drop,
  class: 'blunder',
  lines: [],
  playedScore: { kind: 'cp', value: 0 },
  playedPv: [],
});

describe('conversionFailure', () => {
  const san = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6'];
  it('tags the worst mistake after a winning position that was drawn', () => {
    const g = makeGame(san, 'white', { result: '1/2-1/2' });
    const a = analysisWith([20, 20, 400, 450, 420, 30, 10, 0, 0], [review(4, 0.4), review(6, 0.1)]);
    expect(conversionFailure(g, a)).toBe(4);
  });
  it('tags a lost game that was won', () => {
    const g = makeGame(san, 'white', { result: '0-1' });
    const a = analysisWith([20, 500, 500, 500, -900, -900, -900, -900, -900], [review(4, 1.2)]);
    expect(conversionFailure(g, a)).toBe(4);
  });
  it('tags Black failing to convert', () => {
    const g = makeGame(san, 'black', { result: '1/2-1/2' });
    const r = { ...review(5, 0.5), mover: 'black' as const };
    const a = analysisWith([0, -400, -450, -400, -400, 0, 0, 0, 0], [r]);
    expect(conversionFailure(g, a)).toBe(5);
  });
  it('ignores games the player won', () => {
    const g = makeGame(san, 'white', { result: '1-0' });
    expect(
      conversionFailure(
        g,
        analysisWith([400, 400, 400, 400, 400, 400, 400, 400, 400], [review(4, 0.4)]),
      ),
    ).toBeUndefined();
  });
  it('ignores a single winning spike', () => {
    const g = makeGame(san, 'white', { result: '1/2-1/2' });
    expect(
      conversionFailure(g, analysisWith([0, 500, 0, 0, 0, 0, 0, 0, 0], [review(4, 0.4)])),
    ).toBeUndefined();
  });
  it('ignores games that were never clearly winning', () => {
    const g = makeGame(san, 'white', { result: '0-1' });
    expect(
      conversionFailure(
        g,
        analysisWith([50, 150, 200, 100, 0, -300, -500, -900, -900], [review(4, 0.4)]),
      ),
    ).toBeUndefined();
  });
});
