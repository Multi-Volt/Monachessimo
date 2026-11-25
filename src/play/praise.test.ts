import { describe, expect, it } from 'vitest';
import { fromFen } from '../detectors/board';
import type { Score } from '../engine/eval';
import { praiseMove } from './praise';

const cp = (value: number): Score => ({ kind: 'cp', value });
const line = (pv: string[], value: number) => ({ multipv: 1, depth: 14, score: cp(value), pv });

describe('praiseMove', () => {
  const start = fromFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');

  it('calls the engine first choice best and names development', () => {
    const p = praiseMove({
      before: start,
      uci: 'g8f6',
      lines: [line(['g8f6'], -30), line(['e7e5'], -35)],
      played: cp(-30),
      verdict: { class: null, drop: 0, cpLoss: 0 },
    })!;
    expect(p.label).toBe('best');
    expect(p.points).toContain('It develops your knight.');
  });

  it('calls a move the only good one great', () => {
    const p = praiseMove({
      before: start,
      uci: 'e7e5',
      lines: [line(['e7e5'], 0), line(['d7d5'], -200)],
      played: cp(0),
      verdict: { class: null, drop: 0, cpLoss: 0 },
    })!;
    expect(p.label).toBe('great');
  });

  it('calls a near-best sacrifice brilliant', () => {
    // White plays Bxf7+ style offer: the bishop can be taken by the king for profit.
    const pos = fromFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1');
    const p = praiseMove({
      before: pos,
      uci: 'c4b5',
      lines: [line(['c4b5'], 30), line(['d2d3'], 25)],
      played: cp(30),
      verdict: { class: null, drop: 0, cpLoss: 0 },
    });
    // Bb5 is not en prise: not brilliant.
    expect(p!.label).not.toBe('brilliant');
    const q = praiseMove({
      before: pos,
      uci: 'f3g5',
      lines: [line(['f3g5'], 30), line(['d2d3'], 25)],
      played: cp(30),
      verdict: { class: null, drop: 0, cpLoss: 0 },
    });
    expect(q!.label).toBe('brilliant');
  });

  it('gives no praise to a classed move', () => {
    expect(
      praiseMove({
        before: start,
        uci: 'g7g5',
        lines: [line(['e7e5'], 0)],
        played: cp(-150),
        verdict: { class: 'mistake', drop: 0.2, cpLoss: 150 },
      }),
    ).toBeUndefined();
  });
});
