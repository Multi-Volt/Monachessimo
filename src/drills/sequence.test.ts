import { describe, expect, it } from 'vitest';
import { fromFen, playUci } from '../detectors/board';
import { goalFor, goalReached, lineGain } from './sequence';
import type { Drill } from './types';

const base = (over: Partial<Drill>): Drill => ({
  id: 'x',
  type: 'missed',
  fen: '',
  side: 'white',
  goal: '',
  accepted: [],
  line: [],
  bestScore: { kind: 'cp', value: 0 },
  hints: [],
  explanation: [],
  tags: [],
  rating: 1500,
  createdAt: 0,
  ...over,
});

// Nc7+ forks king and queen; the king steps aside and the knight takes the queen.
const FORK = 'q3k3/8/8/1N6/8/8/5PPP/6K1 w - - 0 1';
const FORK_LINE = ['b5c7', 'e8d7', 'c7a8', 'd7c8'];

describe('drill goals', () => {
  it('counts the material a line wins after the opponent answers', () => {
    expect(lineGain(FORK, FORK_LINE)).toBe(9);
    expect(lineGain(FORK, ['b5c7'])).toBe(0);
  });

  it('asks a missed fork to win the material, not just play the fork', () => {
    const goal = goalFor(base({ fen: FORK, line: FORK_LINE, tags: ['forkMissed'] }));
    expect(goal).toEqual({ kind: 'material', gain: 9 });
    const start = fromFen(FORK);
    const afterFork = playUci(playUci(start, 'b5c7')!, 'e8d7')!;
    expect(goalReached(goal, start, afterFork, 1)).toBe(false);
    const won = playUci(playUci(afterFork, 'c7a8')!, 'd7c8')!;
    expect(goalReached(goal, start, won, 2)).toBe(true);
  });

  it('asks a mate drill to deliver mate', () => {
    const goal = goalFor(base({ bestScore: { kind: 'mate', value: 1 } }));
    expect(goal.kind).toBe('mate');
    const start = fromFen('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
    expect(goalReached(goal, start, playUci(start, 'd1d8')!, 1)).toBe(true);
  });

  it('asks a defensive drill to hold for three moves', () => {
    const goal = goalFor(base({ type: 'replay', fen: FORK, line: ['g2g3'] }));
    expect(goal).toEqual({ kind: 'hold', moves: 3 });
    expect(goalReached(goal, fromFen(FORK), fromFen(FORK), 2)).toBe(false);
    expect(goalReached(goal, fromFen(FORK), fromFen(FORK), 3)).toBe(true);
  });
});
