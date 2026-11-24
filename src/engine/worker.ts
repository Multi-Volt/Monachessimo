import engineJsUrl from 'stockfish/bin/stockfish-19-lite-single.js?url';
import engineWasmUrl from 'stockfish/bin/stockfish-19-lite-single.wasm?url';
import type { Transport } from './engine';

/**
 * Starts Stockfish in a Web Worker. The engine script reads the WASM location
 * from the URL hash, so Vite can give both files content-hashed names.
 */
export function workerTransport(): Transport {
  const wasm = new URL(engineWasmUrl, location.href).href;
  const worker = new Worker(`${engineJsUrl}#${encodeURIComponent(wasm)}`);
  const listeners: ((line: string) => void)[] = [];
  worker.onmessage = (e: MessageEvent<unknown>) => {
    if (typeof e.data !== 'string') return;
    for (const l of listeners) l(e.data);
  };
  return {
    post: (c) => worker.postMessage(c),
    onLine: (l) => void listeners.push(l),
    terminate: () => worker.terminate(),
  };
}
