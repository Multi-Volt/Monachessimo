import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { winningChances, type Score } from '../engine/eval';
import { positionKey } from '../engine/uci';
import type { Side } from '../import/types';

/** How strict the coach is: the smallest drop in winning chances it refuses. */
export const STRICTNESS = {
  blunders: 0.3,
  mistakes: 0.2,
  inaccuracies: 0.1,
} as const;

export type Strictness = keyof typeof STRICTNESS;

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
  return moveDrop(best, played) >= STRICTNESS[strictness];
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
