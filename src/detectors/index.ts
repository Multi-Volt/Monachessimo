import { winningChances } from '../engine/eval';
import type { GameAnalysis, PlyReview } from '../analysis/types';
import type { Game } from '../import/types';
import { fromFen } from './board';
import { discoveredAttack } from './discovered';
import { forkAllowed, forkMissed } from './fork';
import { backRank, mateAllowed, mateMissed } from './mate';
import { hangingPiece, missedCapture, trappedPiece } from './material';
import { endgameType, openingError, timeTrouble } from './phase';
import { pinAllowed, pinMissed } from './pin';
import { sacrificeMissed } from './sacrifice';
import { quietSetupMissed } from './setup';
import { skewerAllowed, skewerMissed } from './skewer';
import { kingSafety, pawnStructure, pieceActivity } from './strategy';
import type { Detector, MoveContext, TagName } from './types';
import { replay } from '../analysis/positions';
import type { MistakeClass } from '../analysis/mistakes';

export { TAGS, type TagName, type MoveContext } from './types';

/** Bump when a detector changes, so stored tags are recomputed. */
export const DETECTOR_VERSION = 2;

export const MOVE_DETECTORS: Partial<Record<TagName, Detector>> = {
  hangingPiece,
  missedCapture,
  trappedPiece,
  forkMissed,
  forkAllowed,
  pinMissed,
  pinAllowed,
  skewerMissed,
  skewerAllowed,
  discoveredAttack,
  backRank,
  mateMissed,
  mateAllowed,
  quietSetupMissed,
  sacrificeMissed,
  kingSafety,
  pawnStructure,
  pieceActivity,
  openingError,
  timeTrouble,
};

/** Tags for one of the player's moves. Only moves classed as a mistake get tags. */
export function tagMove(ctx: MoveContext): TagName[] {
  if (!ctx.class) return [];
  const out: TagName[] = [];
  for (const [name, detect] of Object.entries(MOVE_DETECTORS) as [TagName, Detector][]) {
    try {
      if (detect(ctx)) out.push(name);
    } catch {
      // A detector failing on an odd position must not stop the others.
    }
  }
  // When a mate decides the position, pawn and activity changes are side
  // effects of the mating line, not the lesson.
  const mate = out.includes('mateAllowed') || out.includes('mateMissed');
  const result = mate ? out.filter((t) => t !== 'pawnStructure' && t !== 'pieceActivity') : out;
  const eg = endgameType(ctx.before);
  if (eg) result.push(eg);
  return result;
}

export interface TagRecord {
  /** `${gameId}:${ply}:${tag}` */
  id: string;
  gameId: string;
  ply: number;
  tag: TagName;
  class: MistakeClass | null;
  drop: number;
  playedAt: number;
  version: number;
}

export function contextFor(game: Game, fens: string[], r: PlyReview): MoveContext {
  const clockBefore =
    r.ply >= 2
      ? game.clocks?.[r.ply - 2]
      : game.timeControl
        ? game.timeControl.initial * 100
        : undefined;
  return {
    ply: r.ply,
    mover: r.mover,
    before: fromFen(fens[r.ply]!),
    played: r.uci,
    playedPv: r.playedPv ?? [r.uci],
    lines: r.lines,
    bestScore: r.lines[0]?.score ?? r.playedScore,
    playedScore: r.playedScore,
    drop: r.drop,
    class: r.class,
    ...(clockBefore !== undefined ? { clockBefore } : {}),
    ...(game.timeControl ? { initialSeconds: game.timeControl.initial } : {}),
  };
}

/** Winning chances above which the player counts as clearly winning (about +3 pawns). */
export const WINNING = winningChances({ kind: 'cp', value: 300 });

/**
 * conversionFailure: the player was clearly winning for two positions in a
 * row and did not win. Attached to the player's worst mistake after that.
 */
export function conversionFailure(game: Game, a: GameAnalysis): number | undefined {
  const won = (game.result === '1-0') === (game.userColor === 'white') && game.result !== '1/2-1/2';
  if (won) return undefined;
  const userWc = a.evals.map((s, i) => {
    if (!s) return null;
    const userToMove = (i % 2 === 0) === (game.userColor === 'white');
    return userToMove ? winningChances(s) : -winningChances(s);
  });
  let from = -1;
  for (let i = 1; i < userWc.length; i++) {
    if ((userWc[i] ?? -1) >= WINNING && (userWc[i - 1] ?? -1) >= WINNING) {
      from = i;
      break;
    }
  }
  if (from < 0) return undefined;
  const after = a.reviews
    .filter((r) => r.class && r.ply >= from - 1)
    .sort((x, y) => y.drop - x.drop);
  return after[0]?.ply;
}

/** All tags for one analyzed game. */
export function tagGame(game: Game, a: GameAnalysis): TagRecord[] {
  const fens = replay(game.uci);
  const out: TagRecord[] = [];
  const add = (r: PlyReview, tag: TagName) =>
    out.push({
      id: `${game.id}:${r.ply}:${tag}`,
      gameId: game.id,
      ply: r.ply,
      tag,
      class: r.class,
      drop: r.drop,
      playedAt: game.playedAt,
      version: DETECTOR_VERSION,
    });
  for (const r of a.reviews) {
    if (!r.class) continue;
    for (const tag of tagMove(contextFor(game, fens, r))) add(r, tag);
  }
  const cf = conversionFailure(game, a);
  const review = a.reviews.find((r) => r.ply === cf);
  if (review) add(review, 'conversionFailure');
  return out;
}
