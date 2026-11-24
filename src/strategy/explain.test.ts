import { describe, expect, it } from 'vitest';
import { fromFen } from '../detectors/board';
import { describeChanges } from './explain';
import { features } from './features';

describe('describeChanges', () => {
  it('reports a broken pawn shield and an open file', () => {
    const before = features(fromFen('6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1'), 'white');
    const after = features(fromFen('6k1/5ppp/8/8/8/6P1/5P1P/6K1 w - - 0 1'), 'white');
    // g3 is still within two ranks of the king, so the shield holds. g4 is not.
    const pushed = features(fromFen('6k1/5ppp/8/8/6P1/8/5P1P/6K1 w - - 0 1'), 'white');
    expect(describeChanges(before, after)).toEqual([]);
    expect(describeChanges(before, pushed)).toContain(
      "Your king's pawn shield went from 3 pawns to 2.",
    );
  });

  it('reports new weak pawns', () => {
    const before = features(fromFen('4k3/8/8/8/8/8/PPP5/4K3 w - - 0 1'), 'white');
    const after = features(fromFen('4k3/8/8/8/8/8/P1P5/4K3 w - - 0 1'), 'white');
    expect(describeChanges(before, after)).toEqual(
      expect.arrayContaining([
        'You have 2 new isolated pawns.',
        'Your pawns split into 2 islands, from 1.',
      ]),
    );
  });

  it('says nothing when nothing measurable changed', () => {
    const f = features(fromFen('4k3/8/8/8/8/8/PPP5/4K3 w - - 0 1'), 'white');
    expect(describeChanges(f, f)).toEqual([]);
  });
});
