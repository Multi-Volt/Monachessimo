import type { Chess } from 'chessops/chess';
import type { Role, Square } from 'chessops/types';
import { makeSquare, opposite } from 'chessops/util';
import {
  attackersOf,
  attacksFrom,
  beyond,
  isCapture,
  isSlider,
  normalMove,
  playLine,
  playUci,
  see,
  VALUE,
} from '../detectors/board';

/** Why a move allowed the opponent to win material. One cause per mistake. */
export type Cause =
  | {
      kind: 'defenderLeft';
      /** The piece that moved away, and where it stood. */
      defender: Role;
      from: Square;
      /** The square it was guarding, the piece on it, and who takes it. */
      target: Square;
      victim: Role;
      attacker: Role;
      attackerSquare: Square;
    }
  | {
      kind: 'movedOntoAttacked';
      piece: Role;
      square: Square;
      attacker: Role;
      attackerSquare: Square;
      /** True when the opponent wins the piece without giving anything back. */
      free: boolean;
    }
  | { kind: 'ignoredThreat'; target: Square; victim: Role; attacker: Role; attackerSquare: Square }
  | {
      kind: 'openedLine';
      /** The piece that moved and the square it left. */
      moved: Role;
      from: Square;
      /** The opponent's sliding piece that now sees through, and what it hits. */
      slider: Role;
      sliderSquare: Square;
      target: Square;
      victim: Role;
      line: 'file' | 'rank' | 'diagonal';
    }
  | { kind: 'fork'; attacker: Role; attackerSquare: Square; targets: Square[]; roles: Role[] }
  | {
      kind: 'pin' | 'skewer';
      attacker: Role;
      attackerSquare: Square;
      front: Square;
      frontRole: Role;
      back: Square;
      backRole: Role;
    };

/** How many plies of the reply line to search for the first capture of the player's piece. */
const LOOK = 4;

/** True when two squares share a file, a rank or a diagonal. */
function aligned(a: Square, b: Square): boolean {
  const df = (a % 8) - (b % 8);
  const dr = Math.floor(a / 8) - Math.floor(b / 8);
  return a !== b && (df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr));
}

function lineKind(a: Square, b: Square): 'file' | 'rank' | 'diagonal' {
  if (a % 8 === b % 8) return 'file';
  if (Math.floor(a / 8) === Math.floor(b / 8)) return 'rank';
  return 'diagonal';
}

/** The cheapest opponent piece that attacks `square`. */
function cheapestAttacker(pos: Chess, square: Square, by: Chess['turn']): Square | undefined {
  let best: Square | undefined;
  for (const a of attackersOf(pos, square, by)) {
    if (best === undefined || VALUE[pos.board.getRole(a)!] < VALUE[pos.board.getRole(best)!])
      best = a;
  }
  return best;
}

/** A fork, pin or skewer made by the opponent's first reply, from the board. */
function pattern(after: Chess, reply: string, me: Chess['turn']): Cause | undefined {
  const m = normalMove(reply);
  const next = playUci(after, reply);
  if (!m || !next) return undefined;
  const attacker = next.board.getRole(m.to);
  if (!attacker) return undefined;
  // A pattern made by a piece that can simply be taken for free is not a threat.
  if (!next.isCheck() && see(next, m.to, me) >= VALUE[attacker]) return undefined;
  const hit = [...attacksFrom(next, m.to).intersect(next.board[me])];
  // Fork: two or more pieces attacked at once that each lose material, or the king.
  const forked = hit.filter((sq) => {
    const role = next.board.getRole(sq)!;
    return (
      role === 'king' ||
      (VALUE[role] > VALUE[attacker] && role !== 'pawn') ||
      see(next, sq, opposite(me)) > 0
    );
  });
  if (forked.length >= 2 && forked.some((sq) => next.board.getRole(sq) !== 'pawn'))
    return {
      kind: 'fork',
      attacker,
      attackerSquare: m.to,
      targets: forked,
      roles: forked.map((sq) => next.board.getRole(sq)!),
    };
  // Pin or skewer: a sliding attacker, a piece in front and a piece behind it on the same line.
  if (!isSlider(attacker)) return undefined;
  for (const front of hit) {
    const behind = beyond(m.to, front).find((sq) => next.board.has(sq));
    if (behind === undefined || next.board.getColor(behind) !== me) continue;
    const frontRole = next.board.getRole(front)!;
    const backRole = next.board.getRole(behind)!;
    const frontValue = frontRole === 'king' ? 100 : VALUE[frontRole];
    const backValue = backRole === 'king' ? 100 : VALUE[backRole];
    if (backValue > frontValue && backValue > VALUE[attacker] - 1)
      return {
        kind: 'pin',
        attacker,
        attackerSquare: m.to,
        front,
        frontRole,
        back: behind,
        backRole,
      };
    if (frontValue > backValue && backRole !== 'pawn')
      return {
        kind: 'skewer',
        attacker,
        attackerSquare: m.to,
        front,
        frontRole,
        back: behind,
        backRole,
      };
  }
  return undefined;
}

/**
 * Finds why `uci` let the opponent win material, by comparing the square
 * that is lost before and after the move. `reply` is the opponent's best
 * line after the move. Undefined when the move loses no material that one
 * of these causes explains.
 */
