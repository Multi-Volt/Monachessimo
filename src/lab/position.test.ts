import { describe, expect, it } from 'vitest';
import { Board } from 'chessops/board';
import { parseSquare } from 'chessops/util';
import {
  applyTyped,
  boardOf,
  checkFen,
  fenFromBoard,
  fenToHash,
  hashToFen,
  INITIAL_FEN,
  place,
  READING_ORDER,
} from './position';

describe('Lab positions', () => {
  it('accepts legal FENs and explains illegal ones', () => {
    expect(checkFen(INITIAL_FEN).ok).toBe(true);
    expect(checkFen('nonsense')).toEqual({
      ok: false,
      error: 'That is not a FEN. It needs six fields.',
    });
    const noKing = checkFen('8/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(noKing.ok).toBe(false);
    if (!noKing.ok) expect(noKing.error).toBe('Each side needs exactly one king.');
  });

  it('places pieces, keeps one king per side and clears squares', () => {
    let b = Board.empty();
    b = place(b, parseSquare('e1')!, { color: 'white', role: 'king' });
    b = place(b, parseSquare('g1')!, { color: 'white', role: 'king' });
    expect(b.kingOf('white')).toBe(parseSquare('g1'));
    expect(b.get(parseSquare('e1')!)).toBeUndefined();
    b = place(b, parseSquare('g1')!, null);
    expect(b.kingOf('white')).toBeUndefined();
  });

  it('reads typed edits and refuses words it cannot read', () => {
    const r = applyTyped(Board.empty(), 'Ke1, ke8 Qd4 xd4');
    expect(r.ok).toBe(true);
    if (r.ok) expect(fenFromBoard(r.board, 'white')).toBe('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(applyTyped(Board.empty(), 'Kz9')).toEqual({
      ok: false,
      error: '"Kz9" is not an edit. Use Ke1, qd8 or xd4.',
    });
  });

  it('gives castling rights where king and rook stand at home', () => {
    expect(fenFromBoard(boardOf(INITIAL_FEN), 'black')).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
    );
    const r = applyTyped(boardOf(INITIAL_FEN), 'xh1 xa8');
    if (r.ok) expect(fenFromBoard(r.board, 'white').split(' ')[2]).toBe('Qk');
  });

  it('round-trips the FEN through the hash, and drops a bad one', () => {
    expect(hashToFen(fenToHash(INITIAL_FEN))).toBe(INITIAL_FEN);
    expect(fenToHash(INITIAL_FEN)).not.toContain(' ');
    expect(hashToFen('garbage')).toBeUndefined();
    expect(hashToFen(undefined)).toBeUndefined();
  });

  it('lists squares from a8 to h1', () => {
    expect(READING_ORDER[0]).toBe(parseSquare('a8'));
    expect(READING_ORDER[63]).toBe(parseSquare('h1'));
  });
});
