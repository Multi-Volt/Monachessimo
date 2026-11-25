import { describe, expect, it } from 'vitest';
import { fromFen } from '../detectors/board';
import { longTermReason } from './reason';

describe('longTermReason', () => {
  it('names material first', () => {
    // The knight on d4 is attacked; e2 ignores it, Nf5 saves it.
    const start = fromFen('3rk3/8/8/8/3N4/8/8/4K3 w - - 0 1');
    const r = longTermReason(start, 'white', ['e1e2', 'd8d4'], ['d4f5', 'e8e7']);
    expect(r).toMatchObject({
      kind: 'material',
      text: '2 moves later you have 3 pawns less material than after a better move.',
    });
  });

  it("reads a plan against the king from the engine's moves", () => {
    const start = fromFen('3qk3/8/8/8/8/8/P4PPP/6K1 w - - 0 1');
    const r = longTermReason(
      start,
      'white',
      ['a2a3', 'd8d4', 'a3a4', 'd4d1'],
      ['h2h3', 'd8d4', 'g1h2', 'd4f2'],
    );
    expect(r.kind).toBe('plan');
    expect(r.text).toBe('My pieces head for your king: Qd4, Qd1#, and it ends in checkmate.');
    expect(r.marks).toHaveLength(2);
  });

  it('falls back to the feature that got worse', () => {
    const start = fromFen('k7/8/8/8/8/5b2/5PPP/4R1K1 w - - 0 1');
    const r = longTermReason(start, 'white', ['g2f3', 'a8b8'], ['e1e2', 'a8b8']);
    expect(r).toMatchObject({ kind: 'feature' });
    expect(r.text).toContain('g-file');
  });

  it('says so honestly when nothing measured explains it', () => {
    const start = fromFen('4k3/8/8/8/8/8/6PP/6K1 w - - 0 1');
    const r = longTermReason(start, 'white', ['h2h3', 'e8e7'], ['h2h3', 'e8e7']);
    expect(r).toEqual({
      kind: 'unknown',
      text: 'The engine sees a long-term problem it cannot put into one reason here.',
      marks: [],
    });
  });
});
