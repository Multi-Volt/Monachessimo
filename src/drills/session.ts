import type { TagName } from '../detectors';
import { isDue } from './scheduler';
import type { Drill, ReviewState } from './types';

export interface SessionOptions {
  /** Only drills with this tag. */
  tag?: TagName;
  /** Weakness tags from the profile, most costly first. New drills follow this order. */
  priority: TagName[];
  size?: number;
  /** Most new drills in one session. */
  maxNew?: number;
}

export const SESSION_SIZE = 10;
/** Most plan and conversion drills in one session. They come after the move drills. */
export const MAX_PLAN = 2;
export const MAX_CONVERSION = 1;

/**
 * Picks a session: due reviews first, oldest due first, then new drills
 * taken in turn from the top weaknesses. Each list is newest game first.
 */
export function buildSession(
  drills: Drill[],
  reviews: Map<string, ReviewState>,
  now: number,
  opts: SessionOptions,
): Drill[] {
  const size = opts.size ?? SESSION_SIZE;
  const maxNew = opts.maxNew ?? Math.ceil(size * 0.6);
  const pool = eligible(drills, reviews, now).filter((d) => !opts.tag || d.tags.includes(opts.tag));
  const due = pool
    .filter((d) => {
      const r = reviews.get(d.id);
      return r && isDue(r, now);
    })
    .sort((a, b) => reviews.get(a.id)!.due - reviews.get(b.id)!.due);
  const picked = due.slice(0, size);

  const fresh = pool.filter((d) => !reviews.has(d.id)).sort((a, b) => b.createdAt - a.createdAt);
  const order = opts.tag ? [opts.tag] : opts.priority;
  const buckets = order.map((t) => fresh.filter((d) => d.tags.includes(t)));
  const others = fresh.filter((d) => !d.tags.some((t) => order.includes(t)));
  const chosen = new Set(picked.map((d) => d.id));
  let added = 0;
  const room = () => picked.length < size && added < maxNew;
  for (let round = 0; room() && buckets.some((b) => b.length > round); round++) {
    for (const b of buckets) {
      const d = b[round];
      if (d && room() && !chosen.has(d.id)) {
        picked.push(d);
        chosen.add(d.id);
        added++;
      }
    }
  }
  for (const d of others) {
    if (!room()) break;
    if (!chosen.has(d.id)) {
      picked.push(d);
      chosen.add(d.id);
      added++;
    }
  }
  return capSlowDrills(onePerPosition(picked));
}

/**
 * Keeps at most MAX_PLAN plan drills and MAX_CONVERSION conversion drills,
 * and moves them after the move drills. Both take longer than a move drill.
 */
export function capSlowDrills(list: Drill[]): Drill[] {
  const moves = list.filter((d) => d.type !== 'plan' && d.type !== 'conversion');
  const plans = list.filter((d) => d.type === 'plan').slice(0, MAX_PLAN);
  const conversions = list.filter((d) => d.type === 'conversion').slice(0, MAX_CONVERSION);
  return [...moves, ...plans, ...conversions];
}

/** Position key part of a drill id, `type:key`. */
const positionOf = (id: string) => id.slice(id.indexOf(':') + 1);

/**
 * A plan drill waits until the move drill for the same position has been
 * solved once: first fix the mistake, then compare the plans.
 */
export function eligible(
  drills: Drill[],
  reviews: Map<string, ReviewState>,
  now = Number.POSITIVE_INFINITY,
): Drill[] {
  const solved = new Set<string>();
  const hasMoveDrill = new Set<string>();
  /** Last time any drill of a position was seen. */
  const seenAt = new Map<string, number>();
  for (const d of drills) {
    const key = positionOf(d.id);
    const r = reviews.get(d.id);
    if (r?.lastSeen) seenAt.set(key, Math.max(seenAt.get(key) ?? 0, r.lastSeen));
    if (d.type === 'plan' || d.type === 'conversion') continue;
    hasMoveDrill.add(key);
    if ((r?.reps ?? 0) > 0) solved.add(key);
  }
  return drills.filter((d) => {
    const key = positionOf(d.id);
    // A new drill of a position seen in the last day waits, so the same board
    // does not come back under another drill type.
    if (!reviews.has(d.id) && now - (seenAt.get(key) ?? -Infinity) < SAME_POSITION_GAP)
      return false;
    if (d.type !== 'plan') return true;
    return !hasMoveDrill.has(key) || solved.has(key);
  });
}

/** Least time between two drills of the same position. */
export const SAME_POSITION_GAP = 20 * 60 * 60 * 1000;

/** Keeps the first drill of each position. */
export function onePerPosition(list: Drill[]): Drill[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    const key = positionOf(d.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Days in a row with a finished session, ending today or yesterday. */
export function streak(days: string[], now: number): number {
  const set = new Set(days);
  let n = 0;
  let t = now;
  if (!set.has(dayKey(t))) t -= 86_400_000;
  while (set.has(dayKey(t))) {
    n++;
    t -= 86_400_000;
  }
  return n;
}
