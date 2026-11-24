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
declare module 'node:child_process' {
  interface Child {
    kill(): boolean;
    stdout: { on(e: 'data', l: (b: unknown) => void): void } | null;
    stderr: { on(e: 'data', l: (b: unknown) => void): void } | null;
  }
  export function spawn(
    cmd: string,
    args: string[],
    opts?: { cwd?: string; stdio?: unknown },
  ): Child;
}
