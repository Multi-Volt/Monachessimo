import { describe, expect, it } from 'vitest';
import { checkPhrasing } from './phrasing';

const sheet = [
  'Bg5 is a blunder: it costs about 3.1 pawns.',
  'Why: Your bishop on g5 can be taken by my pawn for free.',
  'What happens next:',
  '- You play Bg5.',
  '- My pawn takes your bishop on g5.',
  'Long term: 6 moves later you have 3 pawns less material than after a better move.',
].join('\n');

describe('phrasing check', () => {
  it('passes a text that uses only the facts', () => {
    const text =
      'Bishop to g5 puts your bishop where my pawn can take it for free. After pawn takes g5 you are three pawns down.';
    expect(checkPhrasing(sheet + '\n- I play hxg5.', text)).toEqual([]);
  });

  it('wants moves in words, not notation', () => {
    expect(checkPhrasing(sheet, 'Bg5 puts your bishop on g5. My pawn takes it for free.')).toEqual([
      'notation: Bg5',
    ]);
  });

  it('flags a square, move, piece, number or pattern not in the facts', () => {
    const text = 'Your knight on f3 is lost to Qxf3, a fork. You lose 5 pawns.';
    expect(checkPhrasing(sheet, text)).toEqual(
      expect.arrayContaining([
        'sans: Qxf3',
        'squares: f3',
        'numbers: 5',
        'pieces: knight',
        'pieces: queen',
        'patterns: fork',
      ]),
    );
  });

  it('flags a piece given to the wrong side', () => {
    const notes = [
      'Nh6 is a blunder: it costs about 1.9 pawns.',
      'What happens next:',
      '- You play Nh6.',
      '- I play h4, threatening Bg5.',
      '- Now my pawn attacks your bishop on g4.',
    ].join('\n');
    expect(
      checkPhrasing(notes, 'Knight to h6 lets me play pawn to h4. I threaten bishop to g5.'),
    ).toEqual([]);
    expect(
      checkPhrasing(
        notes,
        'Knight to h6 lets me play pawn to h4. That threatens your bishop on g5.',
      ),
    ).toContain('owner: your bishop g5');
    expect(
      checkPhrasing(notes, 'Knight to h6 lets me play pawn to h4. Your queen is in danger.'),
    ).toEqual(expect.arrayContaining(['owner: your queen']));
    expect(
      checkPhrasing(
        notes,
        'Knight to h6 lets me play pawn to h4. Sixteen moves later you are worse.',
      ),
    ).toContain('numbers: 16');
  });

  it('counts O-O as castling', () => {
    const notes =
      'O-O is an inaccuracy: it costs about 0.6 pawns.\nWhat happens next:\n- You play O-O.';
    expect(checkPhrasing(notes, 'Castling here is an inaccuracy. It costs you a little.')).toEqual(
      [],
    );
  });

  it('flags the copy rules', () => {
    expect(checkPhrasing(sheet, 'Bg5 loses the bishop — badly! Great.')).toEqual(
      expect.arrayContaining(['dash', 'exclamation mark', 'filler: great']),
    );
    expect(checkPhrasing(sheet, 'Bg5 loses the bishop.')).toContain('1 sentences');
  });
});
