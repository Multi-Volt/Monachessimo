// Exports A6 explanation records as JSONL training input for the phrasing model.
//
//   node --experimental-transform-types --import ./training/register.mjs \
//     training/export-records.ts --puzzles lichess_db_puzzle.csv.zst \
//     --pgn games.pgn.zst --count 20000 --out training/data/records.jsonl
//
// --themes backRankMate,discoveredAttack takes only puzzles with those
// Lichess themes, to add records for tactics the data has too few of.
//
// Sources, both CC0 from database.lichess.org:
//   --puzzles  The puzzle database. Each puzzle starts right before a real
//              losing move, which is the move judged. Mostly blunders.
//   --pgn      A game file. A few of each player's moves are judged, which
//              gives inaccuracies and mistakes as well.
// Records are spread over rating bands and game phases, and each source
// fills its share. The output is appended to, and ids already in it are
// skipped, so a stopped run continues where it left off.
//
// The Node Stockfish build runs on the thread that loads it, so one process
// uses one core. --procs N starts N processes, each judging its own share
// of the candidates into out.K, and joins their files into out at the end.
// Decompression needs the zstd command: Lichess files carry skippable
// frames that Node's own decompressor rejects.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { PgnParser, startingPosition, type Game, type PgnNodeData } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { nodePool } from '../tests/support/node-engine';
import { recordFor } from './record-pipeline';

interface Candidate {
  id: string;
  source: 'puzzle' | 'game';
  fen: string;
  uci: string;
  ply: number;
  rating: number;
  phase: Phase;
}

type Phase = 'opening' | 'middlegame' | 'endgame';

const BANDS = [1200, 1600, 2000, Infinity];
const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

function args() {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    puzzles: get('--puzzles'),
    pgn: get('--pgn'),
    count: Number(get('--count') ?? 1000),
    /** Share of records from the game file, when both sources are given. */
    gameShare: Number(get('--game-share') ?? 0.4),
    procs: Number(get('--procs') ?? Math.max(1, availableParallelism() - 2)),
    /** This process's share, as K/N: set by the parent process. */
    shard: (get('--shard') ?? '0/1').split('/').map(Number) as [number, number],
    out: get('--out') ?? 'training/data/records.jsonl',
    seed: Number(get('--seed') ?? 1),
    /** Only puzzles with one of these Lichess themes, for tactics the data lacks. */
    themes: (get('--themes') ?? '').split(',').filter(Boolean),
  };
}

/** A small seeded generator, so a rerun samples the same moves. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

const VALUE = { pawn: 0, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 } as const;

function phaseOf(pos: Chess, ply: number): Phase {
  let pieces = 0;
  for (const [, p] of pos.board) pieces += VALUE[p.role];
  if (pieces <= 26) return 'endgame';
  return ply < 20 ? 'opening' : 'middlegame';
}

const bucketOf = (c: Candidate) => `${c.source}:${BANDS.findIndex((b) => c.rating < b)}:${c.phase}`;

/** Decompressors still running; a shard that is full stops them. */
const decompressors: ReturnType<typeof spawn>[] = [];

function lines(file: string) {
  const zstd = spawn('zstd', ['-dcq', file], { stdio: ['ignore', 'pipe', 'inherit'] });
  decompressors.push(zstd);
  return createInterface({ input: zstd.stdout, crlfDelay: Infinity });
}

/** A stable shard for an id, so each process judges different moves. */
function shardOf(id: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % n;
}

/**
 * Puzzle rows: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,
 * Themes,... The first move is the mistake. With themes, only puzzles that
 * carry one of them.
 */
