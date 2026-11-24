import { negate, winningChances, type Score } from '../engine/eval';
import { formatScore } from './format';

/** Converts a side-to-move score to White's point of view. */
export function whiteScore(score: Score, sideToMove: 'white' | 'black'): Score {
  return sideToMove === 'white' ? score : negate(score);
}

/** Words for who is better, from a White-side score. */
export function balanceWords(white: Score): string {
  const wc = winningChances(white);
  if (white.kind === 'mate') return white.value > 0 ? 'White mates' : 'Black mates';
  if (Math.abs(wc) < 0.1) return 'about equal';
  const side = wc > 0 ? 'White' : 'Black';
  if (Math.abs(wc) >= 0.5) return `${side} is winning`;
  return `${side} is better`;
}

/**
 * Evaluation of a position from White's side: + is good for White, − for
 * Black. The bar fills with White's share of the winning chances.
 */
export function EvalBar({ score, label = 'Evaluation' }: { score: Score; label?: string }) {
  const share = Math.round(((winningChances(score) + 1) / 2) * 100);
  const text = `${formatScore(score)}, ${balanceWords(score)}`;
  return (
    <div class="eval-bar" role="img" aria-label={`${label}: ${text}`}>
      <span class="eval-bar__track" aria-hidden="true">
        <span class="eval-bar__white" style={{ width: `${share}%` }} />
      </span>
      <span class="eval-bar__text num" aria-hidden="true">
        {text}
      </span>
    </div>
  );
}
