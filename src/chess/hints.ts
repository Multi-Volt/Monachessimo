import { makeSquare, opposite } from 'chessops/util';
import { isCapture, normalMove, playUci, fromFen } from '../detectors/board';
import { uciToSan } from './san';

/** What kind of move it is, without naming the piece. */
export function ideaHint(fen: string, uci: string): string | undefined {
  const pos = fromFen(fen);
  const m = normalMove(uci);
  const after = playUci(pos, uci);
  if (!m || !after) return undefined;
  if (after.isCheckmate()) return 'There is a checkmate.';
  if (isCapture(pos, m) && after.isCheck()) return 'Look for a capture that gives check.';
  if (isCapture(pos, m)) return 'Look for a capture.';
  if (after.isCheck()) return 'Look for a check.';
  return 'The move is quiet: not a capture and not a check.';
}

/**
 * A hint ladder where each step adds something new: an optional first hint
 * (the theme, or the kind of move), then the piece, named by square only when
 * the side has more than one of that piece, then the answer.
 */
export function moveHints(
  fen: string,
  uci: string,
  opts: { first?: string; answer?: string } = {},
): string[] {
  const pos = fromFen(fen);
  const m = normalMove(uci);
  const out: string[] = [];
  const first = opts.first ?? ideaHint(fen, uci);
  if (first) out.push(first);
  if (m) {
    const role = pos.board.getRole(m.from);
    if (role) {
      const same = pos.board[pos.turn].intersect(pos.board[role]).size();
      out.push(same > 1 ? `Move the ${role} on ${makeSquare(m.from)}.` : `Move your ${role}.`);
      const victim = pos.board.get(m.to);
      if (victim && victim.color === opposite(pos.turn) && first !== 'There is a checkmate.')
        out.push(`It takes the ${victim.role} on ${makeSquare(m.to)}.`);
    }
  }
  out.push(`${opts.answer ?? 'The answer is'} ${uciToSan(fen, uci)}.`);
  return out;
}
