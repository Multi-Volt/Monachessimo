// Maia as an opponent: loads the network for a rating from public/maia/ and
// picks a move the way a player of that rating might, from its predicted
// moves. Loaded only when a game is played against Maia.
import type { Chess } from 'chessops/chess';
import { fromFen, playUci } from '../detectors/board';
import { MAIA_RATINGS, parseNet, predict, type MaiaNet, type MaiaTables } from './maia';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const dir = () => `${import.meta.env.BASE_URL}maia/`;

const nets = new Map<number, Promise<MaiaNet>>();
let tables: Promise<MaiaTables> | undefined;

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
 * Maia's move after `moves` from `startFen`. From 1100 up it plays one of
 * the moves it gives at least a tenth of its top move's chance, at random by
 * those chances, so it varies as people do instead of repeating one game.
 * Below 1100 it uses the 1100 network with every legal move in play and the
 * chances flattened by `looseness`, so weaker ratings stray more often.
 */
export async function maiaMove(
  rating: number,
  startFen: string,
  moves: string[],
  random: () => number = Math.random,
): Promise<string | undefined> {
  const [net, t] = await load(maiaRating(rating));
  const history: Chess[] = [fromFen(startFen)];
  for (const m of moves) {
    const next = playUci(history[history.length - 1]!, m);
    if (!next) return undefined;
    history.push(next);
  }
  const { moves: ranked } = predict(net, t, history, startFen === START);
  const top = ranked[0];
  if (!top) return undefined;
  const loose = looseness(rating);
  const pool =
    loose > 1
      ? ranked.map((m) => ({ uci: m.uci, p: m.p ** (1 / loose) }))
      : ranked.filter((m) => m.p >= top.p / 10);
  const total = pool.reduce((a, m) => a + m.p, 0);
  let r = random() * total;
  for (const m of pool) if ((r -= m.p) <= 0) return m.uci;
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
  const [net, t] = await load(rating);
  const history: Chess[] = [fromFen(startFen)];
  for (const m of moves) {
    const next = playUci(history[history.length - 1]!, m);
    if (!next) return undefined;
    history.push(next);
  }
  const { moves: ranked } = predict(net, t, history, startFen === START);
  return ranked.find((m) => m.uci === uci)?.p ?? 0;
}
