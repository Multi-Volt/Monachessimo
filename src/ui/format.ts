import { toCp, type Score } from '../engine/eval';

/** Score in pawns with a sign, for example "+1.4", "−0.3" or "M3". */
export function formatScore(score: Score): string {
  if (score.kind === 'mate') {
    if (score.value === 0) return 'mate';
    return score.value > 0 ? `M${score.value}` : `−M${-score.value}`;
  }
  const p = toCp(score) / 100;
  const s = Math.abs(p).toFixed(1);
  return p > 0.04 ? `+${s}` : p < -0.04 ? `−${s}` : '0.0';
}

/** Winning chances on a -1..1 scale as a whole percentage of the bar, 0..100. */
export function percent(wc: number): number {
  return Math.round(((wc + 1) / 2) * 100);
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'less than a minute';
  if (min === 1) return 'about 1 minute';
  if (min < 60) return `about ${min} minutes`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `about ${h} h ${m} min`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
