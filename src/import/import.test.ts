import { describe, expect, it, vi } from 'vitest';
import {
  importLichess,
  lichessGameId,
  lichessGameTime,
  lichessUrl,
  normalizeLichess,
  readNdjson,
  type LichessGameJson,
} from './lichess';
import {
  importChessCom,
  monthEnd,
  monthStart,
  normalizeChessCom,
  parseTimeControl,
} from './chesscom';
import { parseClock, sanToUci } from './normalize';
import type { Game } from './types';

const liGame = (over: Partial<LichessGameJson> = {}): LichessGameJson => ({
  id: 'abcd1234',
  rated: true,
  variant: 'standard',
  speed: 'blitz',
  status: 'mate',
  createdAt: 1_700_000_000_000,
  winner: 'white',
  moves: 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#',
  clocks: [30003, 30003, 29800, 29500, 29000, 28000, 28500],
  clock: { initial: 300, increment: 3 },
  opening: { eco: 'C23', name: "Bishop's Opening" },
  players: {
    white: { user: { name: 'TestPlayer', id: 'testplayer' }, rating: 1500 },
    black: { user: { name: 'Opponent', id: 'opponent' }, rating: 1480 },
  },
  ...over,
});

function streamOf(text: string, chunk = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close();
      c.enqueue(bytes.slice(i, i + chunk));
      i += chunk;
    },
  });
}

describe('normalize helpers', () => {
  it('converts SAN to UCI, including castling and promotion', () => {
    expect(sanToUci(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O'])).toEqual([
      'e2e4',
      'e7e5',
      'g1f3',
      'b8c6',
      'f1c4',
      'f8c5',
      'e1g1',
    ]);
    expect(sanToUci(['e4', 'e4'])).toBeUndefined();
  });

  it('parses PGN clock comments to centiseconds', () => {
    expect(parseClock('[%clk 0:02:33.3]')).toBe(15330);
    expect(parseClock('[%clk 1:00:00]')).toBe(360000);
    expect(parseClock('no clock')).toBeUndefined();
  });
});