export function findCause(before: Chess, uci: string, reply: readonly string[]): Cause | undefined {
  const me = before.turn;
  const them = opposite(me);
  const m = normalMove(uci);
  const after = playUci(before, uci);
  if (!m || !after) return undefined;
  const moved = after.board.getRole(m.to)!;

  // The first of the player's pieces the opponent captures in the reply line.
  const line = playLine(after, reply.slice(0, LOOK));
  let target: Square | undefined;
  for (let i = 0; i + 1 < line.length; i++) {
    const pos = line[i]!;
    const r = normalMove(reply[i]);
    if (pos.turn === them && r && isCapture(pos, r) && pos.board.getColor(r.to) === me) {
      target = r.to;
      break;
    }
  }

  if (target !== undefined && after.board.getColor(target) === me) {
    const victim = after.board.getRole(target)!;
    const attackerSquare = cheapestAttacker(after, target, them);
    const losesAfter = see(after, target, them) > 0;
    if (attackerSquare !== undefined && losesAfter) {
      const attacker = after.board.getRole(attackerSquare)!;
      // The piece that just moved is the one lost.
      if (target === m.to) {
        const gain = see(after, target, them);
        const taken = isCapture(before, m) ? VALUE[before.board.getRole(m.to) ?? 'pawn'] : 0;
        return {
          kind: 'movedOntoAttacked',
          piece: moved,
          square: m.to,
          attacker,
          attackerSquare,
          free: gain - taken >= VALUE[moved],
        };
      }
      const losesBefore = before.board.getColor(target) === me && see(before, target, them) > 0;
      if (!losesBefore) {
        // The moved piece guarded the target before, and no longer does.
        const guarded = attacksFrom(before, m.from).has(target);
        const guards = attacksFrom(after, m.to).has(target);
        if (guarded && !guards)
          return {
            kind: 'defenderLeft',
            defender: moved,
            from: m.from,
            target,
            victim,
            attacker,
            attackerSquare,
          };
        // A sliding piece now attacks through the square the moved piece left.
        const newSlider = [...attackersOf(after, target, them)].find(
          (a) =>
            isSlider(after.board.getRole(a)) &&
            !attackersOf(before, target, them).has(a) &&
            aligned(a, m.from) &&
            beyond(a, m.from).includes(target),
        );
        if (newSlider !== undefined)
          return {
            kind: 'openedLine',
            moved,
            from: m.from,
            slider: after.board.getRole(newSlider)!,
            sliderSquare: newSlider,
            target,
            victim,
            line: lineKind(newSlider, target),
          };
      } else {
        return { kind: 'ignoredThreat', target, victim, attacker, attackerSquare };
      }
    }
  }
  return reply[0] ? pattern(after, reply[0], me) : undefined;
}

const sq = makeSquare;

function list(roles: Role[], squares: Square[]): string {
  const names = roles.map((r, i) => `your ${r} on ${sq(squares[i]!)}`);
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** One sentence in the coach's voice, speaking as the opponent. */
export function causeText(c: Cause): string {
  switch (c.kind) {
    case 'defenderLeft':
      return `Your ${c.defender} was guarding the ${c.victim} on ${sq(c.target)}. Now my ${c.attacker} can take it.`;
    case 'movedOntoAttacked':
      return c.free
        ? `Your ${c.piece} on ${sq(c.square)} can be taken by my ${c.attacker} for free.`
        : `My ${c.attacker} can take your ${c.piece} on ${sq(c.square)}, and you lose material in the trade.`;
    case 'ignoredThreat':
      return `Your ${c.victim} on ${sq(c.target)} was already attacked by my ${c.attacker}, and this move does not save it.`;
    case 'openedLine':
      return `Moving your ${c.moved} opens the ${c.line} for my ${c.slider} to your ${c.victim} on ${sq(c.target)}.`;
    case 'fork':
      return `My ${c.attacker} on ${sq(c.attackerSquare)} attacks ${list(c.roles, c.targets)} at once.`;
    case 'pin':
      return `My ${c.attacker} pins your ${c.frontRole} on ${sq(c.front)} to your ${c.backRole} behind it.`;
    case 'skewer':
      return `My ${c.attacker} attacks your ${c.frontRole} on ${sq(c.front)}. When it moves, your ${c.backRole} behind it falls.`;
  }
}

export interface Mark {
  orig: string;
  dest?: string;
  brush: 'red' | 'blue' | 'green';
}

/** Board marks for a cause: the lost square in red, the departed guard or the open line in blue. */
export function causeMarks(c: Cause): Mark[] {
  switch (c.kind) {
    case 'defenderLeft':
      return [
        { orig: sq(c.from), dest: sq(c.target), brush: 'blue' },
        { orig: sq(c.target), brush: 'red' },
      ];
    case 'movedOntoAttacked':
      return [{ orig: sq(c.attackerSquare), dest: sq(c.square), brush: 'red' }];
    case 'ignoredThreat':
      return [{ orig: sq(c.attackerSquare), dest: sq(c.target), brush: 'red' }];
    case 'openedLine':
      return [
        { orig: sq(c.sliderSquare), dest: sq(c.target), brush: 'red' },
        { orig: sq(c.from), brush: 'blue' },
      ];
    case 'fork':
      return c.targets.map((t) => ({ orig: sq(c.attackerSquare), dest: sq(t), brush: 'red' }));
    case 'pin':
    case 'skewer':
      return [{ orig: sq(c.attackerSquare), dest: sq(c.back), brush: 'red' }];
  }
}
