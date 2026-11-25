import { describe, expect, it } from 'vitest';
import { accepted, promptFor } from './coachModel';

const sheet = `b5 is a blunder: it costs about 1.1 pawns.
Why: Your pawn on b5 can be taken by my bishop for free.
Patterns: a hanging piece.
Fact: I answer Bxb5, taking your pawn on b5.`;

describe('coach model', () => {
  it('prompts in the trained form, without a system prompt', () => {
    expect(promptFor('notes')).toBe('<|im_start|>user\nnotes<|im_end|>\n<|im_start|>assistant\n');
  });

  it('accepts a faithful text and refuses one with a fact not in the notes', () => {
    const good =
      'Pawn to b5 leaves your pawn hanging: my bishop takes it for free. I answer bishop takes b5.';
    expect(accepted(sheet, `  ${good}\n`)).toBe(good);
    expect(accepted(sheet, 'Pawn to b5 lets my knight take your rook on a8.')).toBeUndefined();
    expect(accepted(sheet, '')).toBeUndefined();
  });
});
