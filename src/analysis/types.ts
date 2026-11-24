import type { Score } from '../engine/eval';
import type { Line } from '../engine/uci';
import type { Side } from '../import/types';
import type { MistakeClass } from './mistakes';

/** Engine settings for the two passes. Changing them invalidates saved analysis. */
export interface AnalysisSettings {
  fastDepth: number;
  /** Time cap per position in the fast pass, in milliseconds. */
  fastMovetime: number;
  deepDepth: number;
  /** Time cap per position in the deep pass, in milliseconds. */
  deepMovetime: number;
  deepMultipv: number;
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  fastDepth: 12,
  fastMovetime: 250,
  deepDepth: 18,
  deepMovetime: 1500,
  deepMultipv: 3,
};

/** Bump when GameAnalysis changes shape, so stored analyses are redone. */
export const ANALYSIS_FORMAT = 2;

export function settingsKey(s: AnalysisSettings): string {
  return `v${ANALYSIS_FORMAT}-f${s.fastDepth}/${s.fastMovetime}-d${s.deepDepth}/${s.deepMovetime}x${s.deepMultipv}`;
}

/** Deep-pass result for one of the player's moves. */
export interface PlyReview {
  ply: number;
  mover: Side;
  san: string;
  uci: string;
  /** Mover's winning chances before and after the move, -1 to 1. */
  wcBefore: number;
  wcAfter: number;
  /** wcBefore minus wcAfter, from the deep pass. */
  drop: number;
  /** Drop seen by the fast pass. */
  fastDrop: number;
  class: MistakeClass | null;
  /** Engine lines in the position before the move, best first, from the mover's side. */
  lines: Line[];
  /** Score of the played move from the mover's side. */
  playedScore: Score;
  /** The played move followed by the engine's continuation, in UCI. */
  playedPv: string[];
}

export interface GameAnalysis {
  gameId: string;
  settings: string;
  status: 'partial' | 'done';
  /**
   * Score of the position before each ply (and after the last), from the
   * side to move. Null until the fast pass reaches it.
   */
  evals: (Score | null)[];
  /** Fast-pass best move in each position, in UCI. */
  best: (string | null)[];
  /** Plies flagged by the fast pass for the deep pass. */
  flagged: number[];
  reviews: PlyReview[];
  /** Total engine time spent on this game, in milliseconds. */
  engineMs: number;
  updatedAt: number;
}
