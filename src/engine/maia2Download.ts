// Maia-2 as an opt-in download: the site serves it from models/maia2/ (put
// there at build time from a release of this project, see
// scripts/fetch-maia2.sh), and a player who wants Maia below 1100 downloads
// it once. It is kept in a cache named after its version, so a new version
// replaces the old one, and it works offline after that.
import { createStore } from '../ui/store';

interface Manifest {
  version: string;
  bytes: number;
  model: string;
  moves: string;
}

export type Maia2State =
  | { kind: 'unknown' }
  /** This build has no Maia-2. */
  | { kind: 'none' }
  | { kind: 'available'; bytes: number }
  | { kind: 'loading'; loaded: number; total: number }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string };

export const maia2State = createStore<{ state: Maia2State }>({ state: { kind: 'unknown' } });

const dir = () => `${import.meta.env.BASE_URL}models/maia2/`;
let manifest: Promise<Manifest | undefined> | undefined;

function getManifest(): Promise<Manifest | undefined> {
  if (__OFFLINE__) return Promise.resolve(undefined);
  manifest ??= fetch(`${dir()}manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : undefined))
    .catch(() => undefined);
  return manifest;
}

const cacheName = (m: Manifest) => `maia2-${m.version}`;

/** Finds out whether Maia-2 is offered here and whether it is downloaded. */
export async function checkMaia2(): Promise<Maia2State> {
  const m = await getManifest();
  let state: Maia2State;
  if (!m || typeof caches === 'undefined') state = { kind: 'none' };
  else {
    const cache = await caches.open(cacheName(m));
    const have =
      (await cache.match(`${dir()}${m.model}`)) && (await cache.match(`${dir()}${m.moves}`));
    state = have ? { kind: 'ready' } : { kind: 'available', bytes: m.bytes };
  }
  if (maia2State.get().state.kind !== 'loading') maia2State.set({ state });
  return state;
}

/** Downloads Maia-2 into its cache, with progress in `maia2State`. */
export async function downloadMaia2(): Promise<void> {
  const m = await getManifest();
  if (!m) throw new Error('This build has no Maia-2.');
  maia2State.set({ state: { kind: 'loading', loaded: 0, total: m.bytes } });
  try {
    for (const old of await caches.keys())
      if (old.startsWith('maia2-') && old !== cacheName(m)) await caches.delete(old);
    const cache = await caches.open(cacheName(m));
    const res = await fetch(`${dir()}${m.model}`);
    if (!res.ok || !res.body) throw new Error('Could not download Maia-2.');
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      maia2State.set({ state: { kind: 'loading', loaded, total: m.bytes } });
    }
    await cache.put(`${dir()}${m.model}`, new Response(new Blob(parts as BlobPart[])));
    const moves = await fetch(`${dir()}${m.moves}`);
    if (!moves.ok) throw new Error('Could not download Maia-2.');
    await cache.put(`${dir()}${m.moves}`, moves);
    maia2State.set({ state: { kind: 'ready' } });
  } catch (e) {
    maia2State.set({ state: { kind: 'failed', message: String(e) } });
    throw e;
  }
}

/** Removes Maia-2 from this device. */
export async function deleteMaia2(): Promise<void> {
  for (const name of await caches.keys()) if (name.startsWith('maia2-')) await caches.delete(name);
  await checkMaia2();
}

/** The downloaded model and its move list, or undefined when not downloaded. */
export async function maia2Files(): Promise<{ model: ArrayBuffer; moves: string[] } | undefined> {
  const m = await getManifest();
  if (!m || typeof caches === 'undefined') return undefined;
  const cache = await caches.open(cacheName(m));
  const model = await cache.match(`${dir()}${m.model}`);
  const moves = await cache.match(`${dir()}${m.moves}`);
  if (!model || !moves) return undefined;
  return { model: await model.arrayBuffer(), moves: (await moves.json()) as string[] };
}
