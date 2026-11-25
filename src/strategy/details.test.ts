import { describe, expect, it } from 'vitest';
import { fromFen } from '../detectors/board';
import { features } from './features';
import { featureNotes, worseNotes } from './details';

const keys = (fen: string, me: 'white' | 'black' = 'white') =>
  featureNotes(fromFen(fen), me).map((n) => `${n.key}:${n.where}`);

describe('featureNotes', () => {
  it('names an isolated pawn with its square and cost', () => {
    const notes = featureNotes(fromFen('4k3/8/8/8/3P4/8/6PP/6K1 w - - 0 1'), 'white');
    expect(notes).toContainEqual({
      key: 'isolatedPawn',
      where: 'd4',
      text: 'Nothing can defend your pawn on d4 with a pawn, so it becomes a target.',
    });
  });

  it('agrees with the counts in features()', () => {
    for (const fen of [
      'r1bq1rk1/pp3ppp/2n1pn2/3p4/2PP4/2N2N2/PP3PPP/R2QKB1R w KQ - 0 9',
      '4k3/8/8/8/3P4/8/6PP/6K1 w - - 0 1',
      '6k1/5ppp/8/8/8/2P5/2P2PPP/6K1 w - - 0 1',
    ]) {
      const pos = fromFen(fen);
      const f = features(pos, 'white');
      const n = featureNotes(pos, 'white');
      expect(n.filter((x) => x.key === 'isolatedPawn').length).toBe(f.isolatedPawns);
      expect(n.filter((x) => x.key === 'openFileNearKing').length).toBe(f.openFilesNearKing);
    }
  });

  it('names doubled pawns by file and an open file by the king', () => {
    expect(keys('6k1/5ppp/8/8/8/2P5/2P2PP1/r5K1 w - - 0 1')).toEqual(
      expect.arrayContaining(['doubledPawns:c', 'openFileNearKing:h']),
    );
  });

  it('finds a bishop stuck behind its own pawns', () => {
    // Dark-squared bishop on c1 behind dark-square pawns on b2, c3 and d4.
    expect(keys('4k3/8/8/8/3P4/2P1P3/1P6/2B3K1 w - - 0 1')).toContain('badBishop:c1');
    expect(keys('4k3/8/8/8/8/8/8/2B3K1 w - - 0 1')).not.toContain('badBishop:c1');
  });

  it("names the opponent's outpost and passed pawn", () => {
    const k = keys('4k3/8/2p5/3n4/3P4/8/8/6K1 w - - 0 1');
    expect(k).toContain('enemyOutpost:d5');
    expect(keys('4k3/8/8/8/1p6/8/6P1/6K1 w - - 0 1')).toContain('enemyPassedPawn:b4');
  });
});

describe('worseNotes', () => {
  it('keeps only what the played line made worse', () => {
    const best = fromFen('4k3/8/8/8/3P4/2P5/6PP/6K1 w - - 0 1');
    const played = fromFen('4k3/8/8/8/3P4/8/6PP/6K1 w - - 0 1');
    expect(worseNotes(best, played, 'white').map((n) => n.key)).toEqual(['isolatedPawn']);
  });
});
