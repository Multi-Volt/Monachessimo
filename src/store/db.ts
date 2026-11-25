import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SearchResult } from '../engine/engine';
import type { GameAnalysis } from '../analysis/types';
import type { Game } from '../import/types';

export const DB_NAME = 'monachessimo';
export const DB_VERSION = 2;

export interface CachedSearch {
  key: string;
  result: SearchResult;
}

/** Progress through one lesson of the Learn tab. */
export interface LessonProgress {
  id: string;
  /** Steps finished, so a lesson resumes where it was left. */
  step: number;
  /** Best stars earned, 0 until the lesson is finished once. */
  stars: 0 | 1 | 2 | 3;
  updatedAt: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

/**
 * Store layout. Stores used by later phases exist from version 1 so that
 * export and delete cover everything from the start.
 */
export interface Schema extends DBSchema {
  games: { key: string; value: Game; indexes: { byOwner: string; byPlayedAt: number } };
  positions: { key: string; value: CachedSearch };
  analyses: { key: string; value: GameAnalysis };
  tags: {
    key: string;
    value: { id: string; gameId: string } & Record<string, unknown>;
    indexes: { byGame: string };
  };
  drills: { key: string; value: { id: string } & Record<string, unknown> };
  reviews: { key: string; value: { id: string } & Record<string, unknown> };
  settings: { key: string; value: MetaRecord };
  meta: { key: string; value: MetaRecord };
  lessons: { key: string; value: LessonProgress };
}

export type StoreName =
  | 'games'
  | 'positions'
  | 'analyses'
  | 'tags'
  | 'drills'
  | 'reviews'
  | 'settings'
  | 'meta'
  | 'lessons';
export const STORE_NAMES: StoreName[] = [
  'games',
  'positions',
  'analyses',
  'tags',
  'drills',
  'reviews',
  'settings',
  'meta',
  'lessons',
];

export type DB = IDBPDatabase<Schema>;

/**
 * Migrations run in order from the stored version to DB_VERSION. Add a new
 * entry for each version; never edit an old one.
 */
const MIGRATIONS: Array<(db: IDBPDatabase<Schema>) => void> = [
  // Version 1.
  (db) => {
    const games = db.createObjectStore('games', { keyPath: 'id' });
    games.createIndex('byOwner', 'owner');
    games.createIndex('byPlayedAt', 'playedAt');
    db.createObjectStore('positions', { keyPath: 'key' });
    db.createObjectStore('analyses', { keyPath: 'gameId' });
    const tags = db.createObjectStore('tags', { keyPath: 'id' });
    tags.createIndex('byGame', 'gameId');
    db.createObjectStore('drills', { keyPath: 'id' });
    db.createObjectStore('reviews', { keyPath: 'id' });
    db.createObjectStore('settings', { keyPath: 'key' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },
  // Version 2: lesson progress for the Learn tab.
  (db) => {
    db.createObjectStore('lessons', { keyPath: 'id' });
  },
];

let opened: Promise<DB> | undefined;

export function openStore(name = DB_NAME): Promise<DB> {
  if (name !== DB_NAME) return open(name);
  opened ??= open(name);
  return opened;
}

function open(name: string): Promise<DB> {
  return openDB<Schema>(name, MIGRATIONS.length, {
    upgrade(db, oldVersion) {
      for (let v = oldVersion; v < MIGRATIONS.length; v++) MIGRATIONS[v]!(db);
    },
    blocking() {
      // Another tab wants a newer version. Close so it can upgrade.
      void opened?.then((db) => db.close());
      opened = undefined;
    },
  });
}

export async function deleteEverything(name = DB_NAME): Promise<void> {
  const db = await opened;
  db?.close();
  opened = undefined;
  await deleteDB(name);
}
