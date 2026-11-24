import { opposite } from 'chessops/util';
import { VALUE, balance, hangingPieces, isCapture, playLine, see } from './board';
import { afterPlayed, afterReply, bestMove, moverColor, reply } from './context';
import type { Detector } from './types';

/** The move left a piece where the opponent wins at least two pawns of material, and the reply takes it. */
export const hangingPiece: Detector = (ctx) => {
  const after = afterPlayed(ctx);
  if (!after) return false;
  const hanging = hangingPieces(after, moverColor(ctx));
  if (hanging.length === 0) return false;
  const r = reply(ctx);
  return !r || hanging.includes(r.move.to);
};

/** The best move was a capture that wins at least two pawns of material. */
export const missedCapture: Detector = (ctx) => {
  const best = bestMove(ctx);
  if (!best || !isCapture(ctx.before, best)) return false;
  const line = playLine(ctx.before, ctx.lines[0]!.pv, 3);
  const end = line[Math.min(2, line.length - 1)]!;
  return balance(end, moverColor(ctx)) - balance(ctx.before, moverColor(ctx)) >= 2;
};

/**
 * After the opponent's reply, or after the opponent's next move in the
 * engine line, one of the player's pieces (knight or larger) is attacked for
 * profit and every square it can move to also loses it.
 */
export const trappedPiece: Detector = (ctx) => {
  const me = moverColor(ctx);
  const positions = [];
  // Right after the move, seen as if the player could move again.
  const after = afterPlayed(ctx);
  if (after && !after.isCheck()) {
    const asIfMine = after.clone();
    asIfMine.turn = me;
    asIfMine.epSquare = undefined;
    positions.push(asIfMine);
  }
  const r = afterReply(ctx);
  if (r) positions.push(r);
  const later = playLine(ctx.before, ctx.playedPv, 4);
  if (later.length === 5) positions.push(later[4]!);
  return positions.some((pos) => isTrapped(pos, me));
};

function isTrapped(
  pos: import('chessops/chess').Chess,
  me: import('chessops/types').Color,
): boolean {
  const them = opposite(me);
  if (pos.turn !== me) return false;
  for (const sq of pos.board[me]) {
    const role = pos.board.getRole(sq)!;
    if (role === 'pawn' || role === 'king') continue;
    if (see(pos, sq, them) < 2) continue;
    let escape = false;
    for (const to of pos.dests(sq)) {
      const gained = pos.board.has(to) ? VALUE[pos.board.getRole(to)!] : 0;
      const next = pos.clone();
      next.play({ from: sq, to });
      if (see(next, to, them) - gained < 2) {
        escape = true;
        break;
      }
    }
    if (!escape) return true;
  }
  return false;
}
