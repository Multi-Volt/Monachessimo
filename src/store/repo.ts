import type { GameAnalysis } from '../analysis/types';
import type { SearchRequest, SearchResult } from '../engine/engine';
import { searchKey } from '../engine/engine';
import type { Game } from '../import/types';
import type { TagRecord } from '../detectors';
import type { Drill, ReviewState } from '../drills/types';
import {
  openStore,
  STORE_NAMES,
  DB_VERSION,
  type DB,
  type LessonProgress,
  type StoreName,
} from './db';

/** Data access used by the app. Each call opens its own short transaction. */
export class Repo {
  constructor(private readonly db: DB) {}

  static async open(): Promise<Repo> {
    return new Repo(await openStore());
  }

  // Games
  putGame(game: Game): Promise<string> {
    return this.db.put('games', game);
  }
  getGame(id: string): Promise<Game | undefined> {
    return this.db.get('games', id);
  }
  async gamesFor(owner: string): Promise<Game[]> {
    const games = await this.db.getAllFromIndex('games', 'byOwner', owner.toLowerCase());
    return games.sort((a, b) => b.playedAt - a.playedAt);
  }
  async allGames(): Promise<Game[]> {
    const games = await this.db.getAll('games');
    return games.sort((a, b) => b.playedAt - a.playedAt);
  }
  async hasGame(id: string): Promise<boolean> {
    return (await this.db.getKey('games', id)) !== undefined;
  }

  // Analysis
  getAnalysis(gameId: string): Promise<GameAnalysis | undefined> {
    return this.db.get('analyses', gameId);
  }
  putAnalysis(a: GameAnalysis): Promise<string> {
    return this.db.put('analyses', a);
  }
  allAnalyses(): Promise<GameAnalysis[]> {
    return this.db.getAll('analyses');
  }

  // Tags
  async replaceTags(gameId: string, tags: TagRecord[]): Promise<void> {
    const tx = this.db.transaction('tags', 'readwrite');
    const old = await tx.store.index('byGame').getAllKeys(gameId);
    for (const k of old) void tx.store.delete(k);
    for (const t of tags) void tx.store.put(t as never);
    await tx.done;
  }
  async allTags(): Promise<TagRecord[]> {
    return (await this.db.getAll('tags')) as unknown as TagRecord[];
  }

  // Drills and scheduler state
  async allDrills(): Promise<Drill[]> {
    return (await this.db.getAll('drills')) as unknown as Drill[];
  }
  async putDrills(drills: Drill[]): Promise<void> {
    const tx = this.db.transaction('drills', 'readwrite');
    for (const d of drills) void tx.store.put(d as never);
    await tx.done;
  }
  async allReviews(): Promise<ReviewState[]> {
    return (await this.db.getAll('reviews')) as unknown as ReviewState[];
  }
  async putReview(r: ReviewState): Promise<void> {
    await this.db.put('reviews', r as never);
  }

  // Engine cache
  async cachedSearch(req: SearchRequest): Promise<SearchResult | undefined> {
    return (await this.db.get('positions', searchKey(req)))?.result;
  }
  async putSearch(req: SearchRequest, result: SearchResult): Promise<void> {
    await this.db.put('positions', { key: searchKey(req), result });
  }

  // Settings and meta
  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const r = await this.db.get('settings', key);
    return r === undefined ? fallback : (r.value as T);
  }
  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db.put('settings', { key, value });
  }
  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('meta', key))?.value as T | undefined;
  }
  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.put('meta', { key, value });
  }

  // Generic access for later phases
  getAll<S extends StoreName>(store: S) {
    return this.db.getAll(store);
  }
  put<S extends StoreName>(store: S, value: Parameters<DB['put']>[1]) {
    return this.db.put(store, value as never);
  }
  delete<S extends StoreName>(store: S, key: string) {
    return this.db.delete(store, key);
  }

  // Lessons
  allLessons(): Promise<LessonProgress[]> {
    return this.db.getAll('lessons');
  }
  getLesson(id: string): Promise<LessonProgress | undefined> {
    return this.db.get('lessons', id);
  }
  async putLesson(p: LessonProgress): Promise<void> {
    await this.db.put('lessons', p);
  }

  // Export and import
  async exportAll(): Promise<ExportFile> {
    const stores: Partial<Record<StoreName, unknown[]>> = {};
    for (const name of STORE_NAMES) stores[name] = await this.db.getAll(name);
    return { app: 'monachessimo', schema: DB_VERSION, exportedAt: Date.now(), stores };
  }

  /** Adds records from an export file. Existing records with the same key are replaced. */
  async importAll(file: unknown): Promise<number> {
    const f = file as Partial<ExportFile>;
    if (f.app !== 'monachessimo' || typeof f.stores !== 'object' || !f.stores)
      throw new Error('This file is not a Monachessimo export.');
    if ((f.schema ?? 0) > DB_VERSION)
      throw new Error(
        'This file comes from a newer version of Monachessimo. Update the app first.',
      );
    let count = 0;
    for (const name of STORE_NAMES) {
      const rows = f.stores[name];
      if (!Array.isArray(rows)) continue;
      const tx = this.db.transaction(name, 'readwrite');
      for (const row of rows) {
        void tx.store.put(row as never);
        count++;
      }
      await tx.done;
    }
    return count;
  }
}

export interface ExportFile {
  app: 'monachessimo';
  schema: number;
  exportedAt: number;
  stores: Partial<Record<StoreName, unknown[]>>;
}
