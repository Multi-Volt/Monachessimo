import { Engine, type SearchRequest, type SearchResult, type Transport } from './engine';

/** Default pool size: one engine per spare core, at most four. */
export function defaultPoolSize(cores = globalThis.navigator?.hardwareConcurrency ?? 2): number {
  return Math.max(1, Math.min(cores - 1, 4));
}

interface Job {
  req: SearchRequest;
  signal: AbortSignal | undefined;
  resolve: (r: SearchResult) => void;
  reject: (e: unknown) => void;
}

/** Runs searches across several engines. Each engine handles one search at a time. */
export class EnginePool {
  private engines: Engine[] = [];
  private idle: Engine[] = [];
  private queue: Job[] = [];

  constructor(
    private readonly makeTransport: () => Transport,
    size: number,
  ) {
    this.resize(size);
  }

  get size(): number {
    return this.engines.length;
  }

  /** Grows or shrinks the pool. Busy engines finish their search before they stop. */
  resize(size: number): void {
    const target = Math.max(1, Math.floor(size));
    while (this.engines.length < target) {
      const e = new Engine(this.makeTransport());
      this.engines.push(e);
      this.idle.push(e);
    }
    while (this.engines.length > target) {
      const e = this.engines.pop()!;
      const i = this.idle.indexOf(e);
      if (i >= 0) {
        this.idle.splice(i, 1);
        e.terminate();
      } else {
        this.retiring.add(e);
      }
    }
    this.pump();
  }

  private retiring = new Set<Engine>();

  search(req: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      this.queue.push({ req, signal, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.idle.length && this.queue.length) {
      const engine = this.idle.pop()!;
      const job = this.queue.shift()!;
      if (job.signal?.aborted) {
        this.idle.push(engine);
        job.reject(job.signal.reason);
        continue;
      }
      engine
        .search(job.req, job.signal)
        .then(job.resolve, job.reject)
        .finally(() => {
          if (this.retiring.delete(engine)) engine.terminate();
          else this.idle.push(engine);
          this.pump();
        });
    }
  }

  /** Rejects every queued search that has not started. */
  clearQueue(reason: unknown): void {
    for (const job of this.queue.splice(0)) job.reject(reason);
  }

  terminate(): void {
    this.clearQueue(new DOMException('Engine pool stopped', 'AbortError'));
    for (const e of this.engines) e.terminate();
    for (const e of this.retiring) e.terminate();
    this.engines = [];
    this.idle = [];
    this.retiring.clear();
  }
}
