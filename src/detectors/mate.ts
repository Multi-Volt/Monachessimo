import { playLine } from './board';
import { isBackRankMate } from './motifs';
import type { Detector } from './types';

/** Longest forced mate, in moves, that counts. Longer mates are beyond the level filter. */
export const MAX_MATE = 5;

/** The player had a forced mate in at most MAX_MATE moves and played something that does not mate. */
export const mateMissed: Detector = (ctx) => {
  const b = ctx.bestScore;
  const p = ctx.playedScore;
  const hadMate = b.kind === 'mate' && b.value > 0 && b.value <= MAX_MATE;
  const keptMate = p.kind === 'mate' && p.value > 0;
  return hadMate && !keptMate;
};

/** The move allows a forced mate in at most MAX_MATE moves that was not there before. */
export const mateAllowed: Detector = (ctx) => {
  const b = ctx.bestScore;
  const p = ctx.playedScore;
  const allows = p.kind === 'mate' && p.value <= 0 && -p.value <= MAX_MATE;
  const wasLost = b.kind === 'mate' && b.value <= 0;
  return allows && !wasLost;
};

/** A missed or allowed mate that ends on the back rank. */
export const backRank: Detector = (ctx) => {
  if (mateMissed(ctx)) return playLine(ctx.before, ctx.lines[0]!.pv).some(isBackRankMate);
  if (mateAllowed(ctx)) return playLine(ctx.before, ctx.playedPv).some(isBackRankMate);
  return false;
};
