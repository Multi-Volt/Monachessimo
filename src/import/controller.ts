import type { Repo } from '../store/repo';
import { importChessCom } from './chesscom';
import { importLichess } from './lichess';
import type { Source } from './types';

export interface ImportRequest {
  source: Source;
  username: string;
  max: number;
  signal?: AbortSignal;
  onCount?: (count: number) => void;
  onWait?: (ms: number) => void;
}

/**
 * Imports games into the store. When games for this player are already
 * stored, fetches only games newer than the most recent one.
 */
export async function importGames(repo: Repo, req: ImportRequest): Promise<number> {
  const owner = req.username.trim().toLowerCase();
  const existing = (await repo.gamesFor(owner)).filter((g) => g.source === req.source);
  const since = existing.length ? Math.max(...existing.map((g) => g.playedAt)) : undefined;
  let count = 0;
  const opts = {
    max: req.max,
    ...(since !== undefined ? { since } : {}),
    ...(req.signal ? { signal: req.signal } : {}),
    ...(req.onWait ? { onWait: req.onWait } : {}),
    onGame: async (game: Parameters<Parameters<typeof importLichess>[1]['onGame']>[0]) => {
      if (await repo.hasGame(game.id)) return;
      await repo.putGame(game);
      req.onCount?.(++count);
    },
  };
  if (req.source === 'lichess') await importLichess(req.username.trim(), opts);
  else await importChessCom(req.username.trim(), opts);
  await repo.setMeta('lastImport', {
    source: req.source,
    username: req.username.trim(),
    at: Date.now(),
  });
  return count;
}
