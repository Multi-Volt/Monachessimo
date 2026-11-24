import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import type { Side } from '../import/types';

/**
 * FENs before each ply and after the last one: fens[i] is the position before
 * ply i, so fens has one more entry than uci.
 */
export function replay(uci: readonly string[]): string[] {
  const pos = Chess.default();
  const fens = [makeFen(pos.toSetup())];
  for (const u of uci) {
    const move = parseUci(u);
    if (!move || !pos.isLegal(move)) throw new Error(`Illegal move ${u} at ply ${fens.length - 1}`);
    pos.play(move);
    fens.push(makeFen(pos.toSetup()));
  }
  return fens;
}

/** Side that plays ply i in a game from the standard start. */
export function moverOf(ply: number): Side {
  return ply % 2 === 0 ? 'white' : 'black';
}

/** Move number shown to people, for example ply 0 is "1." and ply 1 is "1...". */
export function moveLabel(ply: number): string {
  const n = Math.floor(ply / 2) + 1;
  return ply % 2 === 0 ? `${n}.` : `${n}...`;
}
