import { describe, expect, it } from 'vitest';
import { fromFen } from '../detectors/board';
import { causeMarks, causeText, findCause, type Cause } from './cause';

type Row = [name: string, fen: string, move: string, reply: string[], kind: Cause['kind'] | null];

/**
 * Three positions where each cause must fire, and three where it must not.
 * White is the player in every position; the reply is Black's best line.
 */
const ROWS: Record<Cause['kind'], { fire: Row[]; quiet: Row[] }> = {
  defenderLeft: {
    fire: [
      [
        'knight leaves the e5 pawn',
        '7k/8/3b4/4P3/8/5N2/8/7K w - - 0 1',
        'f3g5',
        ['d6e5'],
        'defenderLeft',
      ],
      [
        'rook leaves the d4 knight',
        '7k/8/1b6/8/3N4/8/8/3R3K w - - 0 1',
        'd1e1',
        ['b6d4'],
        'defenderLeft',
      ],
      [
        'queen leaves the g5 bishop',
        '7k/7n/8/6B1/8/8/3Q4/6K1 w - - 0 1',
        'd2c2',
        ['h7g5'],
        'defenderLeft',
      ],
    ],
    quiet: [
      ['a quiet reply', '7k/8/3b4/4P3/8/5N2/7P/7K w - - 0 1', 'h2h3', ['h8g8'], null],
      ['another guard remains', '7k/8/3b4/4P3/8/5N2/8/4R2K w - - 0 1', 'f3g5', ['d6e5'], null],
      ['the guard stays on the line', '7k/8/1b6/8/3N4/8/8/3R3K w - - 0 1', 'd1d3', ['b6d4'], null],
    ],
  },
  movedOntoAttacked: {
    fire: [
      [
        'bishop to a pawn-attacked square',
        '7k/8/7p/8/8/8/8/2B4K w - - 0 1',
        'c1g5',
        ['h6g5'],
        'movedOntoAttacked',
      ],
      [
        'knight to a pawn-attacked square',
        '7k/8/8/4p3/8/5N2/8/7K w - - 0 1',
        'f3d4',
        ['e5d4'],
        'movedOntoAttacked',
      ],
      [
        'queen takes a guarded pawn',
        '7k/8/5n2/3p4/8/8/8/3Q3K w - - 0 1',
        'd1d5',
        ['f6d5'],
        'movedOntoAttacked',
      ],
    ],
    quiet: [
      ['the square is defended', '7k/8/2n5/8/8/2P2N2/8/7K w - - 0 1', 'f3d4', ['c6d4'], null],
      ['a safe square', '7k/8/7p/8/8/8/8/2B4K w - - 0 1', 'c1d2', ['h8g8'], null],
      [
        'another piece was already hanging',
        '7k/8/1b6/8/3N4/8/8/R6K w - - 0 1',
        'a1a2',
        ['b6d4'],
        'ignoredThreat',
      ],
    ],
  },
  ignoredThreat: {
    fire: [
      [
        'knight left hanging',
        '7k/8/1b6/8/3N4/8/8/R6K w - - 0 1',
        'a1a2',
        ['b6d4'],
        'ignoredThreat',
      ],
      [
        'bishop left to a pawn',
        '7k/8/8/6p1/5B2/8/7P/7K w - - 0 1',
        'h2h3',
        ['g5f4'],
        'ignoredThreat',
      ],
      [
        'queen left to a rook',
        '3r3k/8/8/8/8/8/P7/3Q2K1 w - - 0 1',
        'a2a3',
        ['d8d1'],
        'ignoredThreat',
      ],
    ],
    quiet: [
      ['the knight moves away', '7k/8/1b6/8/3N4/8/8/R6K w - - 0 1', 'd4e2', ['h8g8'], null],
      [
        'a pawn now guards the knight',
        '7k/8/1b6/8/3N4/8/2P5/R6K w - - 0 1',
        'c2c3',
        ['b6d4'],
        null,
      ],
      [
        'the moved piece is the one lost',
        '7k/8/7p/8/8/8/8/2B4K w - - 0 1',
        'c1g5',
        ['h6g5'],
        'movedOntoAttacked',
      ],
    ],
  },
  openedLine: {
    fire: [
      [
        'knight opens a diagonal to the rook',
        '7k/8/8/1b6/8/3N4/8/5R1K w - - 0 1',
        'd3e5',
        ['b5f1'],
        'openedLine',
      ],
      [
        'bishop opens the e-file to the queen',
        '4r2k/8/8/8/8/4B3/8/4Q2K w - - 0 1',
        'e3c5',
        ['e8e1'],
        'openedLine',
      ],
      [
        'knight opens the first rank to the rook',
        '7k/8/8/8/8/7K/8/R2N2r1 w - - 0 1',
        'd1c3',
        ['g1a1'],
        'openedLine',
      ],
    ],
    quiet: [
      ['a quiet reply', '7k/8/8/1b6/8/3N4/7P/5R1K w - - 0 1', 'h2h3', ['h8g8'], null],
      ['the line opens onto nothing', '7k/8/8/1b6/8/3N4/8/7K w - - 0 1', 'd3e5', ['h8g8'], null],
      [
        'the slider already attacked',
        '3r3k/8/8/8/8/8/P7/3Q2K1 w - - 0 1',
        'a2a3',
        ['d8d1'],
        'ignoredThreat',
      ],
    ],
  },
  fork: {
    fire: [
      [
        'knight forks king and rook',
        '1k6/8/8/8/1n6/8/3P3P/R3K3 w - - 0 1',
        'h2h3',
        ['b4c2'],
        'fork',
      ],
      [
        'pawn forks bishop and knight',
        '7k/8/3pp3/8/2B1N3/8/7P/7K w - - 0 1',
        'h2h3',
        ['d6d5'],
        'fork',
      ],
      ['queen forks king and rook', '3q3k/8/8/8/8/8/7P/R5K1 w - - 0 1', 'h2h3', ['d8d4'], 'fork'],
    ],
    quiet: [
      ['one piece attacked', '1k6/8/8/8/1n6/8/7P/R6K w - - 0 1', 'h2h3', ['b4c2'], null],
      ['only pawns attacked', '7k/8/8/5n2/8/2P1P3/7P/7K w - - 0 1', 'h2h3', ['f5d4'], null],
      [
        'defended pieces of equal value',
        '7k/8/8/5n2/2B1N3/3P4/7P/7K w - - 0 1',
        'h2h3',
        ['f5d6'],
        null,
      ],
    ],
  },
  pin: {
    fire: [
      ['bishop pins knight to king', '5b1k/8/8/8/8/8/3N3P/4K3 w - - 0 1', 'h2h3', ['f8b4'], 'pin'],
      ['rook pins knight to queen', 'r6k/8/8/8/4N3/8/7P/4Q2K w - - 0 1', 'h2h3', ['a8e8'], 'pin'],
      ['queen pins pawn to king', '3q3k/8/8/8/8/8/5P1P/6K1 w - - 0 1', 'h2h3', ['d8b6'], 'pin'],
    ],
    quiet: [
      ['nothing behind', '5b1k/8/8/8/8/8/3N3P/7K w - - 0 1', 'h2h3', ['f8b4'], null],
      [
        "the piece behind is the opponent's",
        'r6k/8/8/8/4N3/8/7P/4n2K w - - 0 1',
        'h2h3',
        ['a8e8'],
        null,
      ],
      ['a pawn behind a queen', 'r6k/8/8/8/4Q3/8/4P2P/7K w - - 0 1', 'h2h3', ['a8e8'], null],
    ],
  },
  skewer: {
    fire: [
      [
        'rook skewers king to rook',
        '1k5r/8/8/8/R3K3/8/2P5/8 w - - 0 1',
        'c2c3',
        ['h8h4'],
        'skewer',
      ],
      [
        'bishop skewers queen to rook',
        '1b4k1/8/5p2/8/8/2Q5/7P/R6K w - - 0 1',
        'h2h3',
        ['b8e5'],
        'skewer',
      ],
      [
        'rook skewers queen to rook',
        'r3k3/4b3/8/8/3Q4/8/7P/3R3K w - - 0 1',
        'h2h3',
        ['a8d8'],
        'skewer',
      ],
    ],
    quiet: [
      ['a pin instead', 'r6k/8/8/8/4N3/8/7P/4Q2K w - - 0 1', 'h2h3', ['a8e8'], 'pin'],
      ['a pawn behind', 'r6k/8/8/8/4Q3/8/4P2P/7K w - - 0 1', 'h2h3', ['a8e8'], null],
      ['nothing behind the queen', 'r3k3/4b3/8/8/3Q4/8/7P/7K w - - 0 1', 'h2h3', ['a8d8'], null],
    ],
  },
};

describe('findCause', () => {
  for (const [kind, { fire, quiet }] of Object.entries(ROWS)) {
    describe(kind, () => {
      for (const [name, fen, move, reply, expected] of [...fire, ...quiet]) {
        it(`${expected === kind ? 'fires' : 'stays quiet'}: ${name}`, () => {
          const cause = findCause(fromFen(fen), move, reply);
          expect(cause?.kind ?? null).toBe(expected);
          if (cause) {
            expect(causeText(cause)).toMatch(/^[A-Z].*\.$/);
            expect(causeMarks(cause).length).toBeGreaterThan(0);
          }
        });
      }
    });
  }

  it('speaks as the opponent and names the guard that left', () => {
    const c = findCause(fromFen('7k/8/3b4/4P3/8/5N2/8/7K w - - 0 1'), 'f3g5', ['d6e5'])!;
    expect(causeText(c)).toBe(
      'Your knight was guarding the pawn on e5. Now my bishop can take it.',
    );
  });
});
