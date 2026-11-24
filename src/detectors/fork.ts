import { bestMove, reply } from './context';
import { isFork } from './motifs';
import type { Detector } from './types';

/** The best move was a fork. */
export const forkMissed: Detector = (ctx) => {
  const best = bestMove(ctx);
  return !!best && isFork(ctx.before, best);
};

/** The opponent's best reply is a fork. */
export const forkAllowed: Detector = (ctx) => {
  const r = reply(ctx);
  return !!r && isFork(r.pos, r.move);
};
