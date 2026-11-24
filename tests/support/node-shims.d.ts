// Minimal declarations for the few Node APIs the tests use, so the project
// does not need @types/node.
declare module 'node:module' {
  export function createRequire(url: string): unknown;
}
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export function writeFileSync(path: string | URL, data: string): void;
  export function existsSync(path: string | URL): boolean;
}