async function* puzzles(file: string, themes: string[]): AsyncGenerator<Candidate> {
  for await (const row of lines(file)) {
    const [id, fen, moves, rating, , , , tags] = row.split(',');
    if (!id || id === 'PuzzleId' || !fen || !moves) continue;
    if (themes.length && !tags?.split(' ').some((t) => themes.includes(t))) continue;
    const setup = parseFen(fen);
    if (setup.isErr) continue;
    const pos = Chess.fromSetup(setup.value);
    if (pos.isErr) continue;
    const ply = (setup.value.fullmoves - 1) * 2 + (setup.value.turn === 'black' ? 1 : 0);
    yield {
      id: `p:${id}`,
      source: 'puzzle',
      fen,
      uci: moves.split(' ')[0]!,
      ply,
      rating: Number(rating),
      phase: phaseOf(pos.value, ply),
    };
  }
}

/** A few random moves from each standard game that has both ratings. */
async function* games(file: string, rand: () => number, perGame = 2): AsyncGenerator<Candidate> {
  const found: Game<PgnNodeData>[] = [];
  const parser = new PgnParser((g) => void found.push(g));
  for await (const line of lines(file)) {
    parser.parse(line + '\n', { stream: true });
    while (found.length) yield* fromGame(found.shift()!, rand, perGame);
  }
  parser.parse('');
  for (const g of found) yield* fromGame(g, rand, perGame);
}

function* fromGame(
  g: Game<PgnNodeData>,
  rand: () => number,
  perGame: number,
): Generator<Candidate> {
  const h = g.headers;
  const white = Number(h.get('WhiteElo'));
  const black = Number(h.get('BlackElo'));
  const site = h.get('Site')?.split('/').pop();
  if (!site || !white || !black || (h.get('Variant') ?? 'Standard') !== 'Standard') return;
  const start = startingPosition(h);
  if (start.isErr) return;
  const pos = start.value;
  const sans = [...g.moves.mainline()].map((n) => n.san);
  if (sans.length < 16) return;
  const picks = new Set<number>();
  for (let i = 0; i < perGame; i++) picks.add(8 + Math.floor(rand() * (sans.length - 9)));
  for (let ply = 0; ply < sans.length; ply++) {
    const move = parseSan(pos, sans[ply]!);
    if (!move) return;
    if (picks.has(ply)) {
      yield {
        id: `g:${site}:${ply}`,
        source: 'game',
        fen: makeFen(pos.toSetup()),
        uci: makeUci(move),
        ply,
        rating: pos.turn === 'white' ? white : black,
        phase: phaseOf(pos as Chess, ply),
      };
    }
    pos.play(move);
  }
}

/** Takes candidates while their bucket has room; stops when every bucket is full. */
async function* spread(
  from: AsyncIterable<Candidate>,
  quota: number,
  done: Set<string>,
  rand: () => number,
  keep: number,
): AsyncGenerator<Candidate> {
  const per = Math.ceil(quota / (BANDS.length * PHASES.length));
  const taken = new Map<string, number>();
  let full = 0;
  for await (const c of from) {
    if (done.has(c.id)) continue;
    // Skip at random so the run reads further into the file than it keeps.
    if (rand() > keep) continue;
    const b = bucketOf(c);
    const n = taken.get(b) ?? 0;
    if (n >= per) continue;
    taken.set(b, n + 1);
    yield c;
    if (n + 1 === per && ++full === BANDS.length * PHASES.length) return;
  }
}

/** Starts one process per shard, then joins their files into `out`. */
async function parent(o: ReturnType<typeof args>) {
  const argv = process.argv.slice(2);
  const without = (a: string[], k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? [...a.slice(0, i), ...a.slice(i + 2)] : a;
  };
  const base = without(without(without(argv, '--procs'), '--out'), '--count');
  const per = Math.ceil(o.count / o.procs);
  const started = Date.now();
  const children: ReturnType<typeof spawn>[] = [];
  // Stopping the parent stops the shards too.
  for (const sig of ['SIGINT', 'SIGTERM'] as const)
    process.on(sig, () => {
      for (const c of children) c.kill();
      process.exit(1);
    });
  await Promise.all(
    Array.from({ length: o.procs }, (_, k) => {
      const child = spawn(
        process.execPath,
        [
          ...process.execArgv,
          process.argv[1]!,
          ...base,
          ...['--shard', `${k}/${o.procs}`, '--out', `${o.out}.${k}`, '--count', String(per)],
        ],
        { stdio: k === 0 ? 'inherit' : ['ignore', 'ignore', 'inherit'] },
      );
      children.push(child);
      return new Promise((done) => child.on('exit', done));
    }),
  );
  writeFileSync(o.out, '');
  let n = 0;
  for (let k = 0; k < o.procs; k++) {
    if (!existsSync(`${o.out}.${k}`)) continue;
    const text = readFileSync(`${o.out}.${k}`, 'utf8');
    appendFileSync(o.out, text);
    n += text.split('\n').filter(Boolean).length;
  }
  const min = (Date.now() - started) / 60_000;
  console.log(`Wrote ${n} records in ${min.toFixed(1)} min to ${o.out}.`);
}

