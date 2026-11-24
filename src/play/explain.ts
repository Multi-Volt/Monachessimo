import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSquare } from 'chessops/util';
import { pvToSan } from '../chess/san';
import { balance, isCapture, normalMove, playLine, playUci } from '../detectors/board';
import { tagMove, type TagName } from '../detectors';
import type { Score } from '../engine/eval';
import type { Line } from '../engine/uci';
import { TAG_INFO } from '../profile/labels';
import type { Verdict } from './coach';

/** Tags that describe what went wrong on the board, as opposed to when. */
const PATTERN_TAGS: TagName[] = [
  'hangingPiece',
  'trappedPiece',
  'forkAllowed',
  'pinAllowed',
  'skewerAllowed',
  'discoveredAttack',
  'backRank',
  'mateAllowed',
  'missedCapture',
  'forkMissed',
  'pinMissed',
  'skewerMissed',
  'mateMissed',
  'kingSafety',
  'pawnStructure',
  'pieceActivity',
];

export interface MoveExplanation {
  /** Sentences of measured facts, in reading order. */
  reasons: string[];
  /** Patterns the move matched, for the game summary and the profile. */
  tags: TagName[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Explains a move from facts: what the opponent's best answer does, how
 * much material it costs, which patterns it matches, and the cost in pawns.
 * Never names the player's better move.
 */
export function explainMove(args: {
  before: Chess;
  uci: string;
  /** The opponent's best line after the move, in UCI. */
  reply: string[];
  lines: Line[];
  best: Score;
  played: Score;
  verdict: Verdict;
  ply: number;
}): MoveExplanation {
  const { before, uci, reply, verdict } = args;
  const me = before.turn;
  const after = playUci(before, uci);
  const reasons: string[] = [];
  if (!after) return { reasons, tags: [] };

  // The opponent's answer and what it wins.
  const replySan = reply.length ? pvToSan(fenOf(after), reply, 4) : [];
  const first = normalMove(reply[0]);
  if (args.played.kind === 'mate' && args.played.value < 0) {
    reasons.push(`It allows mate in ${-args.played.value}, starting with ${replySan[0]}.`);
  } else if (first && replySan[0]) {
    const line = playLine(after, reply, 4);
    const start = balance(before, me);
    // Material after each of the opponent's moves in its line.
    const losses = [1, 3].filter((i) => line[i]).map((i) => start - balance(line[i]!, me));
    const loss = Math.max(0, ...losses);
    if (isCapture(after, first)) {
      const role = after.board.getRole(first.to) ?? 'pawn';
      reasons.push(
        `Your opponent's best answer is ${replySan[0]}, which takes your ${role} on ${makeSquare(first.to)}.`,
      );
    } else {
      reasons.push(`Your opponent's best answer is ${replySan[0]}.`);
    }
    if (loss >= 1)
      reasons.push(`Within two moves you are ${plural(loss, 'pawn')} of material down.`);
  }

  // Patterns from the detectors.
  let tags: TagName[];
  try {
    tags = tagMove({
      ply: args.ply,
      mover: me,
      before,
      played: uci,
      playedPv: [uci, ...reply],
      lines: args.lines,
      bestScore: args.best,
      playedScore: args.played,
      drop: verdict.drop,
      class: verdict.class ?? 'inaccuracy',
    }).filter((t) => PATTERN_TAGS.includes(t));
  } catch {
    tags = [];
  }
  // When material is lost, the tactic is the lesson; structure and activity
  // changes are side effects of losing the piece or pawn.
  if (reasons.some((r) => r.includes('which takes your') || r.includes('material down')))
    tags = tags.filter((t) => t !== 'pawnStructure' && t !== 'pieceActivity');
  for (const t of tags.slice(0, 2)) reasons.push(`Pattern: you ${TAG_INFO[t].summary}.`);

  if (verdict.cpLoss >= 1000) reasons.push('It turns the game around.');
  else if (verdict.cpLoss > 0)
    reasons.push(`It costs about ${(verdict.cpLoss / 100).toFixed(1)} pawns.`);
  return { reasons, tags };
}

function fenOf(pos: Chess): string {
  return makeFen(pos.toSetup());
}
