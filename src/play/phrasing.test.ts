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

  it('flags a capture told as a plain move, or a move given to the wrong side', () => {
    const notes = [
      'Ne7 is a mistake: it costs about 1.3 pawns.',
      'Fact: This move ignores my threat of e5.',
      'What happens next:',
      '- You play Ne7.',
      '- Your pawn takes my pawn on e5.',
      '- I take back on e5, and material is even.',
    ].join('\n');
    const good =
      'Knight to e7 ignores my threat of pawn to e5. Your pawn takes e5, and I take back.';
    expect(checkPhrasing(notes, good)).toEqual([]);
    expect(
      checkPhrasing(
        notes,
        'Knight to e7 ignores my threat. After you play pawn to e5, I take back.',
      ),
    ).toContain('move: your pawn to e5');
    // A capture may be told as "to e5, taking your pawn".
    expect(
      checkPhrasing(notes, 'Knight to e7 is a mistake. I play pawn to e5, taking nothing yet.'),
    ).toEqual([]);
  });

  it('flags a forced move turned around and check signs read as words', () => {
    expect(
      checkPhrasing(sheet, 'Bishop to g5 is a blunder. You have to play something else.'),
    ).toContain('forced: inverted');
    expect(checkPhrasing(sheet, 'Bishop to g5 is a blunder. My pawn takes g5 plus.')).toContain(
      'notation: sign in words',
    );
  });

  it('reads mates, promotions and pawn moves in the notes as facts', () => {
    const notes =
      'b8=Q is a blunder: it costs about 5.5 pawns.\nWhat happens next:\n- I play h5, threatening Qg7#.';
    expect(
      checkPhrasing(
        notes,
        'Promoting is a blunder here. My pawn goes to h5, threatening checkmate.',
      ),
    ).toEqual([]);
  });

  it('flags the copy rules', () => {
    expect(checkPhrasing(sheet, 'Bg5 loses the bishop — badly! Great.')).toEqual(
      expect.arrayContaining(['dash', 'exclamation mark', 'filler: great']),
    );
    expect(checkPhrasing(sheet, 'Bg5 loses the bishop.')).toContain('1 sentences');
  });
});
