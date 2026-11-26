/* global process, console */
// Builds public/puzzles/ from the Lichess puzzle database (CC0).
// https://database.lichess.org/#puzzles
//
// Usage (the loader lets the script use the tactic detector from src/):
//   node --experimental-transform-types --import ./training/register.mjs \
//     scripts/build-puzzle-shards.ts                    download and build
//   ... --input FILE    build from a local .csv.zst
//   ... --limit 20000   stop after N rows (for a quick local set)
//
// A puzzle tagged with several tactics, a pin won by a fork say, teaches the
// one its solution uses first. For the tactics the detector knows, a shard
// keeps only puzzles whose first tactic, read from the solution, is its own.
//
// Runs in CI before the site build. Output is not committed.
import { createReadStream, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createZstdDecompress } from 'node:zlib';
import { join } from 'node:path';
import { fromFen } from '../src/detectors/board';
import { lineTactics, type TacticKind } from '../src/detectors/lineTactics';

const URL_CSV = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const OUT = 'public/puzzles';
const FORMAT = 1;

// Quality filter.
const MIN_POPULARITY = 80;
const MIN_PLAYS = 500;
const MAX_DEVIATION = 90;
// Shape and budget.
const BAND = 100;
const MIN_RATING = 400;
const MAX_RATING = 3200;
const PER_SHARD = 400;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 250 * 1000 * 1000;

/** Lichess themes kept, each mapped to the shard name the app uses. */
const THEMES: Record<string, string> = {
  hangingPiece: 'hangingPiece',
  trappedPiece: 'trappedPiece',
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  discoveredAttack: 'discoveredAttack',
  backRankMate: 'backRankMate',
  mate: 'mate',
  quietMove: 'quietMove',
  sacrifice: 'sacrifice',
  kingsideAttack: 'kingsideAttack',
  defensiveMove: 'defensiveMove',
  capturingDefender: 'capturingDefender',
  pawnEndgame: 'pawnEndgame',
  rookEndgame: 'rookEndgame',
  bishopEndgame: 'minorEndgame',
  knightEndgame: 'minorEndgame',
  queenEndgame: 'queenEndgame',
  opening: 'opening',
  middlegame: 'middlegame',
  endgame: 'endgame',
};

/** Shards whose puzzles must use their tactic first, by the detector's name for it. */
const FIRST_TACTIC: Record<string, TacticKind> = {
  hangingPiece: 'hanging piece',
  trappedPiece: 'trapped piece',
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  discoveredAttack: 'discovered attack',
  backRankMate: 'back rank mate',
};

/** The puzzle's solution uses `kind` before any other tactic. */
function teaches([, fen, moves]: Row, kind: TacticKind): boolean {
  return lineTactics(fromFen(fen), moves.split(' '))[0]?.kind === kind;
}

type Row = [
  id: string,
  fen: string,
  moves: string,
  rating: number,
  popularity: number,
  plays: number,
];

function args() {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { input: get('--input'), limit: Number(get('--limit') ?? Infinity) };
}

async function source(input: string | undefined): Promise<NodeJS.ReadableStream> {
  if (input) return createReadStream(input).pipe(createZstdDecompress());
  const res = await fetch(URL_CSV, {
    headers: { 'User-Agent': 'Monachessimo build (github.com/Multi-Volt/Monachessimo)' },
  });
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  return Readable.fromWeb(res.body as never).pipe(createZstdDecompress());
}

async function main() {
  const { input, limit } = args();
  const shards = new Map<string, Row[]>();
  let rows = 0;
  let kept = 0;
  const lines = createInterface({ input: await source(input), crlfDelay: Infinity });
  let header: string[] | undefined;
  for await (const line of lines) {
    if (!header) {
      header = line.split(',');
      const want = [
        'PuzzleId',
        'FEN',
        'Moves',
        'Rating',
        'RatingDeviation',
        'Popularity',
        'NbPlays',
        'Themes',
      ];
      for (const [i, w] of want.entries())
        if (header[i] !== w) throw new Error(`Unexpected column ${i}: ${header[i]} (wanted ${w})`);
      continue;
    }
    if (++rows > limit) break;
    const f = line.split(',');
    const rating = Number(f[3]);
    const deviation = Number(f[4]);
    const popularity = Number(f[5]);
    const plays = Number(f[6]);
    if (popularity < MIN_POPULARITY || plays < MIN_PLAYS || deviation > MAX_DEVIATION) continue;
    if (rating < MIN_RATING || rating >= MAX_RATING + BAND) continue;
    const band = Math.min(MAX_RATING, Math.floor(rating / BAND) * BAND);
    const row: Row = [f[0]!, f[1]!, f[2]!, rating, popularity, plays];
    const names = new Set(
      (f[7] ?? '')
        .split(' ')
        .map((t) => THEMES[t])
        .filter(Boolean) as string[],
    );
    if (names.size) kept++;
    for (const name of names) {
      const key = `${name}/${band}`;
      const list = shards.get(key) ?? [];
      list.push(row);
      shards.set(key, list);
    }
  }

  rmSync(OUT, { recursive: true, force: true });
  const manifest: {
    format: number;
    source: string;
    license: string;
    builtAt: string;
    band: number;
    themes: Record<string, Record<string, { file: string; count: number }>>;
    puzzles: number;
    bytes: number;
  } = {
    format: FORMAT,
    source: URL_CSV,
    license: 'CC0-1.0',
    builtAt: new Date().toISOString(),
    band: BAND,
    themes: {},
    puzzles: 0,
    bytes: 0,
  };
  let total = 0;
  let dropped = 0;
  for (const [key, list] of [...shards].sort(([a], [b]) => a.localeCompare(b))) {
    const [name, band] = key.split('/') as [string, string];
    // Most popular first, then most played.
    list.sort((a, b) => b[4] - a[4] || b[5] - a[5]);
    const kind = FIRST_TACTIC[name];
    const chosen: Row[] = [];
    for (const row of list) {
      if (chosen.length >= PER_SHARD) break;
      if (kind && !teaches(row, kind)) {
        dropped++;
        continue;
      }
      chosen.push(row);
    }
    const top = chosen.map(([id, fen, moves, rating]) => [id, fen, moves, rating]);
    const file = `${name}/${band}.json`;
    mkdirSync(join(OUT, name), { recursive: true });
    const body = JSON.stringify(top);
    writeFileSync(join(OUT, file), body);
    const size = statSync(join(OUT, file)).size;
    if (size > MAX_FILE_BYTES) throw new Error(`${file} is ${size} bytes, over 25 MiB`);
    total += size;
    (manifest.themes[name] ??= {})[band] = { file, count: top.length };
    manifest.puzzles += top.length;
  }
  manifest.bytes = total;
  if (total > MAX_TOTAL_BYTES)
    throw new Error(`Puzzle data is ${total} bytes, over the 250 MB budget`);
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest));
  console.log(
    `Read ${rows} rows, ${kept} passed the filter, ${dropped} left out of a tactic shard they do not teach first. Wrote ${shards.size} shards, ${manifest.puzzles} puzzles, ${(total / 1e6).toFixed(1)} MB.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
