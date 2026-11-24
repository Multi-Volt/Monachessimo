import { Chess } from 'chessops/chess';
import { standardUci } from '../chess/uci';
import { parseSan } from 'chessops/san';
import type { Result, Side } from './types';

/**
 * Replays SAN moves from the standard starting position and returns their UCI
 * form. Returns undefined if any move is illegal, which means the record is
 * corrupt or the game did not start from the standard position.
 */
export function sanToUci(san: readonly string[]): string[] | undefined {
  const pos = Chess.default();
  const out: string[] = [];
  for (const s of san) {
    const move = parseSan(pos, s);
    if (!move) return undefined;
    out.push(standardUci(pos, move));
    pos.play(move);
  }
  return out;
}

export function sideOf(username: string, white: string, black: string): Side | undefined {
  const u = username.toLowerCase();
  if (white.toLowerCase() === u) return 'white';
  if (black.toLowerCase() === u) return 'black';
  return undefined;
}

export function resultFromWinner(winner: Side | undefined): Result {
  if (winner === 'white') return '1-0';
  if (winner === 'black') return '0-1';
  return '1/2-1/2';
}

/** Parses a PGN `[%clk h:mm:ss.s]` value into centiseconds. */
export function parseClock(text: string): number | undefined {
  const m = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/.exec(text);
  if (!m) return undefined;
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return Math.round(seconds * 100);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
