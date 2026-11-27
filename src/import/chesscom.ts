import { parsePgn } from 'chessops/pgn';
import { parseClock, sanToUci, sideOf, sleep } from './normalize';
import { ImportError, type Game, type ImportOptions, type Result, type Speed } from './types';

const API = 'https://api.chess.com/pub/player/';
const STANDARD_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** Pause between monthly archive requests. Chess.com allows serial access. */
const MONTH_DELAY_MS = 300;
const RATE_LIMIT_WAIT_MS = 60_000;
const SPEEDS: Record<string, Speed> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  daily: 'daily',
};

interface ChessComPlayer {
  username: string;
  rating?: number;
  result?: string;
}

/** The fields of a Chess.com archive game that the app reads. */
export interface ChessComGameJson {
  url: string;
  pgn?: string;
  time_control?: string;
  time_class?: string;
  rules?: string;
  rated?: boolean;
  initial_setup?: string;
  end_time?: number;
  eco?: string;
  white: ChessComPlayer;
  black: ChessComPlayer;
}

export function parseTimeControl(tc: string | undefined): Game['timeControl'] {
  if (!tc || tc.includes('/')) return undefined;
  const [base, inc] = tc.split('+');
  const initial = Number(base);
  if (!Number.isFinite(initial)) return undefined;
  return { initial, increment: Number(inc ?? 0) || 0 };
}

/** Converts one Chess.com game. Returns undefined for games the app skips. */
export function normalizeChessCom(json: ChessComGameJson, username: string): Game | undefined {
  if (json.rules !== 'chess' || json.rated === false) return undefined;
  if (json.initial_setup && json.initial_setup !== STANDARD_START) return undefined;
  const speed = SPEEDS[json.time_class ?? ''];
  if (!speed || !json.pgn) return undefined;
  const userColor = sideOf(username, json.white.username, json.black.username);
  if (!userColor) return undefined;

  const parsed = parsePgn(json.pgn)[0];
  if (!parsed) return undefined;
  const headers = parsed.headers;
  if (headers.get('SetUp') === '1' || headers.has('FEN')) return undefined;

  const san: string[] = [];
  const clocks: (number | undefined)[] = [];
  for (const node of parsed.moves.mainline()) {
    san.push(node.san);
    clocks.push(parseClock((node.comments ?? []).join(' ')));
  }
  if (san.length === 0) return undefined;
  const uci = sanToUci(san);
  if (!uci) return undefined;

  const result = headers.get('Result');
  if (result !== '1-0' && result !== '0-1' && result !== '1/2-1/2') return undefined;

  const sourceId = json.url.split('/').pop() ?? json.url;
  const game: Game = {
    id: `chesscom:${sourceId}`,
    source: 'chesscom',
    sourceId,
    url: json.url,
    owner: username.toLowerCase(),
    userColor,
    white: { name: json.white.username, ...rating(json.white.rating) },
    black: { name: json.black.username, ...rating(json.black.rating) },
    speed,
    result: result as Result,
    playedAt: startTime(headers, json.end_time),
    san,
    uci,
  };
  const tc = parseTimeControl(json.time_control);
  if (tc) game.timeControl = tc;
  const eco = headers.get('ECO');
  const openingName = json.eco ? openingFromUrl(json.eco) : undefined;
  if (eco || openingName)
    game.opening = { ...(eco ? { eco } : {}), ...(openingName ? { name: openingName } : {}) };
  if (clocks.every((c) => c !== undefined)) game.clocks = clocks as number[];
  return game;
}

function rating(r: number | undefined): { rating?: number } {
  return r === undefined ? {} : { rating: r };
}

/** Chess.com gives the opening as a URL slug, for example `.../Pirc-Defense`. */
function openingFromUrl(url: string): string | undefined {
  const slug = url.split('/').pop();
  return slug ? decodeURIComponent(slug).replace(/-/g, ' ') : undefined;
}

function startTime(headers: Map<string, string>, endTime: number | undefined): number {
  const date = headers.get('UTCDate');
  const time = headers.get('UTCTime');
  if (date && time) {
    const t = Date.parse(`${date.replace(/\./g, '-')}T${time}Z`);
    if (Number.isFinite(t)) return t;
  }
  return (endTime ?? 0) * 1000;
}

async function getJson(
  url: string,
  opts: ImportOptions,
  fetchImpl: typeof fetch,
): Promise<{ status: number; body?: unknown }> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, opts.signal ? { signal: opts.signal } : {});
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      throw new ImportError('Could not reach Chess.com. Check your connection.', 'network');
    }
    if (res.status === 429 && attempt < 2) {
      opts.onWait?.(RATE_LIMIT_WAIT_MS);
      await sleep(RATE_LIMIT_WAIT_MS, opts.signal);
      continue;
    }
    if (!res.ok) return { status: res.status };
    return { status: res.status, body: await res.json() };
  }
}

/**
 * Fetches a user's recent rated standard games from Chess.com, newest first.
 * Reads the archive list, then one month at a time with a short pause.
 */
export async function importChessCom(
  username: string,
  opts: ImportOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const user = encodeURIComponent(username.toLowerCase());
  const list = await getJson(`${API}${user}/games/archives`, opts, fetchImpl);
  if (list.status === 404)
    throw new ImportError(`Chess.com has no user named ${username}.`, 'notFound');
  if (list.status === 429)
    throw new ImportError(
      'Chess.com is limiting requests. Try again in a few minutes.',
      'rateLimited',
    );
  if (!list.body)
    throw new ImportError(`Chess.com answered with HTTP ${list.status}.`, 'badResponse');

  const archives = ((list.body as { archives?: string[] }).archives ?? []).slice().reverse();
  let count = 0;
  for (const [i, monthUrl] of archives.entries()) {
    if (opts.since !== undefined && monthEnd(monthUrl) <= opts.since) break;
    // Months that start after the range are skipped without a request.
    if (opts.until !== undefined && monthStart(monthUrl) >= opts.until) continue;
    if (i > 0) await sleep(MONTH_DELAY_MS, opts.signal);
    const month = await getJson(monthUrl, opts, fetchImpl);
    if (!month.body) continue;
    const games = ((month.body as { games?: ChessComGameJson[] }).games ?? []).slice();
    games.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
    for (const json of games) {
      const game = normalizeChessCom(json, username);
      if (!game) continue;
      if (opts.since !== undefined && game.playedAt <= opts.since) return count;
      if (opts.until !== undefined && game.playedAt >= opts.until) continue;
      await opts.onGame(game);
      if (++count >= opts.max) return count;
    }
  }
  return count;
}

/** First millisecond of the month named by an archive URL ending in /YYYY/MM. */
export function monthStart(url: string): number {
  const m = /\/(\d{4})\/(\d{2})$/.exec(url);
  if (!m) return Number.NEGATIVE_INFINITY;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, 1);
}

/** First millisecond after the month named by an archive URL ending in /YYYY/MM. */
export function monthEnd(url: string): number {
  const m = /\/(\d{4})\/(\d{2})$/.exec(url);
  if (!m) return Number.POSITIVE_INFINITY;
  return Date.UTC(Number(m[1]), Number(m[2]), 1);
}
