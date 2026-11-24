import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { parseUci } from 'chessops/util';

export function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
}

/** SAN for each UCI move in a line, stopping at the first illegal move. */
export function pvToSan(fen: string, pv: readonly string[], max = pv.length): string[] {
  const pos = positionFromFen(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, max)) {
    const move = parseUci(u);
    if (!move || !pos.isLegal(move)) break;
    out.push(makeSanAndPlay(pos, move));
  }
  return out;
}

export function uciToSan(fen: string, uci: string): string {
  return pvToSan(fen, [uci], 1)[0] ?? uci;
}

/** Splits a UCI move into chessground squares, for highlights and arrows. */
export function uciSquares(uci: string): [string, string] {
  return [uci.slice(0, 2), uci.slice(2, 4)];
}
