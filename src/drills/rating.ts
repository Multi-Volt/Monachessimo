import type { Grade } from './types';

export const START_RATING = 1500;
const K = 24;

/** Expected score of a player against a drill, Elo style. */
export function expected(player: number, drill: number): number {
  return 1 / (1 + 10 ** ((drill - player) / 400));
}

/** New puzzle rating after one drill. A hint-assisted solve counts as half a win. */
export function updateRating(player: number, drill: number, grade: Grade): number {
  const score = grade === 'good' ? 1 : grade === 'hard' ? 0.5 : 0;
  return Math.round(player + K * (score - expected(player, drill)));
}
