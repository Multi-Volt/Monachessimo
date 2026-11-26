import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import type { Role } from 'chessops/types';
import { makeSquare, opposite } from 'chessops/util';
import { pvToSan } from '../chess/san';
import { isCapture, normalMove, playUci, see } from '../detectors/board';
import { toCp, winningChances, type Score } from '../engine/eval';
import type { Line } from '../engine/uci';
import { features } from '../strategy/features';
import type { Verdict } from './coach';
import { moveWords } from '../chess/words';

export type PraiseLabel = 'brilliant' | 'great' | 'best' | 'excellent' | 'good';

export const PRAISE_LABEL: Record<PraiseLabel, string> = {
  brilliant: 'Brilliant',
  great: 'Great move',
  best: 'Best move',
  excellent: 'Excellent',
  good: 'Good',
};

export const PRAISE_SYMBOL: Record<PraiseLabel, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '✓',
  good: '✓',
};

export interface Praise {
  label: PraiseLabel;
  headline: string;
  points: string[];
}

const VALUE: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
/** Centipawns a move may lose and still count as excellent. */
const EXCELLENT_CP = 20;
/** How much worse the second choice must be for the move to be the only good one. */
const ONLY_MOVE_CP = 150;
const MINOR_HOME: Record<Chess['turn'], number[]> = {
  white: [1, 2, 5, 6],
  black: [57, 58, 61, 62],
};

/**
 * Names what a good move does, from engine output and counted board facts,
 * with labels close to the ones players know from Chess.com:
 * brilliant is a near-best sacrifice, great is the only good move, best is
 * the engine's first choice, excellent and good lose under 0.2 and 0.4 pawns.
 */
export function praiseMove(args: {
  before: Chess;
  uci: string;
  lines: Line[];
  played: Score;
  verdict: Verdict;
}): Praise | undefined {
  const { before, uci, lines, played, verdict } = args;
  if (verdict.class) return undefined;
  const me = before.turn;
  const after = playUci(before, uci);
  const m = normalMove(uci);
  if (!after || !m) return undefined;
  const san = pvToSan(makeFen(before.toSetup()), [uci], 1)[0] ?? uci;
  const isBest = lines[0]?.pv[0] === uci;
  const nearBest = isBest || verdict.cpLoss <= EXCELLENT_CP;

  // A piece left where the opponent wins material by taking it.
  const taken = isCapture(before, m) ? VALUE[before.board.getRole(m.to) ?? 'pawn'] : 0;
  const offered = !after.isCheckmate() && see(after, m.to, opposite(me)) > taken;
  const holding = winningChances(played) > -0.1;
  const second = lines.find((l) => l.pv[0] !== uci);
  const onlyMove =
    nearBest && second !== undefined && toCp(played) - toCp(second.score) >= ONLY_MOVE_CP;

  const label: PraiseLabel =
    nearBest && offered && holding
      ? 'brilliant'
      : onlyMove
        ? 'great'
        : isBest
          ? 'best'
          : verdict.cpLoss <= EXCELLENT_CP
            ? 'excellent'
            : 'good';

  const points: string[] = [];
  if (after.isCheckmate()) points.push('Checkmate.');
  else if (played.kind === 'mate' && played.value > 0)
    points.push(`It forces mate in ${played.value}.`);
  if (label === 'brilliant') {
    const role = after.board.getRole(m.to)!;
    points.push(
      `It offers your ${role} on ${makeSquare(m.to)}. Taking it costs your opponent more than the ${role} is worth.`,
    );
  }
  if (label === 'great' && second)
    points.push(
      `It is the only good move here. The next best choice is about ${((toCp(played) - toCp(second.score)) / 100).toFixed(1)} pawns worse.`,
    );
  if (taken && !offered) {
    const role = before.board.getRole(m.to) ?? 'pawn';
    points.push(`It wins a ${role} safely.`);
  }
  if (after.isCheck() && !after.isCheckmate()) points.push('It gives check.');
  const king = before.board.kingOf(me);
  if (king === m.from && Math.abs(m.to - m.from) === 2)
    points.push('Your king is castled and safer.');
  else if (
    MINOR_HOME[me].includes(m.from) &&
    before.board.getRole(m.from) !== 'pawn' &&
    ['knight', 'bishop'].includes(before.board.getRole(m.from)!)
  )
    points.push(`It develops your ${before.board.getRole(m.from)}.`);
  const f0 = features(before, me);
  const f1 = features(after, me);
  if (f1.passedPawns > f0.passedPawns) points.push('It creates a passed pawn.');
  if (f1.rooksOnOpenFiles > f0.rooksOnOpenFiles) points.push('Your rook takes an open file.');
  if (f1.outposts > f0.outposts) points.push('Your piece lands on an outpost.');
  if (f1.mobility - f0.mobility >= 6)
    points.push(`Your pieces reach ${f1.mobility - f0.mobility} more squares.`);
  if (f1.centerControl - f0.centerControl >= 2) points.push('It takes more control of the center.');

  const words = moveWords(san);
  const headline =
    label === 'good'
      ? `${words} is good, but there was a slightly better move.`
      : label === 'excellent'
        ? `${words} is excellent, almost as strong as the best move.`
        : label === 'best'
          ? `${words} is the engine's first choice.`
          : label === 'great'
            ? `${words} is a great move.`
            : `${words} is brilliant.`;
  return { label, headline, points: points.slice(0, 3) };
}
