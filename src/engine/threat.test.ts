import { describe, expect, it } from 'vitest';
import type { SearchResult } from './engine';
import { findThreat, nullMoveFen } from './threat';

describe('null move', () => {
  it('passes the turn and clears en passant', () => {
    expect(nullMoveFen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3')).toBe(
      'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3',
    );
  });
  it('refuses a position in check', () => {
    expect(nullMoveFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')).toBeUndefined();
  });
});

describe('findThreat', () => {
  const reply = (uci: string, cp: number) => async (): Promise<SearchResult> =>
    ({
      bestmove: uci,
      lines: [{ multipv: 1, depth: 10, score: { kind: 'cp', value: cp }, pv: [uci] }],
    }) as SearchResult;
  const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
  it('reports a move that wins material if the player passes', async () => {
    const t = await findThreat(reply('e8e7', 300), fen, { kind: 'cp', value: 0 });
    expect(t).toEqual({ uci: 'e8e7', score: { kind: 'cp', value: 300 }, gain: 300 });
  });
  it('ignores a pass that costs little', async () => {
    expect(await findThreat(reply('e8e7', 40), fen, { kind: 'cp', value: 0 })).toBeUndefined();
  });
});
