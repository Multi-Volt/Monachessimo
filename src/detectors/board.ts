import { attacks, between, pawnAttacks } from 'chessops/attacks';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { SquareSet } from 'chessops/squareSet';
import type { Color, NormalMove, Role, Square } from 'chessops/types';
import { opposite, parseUci, squareFile, squareRank } from 'chessops/util';

/** Material values in pawns. The king is large so it is always the last attacker in SEE. */
export const VALUE: Record<Role, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 100,
};

export function fromFen(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
}

export function normalMove(uci: string | undefined): NormalMove | undefined {
  const m = uci ? parseUci(uci) : undefined;
  return m && 'from' in m ? m : undefined;
}

/** Plays a UCI move on a copy of the position. Returns undefined if it is illegal. */
export function playUci(pos: Chess, uci: string | undefined): Chess | undefined {
  const m = normalMove(uci);
  if (!m || !pos.isLegal(m)) return undefined;
  const next = pos.clone();
  next.play(m);
  return next;
}

/** Plays a line of UCI moves, returning every position including the start. */
export function playLine(pos: Chess, pv: readonly string[], max = pv.length): Chess[] {
  const out = [pos];
  let cur = pos;
  for (const u of pv.slice(0, max)) {
    const next = playUci(cur, u);
    if (!next) break;
    out.push(next);
    cur = next;
  }
  return out;
}

export function material(pos: Chess, color: Color): number {
  let sum = 0;
  for (const sq of pos.board[color]) {
    const role = pos.board.getRole(sq);
    if (role && role !== 'king') sum += VALUE[role];
  }
  return sum;
}

/** Material of `color` minus the opponent's. */
export function balance(pos: Chess, color: Color): number {
  return material(pos, color) - material(pos, opposite(color));
}

/** Pieces of `color` that attack `square`, given an occupancy. */
export function attackersOf(
  pos: Chess,
  square: Square,
  color: Color,
  occupied = pos.board.occupied,
): SquareSet {
  return pos.kingAttackers(square, color, occupied).intersect(occupied);
}

/** Squares attacked by the piece on `square`. */
export function attacksFrom(pos: Chess, square: Square, occupied = pos.board.occupied): SquareSet {
  const piece = pos.board.get(square);
  if (!piece) return SquareSet.empty();
  if (piece.role === 'pawn') return pawnAttacks(piece.color, square);
  return attacks(piece, square, occupied);
}

/**
 * Static exchange evaluation: material `by` wins, in pawns, by starting a
 * capture sequence on `square` with the least valuable attacker each time.
 * Ignores pins. Returns 0 when `by` has no attacker.
 */
export function see(pos: Chess, square: Square, by: Color): number {
  const target = pos.board.getRole(square);
  if (!target) return 0;
  const gain: number[] = [];
  let occ = pos.board.occupied;
  let side = by;
  let onSquare = VALUE[target];
  let d = 0;
  gain[0] = 0;
  for (;;) {
    const att = attackersOf(pos, square, side, occ);
    let best: Square | undefined;
    let bestValue = Infinity;
    for (const a of att) {
      const v = VALUE[pos.board.getRole(a)!];
      if (v < bestValue) {
        bestValue = v;
        best = a;
      }
    }
    if (best === undefined) break;
    gain[d] = onSquare - (d > 0 ? gain[d - 1]! : 0);
    d++;
    onSquare = bestValue;
    occ = occ.without(best);
    side = opposite(side);
  }
  if (d === 0) return 0;
  // gain[i] is the running score for the side that made capture i.
  for (let i = d - 1; i > 0; i--) gain[i - 1] = -Math.max(-gain[i - 1]!, gain[i]!);
  return gain[0]!;
}

/** Pieces of `color` (not pawns or the king) that the opponent can win material from. */
export function hangingPieces(pos: Chess, color: Color, minGain = 2): Square[] {
  const out: Square[] = [];
  for (const sq of pos.board[color]) {
    const role = pos.board.getRole(sq)!;
    if (role === 'pawn' || role === 'king') continue;
    if (see(pos, sq, opposite(color)) >= minGain) out.push(sq);
  }
  return out;
}

export function isCapture(pos: Chess, m: NormalMove): boolean {
  return pos.board.has(m.to) && pos.board.getColor(m.to) !== pos.turn
    ? true
    : pos.board.getRole(m.from) === 'pawn' && m.to === pos.epSquare;
}

/** A move that is not a capture, a check or a promotion. */
export function isQuiet(pos: Chess, m: NormalMove): boolean {
  if (isCapture(pos, m) || m.promotion) return false;
  const after = pos.clone();
  after.play(m);
  return !after.isCheck();
}

/** Squares from `from` past `through`, walking away from `from`, in order. */
export function beyond(from: Square, through: Square): Square[] {
  const df = Math.sign(squareFile(through) - squareFile(from));
  const dr = Math.sign(squareRank(through) - squareRank(from));
  const out: Square[] = [];
  let f = squareFile(through) + df;
  let r = squareRank(through) + dr;
  while (f >= 0 && f < 8 && r >= 0 && r < 8) {
    out.push(r * 8 + f);
    f += df;
    r += dr;
  }
  return out;
}

export function isSlider(role: Role | undefined): boolean {
  return role === 'bishop' || role === 'rook' || role === 'queen';
}

export { between };
