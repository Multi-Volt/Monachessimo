import type { Score } from './eval';

/** One principal variation from an engine search. */
export interface Line {
  multipv: number;
  depth: number;
  /** Score from the side to move's point of view. */
  score: Score;
  /** Moves in UCI. */
  pv: string[];
}

export interface InfoLine extends Line {
  bound?: 'lower' | 'upper';
}

/** Parses a UCI `info` line that carries a score and a PV. Other lines return undefined. */
export function parseInfo(line: string): InfoLine | undefined {
  if (!line.startsWith('info ')) return undefined;
  const t = line.split(/\s+/);
  let depth: number | undefined;
  let multipv = 1;
  let score: Score | undefined;
  let bound: InfoLine['bound'];
  let pv: string[] | undefined;
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        depth = Number(t[++i]);
        break;
      case 'multipv':
        multipv = Number(t[++i]);
        break;
      case 'score': {
        const kind = t[++i];
        const value = Number(t[++i]);
        if (kind === 'cp' || kind === 'mate') score = { kind, value };
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          bound = t[i + 1] === 'lowerbound' ? 'lower' : 'upper';
          i++;
        }
        break;
      }
      case 'pv':
        pv = t.slice(i + 1);
        i = t.length;
        break;
      case 'string':
        return undefined;
    }
  }
  if (depth === undefined || !score || !pv || pv.length === 0) return undefined;
  return { multipv, depth, score, pv, ...(bound ? { bound } : {}) };
}

/** Parses `bestmove e2e4 ponder e7e5`. Returns the move, or null for `(none)`. */
export function parseBestMove(line: string): string | null | undefined {
  if (!line.startsWith('bestmove')) return undefined;
  const move = line.split(/\s+/)[1];
  return !move || move === '(none)' ? null : move;
}

/**
 * Cache key for a position. Drops the halfmove and fullmove counters so that
 * transpositions share one entry.
 */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}
