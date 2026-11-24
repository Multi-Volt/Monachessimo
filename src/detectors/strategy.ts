import { squareFile, squareRank } from 'chessops/util';
import { features } from '../strategy/features';
import { normalMove } from './board';
import { afterPlayed, afterReply, moverColor, opponentColor } from './context';
import type { Detector } from './types';

function isCentralHome(
  pos: import('chessops/chess').Chess,
  color: import('chessops/types').Color,
): boolean {
  const k = pos.board.kingOf(color);
  if (k === undefined) return false;
  const file = squareFile(k);
  const homeRank = color === 'white' ? 0 : 7;
  return (file === 3 || file === 4) && squareRank(k) === homeRank;
}

function beforeAndAfter(ctx: Parameters<Detector>[0]) {
  const after = afterReply(ctx) ?? afterPlayed(ctx);
  if (!after) return undefined;
  return { b: features(ctx.before, moverColor(ctx)), a: features(after, moverColor(ctx)), after };
}

/**
 * The player's king got weaker while queens are on the board: fewer shield
 * pawns, a newly open file beside the king, or two more attackers than
 * defenders around it.
 */
export const kingSafety: Detector = (ctx) => {
  const them = opponentColor(ctx);
  if (ctx.before.board.queen.intersect(ctx.before.board[them]).isEmpty()) return false;
  const f = beforeAndAfter(ctx);
  if (!f) return false;
  // An uncastled king in the center is an opening question, not a shield.
  if (isCentralHome(ctx.before, moverColor(ctx)) && isCentralHome(f.after, moverColor(ctx)))
    return false;
  const { a, b } = f;
  return (
    a.pawnShield < b.pawnShield ||
    a.openFilesNearKing > b.openFilesNearKing ||
    a.kingAttackers - a.kingDefenders >= b.kingAttackers - b.kingDefenders + 2
  );
};

/** The player's pawns gained an isolated, doubled or backward pawn, or another island. */
export const pawnStructure: Detector = (ctx) => {
  const f = beforeAndAfter(ctx);
  if (!f) return false;
  const { a, b } = f;
  const weak = (x: typeof a) => x.isolatedPawns + x.doubledPawns + x.backwardPawns;
  return weak(a) > weak(b) || a.pawnIslands > b.pawnIslands;
};

/** Squares of mobility lost that count as a real drop in activity. */
export const MOBILITY_DROP = 6;

/** The player's pieces lost at least MOBILITY_DROP squares of mobility, or a knight went to the edge. */
export const pieceActivity: Detector = (ctx) => {
  const m = normalMove(ctx.played);
  if (m && ctx.before.board.getRole(m.from) === 'knight') {
    const fromFile = squareFile(m.from);
    const toFile = squareFile(m.to);
    if ((toFile === 0 || toFile === 7) && fromFile > 0 && fromFile < 7) return true;
  }
  const f = beforeAndAfter(ctx);
  return !!f && f.a.mobility <= f.b.mobility - MOBILITY_DROP;
};
