# Decisions

One short entry per non-obvious choice. Newest entries go at the bottom of each phase.

## Phase 0

**2026-11-24. TypeScript is pinned to 6.0.x.** The `latest` TypeScript on npm is 7.0.2, the native Go port. typescript-eslint 8.74 supports TypeScript below 6.1, or the native port from 7.1 onward. `package.json` uses `~6.0.3`. Move to 7.1 or later once typescript-eslint supports it as a normal peer.

**2026-11-24. Preact 11.** Preact 11.2.0 is the current release, and @preact/preset-vite 2.10.6 builds it without changes. The plan names Preact without a version.

**2026-11-24. No @types/node.** The only Node API the config files use is `process.env`. `config-env.d.ts` declares it, and `tsconfig.node.json` type-checks the config files on their own. App code cannot see `process`.

**2026-11-24. Pages path is `/Monachessimo/`.** The plan's default was `/monachessimo/`. The GitHub repository is `Multi-Volt/Monachessimo`, and Pages paths are case-sensitive. CI sets `BASE_PATH` from the repository name, so a rename needs no code change. Local and Cloudflare builds default to `/`.

**2026-11-24. The CSP is added only to production builds.** A Vite plugin in `vite.config.ts` prepends a `<meta http-equiv="Content-Security-Policy">` tag at build time. The dev server needs inline scripts and a websocket, which the policy blocks. The policy allows `'wasm-unsafe-eval'` and `blob:` workers for Stockfish, and connections to `lichess.org` and `api.chess.com` only. A meta tag cannot set `frame-ancestors`, so clickjacking protection waits for a host that supports headers. The Playwright test fails on any console error, which includes CSP violations.

**2026-11-24. The e2e test runs against the base-path build.** Playwright serves `vite preview` at the same `BASE_PATH` that CI deploys, so broken asset paths fail in CI instead of on the live site.

**2026-11-24. The UI skill installed with the plan's first command.** `claude plugin install unslop --marketplace heydamir/unslop` added the `heydamir` marketplace and installed `unslop@heydamir` at user scope. The skill's name is `unslop:unslop`. Its license, CC BY 4.0, matches the plan.

**2026-11-24. The prose skill's license is in `pstack/`.** The `cursor/plugins` repository has no root license. `pstack/LICENSE` is MIT, copyright 2026 Lauren Tan, which permits copying. The skill is vendored from commit `ca782ed8` with its license file. The only change is the frontmatter name, `unslop` to `unslop-prose`. It is a user-only slash command (`disable-model-invocation: true`), so the agent cannot call it on its own. In this phase the agent applied its rules by hand to all text.

**2026-11-24. `eval.ts` came early.** The winning-chances conversion from section 6.2 is the first unit under test, so the test setup checks real code. A mate score is converted to plus or minus 10,000 centipawns. Mate 0 counts as a win for the reporting side.

**2026-11-24. Dev machine setup.** The maintainer's machine runs Fedora Kinoite, which had no Node.js. Node 26.13.1 LTS was installed from nodejs.org into `~/.local/share/node`, with links in `~/.local/bin`. The SHA-256 checksum was verified. Playwright does not officially support Fedora and uses its Ubuntu 24.04 Chromium build, which runs the tests correctly.

## Phase 1

**2026-11-24. Lichess game export rejects non-browser user agents.** `/api/games/user/{name}` is wrapped in `NoCrawlers` in lila's `Game.scala`, so curl and headless Chromium get an HTML 404. Real browsers pass. The endpoint, its parameters and the NDJSON shape match the official spec. CORS allows any origin (`Access-Control-Allow-Origin: *`). Tests mock this endpoint instead of calling it. The deployed app must still be checked once from a real phone with a real username.

**2026-11-24. Chess.com allows browser calls.** The Published-Data API sends `Access-Control-Allow-Origin: *`. It rejects requests without a recognizable user agent, which browsers always send. Archives are listed oldest first, so the importer reverses them and fetches one month at a time with a 300 ms pause.

**2026-11-24. Lichess clocks and evals.** `clocks` holds the mover's remaining time after each ply in centiseconds. `analysis[i]` is the evaluation after ply i from White's side, with `{ "mate": n }` for mates. The pipeline converts both to the side to move.

**2026-11-24. Stockfish build.** `stockfish@19.0.1`, the `lite-single` build: 1.85 MB WASM plus a 28 KB loader, single-threaded, no cross-origin isolation needed. The full NNUE builds are 99 MB and break the 25 MiB per-file limit, so they are not an option. The loader reads the WASM URL from its own URL hash, which lets Vite give both files hashed names.

**2026-11-24. The Node build of Stockfish shares one engine per loaded module.** Tests load a fresh copy of the module for each engine. Browser workers are separate by nature.

**2026-11-24. Castling in UCI.** chessops writes castling as king-takes-rook (`e1h1`). The app converts to standard UCI (`e1g1`) everywhere it produces moves, through `src/chess/uci.ts`.

