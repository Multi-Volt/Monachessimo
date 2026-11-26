// The coach's voice for sentences written as the opponent ("my knight"),
// and the notes with their moves in words. Kept apart from the notes, which
// load with the model, so the screens can use them.
import { sanWords } from '../chess/words';

/** A sentence from the narrated line, moved from the opponent's voice to the coach's. */
export function coachVoice(text: string): string {
  return text
    .replace(/, and (?:you are \d+ pawns? (?:up|down)|material is even)/g, '')
    .replace(
      / You have to: anything else loses (?:far more|about \d+(?:\.\d+)? pawns?)\./g,
      ' It is the only good move here.',
    )
    .replace(/\bI take back\b/g, 'Your opponent takes back')
    .replace(/\bI play\b/g, 'Your opponent plays')
    .replace(/\bI answer\b/g, 'Your opponent answers')
    .replace(/\bMy\b/g, "Your opponent's")
    .replace(/\bmy\b/g, "your opponent's")
    .replace(/^I\b/g, 'Your opponent')
    .replace(/\bI\b/g, 'your opponent')
    .replace(/\bme\b/g, 'your opponent');
}

const SAN = String.raw`O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?`;

/**
 * Notes with every move in words, for the writer: "You play Qxd5." becomes
 * "You play queen takes d5." Notation stands only after these phrases, so
 * squares ("on d5") are left alone. The checker reads the notes with the
 * notation, which keeps the exact moves.
 */
export function spellMoves(notes: string): string {
  return notes.replace(
    new RegExp(
      String.raw`(Your move: |You play |[Yy]our opponent plays |threatening |threatened )(${SAN})(?=[ ,.]|$)(\. Checkmate\.|, and you give checkmate\.)?`,
      'gm',
    ),
    (_, lead: string, san: string, mate: string | undefined) => {
      const words = sanWords(san, !!mate);
      // "You play castles" reads as "You castle".
      if (words.startsWith('castles') && /play |plays /.test(lead))
        return `${lead.replace(/ plays? $/, '')} ${lead.startsWith('You play') ? 'castle' : 'castles'}${words.slice(7)}${mate ?? ''}`;
      return `${lead}${words}${mate ?? ''}`;
    },
  );
}
