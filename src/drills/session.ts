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
  const pool = eligible(drills, reviews).filter((d) => !opts.tag || d.tags.includes(opts.tag));
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
  return picked;
}

/** Position key part of a drill id, `type:key`. */
const positionOf = (id: string) => id.slice(id.indexOf(':') + 1);

/**
 * A plan drill waits until the move drill for the same position has been
 * solved once: first fix the mistake, then compare the plans.
 */
export function eligible(drills: Drill[], reviews: Map<string, ReviewState>): Drill[] {
  const solved = new Set<string>();
  const hasMoveDrill = new Set<string>();
  for (const d of drills) {
    if (d.type === 'plan') continue;
    hasMoveDrill.add(positionOf(d.id));
    if ((reviews.get(d.id)?.reps ?? 0) > 0) solved.add(positionOf(d.id));
  }
  return drills.filter((d) => {
    if (d.type !== 'plan') return true;
    const key = positionOf(d.id);
    return !hasMoveDrill.has(key) || solved.has(key);
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
