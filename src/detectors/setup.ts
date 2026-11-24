import { balance, isCapture, isQuiet, normalMove, playLine } from './board';
import { bestMove, moverColor } from './context';
import { isFork, newMotifs, pins, skewers } from './motifs';
import type { Detector } from './types';

/**
 * How many of the player's own moves after the quiet move to search for the
 * tactic. One means the tactic comes three plies after the position.
 */
export const SETUP_MOVES = 1;

export type Payoff = 'mate' | 'fork' | 'pin' | 'skewer' | 'material';

/**
 * What the player's next move in a line achieves, if anything: the payoff
 * a quiet setup prepares. `pv` starts with the quiet move.
 */
export function setupPayoff(
  before: import('chessops/chess').Chess,
  pv: readonly string[],
): { kind: Payoff; move: string } | undefined {
  const line = playLine(before, pv, 4);
  const me = before.turn;
  const pos = line[2];
  const m = normalMove(pv[2]);
  const next = line[3];
  if (!pos || !m || !next || !pos.isLegal(m)) return undefined;
  if (next.isCheckmate()) return { kind: 'mate', move: pv[2]! };
  if (isFork(pos, m)) return { kind: 'fork', move: pv[2]! };
  if (newMotifs(pos, next, me, pins).length) return { kind: 'pin', move: pv[2]! };
  if (newMotifs(pos, next, me, skewers).length) return { kind: 'skewer', move: pv[2]! };
  const end = line[4];
  if (end && isCapture(pos, m) && balance(end, me) - balance(before, me) >= 2)
    return { kind: 'material', move: pv[2]! };
  return undefined;
}

/**
 * The best move was quiet (no capture, check or promotion), and within the
 * next SETUP_MOVES moves of the best line the player has a fork, pin,
 * skewer, mate, or a capture that leaves them at least two pawns up compared
 * with the starting position.
 */
export const quietSetupMissed: Detector = (ctx) => {
  const best = bestMove(ctx);
  if (!best || !isQuiet(ctx.before, best)) return false;
  if (isFork(ctx.before, best)) return false;
  // A setup prepares a tactic. A move that pins or skewers is the tactic itself.
  const afterBest = ctx.before.clone();
  afterBest.play(best);
  const me0 = moverColor(ctx);
  if (
    newMotifs(ctx.before, afterBest, me0, pins).length ||
    newMotifs(ctx.before, afterBest, me0, skewers).length
  )
    return false;
  const pv = ctx.lines[0]!.pv;
  const line = playLine(ctx.before, pv, 2 + 2 * SETUP_MOVES);
  const me = moverColor(ctx);
  for (let k = 1; k <= SETUP_MOVES; k++) {
    const i = 2 * k; // index of the position before the player's k-th follow-up move
    const pos = line[i];
    const m = normalMove(pv[i]);
    if (!pos || !m || !pos.isLegal(m)) break;
    const next = line[i + 1];
    if (!next) break;
    if (next.isCheckmate()) return true;
    if (isFork(pos, m)) return true;
    if (newMotifs(pos, next, me, pins).length || newMotifs(pos, next, me, skewers).length)
      return true;
    // Gain is measured from the starting position, after the opponent's
    // answer, so a recapture inside an exchange does not count.
    const end = line[i + 2];
    if (end && isCapture(pos, m) && balance(end, me) - balance(ctx.before, me) >= 2) return true;
  }
  return false;
};
