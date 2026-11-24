import type { Score } from '../engine/eval';
import type { TagName } from '../detectors';
import type { Side } from '../import/types';

export type DrillType =
  'replay' | 'missed' | 'setup' | 'sacrifice' | 'theme' | 'plan' | 'conversion' | 'time';

/** One practice position. Every field is derived from engine output or the game record. */
export interface Drill {
  /** `${type}:${position key}` so the same position is one drill per type. */
  id: string;
  type: DrillType;
  fen: string;
  side: Side;
  /** What the player is asked to do, one short sentence. */
  goal: string;
  /** Moves that count as correct, in UCI, with their scores from the side to move. */
  accepted: { uci: string; score: Score }[];
  /** Best line from the position, in UCI. */
  line: string[];
  /**
   * For multi-move puzzles: every move from the presented position, the
   * player's moves at even indexes and the opponent's at odd ones. The
   * player must play each of their moves; the last may be any mate.
   */
  solution?: string[];
  bestScore: Score;
  /** Hints from vague to exact. The last one names the move. */
  hints: string[];
  /** Shown after the drill. Only measured facts. */
  explanation: string[];
  tags: TagName[];
  /** Difficulty on the puzzle rating scale. */
  rating: number;
  source?: { gameId: string; ply: number; played: string; playedSan: string };
  /** For plan drills: the candidate moves and what each one does. */
  choices?: PlanChoice[];
  /** For conversion drills: the engine's strength, Stockfish Skill Level 0 to 20. */
  opponentSkill?: number;
  /** For theme puzzles: the Lichess puzzle id and its themes. */
  puzzle?: { id: string; theme: string };
  createdAt: number;
}

export interface PlanChoice {
  uci: string;
  san: string;
  /** Score after the move, from the side to move before it. */
  score: Score;
  /** Measured changes after the move and the engine's reply. */
  changes: string[];
  /** The engine's reply in SAN, when known. */
  reply?: string;
  /** True for the move played in the game. */
  played?: boolean;
}

/** Scheduler state for one drill. */
export interface ReviewState {
  id: string;
  /** Unix milliseconds when the drill is next due. */
  due: number;
  /** Days until the next review after a pass. */
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
  lastGrade?: Grade;
  lastSeen?: number;
}

/** fail: wrong move or answer shown. hard: solved after a hint. good: solved first try. */
export type Grade = 'fail' | 'hard' | 'good';
