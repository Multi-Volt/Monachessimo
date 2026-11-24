import { afterBest, afterPlayed, afterReply, moverColor, opponentColor } from './context';
import { newMotifs, skewers } from './motifs';
import type { Detector } from './types';

/** The best move created a skewer against the opponent. */
export const skewerMissed: Detector = (ctx) => {
  const after = afterBest(ctx);
  return !!after && newMotifs(ctx.before, after, moverColor(ctx), skewers).length > 0;
};

/** The opponent's best reply skewers the player's pieces. */
export const skewerAllowed: Detector = (ctx) => {
  const a = afterPlayed(ctx);
  const b = afterReply(ctx);
  return !!a && !!b && newMotifs(a, b, opponentColor(ctx), skewers).length > 0;
};
