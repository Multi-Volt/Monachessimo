import { createRequire } from 'node:module';
import type { Transport } from '../../src/engine/engine';
import { EnginePool } from '../../src/engine/pool';

interface NodeStockfish {
  processCommand(cmd: string): void;
  listener?: (line: string) => void;
  terminate?: () => void;
}

type NodeRequire = ((id: string) => unknown) & {
  resolve(id: string): string;
  cache: Record<string, unknown>;
};

const require = createRequire(import.meta.url) as NodeRequire;
const enginePath = require.resolve('stockfish/bin/stockfish-19-lite-single.js');

/**
 * The Node build keeps one engine object per loaded module, so each engine
 * needs a fresh copy of the module.
 */
function loadEngine(onLine: (line: string) => void): NodeStockfish {
  delete require.cache[enginePath];
  const factory = require(enginePath) as () => NodeStockfish;
  const engine = factory();
  engine.listener = onLine;
  return engine;
}

/** Runs the same lite single-threaded build the app ships, inside Node. */
export function nodeTransport(): Transport {
  const listeners: ((line: string) => void)[] = [];
  const engine = loadEngine((line) => {
    for (const l of listeners) l(line);
  });
  return {
    post: (c) => engine.processCommand(c),
    onLine: (l) => void listeners.push(l),
    terminate: () => engine.terminate?.(),
  };
}

export function nodePool(size = 1): EnginePool {
  return new EnginePool(nodeTransport, size);
}
