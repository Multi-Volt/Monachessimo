import { describe, expect, it } from 'vitest';
import { nearestBand, puzzleDrill, type Manifest, type PuzzleRow } from './loader';

const manifest: Manifest = {
  format: 1,
  band: 100,
  themes: {
    fork: {
      '1200': { file: 'fork/1200.json', count: 1 },
      '1800': { file: 'fork/1800.json', count: 1 },
    },
  },
  puzzles: 2,
  bytes: 100,
};

// Sample row from https://database.lichess.org/#puzzles
const row: PuzzleRow = [
  '00sHx',
  'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17',
  'e8d7 a2e6 d7d8 f7f8',
  1760,
];

describe('puzzle loader', () => {
  it('picks the nearest rating band that exists', () => {
    expect(nearestBand(manifest, 'fork', 1250)).toBe('1200');
    expect(nearestBand(manifest, 'fork', 1650)).toBe('1800');
    expect(nearestBand(manifest, 'pin', 1500)).toBeUndefined();
  });

  it('applies the opponent move first and keeps the rest as the solution', () => {
    const d = puzzleDrill(row, 'mate', 0)!;
    expect(d.id).toBe('theme:00sHx');
    expect(d.side).toBe('white');
    expect(d.fen.startsWith('q5nr/1ppknQpp/')).toBe(true);
    expect(d.solution).toEqual(['a2e6', 'd7d8', 'f7f8']);
    expect(d.goal).toBe('Find the mate.');
    expect(d.rating).toBe(1760);
    expect(d.hints.at(-1)).toBe('The answer is Be6+.');
  });

  it('skips a row whose first move is illegal', () => {
    expect(puzzleDrill(['x', row[1], 'a1a8 a2e6', 1500], 'mate', 0)).toBeUndefined();
  });
});
