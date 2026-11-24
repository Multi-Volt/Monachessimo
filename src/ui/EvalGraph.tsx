import { winningChances, type Score } from '../engine/eval';

interface Props {
  /** Side-to-move scores per position, as stored in GameAnalysis.evals. */
  evals: (Score | null)[];
  /** Plies to mark, for example blunders. */
  marks: number[];
  /** Plies to mark more quietly, for example mistakes. */
  minorMarks?: number[];
  current: number;
  onSelect: (position: number) => void;
}

/**
 * Winning chances for White across the game. Values above the middle line
 * favor White. Tapping the graph jumps to that position.
 */
export function EvalGraph({ evals, marks, minorMarks = [], current, onSelect }: Props) {
  const w = 300;
  const h = 64;
  const n = Math.max(1, evals.length - 1);
  const x = (i: number) => (i / n) * w;
  const y = (i: number) => {
    const s = evals[i];
    if (!s) return h / 2;
    const white = i % 2 === 0 ? winningChances(s) : -winningChances(s);
    return h / 2 - (white * h) / 2;
  };
  const points = evals.map((_, i) => `${x(i).toFixed(1)},${y(i).toFixed(1)}`).join(' ');
  const pick = (e: MouseEvent) => {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    onSelect(Math.round(((e.clientX - rect.left) / rect.width) * n));
  };
  return (
    <svg
      class="eval-graph"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      onClick={pick}
      aria-hidden="true"
    >
      <polygon class="eval-graph__area" points={`0,${h} ${points} ${w},${h}`} />
      <line class="eval-graph__mid" x1="0" x2={w} y1={h / 2} y2={h / 2} />
      {minorMarks.map((p) => (
        <circle
          key={`m${p}`}
          class="eval-graph__mark eval-graph__mark--minor"
          cx={x(p + 1)}
          cy={y(p + 1)}
          r="2.5"
        />
      ))}
      {marks.map((p) => (
        <circle key={p} class="eval-graph__mark" cx={x(p + 1)} cy={y(p + 1)} r="3" />
      ))}
      <line class="eval-graph__cursor" x1={x(current)} x2={x(current)} y1="0" y2={h} />
    </svg>
  );
}
