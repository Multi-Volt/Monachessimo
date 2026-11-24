import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const ID = 'virtual:engine-inline';

/**
 * Provides `virtual:engine-inline` for the offline bundle: the Stockfish
 * loader as text and its WASM as base64, so one HTML file holds the engine.
 */
export function engineInline(dir = 'node_modules/stockfish/bin'): Plugin {
  return {
    name: 'monachessimo-engine-inline',
    resolveId: (id) => (id === ID ? `\0${ID}` : undefined),
    load(id) {
      if (id !== `\0${ID}`) return undefined;
      const js = readFileSync(`${dir}/stockfish-19-lite-single.js`, 'utf8');
      const wasm = readFileSync(`${dir}/stockfish-19-lite-single.wasm`, 'base64');
      return `export const js = ${JSON.stringify(js)};\nexport const wasmBase64 = ${JSON.stringify(wasm)};`;
    },
  };
}
