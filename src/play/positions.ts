import { replay } from '../analysis/positions';
import { positionKey } from '../engine/uci';
import type { Game, Result } from '../import/types';

/** One time a position came up in the player's own games. */
export interface Visit {
  gameId: string;
  ply: number;
  /** The move played from this position, in SAN. */
  san: string;
  /** True when the player was the one to move. */
  yourMove: boolean;
  outcome: 'won' | 'lost' | 'drew';
  opponent: string;
  playedAt: number;
}

function outcomeFor(g: Game): Visit['outcome'] {
  const r: Result = g.result;
  if (r === '1/2-1/2') return 'drew';
  return (r === '1-0') === (g.userColor === 'white') ? 'won' : 'lost';
}

/** Index of every position in the given games, by position key. */
export function buildIndex(games: readonly Game[]): Map<string, Visit[]> {
  const index = new Map<string, Visit[]>();
  for (const g of games) {
    let fens: string[];
    try {
      fens = replay(g.uci);
    } catch {
      continue;
    }
    const opponent = (g.userColor === 'white' ? g.black : g.white).name;
    const outcome = outcomeFor(g);
    for (let ply = 0; ply < g.uci.length; ply++) {
      const key = positionKey(fens[ply]!);
      const list = index.get(key) ?? [];
      list.push({
        gameId: g.id,
        ply,
        san: g.san[ply]!,
        yourMove: (ply % 2 === 0) === (g.userColor === 'white'),
        outcome,
        opponent,
        playedAt: g.playedAt,
      });
      index.set(key, list);
    }
  }
  return index;
}

/** Your own earlier moves from a position, newest game first. */
export function yourVisits(index: Map<string, Visit[]>, fen: string): Visit[] {
  return (index.get(positionKey(fen)) ?? [])
    .filter((v) => v.yourMove)
    .sort((a, b) => b.playedAt - a.playedAt);
}
