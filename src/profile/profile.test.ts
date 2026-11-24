import { describe, expect, it } from 'vitest';
import type { TagRecord, TagName } from '../detectors';
import { buildProfile, MIN_SAMPLE, summarize, trend, type GameMoves } from './profile';

const games: GameMoves[] = Array.from({ length: 10 }, (_, i) => ({
  gameId: `g${i}`,
  playedAt: 1000 - i, // g0 is the newest
  userMoves: 40,
}));

function tag(gameIndex: number, name: TagName, drop = 0.3): TagRecord {
  return {
    id: `g${gameIndex}:${Math.random()}:${name}`,
    gameId: `g${gameIndex}`,
    ply: 10,
    tag: name,
    class: 'blunder',
    drop,
    playedAt: 1000 - gameIndex,
    version: 1,
  };
}

describe('buildProfile', () => {
  it('ranks by frequency times cost and holds back small samples', () => {
    const tags = [
      ...[0, 1, 2, 3, 4, 5].map((i) => tag(i, 'hangingPiece', 0.5)),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => tag(i, 'pawnStructure', 0.12)),
      ...[0, 1].map((i) => tag(i, 'mateMissed', 0.9)),
    ];
    const p = buildProfile(tags, games);
    expect(p.map((w) => w.tag)).toEqual(['hangingPiece', 'pawnStructure', 'mateMissed']);
    expect(p[2]!.ranked).toBe(false);
    expect(p[0]!.count).toBe(6);
    expect(p[0]!.games).toBe(6);
  });

  it('weights recent games more', () => {
    const newer = buildProfile(
      [0, 1, 2, 3, 4].map((i) => tag(i, 'forkAllowed')),
      games,
    )[0]!;
    const older = buildProfile(
      [5, 6, 7, 8, 9].map((i) => tag(i, 'forkAllowed')),
      games,
    )[0]!;
    expect(newer.per100).toBeGreaterThan(older.per100);
  });

  it('ignores tags from games that are not in the list', () => {
    expect(buildProfile([tag(42, 'backRank')], games)).toEqual([]);
  });
});

describe('trend', () => {
  it('needs enough positions', () => {
    expect(trend(1, 100, 2, 100)).toBe('unknown');
  });
  it('compares the newer half with the older half', () => {
    expect(trend(2, 200, 10, 200)).toBe('better');
    expect(trend(10, 200, 2, 200)).toBe('worse');
    expect(trend(6, 200, 6, 200)).toBe('steady');
  });
});

describe('summarize', () => {
  it('describes the top weaknesses in plain words', () => {
    const tags = Array.from({ length: MIN_SAMPLE }, (_, i) => tag(i, 'forkAllowed'));
    const lines = summarize(buildProfile(tags, games), 10);
    expect(lines[0]).toMatch(
      /^Your most costly habit: you allow a fork against two of your pieces\./,
    );
    expect(lines[0]).toContain('5 of 10 games');
  });
  it('says nothing without ranked weaknesses', () => {
    expect(summarize([], 3)).toEqual([]);
  });
});
