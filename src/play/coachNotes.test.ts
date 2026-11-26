import { describe, expect, it } from 'vitest';
import { fromFen } from '../detectors/board';
import { checkCoachText, coachNotes, coachVoice } from './coachNotes';
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
    expect(
      coachVoice(
        'Your pawn now attacks my queen on a4. You have to: anything else loses about 2.4 pawns.',
      ),
    ).toBe("Your pawn now attacks your opponent's queen on a4. It is the only good move here.");
  });

  it('rejects "for free" when the player gets something back', () => {
    const notes = `Your move: a6. Verdict: a blunder.
What happens next:
- Your opponent's knight takes your bishop on e6.
- Your pawn takes your opponent's queen on a4.
Result: you lose a bishop (3 points) and a queen (9 points) and you win a queen (9 points) and a knight (3 points), so it is an even trade.`;
    expect(
      checkCoachText(notes, 'Pawn to a6 lets your opponent take your bishop for free.'),
    ).toContain('claim: for free');
  });

  it("rejects a text that misnames the player's move, misses the mate or swaps an owner", () => {
    const notes = `Your move: Nf6. Verdict: a blunder.
Patterns: a forced mate.
Why: Your pawn on f7 was already attacked by your opponent's pawn, and this move does not save it.
What happens next:
- Your knight now attacks your opponent's queen on h5.
- Your opponent plays Qxf7#. Checkmate.
Result: your opponent gives checkmate.`;
    const good =
      "Knight to f6 does not save your pawn on f7. Your opponent's queen on h5 takes it with checkmate.";
    expect(checkCoachText(notes, good)).toEqual([]);
    expect(checkCoachText(notes, good.replace('f6', 'g6'))).toContain('move: yours, knight to f6');
    expect(checkCoachText(notes, good.replace('with checkmate', 'with check'))).toContain(
      'mate: not said',
    );
    expect(
      checkCoachText(notes, good.replace('your pawn on f7', "your opponent's pawn on f7")),
    ).toContain("owner: your opponent's pawn on f7");
  });
});
