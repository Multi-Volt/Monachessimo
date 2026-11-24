/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** True in the single-file offline bundle (`npm run build:offline`). */
declare const __OFFLINE__: boolean;

declare module 'virtual:engine-inline' {
  export const js: string;
  export const wasmBase64: string;
}

declare module 'virtual:starter-puzzles' {
  import type { Manifest, PuzzleRow } from './puzzles/loader';
  const starter: { manifest: Manifest; shards: Record<string, PuzzleRow[]> };
  export default starter;
}
