// The build config files read a few environment variables. Declaring
// `process` here avoids pulling Node's full type definitions into the project.
declare const process: { env: Record<string, string | undefined> };

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: 'utf8' | 'base64'): string;
}
