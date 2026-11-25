import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { opposite } from 'chessops/util';
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

/**
 * Asks the engine what the opponent would play if the side to move passed.
 * `current` is the evaluation of the position from the side to move. The
 * result is a threat only when passing costs at least THREAT_CP.
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
  return gain >= THREAT_CP ? { uci: line.pv[0], score: line.score, gain } : undefined;
}
