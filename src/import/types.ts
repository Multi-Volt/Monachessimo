import type { Score } from '../engine/eval';

export type Source = 'lichess' | 'chesscom';
export type Side = 'white' | 'black';
export type Speed = 'ultraBullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily';
export type Result = '1-0' | '0-1' | '1/2-1/2';

export interface PlayerInfo {
  name: string;
  rating?: number;
}

/** One game from either site, in the shape the rest of the app uses. */
export interface Game {
  /** `${source}:${sourceId}`, unique across sites. */
  id: string;
  source: Source;
  sourceId: string;
  url: string;
  /** Lowercased username of the player this game was imported for. */
  owner: string;
  userColor: Side;
  white: PlayerInfo;
  black: PlayerInfo;
  speed: Speed;
  /** Seconds. Missing for daily games. */
  timeControl?: { initial: number; increment: number };
  result: Result;
  /** Unix time in milliseconds when the game started. */
  playedAt: number;
  opening?: { eco?: string; name?: string };
  /** Moves in SAN, one per ply. */
  san: string[];
  /** Moves in UCI, one per ply. */
  uci: string[];
  /** Clock of the mover after each ply, in centiseconds. */
  clocks?: number[];
  /**
   * Server evaluations of the position after each ply, from White's side.
   * Present only when the site already analyzed the game.
   */
  importedEvals?: (Score | null)[];
}

export interface ImportOptions {
  /** Maximum number of games to fetch. */
  max: number;
  /** Only fetch games that started after this time (milliseconds). */
  since?: number;
  signal?: AbortSignal;
  /** Called once per normalized game, in the order the site sends them. */
  onGame: (game: Game) => void | Promise<void>;
  /** Called before waiting out a rate limit, with the wait in milliseconds. */
  onWait?: (ms: number) => void;
}

export class ImportError extends Error {
  constructor(
    message: string,
    readonly kind: 'notFound' | 'network' | 'rateLimited' | 'badResponse',
  ) {
    super(message);
    this.name = 'ImportError';
  }
}
