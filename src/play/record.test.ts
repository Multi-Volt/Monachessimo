import { describe, expect, it } from 'vitest';
import { fromFen } from '../detectors/board';
import { judgeMove } from './coach';
import { explainMove } from './explain';
import { narrateLine } from './narrate';
import { longTermReason } from './reason';
import { buildRecord, RECORD_VERSION, toJsonl, withLine } from './record';

// White's knight on f3 guards e5; Ng5 leaves it to the bishop.
const FEN = '7k/8/3b4/4P3/8/5N2/8/7K w - - 0 1';

function make() {
  const before = fromFen(FEN);
  const best = { kind: 'cp' as const, value: 100 };
  const played = { kind: 'cp' as const, value: -50 };
  const verdict = judgeMove(best, played);
  const reply = ['d6e5'];
  const explanation = explainMove({
    before,
    uci: 'f3g5',
    reply,
    lines: [],
    best,
    played,
    verdict,
    ply: 0,
  });
  return {
    before,
    reply,
    record: buildRecord({ before, uci: 'f3g5', reply, verdict, explanation }),
  };
}

describe('explanation record', () => {
  it('holds the verdict, cause, marks and sentences as plain data', () => {
    const { record } = make();
    expect(record.version).toBe(RECORD_VERSION);
    expect(record.fen).toBe(FEN);
    expect(record.side).toBe('white');
    expect(record.move).toEqual({ uci: 'f3g5', san: 'Ng5' });
    expect(record.verdict.cost).toBe(150);
    expect(record.cause?.kind).toBe('defenderLeft');
    expect(record.sentences.cause).toBe(
      "Your knight was guarding the pawn on e5. Now your opponent's bishop can take it.",
    );
    expect(record.sentences.points[0]).toBe(record.sentences.cause);
    expect(record.marks).toContainEqual({ orig: 'e5', brush: 'red' });
    expect(record.line).toEqual([]);
    // It survives a JSON round trip unchanged.
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });

  it('takes the narrated line and the long-term reason later', () => {
    const { before, reply, record } = make();
    const line = narrateLine(before, ['f3g5', ...reply], 'white');
    const reason = longTermReason(before, 'white', ['f3g5', ...reply], ['h1g1', 'h8g8']);
    const full = withLine(record, line, reason);
    expect(full.line).toHaveLength(2);
    expect(full.reason?.kind).toBe('material');
    expect(full.sentences.reason).toBe(reason.text);
    expect(record.line).toEqual([]);
  });

  it('exports one JSON line per record', () => {
    const { record } = make();
    const text = toJsonl([record, record]);
    expect(text.split('\n')).toHaveLength(3);
    expect(JSON.parse(text.split('\n')[0]!)).toEqual(record);
    expect(toJsonl([])).toBe('');
  });
});
