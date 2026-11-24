import { describe, expect, it } from 'vitest';
import { winningChances } from './eval';

describe('winningChances', () => {
  it('is zero for an equal position', () => {
    expect(winningChances({ kind: 'cp', value: 0 })).toBe(0);
  });

  it('is symmetric around zero', () => {
    const plus = winningChances({ kind: 'cp', value: 250 });
    const minus = winningChances({ kind: 'cp', value: -250 });
    expect(plus).toBeCloseTo(-minus, 12);
  });

  it('matches the Lichess formula at +100 cp', () => {
    // 2 / (1 + exp(-0.368208)) - 1
    expect(winningChances({ kind: 'cp', value: 100 })).toBeCloseTo(0.18203, 4);
  });

  it('saturates for forced mates', () => {
    expect(winningChances({ kind: 'mate', value: 3 })).toBeGreaterThan(0.999);
    expect(winningChances({ kind: 'mate', value: -1 })).toBeLessThan(-0.999);
  });

  it('treats mate 0 as a loss for the side to move, which is checkmated', () => {
    expect(winningChances({ kind: 'mate', value: 0 })).toBeLessThan(-0.999);
  });
});
