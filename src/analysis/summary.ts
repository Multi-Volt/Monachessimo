import type { MistakeClass } from './mistakes';
import type { GameAnalysis, PlyReview } from './types';

export type Counts = Record<MistakeClass, number>;

export function countMistakes(a: GameAnalysis | undefined): Counts {
  const c: Counts = { inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const r of a?.reviews ?? []) if (r.class) c[r.class]++;
  return c;
}

/** The player's classified moves, worst first. */
export function worstMoves(a: GameAnalysis | undefined): PlyReview[] {
  return (a?.reviews ?? []).filter((r) => r.class).sort((x, y) => y.drop - x.drop);
}

export const CLASS_LABEL: Record<MistakeClass, string> = {
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/** Annotation symbols, so the class is never shown by color alone. */
export const CLASS_SYMBOL: Record<MistakeClass, string> = {
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};
