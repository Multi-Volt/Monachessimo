import { describe, expect, it } from 'vitest';
import { fromFen } from '../detectors/board';
import { compareLines } from './explain';
import { captured } from '../ui/Material';

describe('compareLines', () => {
  it('names lost castling and slower development, with material even', () => {
    // After 1.e4 e5 2.Nf3 Nc6: Ke2 loses castling; Bc4 develops.
    const start = fromFen('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
    const out = compareLines(start, 'white', ['e1e2', 'g8f6'], ['f1c4', 'g8f6']);
    expect(out).toContain('Your king can no longer castle.');
    expect(out.some((s) => s.includes('less material'))).toBe(false);
  });

  it('counts material lost in the line', () => {
    const start = fromFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    const out = compareLines(
      start,
      'white',
      ['d1h5', 'g8f6', 'h5f7', 'e8f7'],
      ['g1f3', 'b8c6', 'f1c4', 'g8f6'],
    );
    expect(out[0]).toMatch(/You have \d+ pawns less material\./);
  });
});

describe('captured', () => {
  it('lists taken pieces and the lead', () => {
    const b = fromFen('rnb1kbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1').board;
    const c = captured(b);
    expect(c.white).toEqual({ pieces: ['queen'], lead: 9 });
    expect(c.black).toEqual({ pieces: [], lead: 0 });
  });
});
