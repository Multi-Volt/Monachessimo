import { makeFen } from 'chessops/fen';
import { negate, type Score } from '../engine/eval';
import type { Search } from '../analysis/pipeline';
import { terminalScore } from '../analysis/pipeline';
import { fromFen, playUci } from '../detectors/board';
import type { Side } from '../import/types';
import { judgeMove, type MoveClass } from './coach';

export interface PracticeReview {
  /** Score of each position, from the side to move; one more than the moves. */
  evals: Score[];
  /** Engine's best move in each position, in UCI. */
  best: (string | null)[];
  /** Class of each of the player's moves, by ply; null for good moves. */
  classes: (MoveClass | null)[];
}

/** FENs of every position in a game that starts from `startFen`. */
export function positions(startFen: string, moves: readonly string[]): string[] {
  const out = [startFen];
  let pos = fromFen(startFen);
  for (const u of moves) {
    const next = playUci(pos, u);
    if (!next) break;
    pos = next;
    out.push(makeFen(pos.toSetup()));
  }
  return out;
}

/**
 * Engine review of a practice game from any start position: an evaluation
 * of every position, and a class for each of the player's moves by the same
 * rules the coach uses during play.
 */
export async function reviewPractice(
  startFen: string,
  moves: readonly string[],
  you: Side,
  search: Search,
  onProgress?: (done: number, total: number) => void,
): Promise<PracticeReview> {
  const fens = positions(startFen, moves);
  const evals: Score[] = [];
  const best: (string | null)[] = [];
  let done = 0;
  await Promise.all(
    fens.map(async (fen, i) => {
      const t = terminalScore(fen);
      if (t) {
        evals[i] = t;
        best[i] = null;
      } else {
        const r = await search({ fen, depth: 12, movetime: 300 });
        evals[i] = r.lines[0]?.score ?? { kind: 'cp', value: 0 };
        best[i] = r.bestmove;
      }
      onProgress?.(++done, fens.length);
    }),
  );
  const classes = moves.map((_, ply) => {
    const mover = fens[ply]!.split(' ')[1] === 'w' ? 'white' : 'black';
    if (mover !== you || !evals[ply] || !evals[ply + 1]) return null;
    return judgeMove(evals[ply]!, negate(evals[ply + 1]!)).class;
  });
  return { evals, best, classes };
}
