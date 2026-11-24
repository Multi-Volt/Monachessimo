import { describe, expect, it } from 'vitest';
import { balanceWords, whiteScore } from './EvalBar';

describe('evaluation words', () => {
  it('converts to White and names the better side', () => {
    expect(whiteScore({ kind: 'cp', value: 150 }, 'black')).toEqual({ kind: 'cp', value: -150 });
    expect(balanceWords({ kind: 'cp', value: 10 })).toBe('about equal');
    expect(balanceWords({ kind: 'cp', value: 120 })).toBe('White is better');
    expect(balanceWords({ kind: 'cp', value: -600 })).toBe('Black is winning');
    expect(balanceWords({ kind: 'mate', value: -2 })).toBe('Black mates');
  });
});
