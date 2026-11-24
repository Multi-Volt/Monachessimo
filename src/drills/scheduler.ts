import type { Grade, ReviewState } from './types';

export const DAY = 24 * 60 * 60 * 1000;
/** A failed drill comes back this soon, inside the same session if it is still running. */
export const RELEARN_MS = 10 * 60 * 1000;
export const START_EASE = 2.5;
export const MIN_EASE = 1.3;

export function newReview(id: string, now: number): ReviewState {
  return { id, due: now, interval: 0, ease: START_EASE, reps: 0, lapses: 0 };
}

/**
 * SM-2 style update. A fail resets the streak and brings the drill back in
 * ten minutes. A pass schedules it 1 day, then 3 days, then the last
 * interval times the ease. A pass that needed a hint lowers the ease.
 */
export function schedule(prev: ReviewState, grade: Grade, now: number): ReviewState {
  const next: ReviewState = { ...prev, lastGrade: grade, lastSeen: now };
  if (grade === 'fail') {
    next.reps = 0;
    next.lapses = prev.lapses + 1;
    next.interval = 0;
    next.ease = Math.max(MIN_EASE, prev.ease - 0.2);
    next.due = now + RELEARN_MS;
    return next;
  }
  next.reps = prev.reps + 1;
  if (grade === 'hard') next.ease = Math.max(MIN_EASE, prev.ease - 0.15);
  if (next.reps === 1) next.interval = 1;
  else if (next.reps === 2) next.interval = grade === 'hard' ? 2 : 3;
  else next.interval = Math.round(prev.interval * (grade === 'hard' ? 1.2 : next.ease) * 10) / 10;
  next.due = now + next.interval * DAY;
  return next;
}

export function isDue(r: ReviewState, now: number): boolean {
  return r.due <= now;
}
