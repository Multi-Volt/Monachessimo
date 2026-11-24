import type { AnalysisSettings } from '../analysis/types';
import { loadProfile } from '../profile/data';
import type { Repo } from '../store/repo';
import { conversionDrillFromGame, drillsFromGame, planDrillsFromGame } from './generate';
import { START_RATING } from './rating';
import type { Drill, ReviewState } from './types';

export interface RatingRecord {
  rating: number;
  history: { at: number; rating: number }[];
}

/**
 * Generates drills for every analyzed game and stores the new ones. Drills
 * already stored keep their id, so their scheduler state is untouched.
 */
export async function syncDrills(repo: Repo, settings: AnalysisSettings, now = Date.now()) {
  const profile = await loadProfile(repo, settings);
  const existing = new Map((await repo.allDrills()).map((d) => [d.id, d]));
  const generated: Drill[] = [];
  for (const { game, analysis } of profile.analyzed) {
    const conversion = conversionDrillFromGame(game, analysis, profile.tags, now);
    for (const d of [
      ...drillsFromGame(game, analysis, profile.tags, now),
      ...planDrillsFromGame(game, analysis, profile.tags, now),
      ...(conversion ? [conversion] : []),
    ]) {
      const old = existing.get(d.id);
      generated.push(old ? { ...d, createdAt: old.createdAt } : d);
    }
  }
  await repo.putDrills(generated);
  const all = new Map((await repo.allDrills()).map((d) => [d.id, d]));
  const reviews = new Map((await repo.allReviews()).map((r) => [r.id, r] as [string, ReviewState]));
  return { profile, drills: [...all.values()], reviews };
}

export async function getRating(repo: Repo): Promise<RatingRecord> {
  return (
    (await repo.getMeta<RatingRecord>('puzzleRating')) ?? { rating: START_RATING, history: [] }
  );
}

export async function saveRating(repo: Repo, rating: number, now = Date.now()): Promise<void> {
  const r = await getRating(repo);
  await repo.setMeta('puzzleRating', {
    rating,
    history: [...r.history, { at: now, rating }].slice(-500),
  });
}

export async function recordPracticeDay(repo: Repo, day: string): Promise<string[]> {
  const days = (await repo.getMeta<string[]>('practiceDays')) ?? [];
  if (!days.includes(day)) days.push(day);
  await repo.setMeta('practiceDays', days);
  return days;
}
