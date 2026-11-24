import type { Score } from '../engine/eval';
import { resultFromWinner, sanToUci, sideOf, sleep } from './normalize';
import { ImportError, type Game, type ImportOptions, type Side, type Speed } from './types';

const API = 'https://lichess.org/api/games/user/';
/** Lichess asks clients to wait a full minute after a 429. */
const RATE_LIMIT_WAIT_MS = 60_000;
const MAX_RETRIES = 2;
const SPEEDS: Speed[] = ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical'];

/** The fields of a Lichess NDJSON game that the app reads. */
export interface LichessGameJson {
  id: string;
  rated?: boolean;
  variant?: string;
  speed?: string;
  status?: string;
  createdAt?: number;
  winner?: Side;
  moves?: string;
  clocks?: number[];
  clock?: { initial: number; increment: number };
  initialFen?: string;
  opening?: { eco?: string; name?: string };
  players: Record<
    Side,
    { user?: { name?: string; id?: string }; rating?: number; aiLevel?: number }
  >;
  analysis?: Array<{ eval?: number; mate?: number }>;
}

export function lichessUrl(username: string, max: number, since?: number): string {
  const params = new URLSearchParams({
    max: String(max),
    rated: 'true',
    perfType: SPEEDS.join(','),
    clocks: 'true',
    evals: 'true',
    opening: 'true',
    finished: 'true',
  });
  if (since !== undefined) params.set('since', String(since + 1));
  return `${API}${encodeURIComponent(username)}?${params}`;
}

/** Converts one Lichess game. Returns undefined for games the app skips. */
export function normalizeLichess(json: LichessGameJson, username: string): Game | undefined {
  if (json.variant && json.variant !== 'standard') return undefined;
  if (json.initialFen) return undefined;
  if (json.rated === false) return undefined;
  const speed = json.speed as Speed | undefined;
  if (!speed || !SPEEDS.includes(speed)) return undefined;

  const whiteName = json.players.white.user?.name;
  const blackName = json.players.black.user?.name;
  if (!whiteName || !blackName) return undefined;
  const userColor = sideOf(username, whiteName, blackName);
  if (!userColor) return undefined;

  const san = (json.moves ?? '').split(' ').filter(Boolean);
  if (san.length === 0) return undefined;
  const uci = sanToUci(san);
  if (!uci) return undefined;

  const game: Game = {
    id: `lichess:${json.id}`,
    source: 'lichess',
    sourceId: json.id,
    url: `https://lichess.org/${json.id}`,
    owner: username.toLowerCase(),
    userColor,
    white: { name: whiteName, ...rating(json.players.white.rating) },
    black: { name: blackName, ...rating(json.players.black.rating) },
    speed,
    result: resultFromWinner(json.winner),
    playedAt: json.createdAt ?? 0,
    san,
    uci,
  };
  if (json.clock)
    game.timeControl = { initial: json.clock.initial, increment: json.clock.increment };
  if (json.opening) game.opening = { ...json.opening };
  if (json.clocks?.length) game.clocks = json.clocks.slice(0, san.length);
  if (json.analysis?.length) game.importedEvals = san.map((_, i) => toScore(json.analysis?.[i]));
  return game;
}

function rating(r: number | undefined): { rating?: number } {
  return r === undefined ? {} : { rating: r };
}

function toScore(a: { eval?: number; mate?: number } | undefined): Score | null {
  if (!a) return null;
  if (a.mate !== undefined) return { kind: 'mate', value: a.mate };
  if (a.eval !== undefined) return { kind: 'cp', value: a.eval };
  return null;
}

/** Splits a byte stream into lines and yields each parsed JSON object. */
export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) yield JSON.parse(line);
      }
      if (done) break;
    }
    if (buffer.trim()) yield JSON.parse(buffer);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streams a user's recent rated standard games from Lichess, newest first.
 * Makes one request at a time and waits a minute after HTTP 429.
 */
export async function importLichess(
  username: string,
  opts: ImportOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const url = lichessUrl(username, opts.max, opts.since);
  let res: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetchImpl(url, {
        headers: { Accept: 'application/x-ndjson' },
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      throw new ImportError('Could not reach Lichess. Check your connection.', 'network');
    }
    if (res.status !== 429 || attempt >= MAX_RETRIES) break;
    opts.onWait?.(RATE_LIMIT_WAIT_MS);
    await sleep(RATE_LIMIT_WAIT_MS, opts.signal);
  }
  if (res.status === 404)
    throw new ImportError(`Lichess has no user named ${username}.`, 'notFound');
  if (res.status === 429)
    throw new ImportError(
      'Lichess is limiting requests. Try again in a few minutes.',
      'rateLimited',
    );
  if (!res.ok || !res.body)
    throw new ImportError(`Lichess answered with HTTP ${res.status}.`, 'badResponse');

  let count = 0;
  for await (const json of readNdjson(res.body)) {
    const game = normalizeLichess(json as LichessGameJson, username);
    if (!game) continue;
    await opts.onGame(game);
    count++;
  }
  return count;
}
