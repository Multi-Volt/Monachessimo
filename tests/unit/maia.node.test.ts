import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromFen, playUci } from '../../src/detectors/board';
import { parseNet, predict, type MaiaTables } from '../../src/engine/maia';

const load = (r: number) => {
  const b = readFileSync(`public/maia/maia-${r}.bin`);
  return parseNet(new Uint8Array(b).buffer);
};
const tables = JSON.parse(readFileSync('public/maia/tables.json', 'utf8')) as MaiaTables;
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function line(moves: string[], fen = START) {
  const out = [fromFen(fen)];
  for (const m of moves) out.push(playUci(out[out.length - 1]!, m)!);
  return out;
}

describe('Maia', () => {
  const net = load(1100);

  it('puts nearly all of its policy on legal moves, for either side', () => {
    for (const moves of [
      [],
      ['e2e4'],
      ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'],
      ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7'],
    ]) {
      const { moves: top, legalShare } = predict(net, tables, line(moves), true);
      console.log(
        moves.join(' ') || 'start',
        '->',
        top
          .slice(0, 3)
          .map((m) => `${m.uci} ${(100 * m.p).toFixed(0)}%`)
          .join(', '),
        `legal ${(100 * legalShare).toFixed(1)}%`,
      );
      expect(legalShare).toBeGreaterThan(0.95);
    }
  });

  it('opens and answers like a club player', () => {
    const first = predict(net, tables, line([]), true)
      .moves.slice(0, 4)
      .map((m) => m.uci);
    expect(first).toContain('e2e4');
    const reply = predict(net, tables, line(['e2e4']), true).moves[0]!.uci;
    expect(['e7e5', 'c7c5', 'e7e6', 'c7c6', 'd7d5']).toContain(reply);
  });

  it('takes a queen that is given away', () => {
    // 1.e4 e5 2.Qh5 Nc6 3.Qxf7+?? Kxf7.
    const top = predict(net, tables, line(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7']), true);
    expect(top.moves[0]!.uci).toBe('e8f7');
  });

  it('castles in UCI form', () => {
    const h = line(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']);
    const moves = predict(load(1900), tables, h, true).moves.map((m) => m.uci);
    expect(moves).toContain('e1g1');
    expect(moves).not.toContain('e1h1');
  });

  it('reads a position that did not start from the opening', () => {
    // White to move wins the queen with Rd8+ after the bishop check.
    const { legalShare } = predict(
      net,
      tables,
      line([], '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'),
      false,
    );
    expect(legalShare).toBeGreaterThan(0.9);
  });
});

describe('Maia below 1100', () => {
  it('plays its 1100 moves less carefully the lower the rating', async () => {
    const { looseness } = await import('../../src/engine/maiaPlayer');
    expect(looseness(1100)).toBe(1);
    expect(looseness(1500)).toBe(1);
    expect(looseness(800)).toBeCloseTo(1.5, 5);
    expect(looseness(400)).toBeCloseTo(2.17, 2);
  });
});

describe('Maia 400 in practice', () => {
  it('still takes a bishop left hanging more often than any other move', async () => {
    const { looseness } = await import('../../src/engine/maiaPlayer');
    const share = (moves: { uci: string; p: number }[], rating: number) => {
      const w = moves.map((m) => ({ uci: m.uci, w: m.p ** (1 / looseness(rating)) }));
      const total = w.reduce((a, m) => a + m.w, 0);
      return w.map((m) => ({ uci: m.uci, p: m.w / total })).sort((a, b) => b.p - a.p);
    };
    // 1.d4 e5 2.Bg5: the queen on d8 takes the bishop for free.
    const { moves } = predict(load(1100), tables, line(['d2d4', 'e7e5', 'c1g5']), true);
    const at400 = share(moves, 400);
    const at1100 = share(moves, 1100);
    const take = (s: { uci: string; p: number }[]) => s.find((m) => m.uci === 'd8g5')!.p;
    console.log(
      `takes the bishop: 1100 ${(100 * take(at1100)).toFixed(0)}%, 400 ${(100 * take(at400)).toFixed(0)}%`,
    );
    expect(at400[0]!.uci).toBe('d8g5');
    expect(take(at400)).toBeLessThan(take(at1100));
  });
});
