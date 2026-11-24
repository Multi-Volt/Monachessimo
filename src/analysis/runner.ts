import type { EnginePool } from '../engine/pool';
import type { Game } from '../import/types';
import type { Repo } from '../store/repo';
import { analyzeGame, type Search } from './pipeline';
import { settingsKey, type AnalysisSettings } from './types';

export interface RunnerState {
  status: 'idle' | 'running' | 'paused' | 'error';
  /** Game being analyzed, if any. */
  currentGameId?: string | undefined;
  phase?: 'fast' | 'deep' | undefined;
  /** Positions done and total in the current game's current phase. */
  done: number;
  total: number;
  gamesDone: number;
  gamesTotal: number;
  /** Estimated milliseconds left for the whole queue. */
  etaMs?: number | undefined;
  error?: string | undefined;
}

/** Search that reads and writes the engine cache in IndexedDB. */
export function cachedSearch(repo: Repo, pool: EnginePool): Search {
  return async (req, signal) => {
    const hit = await repo.cachedSearch(req);
    if (hit) return { ...hit, ms: 0 };
    const result = await pool.search(req, signal);
    await repo.putSearch(req, result);
    return result;
  };
}

/**
 * Analyzes a queue of games one at a time. Inside a game, positions run in
 * parallel across the engine pool. Progress is saved per game, so a pause or
 * a closed tab loses at most a few positions.
 */
export class AnalysisRunner {
  private listeners = new Set<(s: RunnerState) => void>();
  private ctrl: AbortController | undefined;
  private queue: Game[] = [];
  private loop: Promise<void> | undefined;
  /** Running average of wall-clock milliseconds per fast-pass position. */
  private msPerPosition = 400;
  state: RunnerState = { status: 'idle', done: 0, total: 0, gamesDone: 0, gamesTotal: 0 };

  constructor(
    private readonly repo: Repo,
    private readonly pool: EnginePool,
    private settings: AnalysisSettings,
  ) {}

  subscribe(l: (s: RunnerState) => void): () => void {
    this.listeners.add(l);
    l(this.state);
    return () => this.listeners.delete(l);
  }

  private set(patch: Partial<RunnerState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  setSettings(s: AnalysisSettings): void {
    this.settings = s;
  }

  /** Queues every stored game that has no finished analysis with the current settings. */
  async enqueuePending(): Promise<number> {
    const key = settingsKey(this.settings);
    const [games, analyses] = await Promise.all([this.repo.allGames(), this.repo.allAnalyses()]);
    const done = new Set(
      analyses.filter((a) => a.status === 'done' && a.settings === key).map((a) => a.gameId),
    );
    this.queue = games.filter((g) => !done.has(g.id));
    this.set({ gamesDone: 0, gamesTotal: this.queue.length, etaMs: this.estimate() });
    return this.queue.length;
  }

  start(): void {
    if (this.state.status === 'running' || this.queue.length === 0) {
      if (this.queue.length === 0) this.set({ status: 'idle' });
      return;
    }
    this.ctrl = new AbortController();
    this.set({ status: 'running', error: undefined });
    this.loop = this.run(this.ctrl.signal);
  }

  async pause(): Promise<void> {
    if (this.state.status !== 'running') return;
    this.ctrl?.abort(new DOMException('Paused', 'AbortError'));
    this.pool.clearQueue(new DOMException('Paused', 'AbortError'));
    await this.loop;
  }

  private estimate(): number {
    const positions = this.queue.reduce((n, g) => n + (g.importedEvals ? 2 : g.uci.length + 1), 0);
    // The deep pass adds roughly a quarter on top of the fast pass.
    return (positions * this.msPerPosition * 1.25) / Math.max(1, this.pool.size);
  }

  private async run(signal: AbortSignal): Promise<void> {
    const search = cachedSearch(this.repo, this.pool);
    try {
      while (this.queue.length && !signal.aborted) {
        const game = this.queue[0]!;
        const resume = await this.repo.getAnalysis(game.id);
        const started = performance.now();
        let fastPositions = 0;
        this.set({ currentGameId: game.id, done: 0, total: game.uci.length + 1 });
        await analyzeGame(game, {
          search,
          settings: this.settings,
          ...(resume ? { resume } : {}),
          signal,
          onProgress: (p) => {
            if (p.phase === 'fast') fastPositions = p.done;
            this.set({ phase: p.phase, done: p.done, total: p.total });
          },
          onCheckpoint: (a) => this.repo.putAnalysis(a).then(() => undefined),
        });
        const elapsed = performance.now() - started;
        if (fastPositions > 0) {
          const sample = (elapsed * Math.max(1, this.pool.size)) / fastPositions / 1.25;
          this.msPerPosition = this.msPerPosition * 0.7 + sample * 0.3;
        }
        this.queue.shift();
        this.set({ gamesDone: this.state.gamesDone + 1, etaMs: this.estimate() });
      }
      this.set({
        status: signal.aborted ? 'paused' : 'idle',
        currentGameId: undefined,
        phase: undefined,
      });
    } catch (err) {
      if (signal.aborted) {
        this.set({ status: 'paused', etaMs: this.estimate() });
        return;
      }
      this.set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }
}
