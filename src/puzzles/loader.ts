import { makeFen } from 'chessops/fen';
import { makeSquare, parseUci } from 'chessops/util';
import { uciToSan } from '../chess/san';
import type { TagName } from '../detectors';
import { fromFen } from '../detectors/board';
import type { Drill } from '../drills/types';
import { TAG_THEME, THEME_GOAL } from './themes';

export interface Manifest {
  format: number;
  band: number;
  themes: Record<string, Record<string, { file: string; count: number }>>;
  puzzles: number;
  bytes: number;
}

/** [id, fen before the opponent's move, moves in UCI separated by spaces, rating] */
export type PuzzleRow = [string, string, string, number];

const base = () => `${import.meta.env.BASE_URL}puzzles/`;
let manifest: Promise<Manifest | undefined> | undefined;
const shards = new Map<string, Promise<PuzzleRow[]>>();

/** The shard manifest, or undefined when this build ships no puzzles. */
export function loadManifest(fetchImpl: typeof fetch = fetch): Promise<Manifest | undefined> {
  manifest ??= fetchImpl(`${base()}manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : undefined))
    .catch(() => undefined);
  return manifest;
}

export function loadShard(file: string, fetchImpl: typeof fetch = fetch): Promise<PuzzleRow[]> {
  let p = shards.get(file);
  if (!p) {
    p = fetchImpl(`${base()}${file}`).then((r) => {
      if (!r.ok) throw new Error(`Puzzle file ${file} answered HTTP ${r.status}`);
      return r.json() as Promise<PuzzleRow[]>;
    });
    shards.set(file, p);
  }
  return p;
}

/** The band closest to `rating` that exists for this theme. */
export function nearestBand(m: Manifest, theme: string, rating: number): string | undefined {
  const bands = Object.keys(m.themes[theme] ?? {}).map(Number);
  if (!bands.length) return undefined;
  const want = Math.floor(rating / m.band) * m.band;
  return String(bands.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a)));
}

/** Converts a puzzle row to a drill. The opponent's first move is applied. */
export function puzzleDrill(row: PuzzleRow, theme: string, now: number): Drill | undefined {
  const [id, fen, movesText, rating] = row;
  const moves = movesText.split(' ');
  const pos = fromFen(fen);
  const first = parseUci(moves[0]!);
  if (!first || !pos.isLegal(first)) return undefined;
  pos.play(first);
  const solution = moves.slice(1);
  const side = pos.turn;
  const start = makeFen(pos.toSetup());
  return {
    id: `theme:${id}`,
    type: 'theme',
    fen: start,
    side,
    goal: THEME_GOAL[theme] ?? 'Find the best move.',
    accepted: [{ uci: solution[0]!, score: { kind: 'cp', value: 0 } }],
    line: solution,
    solution,
    bestScore: { kind: 'cp', value: 0 },
    hints: puzzleHints(start, solution[0]!, theme),
    explanation: [
      `This is Lichess puzzle ${id}, rated ${rating}. The solution has ${Math.ceil(solution.length / 2)} of your moves.`,
    ],
    tags: [],
    rating,
    puzzle: { id, theme },
    createdAt: now,
  };
}

const THEME_HINT: Record<string, string> = {
  hangingPiece: 'Something is undefended.',
  trappedPiece: 'One enemy piece has very few squares.',
  fork: 'One move can attack two things.',
  pin: 'A piece cannot move without exposing something behind it.',
  skewer: 'Attack along a line through a valuable piece.',
  discoveredAttack: 'Move one piece to open a line for another.',
  backRankMate: 'Look at the back rank.',
  mate: 'Start with checks.',
  defensiveMove: 'Your opponent threatens something serious. Stop it.',
  quietMove: 'The best move is not a capture or a check.',
  sacrifice: 'Giving up material works.',
};

function puzzleHints(fen: string, uci: string, theme: string): string[] {
  const pos = fromFen(fen);
  const m = parseUci(uci);
  const from = m && 'from' in m ? m.from : undefined;
  const role = from !== undefined ? pos.board.getRole(from) : undefined;
  const out = [THEME_HINT[theme] ?? 'Look at every check and capture first.'];
  if (role && from !== undefined) {
    out.push(`Move a ${role}.`);
    out.push(`Move the ${role} on ${makeSquare(from)}.`);
  }
  out.push(`The answer is ${uciToSan(fen, uci)}.`);
  return out;
}

/**
 * Theme puzzles for the given weaknesses near the player's puzzle rating.
 * Fetches only the manifest and one shard per theme.
 */
export async function themeDrills(
  tags: TagName[],
  rating: number,
  seen: Set<string>,
  perTheme: number,
  now: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Drill[]> {
  const m = await loadManifest(fetchImpl);
  if (!m) return [];
  const out: Drill[] = [];
  const themes = [...new Set(tags.map((t) => TAG_THEME[t]).filter(Boolean) as string[])];
  for (const theme of themes) {
    const band = nearestBand(m, theme, rating);
    if (!band) continue;
    const rows = await loadShard(m.themes[theme]![band]!.file, fetchImpl);
    const tag = tags.find((t) => TAG_THEME[t] === theme)!;
    let n = 0;
    for (const row of rows) {
      if (n >= perTheme) break;
      if (seen.has(`theme:${row[0]}`)) continue;
      const d = puzzleDrill(row, theme, now);
      if (!d) continue;
      // The same puzzle can sit in several theme shards.
      seen.add(d.id);
      out.push({ ...d, tags: [tag] });
      n++;
    }
  }
  return out;
}
