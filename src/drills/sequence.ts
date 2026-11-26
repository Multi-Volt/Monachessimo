import type { Chess } from 'chessops/chess';
import { balance, fromFen, playLine } from '../detectors/board';
import type { Score } from '../engine/eval';
import type { TagName } from '../detectors';
import type { Drill } from './types';

/** Own moves to hold a position in a defensive drill. */
export const HOLD_MOVES = 3;
/** Most own moves a drill asks for before it ends anyway. */
export const MAX_MOVES = 8;
/** Longest forced mate a drill asks the player to finish. */
export const MAX_MATE_MOVES = 5;
/** Smallest material gain, in pawns, that counts as winning material. */
export const MIN_GAIN = 2;

/** What finishes a drill. */
export type Goal =
  | { kind: 'mate' }
  | { kind: 'material'; gain: number }
  | { kind: 'hold'; moves: number }
  | { kind: 'solution' };

/** Tags whose best line wins something the player should collect. */
const ATTACKING: TagName[] = [
  'missedCapture',
  'forkMissed',
  'pinMissed',
  'skewerMissed',
  'discoveredAttack',
  'quietSetupMissed',
  'sacrificeMissed',
];

/**
 * Largest material gain the engine line reaches after an opponent move, so
 * a recapture inside the line is already counted. In pawns, from the side
 * to move at the start.
 */
export function lineGain(fen: string, line: readonly string[]): number {
  const start = fromFen(fen);
  const me = start.turn;
  const positions = playLine(start, line);
  let best = 0;
  // Even indexes after 0 are positions after an opponent move.
  for (let i = 2; i < positions.length; i += 2)
    best = Math.max(best, balance(positions[i]!, me) - balance(start, me));
  return best;
}

export function goalFor(drill: Drill): Goal {
  if (drill.solution) return { kind: 'solution' };
  if (
    drill.bestScore.kind === 'mate' &&
    drill.bestScore.value > 0 &&
    drill.bestScore.value <= MAX_MATE_MOVES
  )
    return { kind: 'mate' };
  const attacking =
    drill.type === 'missed' ||
    drill.type === 'setup' ||
    drill.type === 'sacrifice' ||
    drill.tags.some((t) => ATTACKING.includes(t));
  if (attacking) {
    const gain = lineGain(drill.fen, drill.line);
    if (gain >= MIN_GAIN) return { kind: 'material', gain: Math.min(gain, 9) };
  }
  return { kind: 'hold', moves: HOLD_MOVES };
}

/**
 * Checks the goal in a position where it is the player's turn again, or
 * where the game has ended. `movesMade` counts the player's moves so far.
 */
export function goalReached(goal: Goal, start: Chess, now: Chess, movesMade: number): boolean {
  const me = start.turn;
  if (now.isCheckmate()) return now.turn !== me;
  switch (goal.kind) {
    case 'mate':
    case 'solution':
      return false;
    case 'material':
      return now.turn === me && balance(now, me) - balance(start, me) >= goal.gain;
    case 'hold':
      return movesMade >= goal.moves;
  }
}

/** Plain statement of the goal, shown under the drill's question. */
export function goalText(goal: Goal): string | undefined {
  switch (goal.kind) {
    case 'mate':
      return 'Play until checkmate.';
    case 'material':
      return `Keep going until you have won the material: ${goal.gain} ${goal.gain === 1 ? 'point' : 'points'} or more.`;
    case 'hold':
      return `Hold the position for ${goal.moves} moves.`;
    case 'solution':
      return undefined;
  }
}

/** The engine's view of the position before one of the player's moves. */
export interface StepTarget {
  best: string;
  score: Score;
  /** Engine line from this position, starting with `best`. */
  pv: string[];
}

/** Target for the first move, from the drill's saved lines. */
export function firstTarget(drill: Drill): StepTarget {
  return { best: drill.line[0]!, score: drill.bestScore, pv: drill.line };
}
