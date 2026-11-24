import { afterAll, describe, expect, it } from 'vitest';
import { analyzeGame } from '../../src/analysis/pipeline';
import { DEFAULT_SETTINGS } from '../../src/analysis/types';
import { tagGame } from '../../src/detectors';
import { acceptable, judge } from '../../src/drills/answers';
import { drillsFromGame } from '../../src/drills/generate';
import { newReview, schedule } from '../../src/drills/scheduler';
import { buildSession, capSlowDrills, dayKey, eligible, streak } from '../../src/drills/session';
import type { Drill } from '../../src/drills/types';
import { makeGame } from '../support/games';
import { nodePool } from '../support/node-engine';

const pool = nodePool(2);
afterAll(() => pool.terminate());
const settings = { ...DEFAULT_SETTINGS, fastDepth: 10, deepDepth: 14 };

describe('drillsFromGame', () => {
  it('turns a hung queen into a replay drill with safe answers', async () => {
    const game = makeGame(['e4', 'e5', 'Nf3', 'Qh4', 'Nxh4'], 'black', {
      black: { name: 'B', rating: 1400 },
    });
    const a = await analyzeGame(game, { search: (r, s) => pool.search(r, s), settings });
    const drills = drillsFromGame(game, a, tagGame(game, a), 1000);
    expect(drills).toHaveLength(1);
    const d = drills[0]!;
    expect(d.type).toBe('replay');
    expect(d.side).toBe('black');
    expect(d.goal).toBe('You played 2... Qh4. Find a better move.');
    expect(d.tags).toContain('hangingPiece');
    expect(d.hints[0]).toMatch(/undefended/);
    expect(d.hints.at(-1)).toMatch(/^The answer is /);
    expect(d.explanation[0]).toMatch(
      /^In the game you played Qh4, and the engine's answer was Nxh4\./,
    );
    expect(judge(d, 'd8h4')).toBe('wrong');
    expect(judge(d, d.accepted[0]!.uci)).toBe('correct');
    // An obvious blunder is rated below the player's game rating.
    expect(d.rating).toBe(1250);
  }, 60_000);

  it('turns a missed mate into a missed-chance drill', async () => {
    const game = makeGame(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'd3'], 'white');
    const a = await analyzeGame(game, { search: (r, s) => pool.search(r, s), settings });
    const drills = drillsFromGame(game, a, tagGame(game, a), 1000);
    const mate = drills.find((d) => d.source?.ply === 6);
    expect(mate?.type).toBe('missed');
    expect(mate?.goal).toBe('Find the forced mate.');
    expect(mate?.accepted.map((x) => x.uci)).toContain('h5f7');
    expect(mate?.explanation.join(' ')).toContain('It forces mate in 1.');
  }, 60_000);
});

describe('acceptable', () => {
  it('accepts moves within the tolerance', () => {
    expect(acceptable({ kind: 'cp', value: 80 }, { kind: 'cp', value: 100 })).toBe(true);
    expect(acceptable({ kind: 'cp', value: -100 }, { kind: 'cp', value: 100 })).toBe(false);
  });
  it('needs a mate when the best move mates', () => {
    expect(acceptable({ kind: 'cp', value: 900 }, { kind: 'mate', value: 2 })).toBe(false);
    expect(acceptable({ kind: 'mate', value: 4 }, { kind: 'mate', value: 2 })).toBe(true);
    expect(acceptable({ kind: 'mate', value: 6 }, { kind: 'mate', value: 2 })).toBe(false);
  });
});

function drill(id: string, tags: Drill['tags'], createdAt = 0): Drill {
  return {
    id,
    type: 'replay',
    fen: '',
    side: 'white',
    goal: '',
    accepted: [],
    line: [],
    bestScore: { kind: 'cp', value: 0 },
    hints: [],
    explanation: [],
    tags,
    rating: 1500,
    createdAt,
  };
}

describe('buildSession', () => {
  const now = 1_800_000_000_000;
  const drills = [
    drill('a', ['hangingPiece'], 3),
    drill('b', ['hangingPiece'], 2),
    drill('c', ['forkMissed'], 1),
    drill('d', ['pawnStructure'], 0),
    drill('e', ['hangingPiece'], 4),
  ];

  it('puts due reviews first, then new drills from the top weaknesses in turn', () => {
    const reviews = new Map([
      ['e', { ...newReview('e', now), due: now - 1000 }],
      ['b', schedule(newReview('b', now), 'good', now)],
    ]);
    const s = buildSession(drills, reviews, now, {
      priority: ['hangingPiece', 'forkMissed'],
      size: 4,
    });
    expect(s.map((d) => d.id)).toEqual(['e', 'a', 'c', 'd']);
  });

  it('brings back a failed drill once its ten minutes pass', () => {
    const failed = schedule(newReview('c', now), 'fail', now);
    const reviews = new Map([['c', failed]]);
    const soon = buildSession(drills, reviews, now + 60_000, { priority: [], maxNew: 0 });
    const later = buildSession(drills, reviews, now + 11 * 60_000, { priority: [], maxNew: 0 });
    expect(soon).toEqual([]);
    expect(later.map((d) => d.id)).toEqual(['c']);
  });

  it('filters by tag', () => {
    const s = buildSession(drills, new Map(), now, { tag: 'forkMissed', priority: [] });
    expect(s.map((d) => d.id)).toEqual(['c']);
  });
});

describe('streak', () => {
  const day = 86_400_000;
  const now = new Date(2026, 10, 24, 12).getTime();
  it('counts days in a row ending today or yesterday', () => {
    expect(streak([dayKey(now), dayKey(now - day), dayKey(now - 2 * day)], now)).toBe(3);
    expect(streak([dayKey(now - day), dayKey(now - 2 * day)], now)).toBe(2);
    expect(streak([dayKey(now - 3 * day)], now)).toBe(0);
  });
});

describe('eligible', () => {
  const now = 1_800_000_000_000;
  const plan = { ...drill('plan:k1', []), type: 'plan' as const };
  const move = drill('replay:k1', []);
  it('holds a plan drill back until its position is solved', () => {
    expect(eligible([plan, move], new Map()).map((d) => d.id)).toEqual(['replay:k1']);
    const solved = new Map([['replay:k1', schedule(newReview('replay:k1', now), 'good', now)]]);
    expect(eligible([plan, move], solved).map((d) => d.id)).toEqual(['plan:k1', 'replay:k1']);
  });
  it('allows a plan drill with no move drill', () => {
    expect(eligible([plan], new Map())).toEqual([plan]);
  });
});

describe('capSlowDrills', () => {
  it('puts move drills first and keeps at most two plans and one conversion', () => {
    const kinds = ['plan', 'replay', 'plan', 'conversion', 'plan', 'conversion', 'missed'] as const;
    const list = kinds.map((type, i) => ({ ...drill(`${type}:${i}`, []), type }));
    expect(capSlowDrills(list).map((d) => d.id)).toEqual([
      'replay:1',
      'missed:6',
      'plan:0',
      'plan:2',
      'conversion:3',
    ]);
  });
});
