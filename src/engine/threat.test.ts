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
  // Black's rook on e2 can take the white knight on a2 if White passes.
  const fen = '4k3/8/8/8/8/8/N3r3/6K1 w - - 0 1';
  it('reports a move that wins material if the player passes', async () => {
    const t = await findThreat(reply('e2a2', 300), fen, { kind: 'cp', value: 0 });
    expect(t).toEqual({ uci: 'e2a2', score: { kind: 'cp', value: 300 }, gain: 300 });
  });
  it('ignores a pass that costs little', async () => {
    expect(await findThreat(reply('e2a2', 40), fen, { kind: 'cp', value: 0 })).toBeUndefined();
  });
  it('ignores a quiet move, however much the engine likes it', async () => {
    // After 1.e4 e5 2.d4 exd4 3.Nf3 Nc6 4.Nxd4 Nxd4 5.Qxd4: Nc3 develops, it threatens nothing.
    const opening = 'r1bqkbnr/pppp1ppp/8/8/3QP3/8/PPP2PPP/RNB1KB1R b KQkq - 0 5';
    expect(await findThreat(reply('b1c3', 80), opening, { kind: 'cp', value: 0 })).toBeUndefined();
  });
  it('reports a check or a mate', async () => {
    const mate = async (): Promise<SearchResult> =>
      ({
        bestmove: 'e2e1',
        lines: [{ multipv: 1, depth: 10, score: { kind: 'mate', value: 1 }, pv: ['e2e1'] }],
      }) as SearchResult;
    expect(await findThreat(mate, fen, { kind: 'cp', value: 0 })).toBeDefined();
  });
});
