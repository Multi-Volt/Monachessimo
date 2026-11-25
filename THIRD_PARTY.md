# Third-party software and credits

This file lists every dependency, its license, and its source. Update it whenever a dependency is added or removed.

## Shipped in the app

| Package or asset                                                                                                                                         | License          | Source                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| preact                                                                                                                                                   | MIT              | https://github.com/preactjs/preact                         |
| stockfish 19.0.1, the lite single-threaded build (stockfish.js by Nathan Rugg, from Stockfish by the Stockfish developers)                               | GPL-3.0          | https://github.com/nmrugg/stockfish.js                     |
| chessops                                                                                                                                                 | GPL-3.0-or-later | https://github.com/niklasf/chessops                        |
| chessground                                                                                                                                              | GPL-3.0-or-later | https://github.com/lichess-org/chessground                 |
| Chess pieces by Colin M.L. Burnett, embedded in chessground's CSS                                                                                        | GPL-2.0-or-later | https://github.com/lichess-org/lila/blob/master/COPYING.md |
| idb                                                                                                                                                      | ISC              | https://github.com/jakearchibald/idb                       |
| Figtree typeface by Erik Kennedy, from @fontsource-variable/figtree                                                                                      | OFL-1.1          | https://github.com/erikdkennedy/figtree                    |
| Workbox runtime (workbox-window and the generated service worker)                                                                                        | MIT              | https://github.com/GoogleChrome/workbox                    |
| Lichess puzzle database, built into `puzzles/` at deploy time                                                                                            | CC0-1.0          | https://database.lichess.org/#puzzles                      |
| Lesson format, lesson content and English lesson texts from Patzer, commit ba73060, adapted in `src/learn/` (Copyright (c) 2026 the Patzer contributors) | MIT              | https://github.com/SikamikanikoBG/patzer                   |

## Build and test tools (not shipped)

| Package                                                                                                   | License                 | Source                                                   |
| --------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------- |
| vite                                                                                                      | MIT                     | https://github.com/vitejs/vite                           |
| @preact/preset-vite                                                                                       | MIT                     | https://github.com/preactjs/preset-vite                  |
| vite-plugin-pwa                                                                                           | MIT                     | https://github.com/vite-pwa/vite-plugin-pwa              |
| workbox-build                                                                                             | MIT                     | https://github.com/GoogleChrome/workbox                  |
| vite-plugin-singlefile                                                                                    | MIT                     | https://github.com/richardtallent/vite-plugin-singlefile |
| typescript                                                                                                | Apache-2.0              | https://github.com/microsoft/TypeScript                  |
| vitest                                                                                                    | MIT                     | https://github.com/vitest-dev/vitest                     |
| @playwright/test                                                                                          | Apache-2.0              | https://github.com/microsoft/playwright                  |
| eslint, @eslint/js                                                                                        | MIT                     | https://github.com/eslint/eslint                         |
| typescript-eslint                                                                                         | MIT                     | https://github.com/typescript-eslint/typescript-eslint   |
| prettier                                                                                                  | MIT                     | https://github.com/prettier/prettier                     |
| eslint-config-prettier                                                                                    | MIT                     | https://github.com/prettier/eslint-config-prettier       |
| Lighthouse, run through npx by `scripts/a11y-audit.mjs`, not installed                                    | Apache-2.0              | https://github.com/GoogleChrome/lighthouse               |
| Lichess puzzle and game databases, read by `training/export-records.ts` for training records, not shipped | CC0-1.0                 | https://database.lichess.org                             |
| zstd command, run by `training/export-records.ts` to read those files, not installed                      | BSD-3-Clause or GPL-2.0 | https://github.com/facebook/zstd                         |
