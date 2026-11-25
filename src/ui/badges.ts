import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import type { MoveClass } from '../play/coach';
import type { PraiseLabel } from '../play/praise';

/** Every label a move can get, best first. */
export type MoveLabel = PraiseLabel | MoveClass;

export const LABEL_ORDER: MoveLabel[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
];

export const LABEL_NAME: Record<MoveLabel, string> = {
  brilliant: 'Brilliant',
  great: 'Great',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

export const LABEL_SYMBOL: Record<MoveLabel, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '✓',
  good: '✓',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

/**
 * Badge fill colors. They sit on the board, not on the page, so they are
 * fixed rather than themed; white symbols on each meet 3:1.
 */
export const LABEL_COLOR: Record<MoveLabel, string> = {
  brilliant: '#14857a',
  great: '#3f6f9e',
  best: '#4f7a28',
  excellent: '#4f7a28',
  good: '#5f7a45',
  inaccuracy: '#9a7500',
  mistake: '#b5571a',
  blunder: '#b3261e',
};

/** A round badge in the top right corner of a square. */
export function badge(square: string, label: MoveLabel): DrawShape {
  const sym = LABEL_SYMBOL[label];
  const size = sym.length > 1 ? 26 : 32;
  return {
    orig: square as Key,
    customSvg: {
      html: `<g><circle cx="78" cy="22" r="21" fill="${LABEL_COLOR[label]}" stroke="#ffffff" stroke-width="4"/><text x="78" y="23" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-weight="800" font-size="${size}" fill="#ffffff">${sym}</text></g>`,
    },
  };
}

export function arrow(from: string, to: string, brush: 'red' | 'green' | 'blue'): DrawShape {
  return { orig: from as Key, dest: to as Key, brush };
}

export function ring(square: string, brush: 'red' | 'green' | 'blue'): DrawShape {
  return { orig: square as Key, brush };
}
