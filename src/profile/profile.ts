import type { TagRecord, TagName } from '../detectors';
import { TAG_INFO } from './labels';

/** Positions a tag needs before it is ranked. */
export const MIN_SAMPLE = 5;
/** Games after which a game's weight halves. Newer games count more. */
export const HALF_LIFE_GAMES = 20;

export type Trend = 'better' | 'worse' | 'steady' | 'unknown';

export interface Weakness {
  tag: TagName;
  label: string;
  /** Positions with this tag. */
  count: number;
  /** Games with at least one. */
  games: number;
  /** Times per 100 of the player's moves, weighted toward recent games. */
  per100: number;
  /** Average drop in winning chances, -1 to 1 scale. */
  avgDrop: number;
  /** Rank score: per100 times avgDrop. */
  impact: number;
  trend: Trend;
  /** True when count reaches MIN_SAMPLE. */
  ranked: boolean;
}

export interface GameMoves {
  gameId: string;
  playedAt: number;
  /** Moves the player made in the game. */
  userMoves: number;
}

/**
 * Builds the weakness list from stored tags and the analyzed games they come
 * from. Ranked weaknesses come first, ordered by impact.
 */
export function buildProfile(tags: TagRecord[], games: GameMoves[]): Weakness[] {
  const ordered = [...games].sort((a, b) => b.playedAt - a.playedAt);
  const weight = new Map(ordered.map((g, i) => [g.gameId, 0.5 ** (i / HALF_LIFE_GAMES)]));
  const totalWeightedMoves = ordered.reduce((s, g) => s + g.userMoves * weight.get(g.gameId)!, 0);
  const half = Math.ceil(ordered.length / 2);
  const recent = new Set(ordered.slice(0, half).map((g) => g.gameId));
  const movesIn = (ids: (g: GameMoves) => boolean) =>
    ordered.filter(ids).reduce((s, g) => s + g.userMoves, 0);
  const recentMoves = movesIn((g) => recent.has(g.gameId));
  const olderMoves = movesIn((g) => !recent.has(g.gameId));

  const byTag = new Map<TagName, TagRecord[]>();
  for (const t of tags) {
    if (!weight.has(t.gameId)) continue;
    const list = byTag.get(t.tag) ?? [];
    list.push(t);
    byTag.set(t.tag, list);
  }

  const out: Weakness[] = [];
  for (const [tag, list] of byTag) {
    const count = list.length;
    const weighted = list.reduce((s, t) => s + weight.get(t.gameId)!, 0);
    const per100 = totalWeightedMoves ? (weighted / totalWeightedMoves) * 100 : 0;
    const avgDrop = list.reduce((s, t) => s + t.drop, 0) / count;
    const inRecent = list.filter((t) => recent.has(t.gameId)).length;
    const inOlder = count - inRecent;
    out.push({
      tag,
      label: TAG_INFO[tag].label,
      count,
      games: new Set(list.map((t) => t.gameId)).size,
      per100,
      avgDrop,
      impact: per100 * avgDrop,
      trend: trend(inRecent, recentMoves, inOlder, olderMoves),
      ranked: count >= MIN_SAMPLE,
    });
  }
  return out.sort((a, b) => Number(b.ranked) - Number(a.ranked) || b.impact - a.impact);
}

/** Compares the rate in the newer half of games with the older half. */
export function trend(
  recent: number,
  recentMoves: number,
  older: number,
  olderMoves: number,
): Trend {
  if (recent + older < MIN_SAMPLE * 2 || !recentMoves || !olderMoves) return 'unknown';
  const r = recent / recentMoves;
  const o = older / olderMoves;
  if (r < o * 0.75) return 'better';
  if (r > o * 1.25) return 'worse';
  return 'steady';
}

/** A short plain-language summary of the top weaknesses, from templates. */
export function summarize(profile: Weakness[], gameCount: number): string[] {
  const top = profile.filter((w) => w.ranked).slice(0, 3);
  if (top.length === 0) return [];
  const lines = top.map((w, i) => {
    const rate = w.per100 >= 1 ? `about ${Math.round(w.per100)} times` : 'less than once';
    const head = i === 0 ? 'Your most costly habit' : 'Next';
    return `${head}: you ${TAG_INFO[w.tag].summary}. It happened in ${w.games} of ${gameCount} games, ${rate} per 100 moves.`;
  });
  const better = top.find((w) => w.trend === 'better');
  if (better) lines.push(`${better.label} happens less often in your recent games.`);
  return lines;
}
