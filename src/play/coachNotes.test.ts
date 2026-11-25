import { describe, expect, it } from 'vitest';
import { fromFen } from '../detectors/board';
import { coachNotes, coachVoice } from './coachNotes';
import { judgeMove } from './coach';
import { explainMove } from './explain';
import { narrateLine } from './narrate';
import { buildRecord, withLine } from './record';

function notes(fen: string, uci: string, reply: string[], best: number, played: number) {
  const before = fromFen(fen);
  const verdict = judgeMove({ kind: 'cp', value: best }, { kind: 'cp', value: played });
  const explanation = explainMove({
    before,
    uci,
    reply,
    lines: [],
    best: { kind: 'cp', value: best },
    played: { kind: 'cp', value: played },
    verdict,
    ply: 0,
  });
  const rec = buildRecord({ before, uci, reply, verdict, explanation });
  return coachNotes(withLine(rec, narrateLine(before, [uci, ...reply], before.turn)));
}

describe('coach notes', () => {
  it('works out a lost piece in points and where it leaves the player', () => {
    // White's knight on f3 guards e5; Ng5 leaves the pawn to the bishop.
    const n = notes('7k/8/3b4/4P3/8/5N2/8/7K w - - 0 1', 'f3g5', ['d6e5'], 100, -50);
    expect(n).toContain('Your move: Ng5.');
    expect(n).toContain('Result: you lose a pawn (1 point), so you are 1 point down.');
    expect(n).toContain('you were 1 point ahead, and now you are even in material.');
    expect(n).not.toMatch(/\bmy\b|\bI\b/);
  });

  it('follows a trade to the recapture and calls it even', () => {
    // Rxd8+ Rxd8: the rooks come off, and the engine still dislikes it.
    const n = notes('r2r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8', ['a8d8'], 100, -100);
    expect(n).toContain('Your move: Rxd8+.');
    expect(n).toContain('so it is an even trade.');
    expect(n).toContain('material stays level for now, but your position gets much harder.');
  });

  it('gives a plain verdict when nothing a beginner can see goes wrong', () => {
    const n = notes('7k/8/8/8/8/8/P7/K7 w - - 0 1', 'a2a3', ['h8g8'], 60, 0);
    expect(n).toContain("Coach's take: the move is okay, just not the best");
  });

  it('moves the narration from the opponent to the coach beside the player', () => {
    expect(coachVoice('My knight takes your rook on b4, and you are 2 pawns down.')).toBe(
      "Your opponent's knight takes your rook on b4.",
    );
    expect(coachVoice('I play Kd6, threatening b4.')).toBe(
      'Your opponent plays Kd6, threatening b4.',
    );
  });
});
