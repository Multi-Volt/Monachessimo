import { describe, expect, it } from 'vitest';
import { fromFen } from '../detectors/board';
import type { SearchRequest, SearchResult } from '../engine/engine';
import { enrichLine, narrateLine } from './narrate';

describe('narrateLine', () => {
  it('names captures, recaptures and the material after them', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4?: Black is the player.
    const start = fromFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3');
    const steps = narrateLine(start, ['c6d4', 'f3e5', 'd8g5', 'e5f7', 'g5g2'], 'black');
    expect(steps.map((s) => s.kind)).toEqual(['quiet', 'capture', 'threat', 'capture', 'capture']);
    expect(steps[1]!.text).toBe('My knight takes your pawn on e5.');
    expect(steps[2]!.text).toMatch(/^Your queen now attacks my /);
  });

  it('marks checks, recaptures and mate', () => {
    const start = fromFen('6k1/p4ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1');
    const steps = narrateLine(start, ['a7a6', 'd1d8'], 'black');
    expect(steps[1]).toMatchObject({ kind: 'mate', text: 'Rd8#. Checkmate.' });
    const trade = fromFen('2rr2k1/8/8/8/8/8/8/3R2K1 w - - 0 1');
    const t = narrateLine(trade, ['d1d8', 'c8d8'], 'black');
    expect(t[0]).toMatchObject({
      kind: 'capture',
      text: 'My rook takes your rook on d8, with check.',
    });
    expect(t[1]).toMatchObject({
      kind: 'recapture',
      text: 'You take back on d8, and you are 5 up.',
    });
    // Taking a piece that just moved is a capture, not a recapture.
    const b5 = fromFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
    expect(narrateLine(b5, ['b7b5', 'f1b5'], 'black')[1]!.text).toBe(
      'My bishop takes your pawn on b5.',
    );
    const check = narrateLine(fromFen('6k1/8/8/8/8/8/8/3R2K1 w - - 0 1'), ['d1d8'], 'black');
    expect(check[0]!.kind).toBe('check');
  });
});

describe('enrichLine', () => {
  it('calls a player move forced when the second choice is much worse', async () => {
    const start = fromFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    const steps = narrateLine(start, ['e1d2'], 'white');
    const search = async (r: SearchRequest): Promise<SearchResult> =>
      ({
        bestmove: 'e1d2',
        lines: [
          { multipv: 1, depth: 10, score: { kind: 'cp', value: 0 }, pv: ['e1d2'] },
          { multipv: 2, depth: 10, score: { kind: 'cp', value: -900 }, pv: ['e1f1'] },
        ],
        ...(r.multipv ? {} : {}),
      }) as SearchResult;
    const out = await enrichLine(start, ['e1d2'], steps, search);
    expect(out[0]!.kind).toBe('forced');
    expect(out[0]!.text).toContain('You have to');
  });
});
