import type { Chess } from 'chessops/chess';
import type { MistakeClass } from '../analysis/mistakes';
import type { Score } from '../engine/eval';
import type { Line } from '../engine/uci';
import type { Side } from '../import/types';

export const TAGS = [
  'hangingPiece',
  'missedCapture',
  'trappedPiece',
  'forkMissed',
  'forkAllowed',
  'pinMissed',
  'pinAllowed',
  'skewerMissed',
  'skewerAllowed',
  'discoveredAttack',
  'backRank',
  'mateMissed',
  'mateAllowed',
  'quietSetupMissed',
  'sacrificeMissed',
  'kingSafety',
  'pawnStructure',
  'pieceActivity',
  'openingError',
  'conversionFailure',
  'timeTrouble',
  'endgame:pawn',
  'endgame:rook',
  'endgame:minor',
  'endgame:queen',
] as const;

export type TagName = (typeof TAGS)[number];

/** Everything a detector may read about one of the player's moves. */
export interface MoveContext {
  ply: number;
  mover: Side;
  /** Position before the move. */
  before: Chess;
  /** Played move in UCI. */
  played: string;
  /** Played move followed by the engine's best continuation. */
  playedPv: string[];
  /** Engine lines before the move, best first, from the mover's side. */
  lines: Line[];
  bestScore: Score;
  playedScore: Score;
  /** Drop in the mover's winning chances, 0 to 2. */
  drop: number;
  class: MistakeClass | null;
  /** Mover's clock before the move, in centiseconds, when known. */
  clockBefore?: number;
  /** Starting clock in seconds, when the game had one. */
  initialSeconds?: number;
}

export type Detector = (ctx: MoveContext) => boolean;
