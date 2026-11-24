import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { analyzeGame } from '../../src/analysis/pipeline';
import { DEFAULT_SETTINGS } from '../../src/analysis/types';
import { pvToSan } from '../../src/chess/san';
import { tagGame, type TagRecord } from '../../src/detectors';
import {
  conversionDrillFromGame,
  drillsFromGame,
  planDrillsFromGame,
} from '../../src/drills/generate';
import type { Drill, DrillType } from '../../src/drills/types';
import { normalizeLichess, type LichessGameJson } from '../../src/import/lichess';
import { themeDrills } from '../../src/puzzles/loader';
import { formatScore } from '../../src/ui/format';
import { nodePool } from '../support/node-engine';

// Writes docs/reports/drills.md: at least 20 generated examples of every
// drill type, for a person to read. Slow (analyzes 50 games), so it runs
// only with REPORT=1, after `node scripts/build-puzzle-shards.ts`.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const RUN = env?.REPORT === '1';
const MIN = 20;
const TYPES: DrillType[] = [
  'replay',
  'missed',
  'setup',
  'sacrifice',
  'theme',
  'plan',
  'conversion',
  'time',
];

const diskFetch = (async (input: RequestInfo | URL) => {
  const path = String(input).replace(/^.*?\/puzzles\//, 'public/puzzles/');
  if (!existsSync(path)) return new Response('', { status: 404 });
  return new Response(readFileSync(path, 'utf8'), { status: 200 });
}) as typeof fetch;

function render(d: Drill): string {
  const lines = [`- **${d.goal}** \`${d.fen}\``];
  if (d.choices) {
    lines.push(
      `  - Choices: ${d.choices.map((c) => `${c.san} ${formatScore(c.score)}${c.played ? ' (game move)' : ''}`).join(', ')}`,
    );
    for (const c of d.choices)
      if (c.changes.length) lines.push(`  - ${c.san}: ${c.changes.join(' ')}`);
  } else if (d.type === 'conversion') {
    lines.push(`  - Start: ${formatScore(d.bestScore)}, opponent Skill Level ${d.opponentSkill}`);
  } else {
    const line = d.solution ?? d.line;
    lines.push(`  - Answer: ${pvToSan(d.fen, line, 6).join(' ')}`);
    if (d.accepted.length > 1)
      lines.push(
        `  - Also accepted: ${d.accepted
          .slice(1)
          .map((a) => pvToSan(d.fen, [a.uci], 1)[0])
          .join(', ')}`,
      );
    if (d.hints.length) lines.push(`  - Hints: ${d.hints.join(' / ')}`);
  }
  for (const e of d.explanation) lines.push(`  - ${e}`);
  if (d.tags.length) lines.push(`  - Tags: ${d.tags.join(', ')}`);
  return lines.join('\n');
}

describe.runIf(RUN)('drill report', () => {
  it('generates at least 20 examples of every drill type', async () => {
    const pool = nodePool(4);
    const games = readFileSync(new URL('../fixtures/perf-games.ndjson', import.meta.url), 'utf8')
      .trim()
      .split('\n')
      .map((l) => normalizeLichess(JSON.parse(l) as LichessGameJson, 'TestPlayer')!);
    const drills: Drill[] = [];
    const allTags: TagRecord[] = [];
    for (const g of games) {
      const a = await analyzeGame(g, {
        search: (r, s) => pool.search(r, s),
        settings: { ...DEFAULT_SETTINGS, fastDepth: 10, deepDepth: 14 },
      });
      const tags = tagGame(g, a);
      allTags.push(...tags);
      drills.push(...drillsFromGame(g, a, tags, 0), ...planDrillsFromGame(g, a, tags, 0));
      const c = conversionDrillFromGame(g, a, tags, 0);
      if (c) drills.push(c);
    }
    pool.terminate();
    const fromGames = new Map(TYPES.map((t) => [t, drills.filter((d) => d.type === t).length]));
    // Lichess puzzles for the tactical types, at three ratings.
    const seen = new Set<string>();
    for (const rating of [1200, 1600, 2000]) {
      drills.push(
        ...(await themeDrills(
          ['quietSetupMissed', 'sacrificeMissed', 'forkMissed', 'pinMissed'],
          rating,
          seen,
          8,
          0,
          diskFetch,
        )),
      );
    }
    const out = [
      '# Generated drill examples',
      '',
      'Built by `REPORT=1 npx vitest run tests/unit/drill-report.node.test.ts` from the 50 games in `tests/fixtures/perf-games.ndjson` (Stockfish 19 lite, depth 10 then 14) and the local puzzle shards. Every sentence in an explanation comes from engine output or a counted board feature.',
      '',
      '| Type | From games | Total |',
      '| --- | --- | --- |',
      ...TYPES.map(
        (t) => `| ${t} | ${fromGames.get(t)} | ${drills.filter((d) => d.type === t).length} |`,
      ),
      '',
    ];
    for (const t of TYPES) {
      out.push(`## ${t}`, '');
      for (const d of drills.filter((x) => x.type === t).slice(0, MIN + 5)) out.push(render(d));
      out.push('');
    }
    writeFileSync(new URL('../../docs/reports/drills.md', import.meta.url), out.join('\n'));
    for (const t of TYPES)
      expect(drills.filter((d) => d.type === t).length, t).toBeGreaterThanOrEqual(MIN);
  }, 1_800_000);
});