/** Judges this process's shard of the candidates with one engine. */
async function child(o: ReturnType<typeof args>) {
  const [k, n] = o.shard;
  mkdirSync(dirname(o.out), { recursive: true });
  const done = new Set<string>();
  if (existsSync(o.out)) {
    for (const l of readFileSync(o.out, 'utf8').split('\n'))
      if (l) done.add((JSON.parse(l) as { id: string }).id);
  } else writeFileSync(o.out, '');
  const remaining = o.count - done.size;
  if (remaining <= 0) return;

  const rand = rng(o.seed + k);
  const mine = async function* (from: AsyncIterable<Candidate>) {
    for await (const c of from) if (shardOf(c.id, n) === k) yield c;
  };
  const gameQuota = o.pgn ? Math.round(remaining * (o.puzzles ? o.gameShare : 1)) : 0;
  const quota = { puzzle: remaining - gameQuota, game: gameQuota };
  // Puzzles are read sparsely so the sample spans the file. Game moves are
  // judged as inaccuracies or worse about one time in five.
  const sources = {
    puzzle: o.puzzles
      ? spread(mine(puzzles(o.puzzles, o.themes)), quota.puzzle, done, rand, 0.05)
      : null,
    game: o.pgn ? spread(mine(games(o.pgn, rand)), quota.game * 5, done, rand, 1) : null,
  };

  const pool = nodePool(1);
  const search = (r: Parameters<typeof pool.search>[0]) => pool.search(r);
  const written = { puzzle: 0, game: 0 };
  const started = Date.now();
  let judged = 0;
  for (;;) {
    // Take from the source furthest behind its quota.
    const open = (['puzzle', 'game'] as const).filter((s) => sources[s] && written[s] < quota[s]);
    const s = open.sort((a, b) => written[a] / quota[a] - written[b] / quota[b])[0];
    if (!s) break;
    const next = await sources[s]!.next();
    if (next.done) {
      sources[s] = null;
      continue;
    }
    const c = next.value;
    const pos = Chess.fromSetup(parseFen(c.fen).unwrap()).unwrap();
    const record = await recordFor(search, pos, c.uci, c.ply).catch((e: unknown) => {
      console.error(`${c.id}: ${String(e)}`);
      return undefined;
    });
    judged++;
    if (!record) continue;
    written[s]++;
    const { id, source, rating, phase } = c;
    await appendFile(o.out, JSON.stringify({ id, source, rating, phase, record }) + '\n');
    const total = written.puzzle + written.game;
    if (k === 0 && total % 25 === 0) {
      const sec = (Date.now() - started) / 1000;
      console.log(
        `Process 1 of ${n}: ${total}/${remaining} records, ${judged} moves judged, ` +
          `${(total / sec).toFixed(2)} records/s, about ${((total * n) / sec).toFixed(1)}/s in all`,
      );
    }
  }
  pool.terminate();
  for (const d of decompressors) d.kill();
}

const opts = args();
if (!opts.puzzles && !opts.pgn) throw new Error('Give --puzzles FILE, --pgn FILE or both.');
if (process.argv.includes('--shard') || opts.procs === 1) await child(opts);
else await parent(opts);
