// The tactics a line actually uses, found on the board and confirmed by the
// line: a fork counts only when the forking piece then takes one of its
// targets, a pin only when the pinned piece or the one behind it is won, a
// skewer only when the slider takes the piece behind, a discovered attack
// only when the uncovered piece makes the capture. A pattern that is on the
// board but not cashed in is not why the move loses, so it is not reported.
//
// The line starts with the player's move: `pv[0]` is the player's, odd
// plies are the opponent's. Each tactic carries one sentence, built from the
// board, in the coach's voice beside the player.
import type { Chess } from 'chessops/chess';
import { SquareSet } from 'chessops/squareSet';
import type { Color, NormalMove, Role, Square } from 'chessops/types';
import { makeSquare, opposite } from 'chessops/util';
import { VALUE, attacksFrom, between, isSlider, normalMove, playLine, see } from './board';
import { forkTargets, isBackRankMate, newMotifs, pins, skewers } from './motifs';

export type TacticKind =
  | 'back rank mate'
  | 'smothered mate'
  | 'fork'
  | 'skewer'
  | 'discovered attack'
  | 'pin'
  | 'trapped piece'
  | 'hanging piece';

export interface Tactic {
  kind: TacticKind;
  /** The half-move of the line that sets it up. */
  ply: number;
  /** One sentence, beside the player: "Your opponent's knight on d5 attacks …". */
  text: string;
}

/** The order a coach names them in, most telling first. */
const PRIORITY: TacticKind[] = [
  'back rank mate',
  'smothered mate',
  'fork',
  'skewer',
  'discovered attack',
  'pin',
  'trapped piece',
  'hanging piece',
];

/** Half-moves after the setup within which the tactic must pay off. */
const PAYOFF_PLIES = 4;

interface Capture {
  ply: number;
  from: Square;
  to: Square;
  role: Role;
}

const sq = makeSquare;
const yours = (pos: Chess, s: Square) => `your ${pos.board.getRole(s)} on ${sq(s)}`;
const theirs = (pos: Chess, s: Square) => `your opponent's ${pos.board.getRole(s)} on ${sq(s)}`;

