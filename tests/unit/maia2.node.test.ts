import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromFen } from '../../src/detectors/board';
import { parseMaia2, predict2 } from '../../src/engine/maia2';

// The model is a download, not in the repository: point MAIA2_DIR at a
// folder with maia2-rapid.bin and moves.json to run this.
const dir = process.env.MAIA2_DIR ?? 'public/models/maia2';
const have = existsSync(`${dir}/maia2-rapid.bin`);

interface Case {
  fen: string;
  self: number;
  oppo: number;
  top: [string, number][];
}

describe.skipIf(!have)('Maia-2', () => {
  it("ranks moves as Maia-2's own PyTorch code does", () => {
    const moves = JSON.parse(readFileSync(`${dir}/moves.json`, 'utf8')) as string[];
    const bin = readFileSync(`${dir}/maia2-rapid.bin`);
    const net = parseMaia2(new Uint8Array(bin).buffer, moves);
    const cases = JSON.parse(readFileSync('tests/fixtures/maia2-reference.json', 'utf8')) as Case[];
    for (const c of cases) {
      const started = Date.now();
      const got = predict2(net, fromFen(c.fen), c.self, c.oppo);
      console.log(
        c.fen.slice(0, 20),
        c.self,
        got.slice(0, 3).map((m) => `${m.uci} ${m.logit.toFixed(2)}`),
        c.top.slice(0, 3).map(([m, l]) => `${m} ${l.toFixed(2)}`),
        `${Date.now() - started} ms`,
      );
      expect(got[0]!.uci).toBe(c.top[0]![0]);
      // 8-bit weights shift the scores a little; what matters is how far each
      // move trails the first, which sets its chance.
      const lead = got[0]!.logit;
      const refLead = c.top[0]![1];
      for (const [m, l] of c.top.slice(1, 3)) {
        const mine = got.find((g) => g.uci === m)!;
        expect(Math.abs(mine.logit - lead - (l - refLead))).toBeLessThan(0.4);
      }
    }
  });
});
