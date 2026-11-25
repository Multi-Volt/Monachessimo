import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import type { Role, Square } from 'chessops/types';
import { makeSquare, opposite } from 'chessops/util';
import { pvToSan } from '../chess/san';
import {
  attacksFrom,
  balance,
  fromFen,
  isCapture,
  normalMove,
  playLine,
  playUci,
  see,
} from '../detectors/board';
import { describeChanges } from '../strategy/explain';
import { worseNotes } from '../strategy/details';
import { causeText, findCause, type Cause } from './cause';
import { nullMoveFen, type Threat } from '../engine/threat';
import { features } from '../strategy/features';
import { tagMove, type TagName } from '../detectors';
import type { Score } from '../engine/eval';
import type { Line } from '../engine/uci';
import { withArticle, type Verdict } from './coach';

/** Tags that describe a tactic: when one is present, it is the lesson. */
const TACTICAL: TagName[] = [
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
];
/** Tags that describe a lasting change, used when no tactic explains the move. */
const POSITIONAL: TagName[] = ['kingSafety', 'pawnStructure', 'pieceActivity'];

export interface MoveExplanation {
  /** One line: the move, its class and its cost. */
  headline: string;
  /** What happens, one fact per point, in reading order. */
  points: string[];
  /** Patterns the move matched, most important first. */
  tags: TagName[];
  /** Why the move allowed the loss, when one cause explains it. */
  cause?: Cause;
}

const VALUE_ORDER: Role[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];

/** "your bishop on a4", "your knight on c3 and your rook on a1". */
function listPieces(pos: Chess, squares: Square[]): string {
  const sorted = [...squares].sort(
    (a, b) =>
      VALUE_ORDER.indexOf(pos.board.getRole(a)!) - VALUE_ORDER.indexOf(pos.board.getRole(b)!),
  );
  const names = sorted.map((sq) => `your ${pos.board.getRole(sq)} on ${makeSquare(sq)}`);
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function article(role: Role): string {
  return role === 'pawn' ? 'a pawn' : `a ${role}`;
}

/** Pieces each side captures along a line, in order, as roles. */
function captures(start: Chess, line: readonly string[], me: Chess['turn']) {
  const lost: Role[] = [];
  const won: Role[] = [];
  const positions = playLine(start, line);
  for (let i = 0; i + 1 < positions.length; i++) {
    const pos = positions[i]!;
    const m = normalMove(line[i]);
    if (!m || !isCapture(pos, m)) continue;
    const role = pos.board.getRole(m.to) ?? 'pawn';
    if (pos.turn === me) won.push(role);
    else lost.push(role);
  }
  return { lost, won };
}

/**
 * Explains a move from facts: the cost, what the opponent's best answer
 * attacks, what changes hands in the line that follows, and the patterns
 * it matches. Never names the player's better move.
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
  /** The opponent's threat before the move, from the null-move search. */
  threat?: Threat | undefined;
}): MoveExplanation {
  const { before, uci, reply, verdict } = args;
  const me = before.turn;
  const after = playUci(before, uci);
  const san = pvToSan(makeFen(before.toSetup()), [uci], 1)[0] ?? uci;
  const cost =
    verdict.cpLoss >= 1000
      ? 'turns the game around'
      : `costs about ${(verdict.cpLoss / 100).toFixed(1)} pawns`;
  const headline = verdict.class
    ? `${san} is ${withArticle(verdict.class)}: it ${cost}.`
    : `${san} ${cost}.`;
  const points: string[] = [];
  if (!after) return { headline, points, tags: [] };

  const replySan = reply.length ? pvToSan(makeFen(after.toSetup()), reply, 6) : [];
  const first = normalMove(reply[0]);
  if (args.played.kind === 'mate' && args.played.value < 0) {
    points.push(`It allows mate in ${-args.played.value}: ${replySan.slice(0, 5).join(' ')}.`);
  } else if (first && replySan[0]) {
    const answered = playUci(after, reply[0]);
    if (isCapture(after, first)) {
      const role = after.board.getRole(first.to) ?? 'pawn';
      points.push(
        `Your opponent answers ${replySan[0]}, taking your ${role} on ${makeSquare(first.to)}.`,
      );
    } else if (answered) {
      // What the answering piece now attacks that the player stands to lose.
      const targets = [...attacksFrom(answered, first.to).intersect(answered.board[me])].filter(
        (sq) => {
          const role = answered.board.getRole(sq);
          return role !== undefined && role !== 'king' && see(answered, sq, opposite(me)) > 0;
        },
      );
      const trapped = targets.filter((sq) => {
        for (const to of answered.dests(sq)) {
          const next = answered.clone();
          next.play({ from: sq, to });
          if (see(next, to, opposite(me)) <= 0) return false;
        }
        return true;
      });
      if (trapped.length)
        points.push(
          `Your opponent answers ${replySan[0]}, attacking ${listPieces(answered, trapped)}, which has no safe square.`,
        );
      else if (targets.length)
        points.push(
          `Your opponent answers ${replySan[0]}, attacking ${listPieces(answered, targets)}.`,
        );
      else if (answered.isCheck()) points.push(`Your opponent answers ${replySan[0]}, with check.`);
      else points.push(`Your opponent's best answer is ${replySan[0]}.`);
    }
    // What changes hands in the line that follows.
    const { lost, won } = captures(after, reply.slice(0, 6), me);
    if (lost.length) {
      const lostText = lost.map(article).join(', ');
      const wonText = won.length ? `, and you win ${won.map(article).join(', ')}` : '';
      points.push(
        `In the line that follows you lose ${lostText}${wonText}: ${replySan.join(' ')}.`,
      );
    }
  }

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
    });
  } catch {
    tags = [];
  }
  // The cause comes first: it says why the move allowed what follows.
  const cause = findCause(before, uci, reply);
  if (args.threat && reply[0] === args.threat.uci && cause?.kind !== 'ignoredThreat') {
    const threatSan = pvToSan(makeFen(after.toSetup()), [reply[0]], 1)[0];
    if (threatSan) points.unshift(`This move ignores my threat of ${threatSan}.`);
  }
  if (cause) points.unshift(causeText(cause));
  const tactical = tags.filter((t) => TACTICAL.includes(t));
  // A tactic is the lesson; lasting changes only explain a move without one.
  const shown = tactical.length ? tactical : tags.filter((t) => POSITIONAL.includes(t));
  return { headline, points, tags: shown.slice(0, 3), ...(cause ? { cause } : {}) };
}

