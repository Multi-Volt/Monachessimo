import type { Transport } from './engine';

/** Script and WASM URLs for the engine worker. */
async function engineUrls(): Promise<{ js: string; wasm: string }> {
  if (__OFFLINE__) {
    // The single-file bundle embeds both files and serves them from blob: URLs.
    const { js, wasmBase64 } = await import('./worker-inline');
    const bytes = Uint8Array.from(atob(wasmBase64), (c) => c.charCodeAt(0));
    return {
      js: URL.createObjectURL(new Blob([js], { type: 'text/javascript' })),
      wasm: URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' })),
    };
  }
  const [{ default: js }, { default: wasm }] = await Promise.all([
    import('stockfish/bin/stockfish-19-lite-single.js?url'),
    import('stockfish/bin/stockfish-19-lite-single.wasm?url'),
  ]);
  // Chromium does not serve a dedicated worker's own script from the service
  // worker, so offline the worker would never start. Fetching the script here
  // goes through the service worker; the worker then runs from a blob: URL.
  const text = await (await fetch(js)).text();
  return {
    js: URL.createObjectURL(new Blob([text], { type: 'text/javascript' })),
    wasm: new URL(wasm, location.href).href,
  };
}

let urls: Promise<{ js: string; wasm: string }> | undefined;

/**
 * Starts Stockfish in a Web Worker. The engine script reads the WASM location
 * from its URL hash. Commands sent before the worker exists are queued.
 */
export function workerTransport(): Transport {
  const listeners: ((line: string) => void)[] = [];
  const queue: string[] = [];
  let worker: Worker | undefined;
  let stopped = false;
  urls ??= engineUrls();
  void urls.then(({ js, wasm }) => {
    if (stopped) return;
    worker = new Worker(`${js}#${encodeURIComponent(wasm)}`);
    worker.onmessage = (e: MessageEvent<unknown>) => {
      if (typeof e.data !== 'string') return;
      for (const l of listeners) l(e.data);
    };
    for (const c of queue.splice(0)) worker.postMessage(c);
  });
  return {
    post: (c) => (worker ? worker.postMessage(c) : queue.push(c)),
    onLine: (l) => void listeners.push(l),
    terminate: () => {
      stopped = true;
      worker?.terminate();
    },
  };
}
