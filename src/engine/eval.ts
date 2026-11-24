/** Engine score from the side to move, as reported by UCI. */
export type Score = { kind: 'cp'; value: number } | { kind: 'mate'; value: number };

/**
 * Centipawn value used in place of a forced mate. Large enough that the
 * winning-chances curve is effectively saturated.
 */
export const MATE_CP = 10_000;

const LICHESS_MULTIPLIER = -0.00368208;

/** Converts a score to centipawns, replacing mates with plus or minus MATE_CP. */
export function toCp(score: Score): number {
  if (score.kind === 'cp') return score.value;
  // UCI reports "mate 0" when the side to move is already checkmated.
  return score.value > 0 ? MATE_CP : -MATE_CP;
}

/** The same score seen by the other side. */
export function negate(score: Score): Score {
  return { kind: score.kind, value: -score.value };
}

/**
 * Winning chances in [-1, 1] for the side the score is reported for, using
 * the Lichess formula 2 / (1 + exp(-0.00368208 * cp)) - 1.
 */
export function winningChances(score: Score): number {
  const cp = toCp(score);
  return 2 / (1 + Math.exp(LICHESS_MULTIPLIER * cp)) - 1;
}
