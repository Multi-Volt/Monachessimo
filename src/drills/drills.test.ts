import { describe, expect, it } from 'vitest';
import { DAY, RELEARN_MS, newReview, schedule } from './scheduler';
import { expected, updateRating } from './rating';

describe('scheduler', () => {
  const t0 = 1_800_000_000_000;
  it('spaces correct answers out: 1 day, 3 days, then by ease', () => {
    let r = newReview('d', t0);
    r = schedule(r, 'good', t0);
    expect(r.interval).toBe(1);
    expect(r.due).toBe(t0 + DAY);
    r = schedule(r, 'good', r.due);
    expect(r.interval).toBe(3);
    r = schedule(r, 'good', r.due);
    expect(r.interval).toBe(7.5);
  });

  it('brings a failed drill back in ten minutes and resets the streak', () => {
    let r = schedule(schedule(newReview('d', t0), 'good', t0), 'good', t0 + DAY);
    r = schedule(r, 'fail', t0 + 4 * DAY);
    expect(r.due).toBe(t0 + 4 * DAY + RELEARN_MS);
    expect(r.reps).toBe(0);
    expect(r.lapses).toBe(1);
    expect(r.ease).toBeCloseTo(2.3);
    r = schedule(r, 'good', r.due);
    expect(r.interval).toBe(1);
  });

  it('lowers the ease after a hint and never below 1.3', () => {
    let r = newReview('d', t0);
    for (let i = 0; i < 20; i++) r = schedule(r, 'hard', t0);
    expect(r.ease).toBe(1.3);
  });
});

describe('puzzle rating', () => {
  it('expects 50 percent against an equal drill', () => {
    expect(expected(1500, 1500)).toBe(0.5);
  });
  it('rises after a solve and falls after a fail', () => {
    expect(updateRating(1500, 1500, 'good')).toBe(1512);
    expect(updateRating(1500, 1500, 'fail')).toBe(1488);
    expect(updateRating(1500, 1500, 'hard')).toBe(1500);
  });
});
