import { kingAttacks, pawnAttacks } from 'chessops/attacks';
import type { Chess } from 'chessops/chess';
import { SquareSet } from 'chessops/squareSet';
import type { Color, Square } from 'chessops/types';
import { makeSquare, opposite, squareFile, squareRank } from 'chessops/util';
import { attackersOf, attacksFrom } from '../detectors/board';

/** One counted feature with the squares behind it. */
export interface FeatureNote {
  key:
    | 'isolatedPawn'
    | 'doubledPawns'
    | 'backwardPawn'
    | 'openFileNearKing'
    | 'badBishop'
    | 'enemyOutpost'
    | 'enemyPassedPawn';
  /** A square or a file, so the same feature can be matched across positions. */
  where: string;
  /** The long-term cost, in the coach's voice. */
  text: string;
}

const FILES = 'abcdefgh';
const fileMask = (f: number) => SquareSet.fromFile(f);
const relRank = (sq: Square, color: Color) =>
  color === 'white' ? squareRank(sq) : 7 - squareRank(sq);
const isLight = (sq: Square) => (squareFile(sq) + squareRank(sq)) % 2 === 1;

/**
 * The features of `me`'s position that cost something over time, each with
 * its square or file and a fixed consequence sentence. "Your" is the player,
 * "my" the opponent. Counts match `features()` in `features.ts`.
 */
export function featureNotes(pos: Chess, me: Color): FeatureNote[] {
  const b = pos.board;
  const them = opposite(me);
  const pawns = b.pawn.intersect(b[me]);
  const enemyPawns = b.pawn.intersect(b[them]);
  const out: FeatureNote[] = [];
  const counts = Array.from({ length: 8 }, (_, f) => pawns.intersect(fileMask(f)).size());

  for (const p of pawns) {
    const f = squareFile(p);
    const left = f > 0 ? counts[f - 1]! : 0;
    const right = f < 7 ? counts[f + 1]! : 0;
    if (left === 0 && right === 0)
      out.push({
        key: 'isolatedPawn',
        where: makeSquare(p),
        text: `Nothing can defend your pawn on ${makeSquare(p)} with a pawn, so it becomes a target.`,
      });
    else {
      // Backward: no own pawn beside it at or behind it, and an enemy pawn guards the square ahead.
      const support = [...pawns].some(
        (q) => Math.abs(squareFile(q) - f) === 1 && relRank(q, me) <= relRank(p, me),
      );
      const front = p + (me === 'white' ? 8 : -8);
      if (
        !support &&
        front >= 0 &&
        front < 64 &&
        [...enemyPawns].some((e) => pawnAttacks(them, e).has(front))
      )
        out.push({
          key: 'backwardPawn',
          where: makeSquare(p),
          text: `Your pawn on ${makeSquare(p)} is backward: no pawn can support it, and your opponent's pawns control the square in front of it.`,
        });
    }
  }
  counts.forEach((n, f) => {
    if (n > 1)
      out.push({
        key: 'doubledPawns',
        where: FILES[f]!,
        text: `Your doubled pawns on the ${FILES[f]}-file cannot defend each other.`,
      });
  });

  const king = b.kingOf(me);
  if (king !== undefined) {
    const kf = squareFile(king);
    for (let f = Math.max(0, kf - 1); f <= Math.min(7, kf + 1); f++) {
      if (!pawns.intersect(fileMask(f)).isEmpty()) continue;
      const rooks = b.rook.union(b.queen).intersect(b[them]).size();
      out.push({
        key: 'openFileNearKing',
        where: FILES[f]!,
        text:
          rooks > 0
            ? `The open ${FILES[f]}-file leads straight to your king. My rooks can use it.`
            : `The ${FILES[f]}-file next to your king has no pawn of yours to shield it.`,
      });
    }
  }

  for (const sq of b.bishop.intersect(b[me])) {
    const same = [...pawns].filter((p) => isLight(p) === isLight(sq)).length;
    const reach = attacksFrom(pos, sq).diff(b[me]).size();
    if (same >= 3 && reach <= 4)
      out.push({
        key: 'badBishop',
        where: makeSquare(sq),
        text: `Your bishop on ${makeSquare(sq)} is stuck behind your own pawns.`,
      });
  }

  // The opponent's lasting gains against the player.
  for (const sq of b.knight.union(b.bishop).intersect(b[them])) {
    const rr = relRank(sq, them);
    if (rr < 3 || rr > 5) continue;
    const f = squareFile(sq);
    const canBeHit = [...pawns].some(
      (p) => Math.abs(squareFile(p) - f) === 1 && relRank(p, them) > rr,
    );
    const guarded = [...enemyPawns].some((q) => pawnAttacks(them, q).has(sq));
    if (!canBeHit && guarded)
      out.push({
        key: 'enemyOutpost',
        where: makeSquare(sq),
        text: `My ${b.getRole(sq)} on ${makeSquare(sq)} sits on an outpost that none of your pawns can attack.`,
      });
  }
  for (const e of enemyPawns) {
    const f = squareFile(e);
    const blocked = [...pawns].some(
      (p) => Math.abs(squareFile(p) - f) <= 1 && relRank(p, them) > relRank(e, them),
    );
    if (!blocked && relRank(e, them) >= 3)
      out.push({
        key: 'enemyPassedPawn',
        where: makeSquare(e),
        text: `My passed pawn on ${makeSquare(e)} has no pawn of yours in its way to promotion.`,
      });
  }
  return out;
}

/** Notes in `played` that `best` does not have: what the move made worse for the long term. */
export function worseNotes(best: Chess, played: Chess, me: Color): FeatureNote[] {
  const had = new Set(featureNotes(best, me).map((n) => `${n.key}:${n.where}`));
  return featureNotes(played, me).filter((n) => !had.has(`${n.key}:${n.where}`));
}

/** Squares around the king, for plans that head for it. */
export function kingZone(pos: Chess, color: Color): SquareSet {
  const k = pos.board.kingOf(color);
  return k === undefined ? SquareSet.empty() : kingAttacks(k).with(k);
}

/** Pieces of `by` that attack any square of `zone`. */
export function zoneAttackers(pos: Chess, zone: SquareSet, by: Color): Square[] {
  const out = new Set<Square>();
  for (const sq of zone) for (const a of attackersOf(pos, sq, by)) out.add(a);
  return [...out];
}
