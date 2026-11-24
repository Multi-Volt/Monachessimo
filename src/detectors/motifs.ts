import type { Chess } from 'chessops/chess';
import type { Color, NormalMove, Square } from 'chessops/types';
import { opposite, squareRank } from 'chessops/util';
import { VALUE, attacksFrom, attackersOf, beyond, between, isSlider, see } from './board';

/**
 * Pieces attacked by the piece on `square` that count as fork targets: the
 * king, anything worth more than the attacker, or anything it can win.
 */
export function forkTargets(pos: Chess, square: Square): Square[] {
  const piece = pos.board.get(square);
  if (!piece) return [];
  const v = VALUE[piece.role];
  const enemies = attacksFrom(pos, square).intersect(pos.board[opposite(piece.color)]);
  const out: Square[] = [];
  for (const t of enemies) {
    const role = pos.board.getRole(t)!;
    if (role === 'pawn') continue;
    if (role === 'king' || VALUE[role] > v || see(pos, t, piece.color) > 0) out.push(t);
  }
  return out;
}

/**
 * True when `move` (by the side to move in `pos`) lands a piece that attacks
 * two or more targets and cannot simply be taken for profit.
 */
export function isFork(pos: Chess, move: NormalMove): boolean {
  const after = pos.clone();
  after.play(move);
  const mover = pos.turn;
  if (forkTargets(after, move.to).length < 2) return false;
  const safe = see(after, move.to, opposite(mover)) <= 0;
  return safe || after.isCheck();
}

export interface LineMotif {
  /** Square of the attacking slider. */
  slider: Square;
  /** The piece directly attacked. */
  front: Square;
  /** The piece behind it on the same line. */
  back: Square;
}

/** Slider lines of `color` that pass through one enemy piece onto another. */
function sliderLines(pos: Chess, color: Color): LineMotif[] {
  const out: LineMotif[] = [];
  const b = pos.board;
  for (const s of b[color]) {
    if (!isSlider(b.getRole(s))) continue;
    for (const front of attacksFrom(pos, s).intersect(b[opposite(color)])) {
      for (const sq of beyond(s, front)) {
        if (!b.has(sq)) continue;
        if (b.getColor(sq) === opposite(color)) out.push({ slider: s, front, back: sq });
        break;
      }
    }
  }
  return out;
}

/**
 * Pins by `color`: a piece (not a pawn) in front of its king, or in front of
 * a piece worth at least two pawns more.
 */
export function pins(pos: Chess, color: Color): LineMotif[] {
  return sliderLines(pos, color).filter(({ front, back }) => {
    const f = pos.board.getRole(front)!;
    const k = pos.board.getRole(back)!;
    if (f === 'king' || f === 'pawn') return false;
    return k === 'king' || VALUE[k] >= VALUE[f] + 2;
  });
}

/** Skewers by `color`: a more valuable piece or the king in front, a piece behind that can then be won. */
export function skewers(pos: Chess, color: Color): LineMotif[] {
  return sliderLines(pos, color).filter(({ slider, front, back }) => {
    const f = pos.board.getRole(front)!;
    const k = pos.board.getRole(back)!;
    if (k === 'king' || k === 'pawn') return false;
    if (f !== 'king' && VALUE[f] <= VALUE[k]) return false;
    // Once the front piece steps away, taking the back piece must gain material.
    const defended = !attackersOf(
      pos,
      back,
      opposite(color),
      pos.board.occupied.without(front),
    ).isEmpty();
    return !defended || VALUE[k] >= VALUE[pos.board.getRole(slider)!];
  });
}

const key = (m: LineMotif) => `${m.slider}-${m.front}-${m.back}`;

/** Motifs present after the move that were not there before, keyed by line. */
export function newMotifs(
  before: Chess,
  after: Chess,
  color: Color,
  find: (pos: Chess, color: Color) => LineMotif[],
): LineMotif[] {
  const old = new Set(find(before, color).map(key));
  return find(after, color).filter((m) => !old.has(key(m)));
}

/**
 * True when `move` uncovers a line from another piece of the mover onto an
 * enemy king or a piece worth at least a minor piece.
 */
export function isDiscoveredAttack(pos: Chess, move: NormalMove): boolean {
  const color = pos.turn;
  const after = pos.clone();
  after.play(move);
  const b = after.board;
  for (const s of b[color]) {
    if (s === move.to || !isSlider(b.getRole(s))) continue;
    const before = attacksFrom(pos, s);
    for (const t of attacksFrom(after, s).intersect(b[opposite(color)])) {
      if (before.has(t)) continue;
      if (!between(s, t).has(move.from)) continue;
      const role = b.getRole(t)!;
      if (role === 'king' || VALUE[role] >= 3) return true;
    }
  }
  return false;
}

/** True when the position is checkmate by a rook or queen along the mated king's back rank. */
export function isBackRankMate(pos: Chess): boolean {
  if (!pos.isCheckmate()) return false;
  const king = pos.board.kingOf(pos.turn);
  if (king === undefined) return false;
  const home = pos.turn === 'white' ? 0 : 7;
  if (squareRank(king) !== home) return false;
  const checkers = pos.ctx().checkers;
  for (const c of checkers) {
    const role = pos.board.getRole(c);
    if ((role !== 'rook' && role !== 'queen') || squareRank(c) !== home) return false;
  }
  return !checkers.isEmpty();
}
