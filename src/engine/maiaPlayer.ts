// Maia as an opponent: picks a move the way a player of a rating might, from
// Maia's predicted moves. Maia-2, when the player downloaded it, plays at
// every rating, including below 1100; otherwise Maia 1100 to 1900 from
// public/maia/ plays, loosened below 1100. Loaded only when a game is played
// against Maia.
import type { Chess } from 'chessops/chess';
import { fromFen, playUci } from '../detectors/board';
import { MAIA_RATINGS, parseNet, predict, type MaiaNet, type MaiaTables } from './maia';
import { parseMaia2, predict2, type Maia2Net } from './maia2';
import { maia2Files } from './maia2Download';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const dir = () => `${import.meta.env.BASE_URL}maia/`;

const nets = new Map<number, Promise<MaiaNet>>();
let tables: Promise<MaiaTables> | undefined;
let net2: Promise<Maia2Net | undefined> | undefined;

/** The nearest rating Maia has a network for. */
export function maiaRating(rating: number): number {
  return MAIA_RATINGS.reduce((a, b) => (Math.abs(b - rating) < Math.abs(a - rating) ? b : a));
}

async function fetchOk(url: string): Promise<Response> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not load ${url}.`);
  return r;
}

function load(rating: number): Promise<[MaiaNet, MaiaTables]> {
  let net = nets.get(rating);
  if (!net) {
    net = fetchOk(`${dir()}maia-${rating}.bin`)
      .then((r) => r.arrayBuffer())
      .then(parseNet);
    net.catch(() => nets.delete(rating));
    nets.set(rating, net);
  }
  tables ??= fetchOk(`${dir()}tables.json`).then((r) => r.json() as Promise<MaiaTables>);
  tables.catch(() => (tables = undefined));
  return Promise.all([net, tables]);
}

/** Maia-2, when it is downloaded; checked again until it is. */
async function loadMaia2(): Promise<Maia2Net | undefined> {
  net2 ??= maia2Files().then((f) => (f ? parseMaia2(f.model, f.moves) : undefined));
  const n = await net2.catch(() => undefined);
  if (!n) net2 = undefined;
  return n;
}

/** The lowest rating offered. Maia's networks start at 1100. */
export const MAIA_FLOOR = 400;

/**
 * How much flatter than Maia 1100 a rating below 1100 plays: 1 at 1100,
 * about 2.2 at 400. This is a guess, not fitted to games at those ratings:
 * Maia has no network below 1100.
 */
export function looseness(rating: number): number {
  return rating >= 1100 ? 1 : 1 + (1100 - rating) / 600;
}

/**
 * Maia-2 knows players under 1100 as one group; within it, a lower rating
 * plays a little less carefully: 1 at 1000, about 1.6 at 400. A guess too.
 */
export function looseness2(rating: number): number {
  return rating >= 1000 ? 1 : 1 + (1000 - rating) / 1000;
}

function line(startFen: string, moves: string[]): Chess[] | undefined {
  const history: Chess[] = [fromFen(startFen)];
  for (const m of moves) {
    const next = playUci(history[history.length - 1]!, m);
    if (!next) return undefined;
    history.push(next);
  }
  return history;
}

/** Maia's chances for each legal move, best first, from Maia-2 if downloaded. */
async function ranked(
  rating: number,
  opponent: number,
  startFen: string,
  moves: string[],
): Promise<{ moves: { uci: string; p: number }[]; loose: number } | undefined> {
  const history = line(startFen, moves);
  if (!history) return undefined;
  const two = await loadMaia2();
  if (two)
    return {
      moves: predict2(two, history[history.length - 1]!, rating, opponent),
      loose: looseness2(rating),
    };
  const [net, t] = await load(maiaRating(rating));
  return {
    moves: predict(net, t, history, startFen === START).moves,
    loose: looseness(rating),
  };
}

/**
 * Maia's move after `moves` from `startFen`, for a player of `rating` facing
 * one of `opponent`. At full care it plays one of the moves it gives at least
 * a tenth of its top move's chance, at random by those chances, so it varies
 * as people do instead of repeating one game. Looser, below 1100, every legal
 * move is in play with its chance flattened, so weaker ratings stray more.
 */
export async function maiaMove(
  rating: number,
  startFen: string,
  moves: string[],
  opponent: number = rating,
  random: () => number = Math.random,
): Promise<string | undefined> {
  const r = await ranked(rating, opponent, startFen, moves);
  const top = r?.moves[0];
  if (!r || !top) return undefined;
  const pool =
    r.loose > 1
      ? r.moves.map((m) => ({ uci: m.uci, p: m.p ** (1 / r.loose) }))
      : r.moves.filter((m) => m.p >= top.p / 10);
  const total = pool.reduce((a, m) => a + m.p, 0);
  let x = random() * total;
  for (const m of pool) if ((x -= m.p) <= 0) return m.uci;
  return top.uci;
}

/**
 * How often a player of `rating` plays `uci` after `moves` from `startFen`,
 * by Maia's prediction. It rejects when the network cannot load.
 */
export async function maiaChance(
  rating: number,
  startFen: string,
  moves: string[],
  uci: string,
): Promise<number | undefined> {
  // Below 1100 only Maia-2 has learned how often people find a move.
  if (rating < 1100 && !(await loadMaia2())) return undefined;
  const r = await ranked(rating, rating, startFen, moves);
  return r ? (r.moves.find((m) => m.uci === uci)?.p ?? 0) : undefined;
}

/** Whether Maia-2 is downloaded and plays, so ratings under 1100 are learned. */
export async function hasMaia2(): Promise<boolean> {
  return !!(await loadMaia2());
}
