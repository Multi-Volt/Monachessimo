/** Engine score from the side to move, as reported by UCI. */
export type Score = { kind: 'cp'; value: number } | { kind: 'mate'; value: number };

/**
 * Centipawn value used in place of a forced mate. Large enough that the
 * winning-chances curve is effectively saturated.
 */
export const MATE_CP = 10_000;

const LICHESS_MULTIPLIER = -0.00368208;

/**
 * Winning chances in [-1, 1] for the side the score is reported for, using
 * the Lichess formula 2 / (1 + exp(-0.00368208 * cp)) - 1.
 */
export function winningChances(score: Score): number {
  const cp = score.kind === 'mate' ? Math.sign(score.value || 1) * MATE_CP : score.value;
  return 2 / (1 + Math.exp(LICHESS_MULTIPLIER * cp)) - 1;
}
