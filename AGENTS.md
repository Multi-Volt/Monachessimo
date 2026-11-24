# Contributing

This guide is for anyone changing Monachessimo, people and coding agents alike. Read it before your first change.

## What the project is

Monachessimo is a free chess trainer that runs entirely in the browser. It imports a player's games from Lichess or Chess.com, analyzes them with Stockfish on the player's device, finds the mistakes they repeat, and builds practice from them: drills from their own games, Lichess theme puzzles, and coached practice games against the engine.

## Rules that do not bend

- **Static site.** No backend, no accounts, no database server. It deploys to GitHub Pages and must stay portable to Cloudflare Pages.
- **Private by default.** Data lives in IndexedDB on the player's device. The app talks only to `lichess.org` and `api.chess.com`, and only to fetch the public games of the username the player enters. No analytics, no cookies, no third-party scripts, fonts or CDNs. The Content-Security-Policy in `vite.config.ts` enforces this; do not loosen it to make something work.
- **Phone first.** Check every screen at 360x740 in light and dark themes. Touch targets are at least 44 px, the board spans the screen width, and nothing scrolls sideways.
- **Works offline** after the first visit. The engine and app shell are precached.
- **Every shipped file is under 25 MiB**, and the site stays under 1 GB.
- **GPL-3.0-or-later.** Stockfish, chessops and Chessground are GPL. Any new dependency needs a compatible license and an entry in `THIRD_PARTY.md`. Ask the maintainer before adding one.
- **Measured facts only.** Every explanation the app shows comes from engine output or a counted board feature. Never state a reason the code did not measure.
- **Accessible.** WCAG AA contrast, color is never the only signal, everything works with a keyboard and a screen reader, and the board always has a typed-move alternative.

## Getting started

You need Node.js 22.12 or newer.

```sh
npm install
npx playwright install chromium
npm run dev            # local dev server
```

| Command                               | What it does                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `npm test`                            | Unit tests (Vitest), including tests that run the real Stockfish build in Node |
| `npm run test:e2e`                    | Playwright tests at a 360x740 phone viewport, against the production build     |
| `npm run lint`                        | ESLint                                                                         |
| `npm run typecheck`                   | Strict TypeScript                                                              |
| `npm run format`                      | Prettier                                                                       |
| `npm run build`                       | Typecheck, then build into `dist/`                                             |
| `npm run build:offline`               | The single-file offline copy, into `dist-offline/`                             |
| `node scripts/build-puzzle-shards.ts` | Download the Lichess puzzle database and build `public/puzzles/`               |
| `node scripts/check-budget.mjs`       | Size budgets, after a build                                                    |
| `node scripts/a11y-audit.mjs`         | Lighthouse accessibility on every screen, after a build                        |

For the end-to-end tests, build with the Pages base path first: `BASE_PATH=/Monachessimo/ npm run build`.

Before you open a pull request, run format, lint, typecheck, unit tests and end-to-end tests, and check their exit codes. Do not read a truncated log as a pass.

## Where things live

| Folder                | Contents                                                                          |
| --------------------- | --------------------------------------------------------------------------------- |
| `src/import/`         | Lichess and Chess.com importers and the shared `Game` record                      |
| `src/engine/`         | Stockfish worker, UCI parsing, engine pool, score conversion                      |
| `src/analysis/`       | Two-pass game analysis, mistake classes, the background runner                    |
| `src/detectors/`      | One pure function per mistake pattern, from the rules of chess                    |
| `src/strategy/`       | Measured position features and the sentences that describe their changes          |
| `src/profile/`        | Weakness ranking and trends                                                       |
| `src/drills/`         | Drill generation, goals, answer checking, the scheduler, sessions                 |
| `src/puzzles/`        | Lichess puzzle shards and theme matching                                          |
| `src/play/`           | Practice games: the coach's rules, explanations, references to the player's games |
| `src/store/`          | IndexedDB schema, migrations, export and import                                   |
| `src/ui/`, `src/app/` | Components, styles and screens                                                    |
| `tests/`              | Fixtures, unit tests, end-to-end tests                                            |
| `docs/`               | Decisions, design direction, detector reference, drill report                     |

## Changing things

- **Detectors.** Every tag needs at least three positions where it must fire and three where it must not, in `tests/fixtures/detector-positions.ts`. Rebuild the saved engine lines with `UPDATE_FIXTURES=1 npx vitest run tests/unit/detectors.node.test.ts`, read `test-results/detector-report.txt`, update `docs/DETECTORS.md`, and bump `DETECTOR_VERSION`.
- **Stored data.** Add a new migration in `src/store/db.ts`; never edit an old one. Bump `ANALYSIS_FORMAT` when the analysis record changes shape.
- **The board.** Use `src/ui/Board.tsx`. It keeps Chessground interactive and refreshes its cached position on every touch. Never create a Chessground in view-only mode if it may later need input.
- **Look and feel.** Follow `docs/DESIGN_DIRECTION.md`. Colors come from the CSS tokens in `src/ui/styles.css`; screens never use raw hex values. One primary action per screen.
- **Decisions.** Add one short entry to `docs/DECISIONS.md` for each non-obvious choice: what you chose and why. Early entries refer to the original build plan, which is not in the repository.

## Writing copy

All text people read, in the app and in docs, follows these rules:

- Plain words and short sentences, one idea each. Say what it does, with the number when there is one.
- No dashes or parentheses used as punctuation. Use a period or a comma.
- Sentence case for headings, labels and buttons. No exclamation marks.
- No filler, no hype words, no vague claims. Cut any sentence that could appear unchanged in another project.
- Name things once and keep the name.
- Chess notation, code and identifiers are exempt.

## Commits and pull requests

- Small commits with a plain subject line and, when useful, a short body.
- No tool or agent trailers: no `Co-Authored-By` lines for AI tools, no session links, no generated-by notes. Never put session URLs, email addresses or local file paths in commits, code or docs.
- Commit as the account that owns the change, using its GitHub noreply address.
