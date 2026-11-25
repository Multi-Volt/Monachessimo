import { describe, expect, it } from 'vitest';
import { fromFen } from './board';
import { lineTactics } from './lineTactics';

// Real Lichess puzzles (CC0): the position before the losing move, the move,
// then the engine's punishing line.
const tactics = (fen: string, pv: string[]) => lineTactics(fromFen(fen), pv);
const kinds = (fen: string, pv: string[]) => tactics(fen, pv).map((t) => t.kind);

describe('tactics confirmed by the line', () => {
  it('finds a knight fork that wins the rook', () => {
    const t = tactics('8/6k1/6p1/p6p/Pr6/2N4P/3K2P1/8 b - - 5 50', [
      'g7f6',
      'c3d5',
      'f6e5',
      'd5b4',
    ]);
    expect(t[0]).toMatchObject({ kind: 'fork', ply: 1 });
    expect(t[0]!.text).toBe(
      "Your opponent's knight on d5 attacks your rook on b4 and your king on f6 at once.",
    );
  });

  it('finds a skewer through the king', () => {
    expect(
      kinds('8/p1R3pp/4k3/8/P1B5/1P5P/1r3rP1/6K1 b - - 1 27', ['e6f6', 'c7f7', 'f6e5', 'f7f2']),
    ).toContain('skewer');
  });

  it('finds a defender pinned to the king that cannot take the checking piece', () => {
    const t = tactics('3r1rk1/2p2ppp/p1n1p1bq/1pN4n/3P4/P1B2P2/1P2B1PP/2RQR2K w - - 6 20', [
      'c5a6',
      'h5g3',
      'h1g1',
      'h6e3',
    ]);
    expect(t.find((x) => x.kind === 'pin')?.text).toBe(
      "Your pawn on h2 cannot take your opponent's knight on g3, because your opponent's queen on h6 pins it to your king.",
    );
  });

  it('finds a discovered attack on the queen', () => {
    expect(
      kinds('r2qkbnr/1p1b1ppp/p1np4/4p3/Q3P3/2N1BN2/PPP2PPP/R3KB1R w KQkq - 0 8', [
        'c3d5',
        'c6d4',
        'e3d4',
        'd7a4',
      ]),
    ).toContain('discovered attack');
  });

  it('finds a back rank mate', () => {
    expect(
      kinds('4r1k1/1p3ppp/2p3b1/8/3P4/PQ2P3/BP4q1/3RK3 b - - 5 31', [
        'g6c2',
        'b3f7',
        'g8h8',
        'f7e8',
      ]),
    ).toContain('back rank mate');
  });

  it('finds a smothered mate', () => {
    expect(kinds('6rk/p5pp/8/6N1/8/8/8/K7 b - - 0 1', ['a7a6', 'g5f7'])).toEqual([
      'smothered mate',
    ]);
  });

  it('finds a piece left unprotected and taken at once', () => {
    expect(kinds('6k1/2R3p1/4Np1p/8/2p5/4K3/6PP/4r3 w - - 2 34', ['e3d4', 'e1e6'])).toEqual([
      'hanging piece',
    ]);
  });

  it('reports nothing for a plain trade', () => {
    expect(kinds('r2r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', ['d1d8', 'a8d8'])).toEqual([]);
  });
});
