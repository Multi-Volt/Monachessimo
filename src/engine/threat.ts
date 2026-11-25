import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { opposite, parseUci } from 'chessops/util';
import type { Color } from 'chessops/types';
import type { SearchRequest, SearchResult } from './engine';
import { toCp, type Score } from './eval';

/**
 * The same position with the other side to move: a null move. Undefined
 * when the side to move is in check, since passing would leave the king in
 * check, which is illegal. The en passant square is cleared because it
 * belonged to the move that is skipped.
 */
export function nullMoveFen(fen: string): string | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr || pos.value.isCheck()) return undefined;
  const flipped = { ...setup.value, turn: opposite(setup.value.turn), epSquare: undefined };
  const check = Chess.fromSetup(flipped);
  return check.isErr ? undefined : makeFen(flipped);
}

export interface Threat {
  /** The opponent's best move if the side to move passed, in UCI. */
  uci: string;
  /** Its score from the opponent's side. */
  score: Score;
  /**
   * How much better the opponent stands if the player passes, in
   * centipawns, compared with the current evaluation.
   */
  gain: number;
}

/**
 * Centipawns a pass must give away before the opponent's best move counts
 * as a threat: less than a pawn, more than the 30 to 50 a free tempo is worth.
 */
export const THREAT_CP = 80;

const VALUE = { pawn: 100, knight: 300, bishop: 300, rook: 500, queen: 900, king: 0 } as const;

function material(pos: Chess, color: Color): number {
  let n = 0;
  for (const sq of pos.board[color]) n += VALUE[pos.board.getRole(sq)!];
  return n;
}

/** Plies of the engine's line in which the threat must win material. */
const THREAT_PLIES = 4;

/**
 * Whether the opponent's best move after a pass threatens something a
 * player can see: a mate, a check, a capture, or a line that wins at least
 * a pawn of material. A quiet developing move can be worth a free tempo in
 * the opening, but it is not a threat.
 */
export function isConcrete(passedFen: string, pv: string[], score: Score): boolean {
  if (score.kind === 'mate' && score.value > 0) return true;
  const setup = parseFen(passedFen);
  if (setup.isErr) return false;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return false;
  const p = pos.value;
  const them = p.turn;
  const first = parseUci(pv[0] ?? '');
  if (!first || !p.isLegal(first)) return false;
  if ('from' in first && p.board.has(first.to)) return true;
  const balance = () => material(p, them) - material(p, opposite(them));
  const start = balance();
  for (const [i, uci] of pv.slice(0, THREAT_PLIES).entries()) {
    const m = parseUci(uci);
    if (!m || !p.isLegal(m)) break;
    p.play(m);
    if (i === 0 && p.isCheck()) return true;
  }
  return balance() - start >= VALUE.pawn;
}

/**
 * Asks the engine what the opponent would play if the side to move passed.
 * `current` is the evaluation of the position from the side to move. The
 * result is a threat only when passing costs at least THREAT_CP and the
 * move threatens something concrete.
 */
export async function findThreat(
  search: (req: SearchRequest) => Promise<SearchResult>,
  fen: string,
  current: Score,
  opts: { depth?: number; movetime?: number } = {},
): Promise<Threat | undefined> {
  const passed = nullMoveFen(fen);
  if (!passed) return undefined;
  const r = await search({ fen: passed, depth: opts.depth ?? 10, movetime: opts.movetime ?? 400 });
  const line = r.lines[0];
  if (!line?.pv[0]) return undefined;
  // The opponent's standing now is minus the player's; passing gives it line.score.
  const gain = toCp(line.score) + toCp(current);
  return gain >= THREAT_CP && isConcrete(passed, line.pv, line.score)
    ? { uci: line.pv[0], score: line.score, gain }
    : undefined;
}
