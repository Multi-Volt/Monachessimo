import { winningChances } from '../engine/eval';
import { balance, playLine } from './board';
import { bestMove, moverColor } from './context';
import type { Detector } from './types';

/** Plies of the best line to check for material that stays down. */
export const SACRIFICE_PLIES = 4;

/**
 * The best line gives up at least two pawns of material that is still down
 * after SACRIFICE_PLIES plies (or ends in mate), while the evaluation holds.
 */
export const sacrificeMissed: Detector = (ctx) => {
  if (!bestMove(ctx)) return false;
  if (winningChances(ctx.bestScore) < -0.1) return false;
  const me = moverColor(ctx);
  const start = balance(ctx.before, me);
  const line = playLine(ctx.before, ctx.lines[0]!.pv, SACRIFICE_PLIES);
  if (line.length < 3) return false;
  const down = (i: number) => balance(line[i]!, me) <= start - 2;
  if (!down(2)) return false;
  const last = line.length - 1;
  return last <= 2 || down(last) || line[last]!.isCheckmate() || ctx.bestScore.kind === 'mate';
};
