import { parseBestMove, parseInfo, positionKey, type Line } from './uci';

/** How to send commands to an engine process and receive its output. */
export interface Transport {
  post(command: string): void;
  onLine(listener: (line: string) => void): void;
  terminate(): void;
}

export interface SearchRequest {
  fen: string;
  /** Stop at this depth. */
  depth?: number;
  /** Stop after this many milliseconds. */
  movetime?: number;
  multipv?: number;
  /** Restrict the search to these UCI moves. */
  searchmoves?: string[];
}

export interface SearchResult {
  fen: string;
  /** Lines ordered best first. Scores are from the side to move. */
  lines: Line[];
  bestmove: string | null;
  depth: number;
  ms: number;
}

/** Identifies the engine build in cache keys, so a new build never reuses old results. */
export const ENGINE_ID = 'sf19-lite-single';

export function searchKey(req: SearchRequest): string {
  const parts = [
    positionKey(req.fen),
    ENGINE_ID,
    `d${req.depth ?? '-'}`,
    `t${req.movetime ?? '-'}`,
    `m${req.multipv ?? 1}`,
  ];
  if (req.searchmoves?.length) parts.push(`s${req.searchmoves.join(',')}`);
  return parts.join('|');
}

/**
 * Wraps one UCI engine. Runs one search at a time; callers queue through
 * EnginePool.
 */
export class Engine {
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<void>;
  private multipv = 1;
  private busy = false;

  constructor(
    private readonly transport: Transport,
    options: { hashMb?: number } = {},
  ) {
    transport.onLine((line) => {
      for (const l of [...this.listeners]) l(line);
    });
    this.ready = (async () => {
      await this.send('uci', (l) => l === 'uciok');
      this.transport.post(`setoption name Hash value ${options.hashMb ?? 16}`);
      this.transport.post('setoption name UCI_AnalyseMode value true');
      await this.isReady();
    })();
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  private send(command: string, until: (line: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      const l = (line: string) => {
        if (until(line)) {
          this.listeners.delete(l);
          resolve();
        }
      };
      this.listeners.add(l);
      this.transport.post(command);
    });
  }

  private isReady(): Promise<void> {
    return this.send('isready', (l) => l === 'readyok');
  }

  async search(req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
    await this.ready;
    if (this.busy) throw new Error('Engine is already searching');
    this.busy = true;
    try {
      const multipv = req.multipv ?? 1;
      if (multipv !== this.multipv) {
        this.transport.post(`setoption name MultiPV value ${multipv}`);
        this.multipv = multipv;
      }
      this.transport.post(`position fen ${req.fen}`);
      await this.isReady();

      const lines = new Map<number, Line>();
      const start = performance.now();
      let go = 'go';
      if (req.depth !== undefined) go += ` depth ${req.depth}`;
      if (req.movetime !== undefined) go += ` movetime ${req.movetime}`;
      if (req.depth === undefined && req.movetime === undefined) go += ' depth 12';
      if (req.searchmoves?.length) go += ` searchmoves ${req.searchmoves.join(' ')}`;

      const bestmove = await new Promise<string | null>((resolve) => {
        const onAbort = () => this.transport.post('stop');
        signal?.addEventListener('abort', onAbort, { once: true });
        const l = (line: string) => {
          const info = parseInfo(line);
          if (info && !info.bound) {
            const prev = lines.get(info.multipv);
            if (!prev || info.depth >= prev.depth) {
              lines.set(info.multipv, {
                multipv: info.multipv,
                depth: info.depth,
                score: info.score,
                pv: info.pv,
              });
            }
            return;
          }
          const best = parseBestMove(line);
          if (best !== undefined) {
            this.listeners.delete(l);
            signal?.removeEventListener('abort', onAbort);
            resolve(best);
          }
        };
        this.listeners.add(l);
        this.transport.post(go);
      });
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');

      // Keep only lines from the deepest completed iteration, best first.
      const all = [...lines.values()];
      const depth = Math.max(0, ...all.map((l) => l.depth));
      const sorted = all.filter((l) => l.depth >= depth - 1).sort((a, b) => a.multipv - b.multipv);
      return { fen: req.fen, lines: sorted, bestmove, depth, ms: performance.now() - start };
    } finally {
      this.busy = false;
    }
  }

  terminate(): void {
    this.transport.terminate();
    this.listeners.clear();
  }
}
