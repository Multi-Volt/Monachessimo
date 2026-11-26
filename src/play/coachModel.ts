// The coach's wording model: a small language model, run on the device by
// wllama, that rewrites the coach notes of a move into plain sentences.
// The model reads the notes with the moves in words; the checker reads them
// with the notation, which keeps the exact moves. The template text shows
// first; the model's text replaces it only when the checker accepts it, so a
// wrong or slow answer is never shown.
//
// The model files are not in the repository. CI downloads them from a
// release of this project and serves them from the site under
// models/coach/: the GGUF file cut into parts of 24 MiB, since static hosts
// limit file sizes and one tensor of the model is larger than that, and a
// manifest.json listing them. A build without them, such as the offline
// file, offers no model. The parts are kept in a cache named after the
// version, so a new model replaces the old one.
import { createStore } from '../ui/store';
import { checkCoachText, spellMoves } from './coachNotes';

export interface ModelManifest {
  /** The model's version, such as "coach-v1". */
  version: string;
  /** Total download size in bytes. */
  bytes: number;
  /** The parts of the GGUF file, in order, joined in the browser. */
  parts: string[];
}

export type ModelState =
  | { kind: 'off' }
  | { kind: 'loading'; loaded: number; total: number }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string };

export const modelState = createStore<{ state: ModelState }>({ state: { kind: 'off' } });

const dir = () => `${import.meta.env.BASE_URL}models/coach/`;

/** The prompt, in SmolLM2's chat form without its default system prompt, as trained. */
export const promptFor = (sheet: string): string =>
  `<|im_start|>user\n${sheet}<|im_end|>\n<|im_start|>assistant\n`;

/** The model's text for `notes` if the checker accepts it, else undefined. */
export function accepted(notes: string, text: string): string | undefined {
  const t = text.trim();
  return t && !checkCoachText(notes, t).length ? t : undefined;
}

/** A second try samples, so it can differ from a refused first one. */
const TRIES = [0, 0.7];

let manifest: Promise<ModelManifest | undefined> | undefined;

/** The deployed model's manifest, or undefined when this build has none. */
export function getManifest(): Promise<ModelManifest | undefined> {
  manifest ??= fetch(`${dir()}manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<ModelManifest>) : undefined))
    .catch(() => undefined);
  return manifest;
}

type Wllama = import('@wllama/wllama').Wllama;
let model: Promise<Wllama> | undefined;

/**
 * Downloads the model the first time, from then on loads it from the
 * browser's cache, and keeps it loaded. Progress goes to `modelState`.
 */
export function loadModel(): Promise<Wllama> {
  model ??= (async () => {
    const m = await getManifest();
    if (!m) throw new Error('This build has no coach model.');
    modelState.set({ state: { kind: 'loading', loaded: 0, total: m.bytes } });
    const [{ Wllama }, { default: wasm }] = await Promise.all([
      import('@wllama/wllama'),
      import('@wllama/wllama/esm/wasm/wllama.wasm?url'),
    ]);
    const file = await download(m);
    const w = new Wllama({ default: wasm }, { suppressNativeLog: true });
    // The CPU, for now: WebGPU on phones is untested. Threads need a
    // cross-origin isolated page, which GitHub Pages cannot serve yet.
    await w.loadModel([file], { n_ctx: 1024, n_gpu_layers: 0 });
    modelState.set({ state: { kind: 'ready' } });
    return w;
  })().catch((e: unknown) => {
    model = undefined;
    modelState.set({ state: { kind: 'failed', message: String(e) } });
    throw e;
  });
  return model;
}

/** The model file, from the cache or the site, with progress in `modelState`. */
async function download(m: ModelManifest): Promise<Blob> {
  const name = `coach-model-${m.version}`;
  const cache = await caches.open(name);
  for (const old of await caches.keys())
    if (old.startsWith('coach-model-') && old !== name) await caches.delete(old);
  let loaded = 0;
  const blobs = await Promise.all(
    m.parts.map(async (part) => {
      const url = `${dir()}${part}`;
      let res = await cache.match(url);
      if (!res) {
        const fresh = await fetch(url);
        if (!fresh.ok) throw new Error(`Could not download ${part}.`);
        await cache.put(url, fresh.clone());
        res = fresh;
      }
      const blob = await res.blob();
      loaded += blob.size;
      modelState.set({ state: { kind: 'loading', loaded, total: m.bytes } });
      return blob;
    }),
  );
  return new Blob(blobs);
}

/** Removes the downloaded model from this device. */
export async function deleteModel(): Promise<void> {
  await unloadModel();
  for (const name of await caches.keys())
    if (name.startsWith('coach-model-')) await caches.delete(name);
}

/** Frees the model's memory, as when the player turns it off. */
export async function unloadModel(): Promise<void> {
  const m = model;
  model = undefined;
  modelState.set({ state: { kind: 'off' } });
  if (m) await (await m.catch(() => undefined))?.exit();
}

// One answer at a time: the model has one context.
let queue: Promise<unknown> = Promise.resolve();
const answers = new Map<string, string | undefined>();

/**
 * The model's accepted text for the coach notes `notes`, or undefined when
 * both tries wrote something the checker refuses. Answers are kept, so the
 * same notes are written once.
 */
export function phrase(notes: string, signal?: AbortSignal): Promise<string | undefined> {
  if (answers.has(notes)) return Promise.resolve(answers.get(notes));
  const run = queue.then(async () => {
    const w = await loadModel();
    let text: string | undefined;
    for (const temperature of TRIES) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const out = await w.createCompletion({
        prompt: promptFor(spellMoves(notes)),
        max_tokens: 160,
        temperature,
        stop: ['<|im_end|>'],
        ...(signal ? { abortSignal: signal } : {}),
      });
      text = accepted(notes, out.choices[0]?.text ?? '');
      if (text) break;
    }
    answers.set(notes, text);
    return text;
  });
  queue = run.catch(() => undefined);
  return run;
}
