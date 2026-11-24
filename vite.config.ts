import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';

// GitHub Pages serves a project site from /<repo>/. CI sets BASE_PATH from the
// repository name. Cloudflare Pages and local previews use the root path.
const base = process.env.BASE_PATH ?? '/';

// GitHub Pages cannot send response headers, so the policy ships as a <meta>
// tag. It is added only to production builds because Vite's dev server needs
// inline scripts and a websocket for hot reload.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://lichess.org https://api.chess.com",
  "img-src 'self' data: blob:",
  "style-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'monachessimo-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  base,
  plugins: [preact(), contentSecurityPolicy()],
  build: {
    target: 'es2022',
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
});
