import { winningChances, type Score } from '../engine/eval';

/**
 * Drops in the mover's winning chances, on Lichess's scale of -1 to 1. These
 * start at Lichess's values. Final values are recorded in docs/DECISIONS.md.
 */
export const THRESHOLDS = {
  inaccuracy: 0.1,
  mistake: 0.2,
  blunder: 0.3,
} as const;

export type MistakeClass = keyof typeof THRESHOLDS;

/** Classifies a drop in winning chances. Returns null for a good move. */
export function classify(drop: number): MistakeClass | null {
  if (drop >= THRESHOLDS.blunder) return 'blunder';
  if (drop >= THRESHOLDS.mistake) return 'mistake';
  if (drop >= THRESHOLDS.inaccuracy) return 'inaccuracy';
  return null;
}

/**
 * Winning-chance drop for the player who moved.
 * @param before score of the position before the move, from the mover's side
 * @param after score of the position after the move, from the opponent's side
 */
export function moveDrop(before: Score, after: Score): number {
  return winningChances(before) + winningChances(after);
}
