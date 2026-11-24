import { kingAttacks, pawnAttacks } from 'chessops/attacks';
import type { Chess } from 'chessops/chess';
import { SquareSet } from 'chessops/squareSet';
import type { Color, Square } from 'chessops/types';
import { opposite, squareFile, squareRank } from 'chessops/util';
import { attackersOf, attacksFrom } from '../detectors/board';

/** Measurable facts about one side's position. Every field is a count. */
export interface Features {
  /** Own pawns on the king's file and the files beside it, one or two ranks ahead. */
  pawnShield: number;
  /** Files at or next to the king with no own pawn. */
  openFilesNearKing: number;
  /** Enemy pieces attacking the king or the squares around it. */
  kingAttackers: number;
  /** Own pieces, other than the king, guarding the squares around the king. */
  kingDefenders: number;
  isolatedPawns: number;
  doubledPawns: number;
  backwardPawns: number;
  passedPawns: number;
  pawnIslands: number;
  /** Squares the knights, bishops, rooks and queens can move to. */
  mobility: number;
  /** Knights and bishops on a protected square in enemy territory that no enemy pawn can attack. */
  outposts: number;
  /** Rooks on a file with no pawns, or with only enemy pawns. */
  rooksOnOpenFiles: number;
  bishopPair: number;
  /** Squares in the center (d4, e4, d5, e5) this side attacks. */
  centerControl: number;
  /** Safe squares on files c to f in the enemy half, attacked by own pawns. */
  space: number;
}

const FILE_MASKS = Array.from({ length: 8 }, (_, f) => SquareSet.fromFile(f));
const CENTER = [27, 28, 35, 36];

/** Rank counted from this side, 0 for its own back rank. */
function relRank(sq: Square, color: Color): number {
  return color === 'white' ? squareRank(sq) : 7 - squareRank(sq);
}

export function features(pos: Chess, color: Color): Features {
  const b = pos.board;
  const them = opposite(color);
  const own = b[color];
  const pawns = b.pawn.intersect(own);
  const enemyPawns = b.pawn.intersect(b[them]);
  const king = b.kingOf(color);

  // King safety.
  let pawnShield = 0;
  let openFilesNearKing = 0;
  let kingAttackers = 0;
  let kingDefenders = 0;
  if (king !== undefined) {
    const kf = squareFile(king);
    const dir = color === 'white' ? 1 : -1;
    for (let f = Math.max(0, kf - 1); f <= Math.min(7, kf + 1); f++) {
      if (pawns.intersect(FILE_MASKS[f]!).isEmpty()) openFilesNearKing++;
      for (const step of [1, 2]) {
        const r = squareRank(king) + dir * step;
        if (r >= 0 && r < 8 && pawns.has(r * 8 + f)) {
          pawnShield++;
          break;
        }
      }
    }
    const zone = kingAttacks(king).with(king);
    const attackers = new Set<Square>();
    const defenders = new Set<Square>();
    for (const sq of zone) {
      for (const a of attackersOf(pos, sq, them)) attackers.add(a);
      for (const d of attackersOf(pos, sq, color)) if (d !== king) defenders.add(d);
    }
    kingAttackers = attackers.size;
    kingDefenders = defenders.size;
  }

  // Pawn structure.
  const files = FILE_MASKS.map((m) => pawns.intersect(m).size());
  let isolatedPawns = 0;
  let doubledPawns = 0;
  let pawnIslands = 0;
  for (let f = 0; f < 8; f++) {
    const n = files[f]!;
    if (n === 0) continue;
    if (n > 1) doubledPawns += n - 1;
    const left = f > 0 ? files[f - 1]! : 0;
    const right = f < 7 ? files[f + 1]! : 0;
    if (left === 0 && right === 0) isolatedPawns += n;
    if (f === 0 || files[f - 1] === 0) pawnIslands++;
  }
  let passedPawns = 0;
  let backwardPawns = 0;
  for (const p of pawns) {
    const f = squareFile(p);
    const rr = relRank(p, color);
    let blocked = false;
    for (const e of enemyPawns) {
      if (Math.abs(squareFile(e) - f) <= 1 && relRank(e, color) > rr) {
        blocked = true;
        break;
      }
    }
    if (!blocked) passedPawns++;
    // Backward: no own pawn on an adjacent file at or behind it, and the
    // square in front is attacked by an enemy pawn.
    let support = false;
    for (const q of pawns) {
      if (Math.abs(squareFile(q) - f) === 1 && relRank(q, color) <= rr) support = true;
    }
    const front = p + (color === 'white' ? 8 : -8);
    if (!support && front >= 0 && front < 64) {
      for (const e of enemyPawns) if (pawnAttacks(them, e).has(front)) backwardPawns++;
    }
  }

  // Piece activity.
  let mobility = 0;
  let outposts = 0;
  let rooksOnOpenFiles = 0;
  for (const sq of own) {
    const role = b.getRole(sq)!;
    if (role === 'pawn' || role === 'king') continue;
    mobility += attacksFrom(pos, sq).diff(own).size();
    if (
      (role === 'knight' || role === 'bishop') &&
      relRank(sq, color) >= 3 &&
      relRank(sq, color) <= 5
    ) {
      const f = squareFile(sq);
      const canBeHit = [...enemyPawns].some(
        (e) => Math.abs(squareFile(e) - f) === 1 && relRank(e, color) > relRank(sq, color),
      );
      const guarded = [...pawns].some((q) => pawnAttacks(color, q).has(sq));
      if (!canBeHit && guarded) outposts++;
    }
    if (role === 'rook' && pawns.intersect(FILE_MASKS[squareFile(sq)]!).isEmpty())
      rooksOnOpenFiles++;
  }
  const bishopPair = b.bishop.intersect(own).size() >= 2 ? 1 : 0;

  // Space and center.
  let centerControl = 0;
  for (const c of CENTER) if (!attackersOf(pos, c, color).isEmpty()) centerControl++;
  let space = 0;
  for (let f = 2; f <= 5; f++) {
    for (let rr = 4; rr <= 5; rr++) {
      const sq = (color === 'white' ? rr : 7 - rr) * 8 + f;
      const byPawn = [...pawns].some((q) => pawnAttacks(color, q).has(sq));
      const enemyHit = [...enemyPawns].some((e) => pawnAttacks(them, e).has(sq));
      if (byPawn && !enemyHit) space++;
    }
  }

  return {
    pawnShield,
    openFilesNearKing,
    kingAttackers,
    kingDefenders,
    isolatedPawns,
    doubledPawns,
    backwardPawns,
    passedPawns,
    pawnIslands,
    mobility,
    outposts,
    rooksOnOpenFiles,
    bishopPair,
    centerControl,
    space,
  };
}

export type FeatureDelta = { [K in keyof Features]: number };

export function delta(before: Features, after: Features): FeatureDelta {
  const out = {} as FeatureDelta;
  for (const k of Object.keys(before) as (keyof Features)[]) out[k] = after[k] - before[k];
  return out;
}