/** Plain text of an explanation, for saved drills and notes. */
export function explanationText(e: MoveExplanation): string[] {
  return [e.headline, ...e.points];
}

const MINOR_HOME: Record<Chess['turn'], number[]> = {
  white: [1, 2, 5, 6],
  black: [57, 58, 61, 62],
};

/** Knights and bishops of `color` still on their starting squares. */
function undeveloped(pos: Chess, color: Chess['turn']): number {
  const minors = pos.board.knight.union(pos.board.bishop).intersect(pos.board[color]);
  return MINOR_HOME[color].filter((sq) => minors.has(sq)).length;
}

function castled(pos: Chess, color: Chess['turn']): boolean {
  const king = pos.board.kingOf(color);
  if (king === undefined) return false;
  const home = color === 'white' ? 0 : 56;
  return king === home + 6 || king === home + 2;
}

function canCastle(pos: Chess, color: Chess['turn']): boolean {
  return [...pos.castles.castlingRights].some((sq) => (color === 'white' ? sq < 8 : sq >= 56));
}

/**
 * What is different at the end of the refuting line compared with the end of
 * the engine's line from the same position, for `me`. Counted facts only:
 * material, development, castling and the strategy features. The better move
 * itself is never named.
 */
export function compareLines(
  start: Chess,
  me: Chess['turn'],
  playedLine: readonly string[],
  bestLine: readonly string[],
): string[] {
  const played = playLine(start, playedLine).at(-1)!;
  const best = playLine(start, bestLine.slice(0, playedLine.length)).at(-1)!;
  const out: string[] = [];
  const mat = balance(played, me) - balance(best, me);
  if (mat < 0) out.push(`You have ${-mat} ${mat === -1 ? 'pawn' : 'pawns'} less material.`);
  if (mat > 0)
    out.push(
      `You have ${mat} more ${mat === 1 ? 'pawn' : 'pawns'} of material, but the position is worse.`,
    );
  const dev = undeveloped(played, me) - undeveloped(best, me);
  if (dev > 0)
    out.push(
      `${dev} more of your knights and bishops ${dev === 1 ? 'is' : 'are'} still on the starting square: ${undeveloped(played, me)} instead of ${undeveloped(best, me)}.`,
    );
  if (castled(best, me) && !castled(played, me)) out.push('Your king has not castled yet.');
  else if (canCastle(best, me) && !canCastle(played, me) && !castled(played, me))
    out.push('Your king can no longer castle.');
  const oppDev = undeveloped(best, opposite(me)) - undeveloped(played, opposite(me));
  if (oppDev > 0)
    out.push(`Your opponent has ${oppDev} more ${oppDev === 1 ? 'piece' : 'pieces'} developed.`);
  // Features with their squares and long-term cost, then the counted
  // changes that no named note covers.
  const notes = worseNotes(best, played, me);
  const named = new Set(notes.map((n) => n.key));
  const covered = (t: string) =>
    (named.has('isolatedPawn') && t.includes('isolated')) ||
    (named.has('doubledPawns') && t.includes('doubled')) ||
    (named.has('backwardPawn') && t.includes('backward')) ||
    (named.has('openFileNearKing') && /files? beside your king/.test(t));
  out.push(...notes.map((n) => n.text));
  out.push(...describeChanges(features(best, me), features(played, me)).filter((t) => !covered(t)));
  return out;
}

