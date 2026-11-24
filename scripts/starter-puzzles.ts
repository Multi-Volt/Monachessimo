import { existsSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** Bands and puzzles per theme kept in the offline bundle's starter set. */
const BANDS = [800, 1100, 1400, 1700, 2000];
const PER_SHARD = 30;
const ID = 'virtual:starter-puzzles';

interface Manifest {
  format: number;
  band: number;
  themes: Record<string, Record<string, { file: string; count: number }>>;
  puzzles: number;
  bytes: number;
}

/**
 * Provides `virtual:starter-puzzles` for the offline bundle: a few bands of
 * each theme from public/puzzles, small enough to embed in one HTML file.
 * Without built shards the starter set is empty and the app skips puzzles.
 */
export function starterPuzzles(dir = 'public/puzzles'): Plugin {
  return {
    name: 'monachessimo-starter-puzzles',
    resolveId: (id) => (id === ID ? `\0${ID}` : undefined),
    load(id) {
      if (id !== `\0${ID}`) return undefined;
      const empty: Manifest = { format: 1, band: 100, themes: {}, puzzles: 0, bytes: 0 };
      const path = `${dir}/manifest.json`;
      if (!existsSync(path))
        return `export default ${JSON.stringify({ manifest: empty, shards: {} })};`;
      const full = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
      const manifest: Manifest = { ...empty, band: full.band };
      const shards: Record<string, unknown[]> = {};
      for (const [theme, bands] of Object.entries(full.themes)) {
        for (const want of BANDS) {
          const band = Object.keys(bands).find((b) => Number(b) === want);
          if (!band) continue;
          const entry = bands[band]!;
          const rows = (
            JSON.parse(readFileSync(`${dir}/${entry.file}`, 'utf8')) as unknown[]
          ).slice(0, PER_SHARD);
          shards[entry.file] = rows;
          (manifest.themes[theme] ??= {})[band] = { file: entry.file, count: rows.length };
          manifest.puzzles += rows.length;
        }
      }
      return `export default ${JSON.stringify({ manifest, shards })};`;
    },
  };
}
