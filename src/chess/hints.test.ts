import { describe, expect, it } from 'vitest';
import { moveHints } from './hints';

describe('moveHints', () => {
  it('never repeats the piece: one queen is "your queen"', () => {
    const fen = '4k3/8/8/3Q4/8/8/8/4K3 w - - 0 1';
    const h = moveHints(fen, 'd5d7');
    expect(h).toEqual(['Look for a check.', 'Move your queen.', 'The answer is Qd7+.']);
  });

  it('names the square when there are two of the piece, and what it takes', () => {
    const fen = '4k3/8/8/3p4/8/2N2N2/8/4K3 w - - 0 1';
    const h = moveHints(fen, 'c3d5');
    expect(h).toEqual([
      'Look for a capture.',
      'Move the knight on c3.',
      'It takes the pawn on d5.',
      'The answer is Nxd5.',
    ]);
  });

  it('keeps a given first hint', () => {
    expect(moveHints('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'e2e4', { first: 'Push.' })[0]).toBe(
      'Push.',
    );
  });
});
