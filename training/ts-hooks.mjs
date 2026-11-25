// Resolve hook for running the app's TypeScript under Node.
// The sources import without extensions, as Vite allows; Node does not.
// This tries .ts, .tsx and /index.ts for relative imports that fail as written.
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const SUFFIXES = ['.ts', '.tsx', '/index.ts'];

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('.') || specifier.startsWith('/')) && context.parentURL) {
    for (const suffix of ['', ...SUFFIXES]) {
      const url = new URL(specifier + suffix, context.parentURL);
      if (url.protocol === 'file:' && existsSync(fileURLToPath(url)) && !url.pathname.endsWith('/'))
        if (suffix || /\.[cm]?[jt]sx?$|\.json$/.test(url.pathname)) return next(url.href, context);
    }
  }
  return next(specifier, context);
}
