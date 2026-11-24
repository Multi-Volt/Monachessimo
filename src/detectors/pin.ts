import { afterBest, afterPlayed, afterReply, moverColor, opponentColor } from './context';
import { newMotifs, pins } from './motifs';
import type { Detector } from './types';

/** The best move created a new pin against the opponent. */
export const pinMissed: Detector = (ctx) => {
  const after = afterBest(ctx);
  return !!after && newMotifs(ctx.before, after, moverColor(ctx), pins).length > 0;
};

/** The opponent's best reply pins one of the player's pieces. */
export const pinAllowed: Detector = (ctx) => {
  const a = afterPlayed(ctx);
  const b = afterReply(ctx);
  return !!a && !!b && newMotifs(a, b, opponentColor(ctx), pins).length > 0;
};
