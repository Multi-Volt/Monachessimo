/**
 * Accuracy of one move from its drop in winning chances, with the formula
 * Lichess publishes: 100 for a perfect move, falling fast as the drop grows.
 * `drop` is on the 0 to 2 scale of winningChances, so a drop of 1 is 50
 * percentage points of winning percentage.
 */
export function moveAccuracy(drop: number): number {
  const points = Math.max(0, drop) * 50;
  const a = 103.1668 * Math.exp(-0.04354 * points) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

/** Mean move accuracy, rounded to one decimal; undefined with no moves. */
export function gameAccuracy(drops: number[]): number | undefined {
  if (!drops.length) return undefined;
  const mean = drops.reduce((s, d) => s + moveAccuracy(d), 0) / drops.length;
  return Math.round(mean * 10) / 10;
}
