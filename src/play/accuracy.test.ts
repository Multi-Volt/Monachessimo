import { describe, expect, it } from 'vitest';
import { gameAccuracy, moveAccuracy } from './accuracy';

describe('accuracy', () => {
  it('is 100 for a perfect move and falls with the drop', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0);
    expect(moveAccuracy(0.2)).toBeLessThan(70);
    expect(moveAccuracy(1)).toBeLessThan(15);
  });
  it('averages a game', () => {
    expect(gameAccuracy([])).toBeUndefined();
    expect(gameAccuracy([0, 0])).toBe(100);
  });
});