describe('Lichess', () => {
  it('normalizes a rated standard game', () => {
    const g = normalizeLichess(liGame({ analysis: [{ eval: 20 }, { mate: 3 }] }), 'testplayer');
    expect(g).toMatchObject({
      id: 'lichess:abcd1234',
      userColor: 'white',
      result: '1-0',
      speed: 'blitz',
      timeControl: { initial: 300, increment: 3 },
      uci: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'],
    });
    expect(g?.importedEvals?.slice(0, 3)).toEqual([
      { kind: 'cp', value: 20 },
      { kind: 'mate', value: 3 },
      null,
    ]);
  });

  it('skips variants, casual games, from-position games and other players', () => {
    expect(normalizeLichess(liGame({ variant: 'chess960' }), 'testplayer')).toBeUndefined();
    expect(normalizeLichess(liGame({ rated: false }), 'testplayer')).toBeUndefined();
    expect(
      normalizeLichess(liGame({ initialFen: '8/8/8/8/8/8/8/8 w - - 0 1' }), 'testplayer'),
    ).toBeUndefined();
    expect(normalizeLichess(liGame(), 'someoneelse')).toBeUndefined();
  });

  it('reads NDJSON split across arbitrary chunks', async () => {
    const out: unknown[] = [];
    for await (const o of readNdjson(streamOf('{"a":1}\n{"a":2}\n\n{"a":3}'))) out.push(o);
    expect(out).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it('streams games and reports 404 as an unknown user', async () => {
    const body = [liGame(), liGame({ id: 'zzzz9999', variant: 'atomic' })]
      .map((g) => JSON.stringify(g))
      .join('\n');
    const fetchOk = vi.fn(async () => new Response(streamOf(body), { status: 200 }));
    const games: Game[] = [];
    const n = await importLichess(
      'TestPlayer',
      { max: 10, onGame: (g) => void games.push(g) },
      fetchOk,
    );
    expect(n).toBe(1);
    expect(games[0]?.id).toBe('lichess:abcd1234');
    const url = String((fetchOk.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('/api/games/user/TestPlayer?');
    expect(url).toContain('clocks=true');

    const fetch404 = async () => new Response('{}', { status: 404 });
    await expect(
      importLichess('ghost', { max: 1, onGame: () => {} }, fetch404),
    ).rejects.toMatchObject({
      kind: 'notFound',
    });
  });
});

const ccPgn = `[Event "Live Chess"]
[Site "Chess.com"]
[White "TestPlayer"]
[Black "Opponent"]
[Result "0-1"]
[ECO "C20"]
[UTCDate "2026.10.05"]
[UTCTime "18:00:00"]
[TimeControl "180+2"]

1. e4 {[%clk 0:03:01]} 1... e5 {[%clk 0:03:01]} 2. Qh5 {[%clk 0:02:59.5]} 2... Nc6 {[%clk 0:02:58]} 3. Bc4 {[%clk 0:02:57]} 3... g6 {[%clk 0:02:55]} 4. Qf3 {[%clk 0:02:50]} 4... Nf6 {[%clk 0:02:50]} 5. g4 {[%clk 0:02:40]} 5... Nd4 {[%clk 0:02:45]} 6. Qd3 {[%clk 0:02:30]} 6... d5 {[%clk 0:02:40]} 0-1`;

const ccGame = {
  url: 'https://www.chess.com/game/live/123456',
  pgn: ccPgn,
  time_control: '180+2',
  time_class: 'blitz',
  rules: 'chess',
  rated: true,
  end_time: 1_791_000_000,
  eco: 'https://www.chess.com/openings/Kings-Pawn-Opening-Wayward-Queen-Attack',
  white: { username: 'TestPlayer', rating: 1200, result: 'resigned' },
  black: { username: 'Opponent', rating: 1210, result: 'win' },
};

describe('Chess.com', () => {
  it('normalizes a rated standard game with clocks', () => {
    const g = normalizeChessCom(ccGame, 'testplayer');
    expect(g).toMatchObject({
      id: 'chesscom:123456',
      userColor: 'white',
      result: '0-1',
      speed: 'blitz',
      timeControl: { initial: 180, increment: 2 },
      opening: { eco: 'C20', name: 'Kings Pawn Opening Wayward Queen Attack' },
      playedAt: Date.UTC(2026, 9, 5, 18),
    });
    expect(g?.san).toHaveLength(12);
    expect(g?.clocks?.[2]).toBe(17950);
  });

  it('skips variants and unrated games', () => {
    expect(normalizeChessCom({ ...ccGame, rules: 'chess960' }, 'testplayer')).toBeUndefined();
    expect(normalizeChessCom({ ...ccGame, rated: false }, 'testplayer')).toBeUndefined();
  });

  it('parses time controls', () => {
    expect(parseTimeControl('600')).toEqual({ initial: 600, increment: 0 });
    expect(parseTimeControl('1/86400')).toBeUndefined();
    expect(monthEnd('https://api.chess.com/pub/player/x/games/2026/12')).toBe(Date.UTC(2027, 0, 1));
  });

  it('fetches months newest first and stops at max', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/archives'))
        return Response.json({
          archives: [
            'https://api.chess.com/pub/player/testplayer/games/2026/09',
            'https://api.chess.com/pub/player/testplayer/games/2026/10',
          ],
        });
      return Response.json({
        games: [ccGame, { ...ccGame, url: 'https://www.chess.com/game/live/2' }],
      });
    });
    const games: Game[] = [];
    const n = await importChessCom(
      'TestPlayer',
      { max: 2, onGame: (g) => void games.push(g) },
      fetchImpl as typeof fetch,
    );
    expect(n).toBe(2);
    expect(urls[1]).toMatch(/2026\/10$/);
    expect(urls).toHaveLength(2);
  });
});

describe('import ranges', () => {
  it('asks Lichess for games inside the range', () => {
    const url = new URL(lichessUrl('TestPlayer', 1000, 1_000, 5_000));
    expect(url.searchParams.get('since')).toBe('1001');
    expect(url.searchParams.get('until')).toBe('4999');
  });

  it('reads a Lichess game id from its link', () => {
    expect(lichessGameId('https://lichess.org/abcd1234')).toBe('abcd1234');
    expect(lichessGameId('https://lichess.org/abcd1234/black')).toBe('abcd1234');
    expect(lichessGameId('lichess.org/abcd1234wxyz')).toBe('abcd1234');
    expect(lichessGameId('abcd1234')).toBe('abcd1234');
    expect(lichessGameId('https://example.com/x')).toBeUndefined();
  });

  it('looks up when a Lichess game was played', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/game/export/abcd1234');
      return Response.json({ createdAt: 1_700_000_000_000 });
    });
    expect(await lichessGameTime('https://lichess.org/abcd1234', fetchImpl as typeof fetch)).toBe(
      1_700_000_000_000,
    );
  });

  it('skips Chess.com months after the range without asking for them', async () => {
    expect(monthStart('https://api.chess.com/pub/player/x/games/2026/10')).toBe(
      Date.UTC(2026, 9, 1),
    );
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/archives'))
        return Response.json({
          archives: [
            'https://api.chess.com/pub/player/testplayer/games/2026/09',
            'https://api.chess.com/pub/player/testplayer/games/2026/10',
          ],
        });
      return Response.json({ games: [ccGame] });
    });
    await importChessCom(
      'TestPlayer',
      { max: 10, until: Date.UTC(2026, 9, 1), onGame: () => undefined },
      fetchImpl as typeof fetch,
    );
    expect(urls.some((u) => u.endsWith('2026/10'))).toBe(false);
    expect(urls.some((u) => u.endsWith('2026/09'))).toBe(true);
  });
});