function list(items: string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * The confirmed tactics in the first `plies` half-moves of `pv`, played from
 * `fen`'s position, most telling first.
 */
export function lineTactics(start: Chess, pv: readonly string[], plies = pv.length): Tactic[] {
  const me = start.turn;
  const them = opposite(me);
  const pos = playLine(start, pv, plies);
  const n = pos.length - 1;
  const moves = pv.slice(0, n).map((u) => normalMove(u)!);

  // The opponent's captures of the player's pieces, in order.
  const caps: Capture[] = [];
  for (let j = 1; j < n; j += 2) {
    const role = pos[j]!.board.getRole(moves[j]!.to);
    if (role && pos[j]!.board.getColor(moves[j]!.to) === me)
      caps.push({ ply: j, from: moves[j]!.from, to: moves[j]!.to, role });
  }
  const paid = (k: number, ok: (c: Capture) => boolean) =>
    caps.some((c) => c.ply > k && c.ply <= k + PAYOFF_PLIES && ok(c)) ||
    caps.some((c) => c.ply === k && ok(c));

  const out: Tactic[] = [];
  const add = (t: Tactic) => {
    if (!out.some((o) => o.kind === t.kind)) out.push(t);
  };

  // Mates at the end of the line.
  const last = pos[n]!;
  if (n > 0 && last.isCheckmate() && last.turn === me) {
    if (isBackRankMate(last) && boxedIn(last))
      add({
        kind: 'back rank mate',
        ply: n - 1,
        text: `Your opponent's ${last.board.getRole(moves[n - 1]!.to)} gives checkmate on your back row, where your own pieces block your king's escape.`,
      });
    else if (isSmothered(last, moves[n - 1]!))
      add({
        kind: 'smothered mate',
        ply: n - 1,
        text: "Your opponent's knight gives checkmate, and your king cannot move because its own pieces surround it.",
      });
  }

  // Setups: the player's own move (walking into it) and each opponent move.
  for (let k = 0; k < n; k++) {
    if (k > 0 && k % 2 === 0) continue;
    const before = pos[k]!;
    const after = pos[k + 1]!;
    const m = moves[k]!;

    if (k % 2 === 1) {
      // Fork: the moved piece attacks two targets and later takes one of them.
      const targets = forkTargets(after, m.to);
      if (
        targets.length >= 2 &&
        paid(k, (c) => c.from === m.to && targets.includes(c.to) && c.ply > k)
      )
        add({
          kind: 'fork',
          ply: k,
          text: `${cap(theirs(after, m.to))} attacks ${list(targets.map((t) => yours(after, t)))} at once.`,
        });

      // Discovered attack: moving off a line uncovers a slider that then captures.
      for (const s of after.board[them]) {
        if (s === m.to || !isSlider(after.board.getRole(s))) continue;
        for (const t of attacksFrom(after, s).intersect(after.board[me])) {
          if (attacksFrom(before, s).has(t) || !between(s, t).has(m.from)) continue;
          const role = after.board.getRole(t)!;
          if (role !== 'king' && VALUE[role] < 3) continue;
          if (paid(k, (c) => c.from === s && c.to === t))
            add({
              kind: 'discovered attack',
              ply: k,
              text: `When your opponent's ${after.board.getRole(m.to)} moves off ${sq(m.from)}, ${theirs(after, s).replace("your opponent's", 'the')} behind it attacks ${yours(after, t)}.`,
            });
        }
      }
    }

    // A pinned defender: a piece of the player's attacks the piece that just
    // moved but may not take it, because it is pinned to the king. It counts
    // when the line then mates or wins material.
    if (k % 2 === 1) {
      const king = after.board.kingOf(me);
      const pays = (n > 0 && pos[n]!.isCheckmate()) || paid(k, () => true);
      if (king !== undefined && pays)
        for (const d of after.board[me]) {
          if (d === king || !attacksFrom(after, d).has(m.to) || after.dests(d).has(m.to)) continue;
          const pinner = [...after.board[them]].find(
            (s) =>
              isSlider(after.board.getRole(s)) &&
              attacksFrom(after, s, after.board.occupied.without(d)).has(king) &&
              between(s, king).has(d),
          );
          if (pinner === undefined) continue;
          add({
            kind: 'pin',
            ply: k,
            text: `${cap(yours(after, d))} cannot take ${theirs(after, m.to)}, because ${theirs(after, pinner)} pins it to your king.`,
          });
          break;
        }
    }

    // Pins and skewers the setup creates.
    const standing = k === 0 ? pins(after, them) : newMotifs(before, after, them, pins);
    for (const p of standing)
      if (paid(k, (c) => c.to === p.front || c.to === p.back))
        add({
          kind: 'pin',
          ply: k,
          text: `${cap(theirs(after, p.slider))} pins ${yours(after, p.front)} to ${yours(after, p.back)} behind it.`,
        });
    for (const s of newMotifs(before, after, them, skewers))
      if (paid(k, (c) => c.to === s.back && c.from === s.slider))
        add({
          kind: 'skewer',
          ply: k,
          text: `${cap(theirs(after, s.slider))} attacks ${yours(after, s.front)}, and when it moves, ${yours(after, s.back)} behind it is lost.`,
        });
  }

  // Captures no tactic above explains: trapped or simply unprotected pieces.
  for (const c of caps) {
    const p = pos[c.ply]!;
    if (out.length) break;
    if (c.role === 'pawn' || c.role === 'king') continue;
    // Taking back after the player's own capture is a trade, not a gift.
    if (c.ply >= 1 && moves[c.ply - 1]!.to === c.to) continue;
    // Recaptured at once, it was a trade, not a gift.
    const next = moves[c.ply + 1];
    const recaptured = !!next && next.to === c.to && c.ply + 1 < n;
    const profit = see(p, c.to, them);
    if (recaptured && profit < 2) continue;
    const prev = c.ply >= 2 ? pos[c.ply - 1] : undefined;
    if (prev && trapped(prev, c.to, me))
      add({
        kind: 'trapped piece',
        ply: c.ply - 2,
        text: `${cap(yours(p, c.to))} has no safe square to go to, so your opponent wins it.`,
      });
    else if (profit >= 2 && c.ply === 1)
      add({
        kind: 'hanging piece',
        ply: c.ply,
        text: `${cap(yours(p, c.to))} is not protected enough, so ${theirs(p, c.from)} takes it.`,
      });
    break;
  }

  return out.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Mate by a knight with every square around the king held by its own pieces. */
function isSmothered(pos: Chess, last: NormalMove): boolean {
  if (pos.board.getRole(last.to) !== 'knight') return false;
  const king = pos.board.kingOf(pos.turn);
  if (king === undefined) return false;
  const around = SquareSet.fromSquare(king).union(kingRing(king)).without(king);
  for (const s of around) if (pos.board.getColor(s) !== pos.turn) return false;
  return true;
}

function kingRing(s: Square): SquareSet {
  let out = SquareSet.empty();
  const f = s % 8;
  const r = Math.floor(s / 8);
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      const nf = f + df;
      const nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) out = out.with(nr * 8 + nf);
    }
  return out;
}

/**
 * The player's piece on `square`, with the player to move, is attacked for
 * profit and every square it can go to loses it too.
 */
function trapped(pos: Chess, square: Square, me: Color): boolean {
  if (pos.turn !== me || pos.isCheck()) return false;
  const them = opposite(me);
  if (see(pos, square, them) < 2) return false;
  const dests = pos.dests(square);
  if (dests.isEmpty()) return false;
  for (const to of dests) {
    const gained = pos.board.has(to) ? VALUE[pos.board.getRole(to)!] : 0;
    const next = pos.clone();
    next.play({ from: square, to });
    if (see(next, to, them) - gained < 2) return false;
  }
  return true;
}

/** The mated king's squares one row up are all its own pieces: the back rank pattern. */
function boxedIn(pos: Chess): boolean {
  const king = pos.board.kingOf(pos.turn);
  if (king === undefined) return false;
  const up = pos.turn === 'white' ? 1 : -1;
  const row = Math.floor(king / 8) + up;
  for (const s of kingRing(king))
    if (Math.floor(s / 8) === row && pos.board.getColor(s) !== pos.turn) return false;
  return true;
}
