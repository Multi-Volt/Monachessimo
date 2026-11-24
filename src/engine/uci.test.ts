import { describe, expect, it } from 'vitest';
import { parseBestMove, parseInfo, positionKey } from './uci';
import { searchKey } from './engine';
import { defaultPoolSize } from './pool';

describe('parseInfo', () => {
  it('reads depth, multipv, score and pv', () => {
    expect(
      parseInfo(
        'info depth 12 seldepth 18 multipv 2 score cp -34 nodes 1000 nps 50000 hashfull 3 time 20 pv e7e5 g1f3 b8c6',
      ),
    ).toEqual({
      depth: 12,
      multipv: 2,
      score: { kind: 'cp', value: -34 },
      pv: ['e7e5', 'g1f3', 'b8c6'],
    });
  });

  it('reads mate scores and bounds', () => {
    expect(parseInfo('info depth 5 score mate -2 pv h7h8')?.score).toEqual({
      kind: 'mate',
      value: -2,
    });
    expect(parseInfo('info depth 9 score cp 40 lowerbound nodes 1 pv e2e4')?.bound).toBe('lower');
  });

  it('ignores lines without a pv or with a string payload', () => {
    expect(parseInfo('info depth 1 currmove e2e4 currmovenumber 1')).toBeUndefined();
    expect(parseInfo('info string NNUE evaluation using nn.nnue')).toBeUndefined();
    expect(parseInfo('readyok')).toBeUndefined();
  });
});

describe('parseBestMove', () => {
  it('reads the move and handles (none)', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('info depth 1')).toBeUndefined();
  });
});

describe('cache keys', () => {
  it('ignore move counters', () => {
    expect(positionKey('8/8/8/8/8/8/8/K1k5 w - - 12 40')).toBe('8/8/8/8/8/8/8/K1k5 w - -');
    expect(searchKey({ fen: 'x w - - 0 1', depth: 12 })).toBe(
      searchKey({ fen: 'x w - - 5 9', depth: 12 }),
    );
    expect(searchKey({ fen: 'x w - - 0 1', depth: 12 })).not.toBe(
      searchKey({ fen: 'x w - - 0 1', depth: 18 }),
    );
  });
});

describe('defaultPoolSize', () => {
  it('uses spare cores, between one and four', () => {
    expect(defaultPoolSize(1)).toBe(1);
    expect(defaultPoolSize(2)).toBe(1);
    expect(defaultPoolSize(4)).toBe(3);
    expect(defaultPoolSize(16)).toBe(4);
  });
});
