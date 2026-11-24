import { afterAll, describe, expect, it } from 'vitest';
import { nodePool } from '../support/node-engine';

const pool = nodePool(1);
afterAll(() => pool.terminate());

describe('Stockfish lite in Node', () => {
  it('finds mate in one', async () => {
    // White plays Qxf7#.
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    const r = await pool.search({ fen, depth: 10 });
    expect(r.bestmove).toBe('h5f7');
    expect(r.lines[0]?.score).toEqual({ kind: 'mate', value: 1 });
  }, 30_000);

  it('returns three lines with multipv 3', async () => {
    const r = await pool.search({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      depth: 8,
      multipv: 3,
    });
    expect(r.lines).toHaveLength(3);
    expect(new Set(r.lines.map((l) => l.pv[0])).size).toBe(3);
  }, 30_000);
});