/**
 * What the opponent's last move does to the player: check, a capture, or
 * pieces it now attacks that the player would lose. Undefined when none.
 */
export function threatNote(before: Chess, uci: string): string | undefined {
  const after = playUci(before, uci);
  const m = normalMove(uci);
  if (!after || !m) return undefined;
  const me = after.turn;
  const san = pvToSan(makeFen(before.toSetup()), [uci], 1)[0] ?? uci;
  const parts: string[] = [];
  if (isCapture(before, m))
    parts.push(`takes your ${before.board.getRole(m.to) ?? 'pawn'} on ${makeSquare(m.to)}`);
  const targets = [...attacksFrom(after, m.to).intersect(after.board[me])].filter((sq) => {
    const role = after.board.getRole(sq);
    return role !== undefined && role !== 'king' && see(after, sq, opposite(me)) > 0;
  });
  if (targets.length) parts.push(`attacks ${listPieces(after, targets)}`);
  if (after.isCheck()) parts.push('gives check');
  if (!parts.length) return undefined;
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `Your opponent's ${san} ${text}.`;
}

/**
 * The opponent's threat in words, from the null-move search: what the move
 * takes, or the mate it gives. `lastSan` is the opponent's last move, which
 * set the threat up, when known.
 */
export function threatText(fen: string, threat: Threat, lastSan?: string): string | undefined {
  const passed = nullMoveFen(fen);
  if (!passed) return undefined;
  const pos = fromFen(passed);
  const m = normalMove(threat.uci);
  if (!m) return undefined;
  const san = pvToSan(passed, [threat.uci], 1)[0] ?? threat.uci;
  const lead = lastSan ? `With ${lastSan}, I threaten ${san}` : `I threaten ${san}`;
  if (threat.score.kind === 'mate' && threat.score.value > 0)
    return threat.score.value === 1 ? `${lead}, and it is mate.` : `${lead}, with mate to follow.`;
  if (isCapture(pos, m)) {
    const role = pos.board.getRole(m.to) ?? 'pawn';
    return `${lead}, taking your ${role} on ${makeSquare(m.to)}.`;
  }
  return `${lead}. Ignoring it costs about ${(threat.gain / 100).toFixed(1)} pawns.`;
}
