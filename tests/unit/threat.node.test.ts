import { afterAll, describe, expect, it } from 'vitest';
import { findThreat } from '../../src/engine/threat';
import { nodePool } from '../support/node-engine';

const pool = nodePool(1);
afterAll(() => pool.terminate());

describe('threat search with Stockfish', () => {
  it('finds the capture the opponent threatens', async () => {
    // White to move; Black's rook attacks the undefended knight on d4.
    const fen = '3rk3/8/8/8/3N4/8/8/4K3 w - - 0 1';
    const now = await pool.search({ fen, depth: 10 });
    const t = await findThreat((r) => pool.search(r), fen, now.lines[0]!.score);
    expect(t?.uci).toBe('d8d4');
  });

  it('finds no threat in a quiet position', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const now = await pool.search({ fen, depth: 10 });
    expect(await findThreat((r) => pool.search(r), fen, now.lines[0]!.score)).toBeUndefined();
  });
});
