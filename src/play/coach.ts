import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { winningChances, type Score } from '../engine/eval';
import { positionKey } from '../engine/uci';
import type { Side } from '../import/types';

export type MoveClass = 'inaccuracy' | 'mistake' | 'blunder';

/** How strict the coach is: the mildest class of move it refuses. */
export const STRICTNESS = {
  blunders: 'blunder',
  mistakes: 'mistake',
  inaccuracies: 'inaccuracy',
} as const satisfies Record<string, MoveClass>;

export type Strictness = keyof typeof STRICTNESS;

const RANK: Record<MoveClass, number> = { inaccuracy: 1, mistake: 2, blunder: 3 };

/**
 * Centipawn loss for each class. Winning chances alone treat a pawn given
 * away near equality as an inaccuracy; a coach should call it a mistake.
 */
export const CP_LOSS = { inaccuracy: 40, mistake: 90, blunder: 200 } as const;
/**
 * The pawn thresholds apply only while the best move keeps the game within
 * this many centipawns. In a clearly won or lost position a pawn matters less,
 * and winning chances alone judge the move, as on Lichess and Chess.com.
 */
export const CLOSE_CP = 300;

const WC_LOSS = { inaccuracy: 0.1, mistake: 0.2, blunder: 0.3 } as const;

/** Centipawns with mates counted as plus or minus 1000. */
function cp(s: Score): number {
  if (s.kind === 'mate') return s.value > 0 ? 1000 : -1000;
  return Math.max(-1000, Math.min(1000, s.value));
}

export interface Verdict {
  class: MoveClass | null;
  /** Drop in winning chances, 0 to 2. */
  drop: number;
  /** Loss in centipawns, mates counted as 1000. */
  cpLoss: number;
}

function byThreshold<T extends Record<MoveClass, number>>(value: number, t: T): MoveClass | null {
  if (value >= t.blunder) return 'blunder';
  if (value >= t.mistake) return 'mistake';
  if (value >= t.inaccuracy) return 'inaccuracy';
  return null;
}

/**
 * Classifies a move by both scales and keeps the worse result. Scores are
 * from the player's side: the best move's, then the played move's.
 */
export function judgeMove(best: Score, played: Score): Verdict {
  const drop = moveDrop(best, played);
  const b = cp(best);
  const p = cp(played);
  const cpLoss = Math.max(0, b - p);
  const decided = Math.abs(b) > CLOSE_CP;
  const byWc = byThreshold(drop, WC_LOSS);
  const byCp = decided ? null : byThreshold(cpLoss, CP_LOSS);
  const cls = [byWc, byCp].reduce<MoveClass | null>(
    (worst, c) => (c && (!worst || RANK[c] > RANK[worst]) ? c : worst),
    null,
  );
  return { class: cls, drop, cpLoss };
}

export const STRICTNESS_TEXT: Record<Strictness, string> = {
  blunders: 'Refuse blunders only',
  mistakes: 'Refuse mistakes and blunders',
  inaccuracies: 'Refuse anything less than a good move',
};

/**
 * Drop in the player's winning chances from the best move to the played
 * move. Both scores are from the player's side.
 */
export function moveDrop(best: Score, played: Score): number {
  return Math.max(0, winningChances(best) - winningChances(played));
}

/** True when the coach sends the move back. */
export function refuses(strictness: Strictness, best: Score, played: Score): boolean {
  const v = judgeMove(best, played);
  return !!v.class && RANK[v.class] >= RANK[STRICTNESS[strictness]];
}

/** Stockfish Skill Level for a practice opponent near the player's rating. */
export function skillFor(rating: number): number {
  return Math.max(0, Math.min(20, Math.round((rating - 700) / 100)));
}

export function skillLabel(skill: number): string {
  if (skill <= 3) return 'Beginner';
  if (skill <= 7) return 'Casual';
  if (skill <= 12) return 'Club';
  if (skill <= 16) return 'Strong';
  return 'Expert';
}

export type GameEnd =
  | { kind: 'checkmate'; winner: Side }
  | { kind: 'stalemate' | 'insufficient' | 'repetition' | 'fifty' };

/**
 * How the game ended, or undefined while it goes on. `history` holds the
 * position keys of every position so far, including the current one.
 */
export function gameEnd(pos: Chess, history: readonly string[]): GameEnd | undefined {
  if (pos.isCheckmate())
    return { kind: 'checkmate', winner: pos.turn === 'white' ? 'black' : 'white' };
  if (pos.isStalemate()) return { kind: 'stalemate' };
  if (pos.isInsufficientMaterial()) return { kind: 'insufficient' };
  const key = positionKey(makeFen(pos.toSetup()));
  if (history.filter((k) => k === key).length >= 3) return { kind: 'repetition' };
  if (pos.halfmoves >= 100) return { kind: 'fifty' };
  return undefined;
}

export function endText(end: GameEnd, you: Side): string {
  switch (end.kind) {
    case 'checkmate':
      return end.winner === you ? 'You won by checkmate.' : 'You were checkmated.';
    case 'stalemate':
      return 'Draw by stalemate.';
    case 'insufficient':
      return 'Draw: neither side can mate.';
    case 'repetition':
      return 'Draw by threefold repetition.';
    case 'fifty':
      return 'Draw by the fifty-move rule.';
  }
}
