# Monachessimo build plan

Paste this file into the repo root as `BUILD_PLAN.md` and tell Claude Code to follow it. It is written for the agent, so it states decisions, order of work, and what "done" means for each phase.

## 1. What we are building

Monachessimo is a free, local-first chess trainer that runs in the browser. The user enters a Lichess or Chess.com username. The app imports their games, runs Stockfish on their own device, finds the mistakes and missed chances they repeat, and builds practice from those weaknesses.

The core loop:

1. Import games.
2. Analyze every position with Stockfish (fast pass, then a deeper pass on suspect moves).
3. Detect and tag mistakes and missed opportunities.
4. Build a weakness profile.
5. Generate drills for the top weaknesses and schedule them with spaced repetition.
6. Re-measure over time to show progress.

Drills cover more than blunders. They also train offense: quiet moves that set up forks, pins and skewers, sacrifices that work, converting winning positions, and picking a plan (a strategy quiz built on engine multi-PV).

## 2. Hard constraints

- Static site only. No backend, no accounts, no database server. Everything runs in the browser.
- Free hosting. Primary target is GitHub Pages. Keep everything portable to Cloudflare Pages.
- Local data only. Games, analysis, drill history and settings live in IndexedDB on the user's device. No analytics, no telemetry, no third-party scripts.
- Mobile first. The main users are on phones. Test at 360x740 before anything else.
- Works offline after first load (PWA), and can also ship as a downloadable offline bundle.
- Not a monolith. Separate modules with clear interfaces, so engine, import, detectors and drills can each be tested alone.
- License the repo GPL-3.0-or-later. Stockfish is GPL-3.0, so this is required if we distribute it.
- Site size limit on GitHub Pages is 1 GB, with a soft 100 GB/month bandwidth cap. Cloudflare Pages caps single files at 25 MiB. Keep every shipped file under 25 MiB so both hosts work.

## 3. Agent setup (do this first)

### 3.1 Install the two unslop skills

There are two different skills with the same name. They do different jobs.

**A. `heydamir/unslop` is a UI design skill.** It audits an interface for AI-looking patterns (purple gradients, glows, emoji labels, uneven spacing), proposes a design direction from the product, then fixes things in a fixed order: spacing, color, icons, copy, type, layout, details, visuals, motion. Install it as a Claude Code plugin:

```
claude plugin install unslop --marketplace heydamir/unslop
```

If that flag is not supported, use:

```
claude plugin marketplace add heydamir/unslop
claude plugin install unslop@heydamir
```

Then start a new session or run `/reload-plugins`. Invoke it with `/unslop <screen or description>`, or `/unslop:unslop` if the name clashes. The skill asks before any paid image generation. Always say no unless the user approves. The user is supplying icons and art, so do not generate images.

The project is CC BY 4.0. Credit Damir Sokolovsky (@heydamir) and link https://github.com/heydamir/unslop in the README and the About screen.

**B. `cursor/plugins` pstack `unslop` is a prose skill.** It removes AI tells from writing. It targets prose, not code. Source: https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md

To avoid a name clash, vendor it under a different folder name:

1. Check the license of the `cursor/plugins` repo first. If it does not permit copying, do not vendor it. Instead ask the user to install it through their normal route, and reference it by link.
2. If copying is allowed, save it to `.claude/skills/unslop-prose/SKILL.md` and change the `name` in the frontmatter to `unslop-prose`. Keep its original attribution and license notice.
3. It has `disable-model-invocation: true`, so it only runs when invoked. Invoke it by name when needed.

### 3.2 When to use each

- `unslop` (UI): after the first working version of each screen, and again at the end of every phase that changes the interface. Details in section 9.
- `unslop-prose`: on every piece of human-readable text. That means README, docs, in-app copy, error messages, empty states, onboarding, the About page, changelog entries, and PR descriptions. Do not run it on code, identifiers, or chess notation.

### 3.3 Verify before you trust

Docs and APIs change. Before using any of the following, read the current official documentation and confirm the details in this plan are still correct. If something differs, follow the docs and note the difference in `docs/DECISIONS.md`.

