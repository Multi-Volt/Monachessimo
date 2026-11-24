import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { classify } from '../../src/analysis/mistakes';
import { negate, winningChances } from '../../src/engine/eval';
import type { Line } from '../../src/engine/uci';
import { fromFen, playUci } from '../../src/detectors/board';
import { tagMove, TAGS, type MoveContext, type TagName } from '../../src/detectors';
import { makeFen } from 'chessops/fen';
import { FIXTURES, type DetectorFixture } from '../fixtures/detector-positions';
import type { EnginePool } from '../../src/engine/pool';

const LINES_FILE = new URL('../fixtures/detector-lines.json', import.meta.url);
const UPDATE =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
    .UPDATE_FIXTURES === '1';
const DEPTH = 16;

interface SavedLines {
  lines: Line[];
  playedLine: Line | null;
}

type LineFile = Record<string, SavedLines>;
const key = (f: DetectorFixture) => `${f.fen}|${f.played}`;

let pool: EnginePool | undefined;
afterAll(() => pool?.terminate());

async function engineLines(f: DetectorFixture): Promise<SavedLines> {
  if (!pool) pool = (await import('../support/node-engine')).nodePool(2);
  const r = await pool.search({ fen: f.fen, depth: DEPTH, multipv: 3 });
  const after = playUci(fromFen(f.fen), f.played);
  if (!after) throw new Error(`Illegal move ${f.played} in ${f.name}`);
  let playedLine: Line | null = null;
  if (!after.isEnd()) {
    const p = await pool.search({ fen: makeFen(after.toSetup()), depth: DEPTH });
    playedLine = p.lines[0] ?? null;
  }
  return { lines: r.lines, playedLine };
}

export function buildContext(f: DetectorFixture, saved: SavedLines): MoveContext {
  const before = fromFen(f.fen);
  const after = playUci(before, f.played)!;
  const inLines = saved.lines.find((l) => l.pv[0] === f.played);
  let playedScore = inLines?.score;
  let playedPv = inLines?.pv;
  if (!playedScore) {
    if (after.isCheckmate()) playedScore = { kind: 'mate', value: 1 };
    else if (after.isEnd()) playedScore = { kind: 'cp', value: 0 };
    else playedScore = negate(saved.playedLine!.score);
    playedPv = [f.played, ...(saved.playedLine?.pv ?? [])];
  }
  const bestScore = saved.lines[0]!.score;
  const drop = Math.max(0, winningChances(bestScore) - winningChances(playedScore));
  return {
    ply: f.ply ?? 40,
    mover: before.turn,
    before,
    played: f.played,
    playedPv: playedPv!,
    lines: saved.lines,
    bestScore,
    playedScore,
    drop,
    class: classify(drop),
    ...(f.clockBefore !== undefined ? { clockBefore: f.clockBefore } : {}),
    ...(f.initialSeconds !== undefined ? { initialSeconds: f.initialSeconds } : {}),
  };
}

const saved: LineFile = existsSync(LINES_FILE) ? JSON.parse(readFileSync(LINES_FILE, 'utf8')) : {};

describe('detector fixtures', () => {
  if (UPDATE) {
    it('rebuilds engine lines', async () => {
      const out: LineFile = {};
      const report: string[] = [];
      for (const f of FIXTURES) {
        const s = saved[key(f)] ?? (await engineLines(f));
        out[key(f)] = s;
        const ctx = buildContext(f, s);
        const tags = tagMove(ctx);
        const miss = f.has.filter((t) => !tags.includes(t));
        const extra = f.not.filter((t) => tags.includes(t));
        report.push(
          `${miss.length || extra.length ? 'FAIL' : 'ok  '} ${f.name}\n     best ${s.lines[0]?.pv.slice(0, 6).join(' ')} ` +
            `(${JSON.stringify(ctx.bestScore)}) played ${ctx.playedPv.slice(0, 5).join(' ')} ` +
            `(${JSON.stringify(ctx.playedScore)}) drop ${ctx.drop.toFixed(2)} ${ctx.class}\n     tags ${tags.join(', ')}` +
            (miss.length ? `\n     MISSING ${miss.join(', ')}` : '') +
            (extra.length ? `\n     UNEXPECTED ${extra.join(', ')}` : ''),
        );
      }
      writeFileSync(LINES_FILE, JSON.stringify(out, null, 1) + '\n');
      writeFileSync(
        new URL('../../test-results/detector-report.txt', import.meta.url),
        report.join('\n') + '\n',
      );
    }, 600_000);
    return;
  }

  for (const f of FIXTURES) {
    it(f.name, () => {
      const s = saved[key(f)];
      expect(s, 'engine lines missing; run with UPDATE_FIXTURES=1').toBeDefined();
      const tags = tagMove(buildContext(f, s!));
      for (const t of f.has) expect(tags, `expected ${t}`).toContain(t);
      for (const t of f.not) expect(tags, `did not expect ${t}`).not.toContain(t);
    });
  }

  it('covers every move tag with three positives and three negatives', () => {
    const gameLevel: TagName[] = ['conversionFailure'];
    for (const tag of TAGS) {
      if (gameLevel.includes(tag)) continue;
      const pos = FIXTURES.filter((f) => f.has.includes(tag)).length;
      const neg = FIXTURES.filter((f) => f.not.includes(tag)).length;
      expect(pos, `${tag} positives`).toBeGreaterThanOrEqual(3);
      expect(neg, `${tag} negatives`).toBeGreaterThanOrEqual(3);
    }
  });
});
