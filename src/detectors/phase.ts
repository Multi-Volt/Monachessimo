import type { Chess } from 'chessops/chess';
import type { Detector, TagName } from './types';

/** Plies in the first ten moves. */
export const OPENING_PLIES = 20;

/** A mistake in the first ten moves. */
export const openingError: Detector = (ctx) => ctx.ply < OPENING_PLIES;

/** Share of the starting clock below which a move counts as made in time trouble. */
export const TIME_TROUBLE_SHARE = 0.1;

/** A mistake or blunder made with less than 10 percent of the starting clock left. */
export const timeTrouble: Detector = (ctx) => {
  if (ctx.class !== 'blunder' && ctx.class !== 'mistake') return false;
  if (ctx.clockBefore === undefined || !ctx.initialSeconds) return false;
  return ctx.clockBefore < ctx.initialSeconds * 100 * TIME_TROUBLE_SHARE;
};

/** Endgame type from the pieces other than kings and pawns, or undefined if it is not one of the four. */
export function endgameType(pos: Chess): TagName | undefined {
  const b = pos.board;
  const knights = b.knight.size();
  const bishops = b.bishop.size();
  const rooks = b.rook.size();
  const queens = b.queen.size();
  const minors = knights + bishops;
  if (minors + rooks + queens === 0) return 'endgame:pawn';
  if (rooks > 0 && minors + queens === 0) return 'endgame:rook';
  if (minors > 0 && rooks + queens === 0) return 'endgame:minor';
  if (queens > 0 && minors + rooks === 0) return 'endgame:queen';
  return undefined;
}
