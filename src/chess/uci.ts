import type { Position } from 'chessops/chess';
import { castlingSide } from 'chessops/chess';
import type { Move } from 'chessops/types';
import { makeSquare, makeUci, squareRank } from 'chessops/util';

/**
 * UCI string in standard notation. chessops writes castling as "king takes
 * own rook" (e1h1); Stockfish and both game sites expect e1g1.
 */
export function standardUci(pos: Position, move: Move): string {
  if ('from' in move) {
    const side = castlingSide(pos, move);
    if (side) {
      const rank = squareRank(move.from);
      const toFile = side === 'h' ? 6 : 2;
      return makeSquare(move.from) + makeSquare(rank * 8 + toFile);
    }
  }
  return makeUci(move);
}
