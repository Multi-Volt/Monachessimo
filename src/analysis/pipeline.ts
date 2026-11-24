import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { makeSanAndPlay } from 'chessops/san';
import { negate, type Score } from '../engine/eval';
import type { SearchRequest, SearchResult } from '../engine/engine';
import type { Line } from '../engine/uci';
import type { Game } from '../import/types';
import { classify, moveDrop, THRESHOLDS } from './mistakes';
import { moverOf, replay } from './positions';
import { settingsKey, type AnalysisSettings, type GameAnalysis, type PlyReview } from './types';
import { winningChances } from '../engine/eval';

export type Search = (req: SearchRequest, signal?: AbortSignal) => Promise<SearchResult>;

export interface Progress {
  phase: 'fast' | 'deep';
  done: number;
  total: number;
}

export interface AnalyzeOptions {
  search: Search;
  settings: AnalysisSettings;
  /** Earlier partial analysis to continue from. */
  resume?: GameAnalysis;
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  /** Called with the current state so the caller can save it. */
  onCheckpoint?: (a: GameAnalysis) => void | Promise<void>;
  /** Positions between checkpoints. */
  checkpointEvery?: number;
}

/** Score of a finished position, or undefined if the game can go on. */
export function terminalScore(fen: string): Score | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return undefined;
  if (pos.value.isCheckmate()) return { kind: 'mate', value: 0 };
  if (pos.value.isStalemate() || pos.value.isInsufficientMaterial())
    return { kind: 'cp', value: 0 };
  return undefined;
}

/** Converts Lichess's White-side evals after each ply to side-to-move scores per position. */
function importedToSideToMove(game: Game, n: number): (Score | null)[] {
  const out: (Score | null)[] = Array(n + 1).fill(null);
  game.importedEvals?.forEach((s, i) => {
    if (!s) return;
    // Position i+1 has Black to move when ply i was White's.
    out[i + 1] = i % 2 === 0 ? negate(s) : s;
  });
  return out;
}

