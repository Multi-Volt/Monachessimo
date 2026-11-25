import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import type { Role, Square } from 'chessops/types';
import { makeSquare, opposite } from 'chessops/util';
import { pvToSan } from '../chess/san';
import { attacksFrom, balance, isCapture, normalMove, playLine } from '../detectors/board';
import { kingZone, worseNotes, type FeatureNote } from '../strategy/details';
import type { Mark } from './cause';

export interface LongTermReason {
  kind: 'material' | 'plan' | 'feature' | 'unknown';
  text: string;
  marks: Mark[];
}

/** Plies of each line to compare: long enough to see a plan, short enough to trust. */
export const REASON_PLIES = 14;

/** Feature notes from most to least serious, for choosing one. */
const NOTE_ORDER: FeatureNote['key'][] = [
  'openFileNearKing',
  'enemyPassedPawn',
  'isolatedPawn',
  'badBishop',
  'enemyOutpost',
  'backwardPawn',
  'doubledPawns',
];

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * Chooses one long-term reason why the played line is worse than the best
 * line, both from the same start position. `played` starts with the
 * player's move. Material first, then a plan read from the engine's own
 * moves, then the feature that got worse, and otherwise an honest "unknown".
 */
export function longTermReason(
  start: Chess,
  me: Chess['turn'],
  played: readonly string[],
  best: readonly string[],
): LongTermReason {
  const them = opposite(me);
  const n = Math.min(REASON_PLIES, played.length, Math.max(best.length, 1));
  const pLine = playLine(start, played.slice(0, n));
  const bLine = playLine(start, best.slice(0, n));
  const pEnd = pLine.at(-1)!;
  const bEnd = bLine.at(-1)!;
  const moves = pLine.length - 1;

  // 1. Material.
  const diff = balance(pEnd, me) - balance(bEnd, me);
  if (diff < 0)
    return {
      kind: 'material',
      text: `${moves} moves later you have ${plural(-diff, 'pawn')} less material than after a better move.`,
      marks: [],
    };

  // 2. A plan: the opponent's pieces converge on one square or on the king.
  const sans = pvToSan(makeFen(start.toSetup()), played.slice(0, n), n);
  const onSquare = new Map<Square, number[]>();
  const onKing: number[] = [];
  for (let i = 0; i + 1 < pLine.length; i++) {
    const pos = pLine[i]!;
    if (pos.turn !== them) continue;
    const after = pLine[i + 1]!;
    const m = normalMove(played[i])!;
    const hits = attacksFrom(after, m.to);
    if (!hits.intersect(kingZone(after, me)).isEmpty() || after.isCheck()) onKing.push(i);
    for (const sq of hits.intersect(after.board[me])) {
      if (after.board.getRole(sq) === 'king') continue;
      onSquare.set(sq, [...(onSquare.get(sq) ?? []), i]);
    }
  }
  const arrows = (idx: number[]) =>
    idx.map((i) => {
      const m = normalMove(played[i])!;
      return { orig: makeSquare(m.from), dest: makeSquare(m.to), brush: 'red' as const };
    });
  if (onKing.length >= 3 || (onKing.length >= 2 && (pEnd.isCheckmate() || pEnd.isCheck()))) {
    const end = pEnd.isCheckmate()
      ? ', and it ends in checkmate'
      : pEnd.isCheck()
        ? ', ending with check'
        : '';
    return {
      kind: 'plan',
      text: `My pieces head for your king: ${onKing.map((i) => sans[i]).join(', ')}${end}.`,
      marks: arrows(onKing),
    };
  }
  for (const [sq, idx] of onSquare) {
    if (idx.length < 2) continue;
    // The plan must end in a gain there: a capture on that square later in the line.
    const won = played.slice(0, n).some((u, i) => {
      const m = normalMove(u);
      return pLine[i]!.turn === them && m?.to === sq && isCapture(pLine[i]!, m);
    });
    if (!won) continue;
    const role = pLine[idx[0]! + 1]!.board.getRole(sq) as Role;
    return {
      kind: 'plan',
      text: `My pieces gang up on your ${role} on ${makeSquare(sq)} with ${idx.map((i) => sans[i]).join(' and ')}, and win it.`,
      marks: [...arrows(idx), { orig: makeSquare(sq), brush: 'red' }],
    };
  }

  // 3. The feature that got worst, only if the two lines differ in it.
  const notes = worseNotes(bEnd, pEnd, me).sort(
    (a, b) => NOTE_ORDER.indexOf(a.key) - NOTE_ORDER.indexOf(b.key),
  );
  const note = notes[0];
  if (note) {
    const marks: Mark[] = /^[a-h][1-8]$/.test(note.where)
      ? [{ orig: note.where, brush: 'red' }]
      : [];
    return { kind: 'feature', text: note.text, marks };
  }

  // 4. Nothing measured explains it.
  return {
    kind: 'unknown',
    text: 'The engine sees a long-term problem it cannot put into one reason here.',
    marks: [],
  };
}
