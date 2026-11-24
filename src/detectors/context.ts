import type { Chess } from 'chessops/chess';
import type { NormalMove } from 'chessops/types';
import { opposite } from 'chessops/util';
import { normalMove, playUci } from './board';
import type { MoveContext } from './types';

export const moverColor = (ctx: MoveContext) => ctx.before.turn;
export const opponentColor = (ctx: MoveContext) => opposite(ctx.before.turn);

/** Position after the played move. */
export function afterPlayed(ctx: MoveContext): Chess | undefined {
  return playUci(ctx.before, ctx.played);
}

/** The engine's best move, when it differs from the played move. */
export function bestMove(ctx: MoveContext): NormalMove | undefined {
  const uci = ctx.lines[0]?.pv[0];
  if (!uci || uci === ctx.played) return undefined;
  const m = normalMove(uci);
  return m && ctx.before.isLegal(m) ? m : undefined;
}

export function afterBest(ctx: MoveContext): Chess | undefined {
  const m = bestMove(ctx);
  if (!m) return undefined;
  const p = ctx.before.clone();
  p.play(m);
  return p;
}

/** The opponent's best reply to the played move. */
export function reply(ctx: MoveContext): { pos: Chess; move: NormalMove } | undefined {
  const after = afterPlayed(ctx);
  const m = normalMove(ctx.playedPv[1]);
  if (!after || !m || !after.isLegal(m)) return undefined;
  return { pos: after, move: m };
}

export function afterReply(ctx: MoveContext): Chess | undefined {
  const r = reply(ctx);
  if (!r) return undefined;
  const p = r.pos.clone();
  p.play(r.move);
  return p;
}
