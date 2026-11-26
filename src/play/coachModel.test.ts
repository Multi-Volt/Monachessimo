import { describe, expect, it } from 'vitest';
import { accepted, promptFor } from './coachModel';

const notes = `Your move: Bg5. Verdict: a blunder.
Why: Your bishop on g5 can be taken by your opponent's knight for free.
Patterns: a hanging piece.
What happens next:
- You play Bg5.
- Your opponent's knight takes your bishop on g5.
Result: you lose a bishop (3 points), so you are 3 points down.
Where it leaves you: you were even in material, and now you are 3 points behind.`;

describe('coach model', () => {
  it('prompts in the trained form, without a system prompt', () => {
    expect(promptFor('notes')).toBe('<|im_start|>user\nnotes<|im_end|>\n<|im_start|>assistant\n');
  });

  it('accepts a faithful text and refuses one with a fact not in the notes', () => {
    const good =
      "Bishop to g5 leaves your bishop hanging, so your opponent's knight takes it for free. You go from even to 3 points behind.";
    expect(accepted(notes, `  ${good}\n`)).toBe(good);
    expect(
      accepted(
        notes,
        "Bishop to g5 lets your opponent's knight take your rook on a8. You are 5 points behind.",
      ),
    ).toBeUndefined();
    expect(accepted(notes, '')).toBeUndefined();
  });
});