- Lichess API (game export, puzzle endpoints, OAuth, CORS behavior, rate limits)
- Chess.com Published-Data API
- The Stockfish WASM package you choose (exact name, version, build variants, file sizes)
- Lichess puzzle database format (https://database.lichess.org/#puzzles)
- Vite PWA plugin and single-file plugin versions

## 4. Tech stack

Choose these unless verification shows a blocker. Ask the user before adding anything else.

- Language: TypeScript, strict mode.
- Build: Vite, with `base` set for the Pages project path (for example `/monachessimo/`).
- UI: Preact. It is small and fast on phones. No heavy component library.
- Board: Chessground (the Lichess board, GPL-3.0). Piece sets must be licensed for reuse. The user may supply their own.
- Rules and move generation: `chessops` (GPL-3.0, used by Lichess) or `chess.js`. Prefer chessops for attack maps and bitboard helpers, which the detectors need.
- Engine: Stockfish compiled to WASM, single-threaded "lite" NNUE build to start. Verify the package. The `stockfish` npm package by nmrugg is the likely candidate.
- Storage: IndexedDB through the `idb` wrapper.
- PWA: `vite-plugin-pwa`.
- Tests: Vitest for units, Playwright for end-to-end at a phone viewport.
- Lint and format: ESLint and Prettier. Keep config minimal.
- CI/CD: GitHub Actions that test, build, and deploy to Pages.

## 5. Repo layout

```
monachessimo/
  BUILD_PLAN.md
  README.md
  LICENSE                  (GPL-3.0-or-later)
  THIRD_PARTY.md           (every dependency, its license, and credits)
  docs/
    DECISIONS.md           (short log of choices and why)
    DESIGN_DIRECTION.md    (written by the unslop UI skill, approved by the user)
    DETECTORS.md           (what each tag means, with example FENs)
  assets/                  (user-supplied icons and art; never overwrite)
  scripts/
    build-puzzle-shards.ts (downloads and shards the Lichess puzzle CSV)
  src/
    app/                   (shell, routing, screens)
    import/                (lichess.ts, chesscom.ts, normalize.ts)
    engine/                (worker.ts, pool.ts, uci.ts, eval.ts)
    analysis/              (pipeline.ts, mistakes.ts, phases.ts)
    detectors/             (one file per tag, plus index.ts)
    profile/               (weakness scoring and trends)
    drills/                (generators, scheduler, session logic)
    puzzles/               (shard loader, theme index, rating logic)
    store/                 (IndexedDB schema, migrations, export/import)
    ui/                    (components, board wrapper, styles)
    pwa/                   (service worker config)
  tests/
    fixtures/              (PGNs and FENs with expected tags)
```

## 6. Data flow and key decisions

### 6.1 Import

- Lichess: stream the user's games as NDJSON from the games export endpoint, with clocks and opening info requested. If Lichess already has server analysis for a game, reuse those evals and skip our own work for that game. Respect rate limits, run one request at a time, and back off on HTTP 429.
- Chess.com: read the monthly archive list, then fetch months newest first, serially, with a small delay. Parse PGN with clock comments.
- Normalize both into one `Game` record: id, source, color, ratings, time control, result, opening, moves, per-move clock if present, and any imported evals.
- Default: most recent 100 games, rated only, standard chess. Let the user raise the cap. Store games locally so re-imports only fetch new ones.
- Verify browser access works (CORS) from a deployed Pages origin, not only from localhost. If either API blocks it, report it and propose a fallback before building around it.

### 6.2 Engine and analysis

- Run Stockfish in Web Workers. Build a pool sized `min(hardwareConcurrency - 1, 4)`, minimum 1, and allow the user to lower it in Settings. Each worker loads its own engine, so watch memory on phones.
- Two passes:
  - Fast pass on every position: about 100 ms or depth 12.
  - Deep pass on flagged positions only: depth 18 or about 1.5 s, with multi-PV 3.
- Cache results by FEN plus engine settings so repeated positions cost nothing.
- Convert centipawns to winning chances with the Lichess formula: `2 / (1 + exp(-0.00368208 * cp)) - 1`. Treat mate scores as a large fixed value.
- Mistake classes by drop in winning chances for the mover. Start with inaccuracy 0.10, mistake 0.20, blunder 0.30. Make these constants, tune them against fixtures, and record the final values in `docs/DECISIONS.md`.
- Add a level filter. Do not flag a move as a "miss" if only a very deep line finds the better move and a player at the user's rating is very unlikely to see it. Start simple: require the better move to win by at least a clear margin within the deep pass at depth 18.
- Analysis must be pausable and resumable. Save progress per game. Show progress and an estimate. Never block the UI thread.
- Optional later: multithreaded Stockfish through cross-origin isolation (`coi-serviceworker` on GitHub Pages, or response headers on Cloudflare Pages). Keep it behind a flag and fall back to the worker pool.

### 6.3 Detectors and tags

Implement detectors as small pure functions: `(position, move, engineLines, context) => Tag[]`. Write them from scratch using the rules of chess. The Lichess puzzle tagger is a useful reference for what the themes mean, but check its license before copying any code. Prefer an independent implementation.

Tags for the user's own mistakes and missed chances:

- `hangingPiece`, `missedCapture`, `trappedPiece`
- `forkMissed`, `forkAllowed`
- `pinMissed`, `pinAllowed`, `skewerMissed`, `skewerAllowed`
- `discoveredAttack`, `backRank`, `mateMissed`, `mateAllowed`
- `quietSetupMissed` (the best move was non-forcing and led to a tactic within N plies)
- `sacrificeMissed` (best line gives up material but evaluation holds or improves within N plies)
- `kingSafety`, `pawnStructure`, `pieceActivity` (from computed features, see 6.5)
- `openingError` (leaves book or drops evaluation in the first 10 moves)
- `conversionFailure` (was clearly winning, ended up drawn or lost)
- `timeTrouble` (blunder made with under about 10 percent of clock remaining)
- `endgame:<type>` (pawn, rook, minor piece, queen)

Each tag needs: a definition in `docs/DETECTORS.md`, at least three positive and three negative FEN fixtures, and a test.

### 6.4 Weakness profile

- For each tag, compute frequency per 100 moves, average winning-chance loss, and recent trend. Weight recent games more.
- Require a minimum sample before ranking a tag, and show confidence ("based on 14 positions").
- The profile outputs a ranked list of weaknesses and a short plain-language summary built from templates. No language model is needed in the first version.

### 6.5 Strategy features

Stockfish gives numbers, not reasons. For the strategy component, compute measurable features before and after a move and report real changes:

- King safety: pawn shield, open files near the king, attackers and defenders in the king zone.
- Pawn structure: isolated, doubled, backward and passed pawns, pawn islands.
- Piece activity: mobility, outposts, rooks on open files, bishop pair.
- Space and center control.

Use these to write explanations like "this move removed your pawn shield and the evaluation dropped 1.4." Only state facts the code measured.

### 6.6 Drills

Every drill has: a position, the side to move, a goal, accepted answers (from engine lines, within a tolerance), a hint ladder, and an explanation. Types:

1. **Replay my mistake.** Your own blunder position. Find the better move.
2. **Missed chance.** A strong tactic you skipped in a real game.
3. **Setup builder.** Find the quiet move that creates a fork, pin, or skewer threat next move.
4. **Sacrifice finder.** Find the sacrifice that works, with a "does it work?" check that shows the follow-up line.
5. **Theme puzzles.** Matching Lichess puzzles by theme and rating band, from static shards.
6. **Plan picker (strategy).** Show the position, let the user choose among 3 to 5 candidate moves from multi-PV, then reveal how each scored and what the measured features changed.
7. **Conversion practice.** Start from a winning position and play it out against a weakened Stockfish.
8. **Time awareness.** Surfacing positions where the user blundered under time pressure, with a short review.

Scheduling: start with a simple Leitner or SM-2 variant keyed by position. Wrong answers return sooner. Track a lightweight puzzle rating so difficulty adapts.

### 6.7 Puzzle shards (no runtime server)

- `scripts/build-puzzle-shards.ts` downloads the public-domain Lichess puzzle CSV during the GitHub Actions build, not into the repo. This keeps the repo small and avoids Git LFS.
- Filter for quality (popularity and play count thresholds), then group by theme and 100-point rating band. Write compact JSON shards plus a `manifest.json`.
- Budget the total shipped puzzle data at 250 MB or less, with every file under 25 MiB. If the budget is tight, keep the most popular puzzles first.
- The app fetches only the shards its drill plan needs and caches them with the service worker.
- A live Lichess puzzle API source can be added later as an optional enhancement. Check whether it needs login for the difficulty options, and whether browser calls work.

### 6.8 Storage

IndexedDB stores: `games`, `positions` (analysis cache), `tags`, `drills`, `reviews` (scheduler state), `settings`, `meta`. Version the schema and write migrations. Provide Export all data (JSON file) and Import, plus Delete everything. Never use localStorage for large data.

## 7. Offline and portability

- **PWA.** Service worker via `vite-plugin-pwa`. Precache the app shell and engine. Cache puzzle shards on demand. Provide a manifest using the user's icons. Test install on Android Chrome and iOS Safari (Add to Home Screen).
- **Offline bundle.** A second build target that outputs a single self-contained HTML file or a zip, with the engine as embedded base64 WASM and the worker started from a Blob URL, plus a small starter puzzle set. Opening local files is restricted in browsers (workers and WASM often fail from `file://`), so also document `python3 -m http.server` as the supported local route. Treat iOS local-file use as best effort and say so in the README.
- **CSP.** GitHub Pages cannot set headers, so use a `<meta>` Content-Security-Policy. Allow connections only to `lichess.org`, `api.chess.com`, and the app's own origin. Allow `blob:` workers and WASM as the engine requires.

## 8. Privacy and legal

- No data leaves the device except the requests to Lichess and Chess.com for the user's own public games.
- No analytics. No cookies. State this plainly on the About screen.
- Maintain `THIRD_PARTY.md` with every dependency, license and credit (Stockfish, Lichess puzzle database under CC0, Chessground, chessops, any piece set, heydamir/unslop under CC BY 4.0).
- Follow the Lichess and Chess.com API terms. Cache aggressively and never hammer the APIs.
- The app is free. Do not add payments or accounts. GitHub Pages terms discourage commercial use.

## 9. Design and UI

The user is supplying icons and artwork in `assets/`. Never generate, replace, or edit them. If something is missing, list what is needed and use a plain placeholder.

### Screens

1. **Connect.** Enter a username, pick a source, choose how many games. Short and calm.
2. **Import and analysis progress.** Per-game progress, pause and resume, time estimate.
3. **Dashboard.** Top weaknesses with confidence, a trend, and one clear "Train this" action.
4. **Drill session.** The board fills the width. Hint, retry, and explanation sit below. One-handed use.
5. **Game review.** Move list, evaluation graph, mistakes marked and tagged.
6. **Progress.** Weakness trends and puzzle rating over time.
7. **Settings and data.** Worker count, analysis depth, export, import, delete.
8. **About.** Credits, licenses, privacy statement, unslop credit.

### Working method with the UI skill

1. Build the screen functionally first, with simple honest styling.
2. Run `/unslop` on it. Let it audit and propose a direction. For the first run, save the approved direction to `docs/DESIGN_DIRECTION.md` and show it to the user before applying changes.
3. Apply its passes in order. Re-run at the end of each phase on every changed screen.
4. If the skill says a screen is already good, take the small refinements and move on.

Brand note for the direction step: the name is a pun on "monachesimo" (monasticism) and chess. Disciplined practice, a quiet scriptorium feel, and some Italian warmth are possible angles. Offer options, then wait for the user to choose. Do not invent a mascot or backstory.

### Standards

- Touch targets at least 44 px. Board never smaller than the screen width on phones.
- Light and dark themes. Respect `prefers-reduced-motion`.
- Color is never the only signal. Meet WCAG AA contrast.
- Keyboard and screen reader support for everything except the board move input, which needs its own accessible alternative (type a move in SAN or UCI).
- Show clear states for loading, empty, error, and offline. All copy goes through `unslop-prose`.

## 10. Phases and acceptance criteria

Finish each phase fully before the next. At the end of each phase: tests pass, the deployed Pages build works on a real phone, docs are updated, and the user gets a short summary.

**Phase 0. Scaffold.**
Vite + TypeScript + Preact project, lint, test setup, GPL license, README stub, GitHub Actions deploying to Pages. Both unslop skills installed and confirmed working.
Done when: a placeholder page is live on Pages and CI is green.

**Phase 1. Import and engine.**
Lichess import, Chess.com import, normalized store, Stockfish worker pool, fast pass and deep pass, mistake classification, resumable analysis, a plain game review screen.
Done when: entering a real username imports games, analyzes them on a phone, and lists each game's blunders with the evaluation drop. Record real timing numbers for 50 games on a mid-range phone and a laptop in `docs/DECISIONS.md`.

**Phase 2. Detectors and profile.**
All tags in 6.3 with fixtures, the weakness profile, and the dashboard.
Done when: every detector has passing positive and negative fixtures, and the dashboard ranks weaknesses with sample sizes.

**Phase 3. Drills from your own games.**
Replay-my-mistake, missed-chance, scheduler, drill session screen.
Done when: a user can finish a daily session built from their own games and the scheduler brings back missed positions.

**Phase 4. Puzzle shards.**
Shard build script in CI, manifest, loader, theme puzzles matched to the profile, puzzle rating.
Done when: the deployed site stays under 1 GB and every file under 25 MiB, and a theme drill loads only the shards it needs.

**Phase 5. Offense and strategy drills.**
Setup builder, sacrifice finder, plan picker, strategy features and explanations, conversion practice, time awareness.
Done when: each drill type has at least 20 generated examples reviewed by a human-readable report, and the explanations contain only measured facts.

**Phase 6. PWA and offline.**
Service worker, install flow, offline mode, the single-file or zip bundle, optional multithreading flag.
Done when: the app installs on Android and iOS, works in airplane mode after first load, and the offline bundle runs from `python3 -m http.server`.

**Phase 7. Polish and release.**
Full unslop UI pass on every screen, prose pass on all copy and docs, accessibility audit, performance budget check, README with screenshots, `THIRD_PARTY.md` complete.
Done when: Lighthouse accessibility is 95 or higher on every screen, and the user signs off.

**Stretch ideas (do not start without asking):**

- Maia (human-like engine) to find moves that players at the user's rating rarely find. Research size and licensing first.
- Live Lichess puzzle API source.
- Bring-your-own-key language model explanations, fed only engine-verified facts. The key stays on the device.
- Opening repertoire trainer built from the user's own games.

## 11. Testing and quality

- Unit tests for eval conversion, mistake thresholds, scheduler math, and every detector.
- Golden-game tests: a few fixed PGNs with known expected mistakes. Pin engine depth so results are stable.
- End-to-end tests with Playwright at 360x740 covering connect, import (mocked network), analysis, and one drill.
- Performance budgets: record initial JS size, engine load time, and time to analyze 50 games. Fail CI on large regressions.
- Test on at least one real Android phone and one real iPhone before calling a phase done.

## 12. Working rules for the agent

- Make small commits with clear messages. Follow the commit attribution instructions already set for this environment.
- Keep `docs/DECISIONS.md` current. One short entry per non-obvious choice.
- Ask the user before: adding a dependency outside section 4, enabling any paid service, changing the license, or changing the visual direction after it is approved.
- Do not claim a phase is finished until you have run the tests, loaded the deployed build, and checked it in a phone-size viewport. Report what you could not verify.
- If a constraint in this plan conflicts with reality (an API blocks browser calls, a file is too large), stop, explain, and propose options. Do not quietly work around it.
- Never touch files in `assets/`.

## 13. Questions to settle with the user

Defaults are in brackets. Proceed with them if the user has not answered.

1. Repo name and Pages path? [`monachessimo`]
2. Which formats are the supplied icons in? [SVG for UI icons, PNG at 192 and 512 for the PWA]
3. Lichess only first, or both sites from the start? [Both, Lichess first]
4. Include Lichess login (OAuth) for puzzle difficulty tuning? [No, not in v1]
5. Visual direction options from the UI skill pass? [Agent proposes three, user picks one]

## 14. Kickoff prompt

Give this to the agent to start:

> Read `BUILD_PLAN.md` in full. Do section 3 first: install both unslop skills and confirm each one works. Then complete Phase 0 and stop for my review. Verify every external API and package against its current docs before relying on it, and log anything that differs from the plan in `docs/DECISIONS.md`. Ask me before leaving the plan or adding unlisted dependencies.
