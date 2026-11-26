import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { starterPuzzles } from './scripts/starter-puzzles.ts';
import { engineInline } from './scripts/engine-inline.ts';

// GitHub Pages serves a project site from /<repo>/. CI sets BASE_PATH from the
// repository name. Cloudflare Pages and local previews use the root path.
const base = process.env.BASE_PATH ?? '/';

// GitHub Pages cannot send response headers, so the policy ships as a <meta>
// tag. It is added only to production builds because Vite's dev server needs
// inline scripts and a websocket for hot reload.
function policy(offline: boolean): string {
  return [
    "default-src 'self'",
    // The offline bundle is one HTML file, so its script is inline.
    offline
      ? "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:"
      : "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    // The offline bundle's engine worker loads its WASM from a blob: URL.
    `connect-src 'self' https://lichess.org https://api.chess.com${offline ? ' blob: data:' : ''}`,
    "img-src 'self' data: blob:",
    offline ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
    offline ? "font-src 'self' data:" : "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function contentSecurityPolicy(offline: boolean): Plugin {
  return {
    name: 'monachessimo-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy(offline) },
        injectTo: 'head-prepend',
      },
    ],
  };
}

const appManifest = {
  name: 'Monachessimo',
  short_name: 'Monachessimo',
  description: 'A free chess trainer that analyzes your own games on your device.',
  lang: 'en',
  start_url: '.',
  scope: '.',
  display: 'standalone' as const,
  background_color: '#f8f4ec',
  theme_color: '#f8f4ec',
  icons: [
    { src: 'icons/placeholder-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/placeholder-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/placeholder-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

export default defineConfig(({ mode }) => {
  const offline = mode === 'offline';
  return {
    base: offline ? './' : base,
    // The offline bundle is one file; public/ (icons, puzzle shards) stays out.
    publicDir: offline ? false : 'public',
    define: { __OFFLINE__: JSON.stringify(offline) },
    plugins: [
      preact(),
      contentSecurityPolicy(offline),
      starterPuzzles(),
      engineInline(),
      ...(offline
        ? [viteSingleFile()]
        : [
            VitePWA({
              registerType: 'prompt',
              injectRegister: false,
              manifest: appManifest,
              includeAssets: ['icons/placeholder-180.png'],
              workbox: {
                // Adds the cross-origin isolation headers: see public/sw-isolation.js.
                importScripts: ['sw-isolation.js'],
                globPatterns: ['**/*.{js,css,html,wasm,woff2,png,svg}'],
                // The coach model and its 10 MB runtime are fetched only by players who
                // turn the model on; wllama keeps the model in its own cache.
                // The 3D board's pieces and three.js load only for players who choose it.
                globIgnores: [
                  'puzzles/**',
                  'models/**',
                  '3d/**',
                  'assets/wllama-*.wasm',
                  'assets/Board3D-*.js',
                ],
                // The engine's WASM is 1.8 MB.
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
                navigateFallback: 'index.html',
                runtimeCaching: [
                  {
                    // Puzzle shards are cached when a session first needs them.
                    urlPattern: ({ url }) => url.pathname.includes('/puzzles/'),
                    handler: 'StaleWhileRevalidate',
                    options: { cacheName: 'puzzles', expiration: { maxEntries: 600 } },
                  },
                  {
                    urlPattern: ({ url }) =>
                      url.pathname.includes('/3d/') ||
                      /\/assets\/Board3D-[^/]+\.js$/.test(url.pathname),
                    handler: 'CacheFirst',
                    options: { cacheName: 'board-3d', expiration: { maxEntries: 20 } },
                  },
                  {
                    urlPattern: ({ url }) => /\/assets\/wllama-[^/]+\.wasm$/.test(url.pathname),
                    handler: 'CacheFirst',
                    options: { cacheName: 'coach-model-runtime', expiration: { maxEntries: 2 } },
                  },
                ],
              },
            }),
          ]),
    ],
    build: {
      target: 'es2022',
      ...(offline ? { outDir: 'dist-offline', assetsInlineLimit: 100_000_000 } : {}),
    },
    test: {
      include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
      testTimeout: 20_000,
    },
  };
});