function sanOf(fen: string, uci: string): string {
  const setup = parseFen(fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const move = parseUci(uci);
  return move ? makeSanAndPlay(pos, move) : uci;
}

/**
 * Analyzes one game: a fast pass over every position, then a deep multi-PV
 * pass on the player's moves that the fast pass flagged. Can be stopped with
 * the signal and continued later from a checkpoint.
 */
export async function analyzeGame(game: Game, opts: AnalyzeOptions): Promise<GameAnalysis> {
  const { search, settings, signal } = opts;
  const fens = replay(game.uci);
  const n = game.uci.length;
  const key = settingsKey(settings);
  const resume = opts.resume?.settings === key ? opts.resume : undefined;

  const a: GameAnalysis = resume
    ? structuredClone(resume)
    : {
        gameId: game.id,
        settings: key,
        status: 'partial',
        evals: importedToSideToMove(game, n),
        best: Array(n + 1).fill(null),
        flagged: [],
        reviews: [],
        engineMs: 0,
        updatedAt: Date.now(),
      };
  const every = opts.checkpointEvery ?? 8;
  const checkpoint = async () => {
    a.updatedAt = Date.now();
    await opts.onCheckpoint?.(a);
  };

  // Fast pass. Imported evals fill most positions for analyzed Lichess games.
  for (let i = 0; i <= n; i++) {
    if (a.evals[i] === null) {
      const t = terminalScore(fens[i]!);
      if (t) a.evals[i] = t;
    }
  }
  const todo = a.evals.flatMap((e, i) => (e === null ? [i] : []));
  let done = a.evals.length - todo.length;
  opts.onProgress?.({ phase: 'fast', done, total: n + 1 });
  let sinceCheckpoint = 0;
  await saveOnFailure(
    checkpoint,
    Promise.all(
      todo.map(async (i) => {
        const r = await search(
          { fen: fens[i]!, depth: settings.fastDepth, movetime: settings.fastMovetime },
          signal,
        );
        const top = r.lines[0];
        a.evals[i] = top ? top.score : { kind: 'cp', value: 0 };
        a.best[i] = r.bestmove;
        a.engineMs += r.ms;
        opts.onProgress?.({ phase: 'fast', done: ++done, total: n + 1 });
        if (++sinceCheckpoint >= every) {
          sinceCheckpoint = 0;
          await checkpoint();
        }
      }),
    ),
  );

  // Flag the player's moves whose fast-pass drop reaches the lowest threshold.
  if (!resume || resume.flagged.length === 0) {
    a.flagged = [];
    for (let ply = 0; ply < n; ply++) {
      if (moverOf(ply) !== game.userColor) continue;
      const drop = moveDrop(a.evals[ply]!, a.evals[ply + 1]!);
      if (drop >= THRESHOLDS.inaccuracy) a.flagged.push(ply);
    }
  }
  await checkpoint();

  // Deep pass on flagged moves only.
  const reviewed = new Set(a.reviews.map((r) => r.ply));
  const deepTodo = a.flagged.filter((p) => !reviewed.has(p));
  let deepDone = a.flagged.length - deepTodo.length;
  opts.onProgress?.({ phase: 'deep', done: deepDone, total: a.flagged.length });
  await saveOnFailure(
    checkpoint,
    Promise.all(
      deepTodo.map(async (ply) => {
        const review = await deepReview(game, fens, ply, a, opts);
        a.reviews.push(review);
        opts.onProgress?.({ phase: 'deep', done: ++deepDone, total: a.flagged.length });
        await checkpoint();
      }),
    ),
  );
  a.reviews.sort((x, y) => x.ply - y.ply);
  a.status = 'done';
  await checkpoint();
  return a;
}

/** Saves progress before passing on an error, such as a pause. */
async function saveOnFailure<T>(save: () => Promise<void>, work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (err) {
    await save();
    throw err;
  }
}

async function deepReview(
  game: Game,
  fens: string[],
  ply: number,
  a: GameAnalysis,
  opts: AnalyzeOptions,
): Promise<PlyReview> {
  const { search, settings, signal } = opts;
  const before = fens[ply]!;
  const after = fens[ply + 1]!;
  const played = game.uci[ply]!;
  const deep = await search(
    {
      fen: before,
      depth: settings.deepDepth,
      movetime: settings.deepMovetime,
      multipv: settings.deepMultipv,
    },
    signal,
  );
  a.engineMs += deep.ms;
  const lines: Line[] = deep.lines;
  const bestScore = lines[0]?.score ?? a.evals[ply]!;

  // Score of the played move from the mover's side.
  let playedScore: Score;
  const inLines = lines.find((l) => l.pv[0] === played);
  const terminal = terminalScore(after);
  if (inLines) playedScore = inLines.score;
  else if (terminal) playedScore = negate(terminal);
  else {
    const r = await search(
      { fen: after, depth: settings.deepDepth, movetime: settings.deepMovetime },
      signal,
    );
    a.engineMs += r.ms;
    playedScore = negate(r.lines[0]?.score ?? a.evals[ply + 1]!);
  }

  const wcBefore = winningChances(bestScore);
  const wcAfter = winningChances(playedScore);
  const drop = Math.max(0, wcBefore - wcAfter);
  const fastDrop = moveDrop(a.evals[ply]!, a.evals[ply + 1]!);
  // Level filter: the fast pass (depth 12) must also see the loss. A move only
  // a deep search can refute is not counted as the player's mistake.
  const cls = fastDrop >= THRESHOLDS.inaccuracy ? classify(drop) : null;
  return {
    ply,
    mover: game.userColor,
    san: game.san[ply] ?? sanOf(before, played),
    uci: played,
    wcBefore,
    wcAfter,
    drop,
    fastDrop,
    class: cls,
    lines,
    playedScore,
  };
}
