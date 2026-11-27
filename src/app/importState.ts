import { importGames } from '../import/controller';
import { ImportError, type Source } from '../import/types';
import { createStore } from '../ui/store';
import { getServices } from './services';

export interface ImportState {
  status: 'idle' | 'running' | 'done' | 'error';
  source?: Source | undefined;
  username?: string | undefined;
  count: number;
  /** Set while waiting out a rate limit. */
  waitingUntil?: number | undefined;
  error?: string | undefined;
}

export const importState = createStore<ImportState>({ status: 'idle', count: 0 });

let ctrl: AbortController | undefined;

/** Imports games, then queues and starts analysis. */
export async function startImport(
  source: Source,
  username: string,
  max: number,
  range?: { from: number; to?: number },
): Promise<void> {
  const { repo, runner } = await getServices();
  ctrl?.abort();
  ctrl = new AbortController();
  importState.set({
    status: 'running',
    source,
    username,
    count: 0,
    error: undefined,
    waitingUntil: undefined,
  });
  try {
    await importGames(repo, {
      source,
      username,
      max,
      ...(range ? { range } : {}),
      signal: ctrl.signal,
      onCount: (count) => importState.set({ count, waitingUntil: undefined }),
      onWait: (ms) => importState.set({ waitingUntil: Date.now() + ms }),
    });
    importState.set({ status: 'done', waitingUntil: undefined });
    await repo.setMeta('player', { source, username });
    await runner.enqueuePending();
    runner.start();
  } catch (err) {
    if (ctrl.signal.aborted) return;
    const message =
      err instanceof ImportError
        ? err.message
        : 'The import stopped because of an unexpected error.';
    importState.set({ status: 'error', error: message, waitingUntil: undefined });
  }
}

export function cancelImport(): void {
  ctrl?.abort();
  importState.set({ status: 'idle' });
}
