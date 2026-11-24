import { winningChances, type Score } from '../engine/eval';
import type { Drill } from './types';

/** A move is accepted when it keeps the winning chances within this much of the best move. */
export const TOLERANCE = 0.07;

/** True when `score` is close enough to `best`. Both are from the side to move. */
export function acceptable(score: Score, best: Score): boolean {
  if (best.kind === 'mate' && best.value > 0) {
    return score.kind === 'mate' && score.value > 0 && score.value <= best.value + 2;
  }
  return winningChances(score) >= winningChances(best) - TOLERANCE;
}

export type Verdict = 'correct' | 'wrong' | 'unknown';

/**
 * Judges a move from saved engine lines alone. "unknown" means the move is
 * not in the lines and needs an engine check.
 */
export function judge(drill: Drill, uci: string): Verdict {
  if (drill.accepted.some((a) => a.uci === uci)) return 'correct';
  if (drill.source && drill.source.played === uci) return 'wrong';
  return drill.line[0] === uci ? 'correct' : 'unknown';
}
