import { afterAll, describe, expect, it } from 'vitest';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { RECORD_VERSION } from '../../src/play/record';
import { recordFor } from '../../training/record-pipeline';
import { nodePool } from '../support/node-engine';

const pool = nodePool(1);
afterAll(() => pool.terminate());
const search = (r: Parameters<typeof pool.search>[0]) => pool.search(r);
const at = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

describe('training record pipeline with Stockfish', () => {
  it('builds a full record for a blunder', async () => {
    // White's knight on d4 is defended by the e3 pawn; e3e4 leaves it to the rook.
    const fen = '3rk3/8/8/8/3N4/4P3/8/4K3 w - - 0 1';
    const r = await recordFor(search, at(fen), 'e3e4', 40);
    expect(r?.version).toBe(RECORD_VERSION);
    expect(r?.verdict.class).toBe('blunder');
    expect(r?.reply[0]).toBe('d8d4');
    expect(r?.line[0]?.uci).toBe('e3e4');
    expect(r?.reason).toBeDefined();
    expect(r?.sentences.headline).toMatch(/^e4 is a blunder/);
  }, 60_000);

  it('returns nothing for a good move', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(await recordFor(search, at(fen), 'e2e4', 0)).toBeUndefined();
  }, 60_000);

  it('returns nothing for an illegal move', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(await recordFor(search, at(fen), 'e2e5', 0)).toBeUndefined();
  });
});
