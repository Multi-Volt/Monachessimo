import { moveHints } from '../chess/hints';
import { makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { uciToSan, pvToSan } from '../chess/san';
import { fromFen } from '../detectors/board';
import { acceptable } from '../drills/answers';
import type { Drill } from '../drills/types';
import type { Line } from '../engine/uci';
import { positionKey } from '../engine/uci';
import type { Side } from '../import/types';
import type { Repo } from '../store/repo';
import { formatDate } from '../ui/format';
import type { GameEnd, Strictness } from './coach';

/** One of the player's moves in a practice game. */
export interface PlyRecord {
  ply: number;
  /** Refused tries before the accepted move. */
  refused: number;
  /** True when the player asked for a hint on this move. */
  hinted: boolean;
  /** Label of the accepted move: praise for a good move, or its class. */
  label?: import('../ui/badges').MoveLabel;
  /** Label of the first try at this move, for the game's accuracy and counts. */
  first?: import('../ui/badges').MoveLabel;
  /** Drop in winning chances of the first try. */
  drop?: number;
}

export interface PracticeGame {
  id: string;
  startFen: string;
  you: Side;
  /** All moves from the start position, both sides, in UCI. */
  moves: string[];
  skill: number;
  /** The rating of the Maia network that plays the opponent; missing means Stockfish. */
  maia?: number;
  /** The player's rating, rounded to a Maia network, for how rare their good moves are. */
  rating?: number;
  strictness: Strictness;
  startedAt: number;
  yourMoves: PlyRecord[];
  savedDrills: number;
  /** Weak moves: refused ones, and ones the coach let through at this strictness. */
  refusals?: {
    ply: number;
    san: string;
    class: import('./coach').MoveClass;
    tags: import('../detectors').TagName[];
    accepted?: boolean;
  }[];
  /** Moves the player took back. */
  takebacks?: number;
  /** Engine review of the finished game, once it has run. */
  review?: import('./review').PracticeReview;
  /** Where the start position came from, for the summary. */
  source?: { label: string; gameId?: string; ply?: number };
  end?: GameEnd | { kind: 'resigned' };
}

export interface PracticeSummary {
  id: string;
  at: number;
  you: Side;
  result: 'won' | 'lost' | 'drew';
  moves: number;
  firstTry: number;
  skill: number;
  strictness: Strictness;
}

export async function loadCurrent(repo: Repo): Promise<PracticeGame | undefined> {
  return repo.getMeta<PracticeGame>('practiceGame');
}

export async function saveCurrent(repo: Repo, g: PracticeGame | undefined): Promise<void> {
  await repo.setMeta('practiceGame', g);
}

export async function addSummary(repo: Repo, s: PracticeSummary): Promise<void> {
  const list = (await repo.getMeta<PracticeSummary[]>('practiceHistory')) ?? [];
  await repo.setMeta('practiceHistory', [s, ...list].slice(0, 50));
}

/** Position after all moves of a practice game. */
export function currentPosition(g: PracticeGame) {
  const pos = fromFen(g.startFen);
  for (const u of g.moves) {
    const m = parseUci(u);
    if (m && pos.isLegal(m)) pos.play(m);
  }
  return pos;
}

/** Position keys of every position in the game, for repetition. */
export function history(g: PracticeGame): string[] {
  const pos = fromFen(g.startFen);
  const out = [positionKey(makeFen(pos.toSetup()))];
  for (const u of g.moves) {
    const m = parseUci(u);
    if (!m || !pos.isLegal(m)) break;
    pos.play(m);
    out.push(positionKey(makeFen(pos.toSetup())));
  }
  return out;
}

/**
 * A drill from a position where the coach refused the player's move. It
 * comes back through the scheduler like a mistake from a real game.
 */
export function practiceDrill(
  fen: string,
  side: Side,
  refusedUci: string,
  drop: number,
  lines: Line[],
  rating: number,
  now: number,
): Drill | undefined {
  const best = lines[0];
  if (!best?.pv[0]) return undefined;
  const san = uciToSan(fen, refusedUci);
  const bestSan = uciToSan(fen, best.pv[0]);
  return {
    id: `practice:${positionKey(fen)}`,
    type: 'replay',
    fen,
    side,
    goal: `In a practice game you tried ${san}. Find a better move.`,
    accepted: lines
      .filter((l) => l.pv[0] && l.pv[0] !== refusedUci && acceptable(l.score, best.score))
      .map((l) => ({ uci: l.pv[0]!, score: l.score })),
    line: best.pv,
    bestScore: best.score,
    hints: moveHints(fen, best.pv[0]!),
    explanation: [
      `In a practice game on ${formatDate(now)} the coach refused ${san}. It cost about ${Math.round(drop * 50)}% of your winning chances.`,
      `${bestSan} was the engine's choice. Engine line: ${pvToSan(fen, best.pv, 6).join(' ')}.`,
    ],
    tags: [],
    rating,
    createdAt: now,
  };
}

/** Most finished practice games kept for review. */
export const KEEP_FINISHED = 30;

export async function finishedGames(repo: Repo): Promise<PracticeGame[]> {
  return (await repo.getMeta<PracticeGame[]>('practiceGames')) ?? [];
}

/** Stores a finished game for review, newest first, replacing an older copy. */
export async function saveFinished(repo: Repo, g: PracticeGame): Promise<void> {
  const list = (await finishedGames(repo)).filter((x) => x.id !== g.id);
  await repo.setMeta('practiceGames', [g, ...list].slice(0, KEEP_FINISHED));
}