**2026-11-24. Mate 0.** UCI reports `score mate 0` for a side that is already checkmated. `winningChances` treats it as a loss for the side to move. The Phase 0 version had this backwards.

**2026-11-24. Analysis passes.** Fast pass: depth 12 with a 250 ms cap on every position. Deep pass: depth 18 with a 1.5 s cap and MultiPV 3, only on the player's moves whose fast-pass drop is at least 0.10. If Lichess already analyzed a game, its evals replace the fast pass and only the deep pass runs. Settings offers Quick (10/15), Standard (12/18) and Thorough (14/20).

**2026-11-24. Mistake thresholds.** Inaccuracy 0.10, mistake 0.20, blunder 0.30 drop in winning chances on Lichess's -1 to 1 scale, from the deep pass. The golden tests pass with these values, so they stay for now. Tuning against more fixtures happens in Phase 2.

**2026-11-24. Level filter.** A move counts as a mistake only when both passes see the loss: the depth-12 fast pass flags it and the depth-18 deep pass confirms it. A loss that only the deep search finds is not counted.

**2026-11-24. Extra `analyses` store.** Per-game analysis, including partial progress for resume, has its own store. The plan's list had no place for it. All the plan's stores exist from schema version 1.

**2026-11-24. Hash routing.** Routes look like `#/game/<id>`, so any static host serves every screen without rewrite rules.

**2026-11-24. Timing, 50 games.** 50 generated games (3,906 plies, 78 on average, from `scripts/make-perf-games.mjs`), Standard depth, analyzed in headless Chromium through the real app (`npx playwright test -c playwright.perf.config.ts`):

| Device                    | Engines | Time                                  |
| ------------------------- | ------- | ------------------------------------- |
| Laptop, 20 threads, Linux | 4       | 164.5 s                               |
| Mid-range phone           |         | not measured yet: needs a real device |

**2026-11-24. Visual direction.** The maintainer chose Bottega from three directions (Scriptorium, Bottega, Scoresheet). See `docs/DESIGN_DIRECTION.md`. They also approved one self-hosted typeface: Figtree from `@fontsource-variable/figtree` (OFL-1.1), 20 KB for Latin.

**2026-11-24. Board squares drawn in CSS.** The olive-wood board uses a `conic-gradient` checkerboard with hard stops, in place of Chessground's brown SVG theme. Coordinates sit inside the edge squares so the board can span the full phone width.

## Phase 2

**2026-11-24. Detector files.** The plan asked for one file per tag. Related tags share a file (`fork.ts` holds `forkMissed` and `forkAllowed`, `mate.ts` holds the three mate tags, `strategy.ts` the three feature tags, `phase.ts` the opening, time and endgame tags). Each tag is still its own exported function with its own tests.

**2026-11-24. Fixture lines are saved, not recomputed.** Detector tests run on engine lines stored in `tests/fixtures/detector-lines.json` (depth 16, MultiPV 3), so they are fast and stable across engine timing. `UPDATE_FIXTURES=1` rebuilds the file and writes a report.

**2026-11-24. Fixtures that came from generated games.** The six `kingSafety`, `pawnStructure` and `pieceActivity` positives and some negatives came from mining `perf-games.ndjson`. Each was checked by hand against the measured feature change written in its name. Hand-built positions cover every tactical tag.

**2026-11-24. Pins need a real piece in front.** A pawn in front of a bigger piece is not counted, and the piece behind must be the king or worth at least two pawns more. Without this, almost every quiet move in the generated games "created a pin".

**2026-11-24. Quiet setups pay off on the next move.** `quietSetupMissed` looks only at the player's next move in the best line (three plies), and material is measured from the starting position. Looking two moves ahead, or measuring from the position before the follow-up, tagged ordinary exchanges.

**2026-11-24. Trapped pieces are checked right after the move.** A piece that is captured on the next ply would otherwise never be seen as trapped.

**2026-11-24. King safety skips the uncastled center king.** If the king stays on d or e of its first rank before and after the move, `kingSafety` does not fire. Open files near an uncastled king in the opening are normal.

**2026-11-24. Time trouble counts mistakes and blunders.** The plan said blunders. Mistakes are added so the tag gathers enough positions to rank.

**2026-11-24. No opening book.** `openingError` is any classified mistake in the first ten moves. Leaving book needs book data, which v1 does not ship.

**2026-11-24. Mistake thresholds stay at 0.10, 0.20 and 0.30.** All 62 detector fixtures and the golden games classify as expected with these values.

**2026-11-24. Profile parameters.** A tag is ranked after 5 positions. Games are weighted by recency with a half-life of 20 games. The trend compares the newer half of analyzed games with the older half and needs 10 positions. Rank order is the weighted rate per 100 moves times the average drop.

**2026-11-24. Stored tags carry the detector version.** When `DETECTOR_VERSION` changes, the app retags every analyzed game from its saved analysis at startup. The engine does not run again.

**2026-11-24. Home is the dashboard.** With no stored games, home shows the import form. Import moved to `#/import`.
