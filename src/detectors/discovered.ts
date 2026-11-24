import { bestMove, reply } from './context';
import { isDiscoveredAttack } from './motifs';
import type { Detector } from './types';

/** The best move was a discovered attack, or the opponent's best reply is one. */
export const discoveredAttack: Detector = (ctx) => {
  const best = bestMove(ctx);
  if (best && isDiscoveredAttack(ctx.before, best)) return true;
  const r = reply(ctx);
  return !!r && isDiscoveredAttack(r.pos, r.move);
};
