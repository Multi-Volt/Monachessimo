import { Board } from 'chessops/board';
import { Chess } from 'chessops/chess';
import { INITIAL_FEN, makeBoardFen, makeFen, parseFen } from 'chessops/fen';
import type { Color, Role, Square } from 'chessops/types';
import { charToRole, makeSquare, parseSquare, roleToChar } from 'chessops/util';

export { INITIAL_FEN };

/** A FEN that chessops accepts and that is a legal position, or the reason it is not. */
export function checkFen(fen: string): { ok: true; pos: Chess } | { ok: false; error: string } {
  const setup = parseFen(fen.trim());
  if (setup.isErr) return { ok: false, error: 'That is not a FEN. It needs six fields.' };
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr)
    return { ok: false, error: POSITION_ERROR[pos.error.message] ?? pos.error.message };
  return { ok: true, pos: pos.value };
}

const POSITION_ERROR: Record<string, string> = {
  ERR_EMPTY: 'The board is empty.',
  ERR_KINGS: 'Each side needs exactly one king.',
  ERR_OPPOSITE_CHECK: 'The side that is not to move is in check.',
  ERR_PAWNS_ON_BACKRANK: 'Pawns cannot stand on the first or last rank.',
  ERR_IMPOSSIBLE_CHECK: 'No legal move leads to this check.',
  ERR_VARIANT: 'This kind of position is not supported.',
};

/** A piece placed in the editor, or `null` to clear the square. */
export type Placement = { color: Color; role: Role } | null;

/** The board after placing a piece; a second king of the same colour replaces the first. */
export function place(board: Board, square: Square, piece: Placement): Board {
  const b = board.clone();
  if (!piece) {
    b.take(square);
    return b;
  }
  if (piece.role === 'king') {
    const old = b.kingOf(piece.color);
    if (old !== undefined) b.take(old);
  }
  b.set(square, piece);
  return b;
}

/**
 * Typed edits for keyboard and screen-reader users: "Ke1" puts a white king
 * on e1, "qd8" a black queen on d8, "xd4" clears d4. Separated by spaces or
 * commas. Returns the new board, or the first word it cannot read.
 */
export function applyTyped(
  board: Board,
  text: string,
): { ok: true; board: Board } | { ok: false; error: string } {
  let b = board;
  for (const word of text.split(/[\s,]+/).filter(Boolean)) {
    const m = /^([KQRBNPkqrbnpx])([a-h][1-8])$/.exec(word);
    if (!m) return { ok: false, error: `"${word}" is not an edit. Use Ke1, qd8 or xd4.` };
    const sq = parseSquare(m[2]!)!;
    const ch = m[1]!;
    if (ch === 'x') b = place(b, sq, null);
    else
      b = place(b, sq, {
        color: ch === ch.toUpperCase() ? 'white' : 'black',
        role: charToRole(ch)!,
      });
  }
  return { ok: true, board: b };
}

/**
 * A full FEN from an edited board: castling wherever king and rook stand on
 * their starting squares, no en passant, move 1.
 */
export function fenFromBoard(board: Board, turn: Color): string {
  let castling = '';
  const home = (sq: string, color: Color, role: Role) => {
    const p = board.get(parseSquare(sq)!);
    return p?.color === color && p.role === role;
  };
  if (home('e1', 'white', 'king')) {
    if (home('h1', 'white', 'rook')) castling += 'K';
    if (home('a1', 'white', 'rook')) castling += 'Q';
  }
  if (home('e8', 'black', 'king')) {
    if (home('h8', 'black', 'rook')) castling += 'k';
    if (home('a8', 'black', 'rook')) castling += 'q';
  }
  return `${makeBoardFen(board)} ${turn === 'white' ? 'w' : 'b'} ${castling || '-'} - 0 1`;
}

/** The board of a FEN, or an empty board. */
export function boardOf(fen: string): Board {
  const s = parseFen(fen);
  return s.isOk ? s.value.board : Board.empty();
}

/** The squares in reading order from White's side: a8 to h8, down to a1 to h1. */
export const READING_ORDER: Square[] = Array.from(
  { length: 64 },
  (_, i) => (7 - Math.floor(i / 8)) * 8 + (i % 8),
);

/** "white knight", for labels. */
export function pieceName(p: { color: Color; role: Role } | undefined): string {
  return p ? `${p.color} ${p.role}` : 'empty';
}

/** The letter for a piece in typed edits: upper case for White. */
export function pieceLetter(p: { color: Color; role: Role }): string {
  const c = roleToChar(p.role);
  return p.color === 'white' ? c.toUpperCase() : c;
}

/** The Lab's hash: the FEN with spaces as underscores, so links stay readable. */
export function fenToHash(fen: string): string {
  return fen.trim().replace(/ /g, '_');
}

export function hashToFen(part: string | undefined): string | undefined {
  if (!part) return undefined;
  const fen = part.replace(/_/g, ' ');
  return checkFen(fen).ok ? fen : undefined;
}

/** The FEN of a position. */
export const fenOf = (pos: Chess): string => makeFen(pos.toSetup());

export const squareName = makeSquare;
