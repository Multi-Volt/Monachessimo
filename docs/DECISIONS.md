# Decisions

One short entry per non-obvious choice. Newest entries go at the bottom of each phase.

## Phase 0

**2026-11-24. TypeScript is pinned to 6.0.x.** The `latest` TypeScript on npm is 7.0.2, the native Go port. typescript-eslint 8.74 supports TypeScript below 6.1, or the native port from 7.1 onward. `package.json` uses `~6.0.3`. Move to 7.1 or later once typescript-eslint supports it as a normal peer.

**2026-11-24. Preact 11.** Preact 11.2.0 is the current release, and @preact/preset-vite 2.10.6 builds it without changes. The plan names Preact without a version.

**2026-11-24. No @types/node.** The only Node API the config files use is `process.env`. `config-env.d.ts` declares it, and `tsconfig.node.json` type-checks the config files on their own. App code cannot see `process`.

**2026-11-24. Pages path is `/Monachessimo/`.** The plan's default was `/monachessimo/`. The GitHub repository is `Multi-Volt/Monachessimo`, and Pages paths are case-sensitive. CI sets `BASE_PATH` from the repository name, so a rename needs no code change. Local and Cloudflare builds default to `/`.

**2026-11-24. The CSP is added only to production builds.** A Vite plugin in `vite.config.ts` prepends a `<meta http-equiv="Content-Security-Policy">` tag at build time. The dev server needs inline scripts and a websocket, which the policy blocks. The policy allows `'wasm-unsafe-eval'` and `blob:` workers for Stockfish, and connections to `lichess.org` and `api.chess.com` only. A meta tag cannot set `frame-ancestors`, so clickjacking protection waits for a host that supports headers. The Playwright test fails on any console error, which includes CSP violations.

**2026-11-24. The e2e test runs against the base-path build.** Playwright serves `vite preview` at the same `BASE_PATH` that CI deploys, so broken asset paths fail in CI instead of on the live site.

**2026-11-24. `eval.ts` came early.** The winning-chances conversion from section 6.2 is the first unit under test, so the test setup checks real code. A mate score is converted to plus or minus 10,000 centipawns. Mate 0 counts as a win for the reporting side.

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

## Phase 3

**2026-11-24. Which mistakes become drills.** Every move classed as a mistake or blunder, where the deep pass found at least one other move within tolerance. If the position has a "missed" tag (missed capture, fork, pin, skewer, mate, quiet setup or sacrifice) it is a missed-chance drill, otherwise a replay drill. Inaccuracies are left out of v1 to keep sessions short.

**2026-11-24. Accepted answers.** A move counts when its winning chances are within 0.07 of the best move, or when it keeps a forced mate no more than two moves longer than the best mate. Moves outside the saved MultiPV lines are checked live on the device at depth 14 (1.5 s cap). The game move never counts.

**2026-11-24. Scheduler.** SM-2 style, per drill. A fail sets the drill due in 10 minutes and adds it once more to the end of the running session. Passes go to 1 day, then 3 days, then interval times ease (start 2.5). A pass after a hint counts as "hard": it lowers the ease by 0.15 and grows the interval by 1.2 only. Ease never goes below 1.3.

**2026-11-24. Puzzle rating.** Elo with K = 24, starting at 1500. A first-try solve scores 1, a solve after a hint 0.5, a miss 0. A drill's rating is the player's game rating, +100 for missed tactics, +200 for quiet setups and sacrifices, and -150 when the game move dropped 0.8 or more.

**2026-11-24. Sessions.** Ten drills. Due reviews come first, oldest due first. New drills, at most six, are taken in turn from the ranked weaknesses, newest first. "Train this" restricts the session to one tag.

**2026-11-24. Promotion on the board.** A pawn moved to the last rank on the board promotes to a queen. Typed moves can name any piece (e8=N or e7e8n).

**2026-11-24. Streak.** A day counts when a session reaches its summary screen. The streak is the run of such days ending today or yesterday, drawn as tally marks.

**2026-11-24. Mate decides the tags.** When `mateAllowed` or `mateMissed` fires, `pawnStructure` and `pieceActivity` are dropped. They only reflected the mating line taking pawns. `kingSafety` stays. Detector version 2.

## Phase 4

**2026-11-24. Puzzle database format.** Checked on database.lichess.org on 2026-11-24: 6,193,530 puzzles, updated 2026-11-11, released under CC0. The CSV now has an 11th column, `DailyDate`, after the ten the plan expected. The script checks the first eight column names and fails the build if they change. The download is 310 MB of zstd. Node 26 decompresses zstd natively, so the script needs no dependency.

**2026-11-24. Shard shape.** A puzzle passes when its popularity is at least 80, it has at least 500 plays, and its rating deviation is at most 90. Ratings run from 400 to 3299 in 100-point bands. 21 Lichess themes map to 19 shard names, with bishop and knight endgames sharing one minor-piece shard. Each theme-and-band shard keeps its 400 most popular puzzles, so a puzzle can appear in several themes. Each row holds id, FEN, moves and rating. The 2026-11-11 database gives 505 shards, 165,974 puzzle entries, 16.3 MB in total, and about 30 KB per shard. The script fails if any file passes 25 MiB or the total passes 250 MB.

**2026-11-24. Shards are built in CI.** CI caches the compressed database in `~/.cache/monachessimo`, keyed by its Last-Modified header, so it downloads only when Lichess publishes a new file. The output in `public/puzzles/` is not committed.

**2026-11-24. The script is TypeScript run by Node directly.** Node 26 strips types natively. The script is not part of `npm run typecheck`, because that would need Node's type definitions.

**2026-11-24. How sessions use puzzles.** After due reviews and new drills from your games, the rest of the 10-drill session is filled with puzzles for up to three ranked weaknesses, in the band nearest your puzzle rating. A session fetches the manifest and one shard per theme. Puzzles you have seen are stored as drills, so the scheduler brings them back like your own positions.

**2026-11-24. Puzzle answers.** Each of the player's moves must match the solution, except that any checkmate counts on the last move, as the database notes say. The opponent's moves play automatically. No engine check runs for puzzles.

**2026-11-24. Route names.** `#/progress` is the Progress screen from the plan (puzzle rating and weakness trends). The import and analysis status screen moved to `#/analysis`.

**2026-11-24. The rating chart.** One series, so it has no legend and a title instead. It has a 2 px accent line, three gridlines, a hover or tap readout, and a "Show as table" view. Weakness trends are a table, older half against newer half, because each one is a comparison of two numbers.

## Phase 5

**2026-11-24. Drill types from one mistake.** Each classified mistake becomes one move drill, typed by its most specific tag: time trouble, then sacrifice, then quiet setup, then any other missed tactic, then replay. Plan and conversion drills are extra drills with their own ids.

**2026-11-24. Setup builder and sacrifice finder also use Lichess puzzles.** Your own games rarely give 20 of each. `quietMove` puzzles count only when the first solution move is quiet, because Lichess tags a puzzle `quietMove` when any move in it is quiet. `sacrifice` puzzles are used as they are.

**2026-11-24. "Does it work?"** After any move drill, the player can step through the engine line or puzzle solution on the board, with the material count against the start shown at each step. For sacrifices the button reads "Does it work?".

**2026-11-24. Plan picker.** Built from mistakes where all three engine lines start with a quiet move, so the choice is positional, not tactical. Choices are the three lines plus the game move, in a fixed order that does not reveal the best one. After the pick, each choice shows its score, the engine's reply, and the measured changes after the move and the reply. A plan drill waits until the move drill for the same position has been solved once.

**2026-11-24. Conversion practice.** The first position in a game where the player, to move, is clearly winning (about +3) in two positions in a row and is already two pawns of material up. Without the material rule, a hanging queen still to be taken counted as a conversion. The opponent is Stockfish at Skill Level 1 to 10, from the player's rating: (rating - 900) / 150. After each move a full-strength check at depth 12 decides the result: below +1.5 is a miss; checkmate, or a forced mate in 3 or less, is a solve; still winning after 30 moves counts as "hard".

**2026-11-24. Time awareness.** Mistakes tagged `timeTrouble` become drills that say how much clock was left, show a running timer, and report seconds spent on the move against the game average. A correct answer after 30 seconds counts as "hard".

**2026-11-24. Explanations.** `src/strategy/explain.ts` writes sentences only from counted feature changes, such as pawn shield 3 to 1, or 7 fewer squares. Drills tagged with a strategy tag include these sentences after the game move and the reply.

**2026-11-24. Drill report.** `docs/reports/drills.md` holds at least 20 generated examples of every type. It is built from the 50 generated games, now with synthetic clocks for a 3-minute game, and from the local puzzle shards. Run it with `REPORT=1 npx vitest run tests/unit/drill-report.node.test.ts`. The games' moves did not change when clocks were added.

## Phase 6

**2026-11-24. Service worker.** `vite-plugin-pwa` 2.0.0 with Workbox's `generateSW` and `registerType: 'prompt'`. It precaches the app shell, fonts, icons and the 1.8 MB engine WASM; the per-file limit is raised to 4 MB. Puzzle shards use stale-while-revalidate in a `puzzles` cache, so a shard works offline once a session has opened it. When a new version is waiting, a banner offers a reload.

**2026-11-24. The engine worker starts from a blob: URL.** With the site offline, Chromium did not serve the engine worker's own script from the service worker, and the worker never started. No error event fired. The app now fetches the script itself, which goes through the service worker, and starts the worker from a Blob URL. The worker's WASM fetch then also comes from the cache. The CSP already allowed `blob:` workers.

**2026-11-24. Placeholder icons.** No icons were in `assets/` yet, so `public/icons/` holds plain placeholder PNGs (192, 512 and 180 px) made in code. Replace them with the maintainer's icons. Nothing in `assets/` was touched.

**2026-11-24. Offline bundle.** `npm run build:offline` uses `vite-plugin-singlefile` 2.3.4 with `base: './'` and no `public/` folder. Vite 8 cannot inline `.wasm` with `?inline`, so `scripts/engine-inline.ts` provides the loader as text and the WASM as base64 through a virtual module. Both run from Blob URLs. `scripts/starter-puzzles.ts` embeds 30 puzzles from each of five bands (800 to 2000) per theme. The file is about 3 MB. CI publishes it at `offline/monachessimo.html`.

**2026-11-24. The offline file has a looser CSP.** A single HTML file needs inline script and style, data: fonts, and blob:/data: connections for the embedded engine. Connections to other sites are still limited to Lichess and Chess.com.

**2026-11-24. Build-time audit warnings.** `npm audit` reports 4 moderate advisories in `glob` and `minimatch` under `workbox-build`. They run only at build time over this repository's files. The only offered fix downgrades `vite-plugin-pwa` to a version without Vite 8 support, so they stay until Workbox updates.

**2026-11-24. Multithreading is not built.** The plan's optional flag needs the multi-threaded engine build and cross-origin isolation, which on GitHub Pages means `coi-serviceworker`. That adds a package and a second service worker next to Workbox's. The worker pool already uses several cores. This waits for the maintainer to decide.

**2026-11-24. What was tested.** Playwright covers: the app working offline after a first visit (games, review, drills, and a live engine check), import disabled offline, and the offline bundle served by `python3 -m http.server` importing and analyzing games. Installing on a real Android phone and iPhone has not been tested.

## Phase 7

**2026-11-24. UI pass.** Every screen was captured at 360x740 in both themes and checked against `docs/DESIGN_DIRECTION.md`. Changes: daily sessions lead with move drills, and plan and conversion drills come after, at most two and one per session; the dashboard summary is one line plus an improvement line, not three paragraphs; "about 1 times" now reads "about once"; "Open games" became "See your games".

**2026-11-24. Prose pass.** App copy and the README were checked against the copy rules in `AGENTS.md`: no dashes as punctuation, no parentheses as asides, plain words. Ratings in parentheses after a player's name stay, since that is chess convention. The decision log keeps parentheses where they hold file names or values.

**2026-11-24. Accessibility.** `scripts/a11y-audit.mjs` seeds a Chromium profile with 8 analyzed games, then runs Lighthouse 13.6.0 through npx (not installed) on ten screens at 360x740. Every screen scored 100. Lighthouse runs its own Chromium on the seeded profile; connecting to a shared browser over the DevTools port failed with "Target closed".

**2026-11-24. Performance budgets.** `perf-budget.json` sets the limits. CI fails when the entry JS passes 90 KB gzipped (61 KB now), the CSS 12 KB gzipped (7 KB), or the engine WASM 2 MB (1.8 MB). It also fails when the engine takes more than 5 s to report ready, or when 10 generated games take more than 180 s to analyze. Raise a budget only with an entry here.

**2026-11-24. Not verified.** No real phone has run the app: no Android or iPhone install, no airplane-mode test on a device, no timing on a mid-range phone. The CI pipeline with puzzle shards and the offline bundle has not run on GitHub, because pushes from this machine failed authentication.

**2026-11-24. The board is the main way to move.** Drills, puzzles, conversion games and the plan picker all take moves on the board, by dragging a piece or by tapping it and then its square. Typing a move (SAN or UCI) sits behind a "Type a move instead" toggle as the accessible alternative. A wrong move stays on the board for 0.9 s, then the piece goes back and the player tries again with the reason still shown; there is no Retry button. In the plan picker only the candidate moves can be played. `tests/e2e/board.spec.ts` plays moves by tap and by drag at 360x740.

**2026-11-24. Drills end when their goal is met.** Each drill from a game has a goal from its engine line: win material (the gain the line reaches after the opponent answers, at least 2 pawns), deliver mate, or hold the position for 3 moves. The opponent answers every move with its best reply, so a forked king steps aside and the drill goes on until the material is actually won. Every move is judged against the engine in that position, within the usual tolerance, so the player does not have to match one exact line. The engine's choices are shown only after the drill ends or the player asks for the answer. A drill that is still short of its material goal after 8 moves ends as a partial success.

**2026-11-24. Try again.** Every finished drill offers "Try again" to replay the position. Only the first attempt changes the schedule and the puzzle rating.

**2026-11-24. Taps on a board that moved.** Chessground caches the board's position on the page and refreshes it only on scroll and resize. When text above the board changed height between drills, taps landed on the wrong squares. The board wrapper now clears that cache at the start of every touch or click and after every render. The board also never switches to view-only mode, because Chessground binds input handlers only when the board is created.

**2026-11-24. Practice games.** `#/play` plays a full game against Stockfish at Skill Level 0 to 20, suggested from the puzzle rating as (rating - 700) / 100. A full-strength search (depth 14, MultiPV 3) checks each of the player's moves. Depending on the chosen strictness, it refuses moves that drop 0.30, 0.20 or 0.10 of winning chances. A refused move shows its cost but never the better move; hints go from piece to square to move. The first refusal in a position saves it as a drill. Games start from the initial position, from any move of a stored game, from a random position where the player went wrong, or from a drill ("Play it out"). Game review has "Practice from here". The game in progress is saved after every move.

**2026-11-24. References to your own games.** `src/play/positions.ts` indexes every position in the stored games. On the player's turn in a practice game, the screen lists the earlier games that reached the same position, the move played there, and how that game ended.

**2026-11-24. Board colors.** Settings offers six square-color presets and a custom pair of colors. They apply to every board through CSS custom properties. The coordinate ink switches between dark and light, whichever has the better contrast against both square colors.

**2026-11-24. Services on first render.** `useServices` now returns the loaded services on a component's first render once they exist. Before, every component saw `undefined` once, and the practice game's first effect failed on it.

**2026-11-24. The coach judges by material as well as winning chances.** Winning chances alone called a pawn given away near equality an inaccuracy (about 0.18), so the practice coach let free pawns through. A move is now classed by both scales, and the worse class counts: centipawn loss of 40, 90 and 200 for inaccuracy, mistake and blunder, unless both scores are beyond ±7 pawns. After 1.e4 e5 2.Nf3, 2...Qf6 (1.04 pawns, 0.187 of winning chances) is now a mistake. Every verdict lists measured facts: the opponent's best answer and what it takes, the material lost within two moves, matching patterns, and the cost in pawns. When material is lost, pawn-structure and activity tags are left out. "Show what happens" plays the refused move and the opponent's line on the board. Moves the coach lets through at the chosen strictness get a short note, and the game summary lists every weak move and pattern.

**2026-11-24. The theme follows the board.** With any board other than the default, the whole palette is generated from the hue of the dark squares: one neutral ramp (page, card, raised surface, hairlines and three text roles) at low saturation, and an accent at real saturation. Each text role is moved in lightness until it meets a fixed contrast on every surface: primary text 12:1, secondary 7:1, muted and accent 4.5:1, and text on the accent 4.5:1. A gray board gets a monochrome accent. The first version only tinted the surfaces and kept the default warm text, which looked muddy on cool boards and gave the blue board an almost gray accent. The default olive board keeps the designed Bottega colors exactly.

**2026-11-24. Evaluation readout.** Practice games, the game picker and game review show the evaluation from White's side (+ good for White, − good for Black) with words naming the better side, and a bar. Practice games can hide it. Drills never show it, since it would reveal whether the answer was right.

**2026-11-24. Coach verdicts, praise and review.** A coach verdict is a headline with the cost, then one bullet per measured fact (what the answer attacks, what changes hands), then pattern names as chips. Good moves get labels close to Chess.com's: brilliant for a near-best move that leaves a piece en prise at a profit, great when the next choice is 1.5 pawns worse, best for the engine's first choice, excellent and good under 0.2 and 0.4 pawns lost. The pawn thresholds now apply only while the best move keeps the game within 3 pawns; in a clearly won or lost position only winning chances count, because the old 7-pawn limit refused almost every move in lost positions. "Show what happens" ends by comparing the end of the refuting line with the end of the engine's line: material, development, castling and the strategy features. Every board shows the pieces each side has taken. Finished practice games are kept, the last 30, and can be replayed with an engine review. Hints never repeat: kind of move, then the piece, named by square only when there are two, then what it takes, then the answer.

**2026-11-24. Practice games teach through the board.** The practice game screen was a wall of text and felt like a quiz. It now follows how Chess.com coaches: a badge with the move's label on the square it lands on, a red arrow for the opponent's punishing reply, and a refused move that stays on the board until the player taps Try again, instead of snapping back after 0.9 seconds. One coach bubble carries one sentence at a time; the details are behind "Why?". On the player's turn it names what the opponent's last move attacks. Hints ring the piece and then draw the arrow. The summary shows accuracy on first tries, from the Lichess formula on the drop in winning chances, and a count of each label.

**2026-11-24. No repeated positions in Train.** A failed drill now comes back the next day, not in 10 minutes, and is no longer added again to the end of the running session; Try again covers the immediate retry. A session holds one drill per position, and a new drill of a position seen in the last 20 hours waits, so a plan or conversion drill does not follow the move drill of the same board.

**2026-11-24. Daily puzzle refresh.** CI runs once a day at 05:23 UTC. A first job reads only the headers of the Lichess puzzle database and looks up its `Last-Modified` version in the Actions cache. A cached version means a past build already shipped it, so the run stops there. A new version runs the full build and deploys. The 250 MB file is downloaded only when Lichess publishes a new one. If the cache is evicted after a week unused, the next daily run rebuilds once. GitHub pauses scheduled workflows in repositories with no activity for 60 days.

**2026-11-24. Coach plan A1: the cause of a mistake.** `src/play/cause.ts` finds why a move let the opponent win material. It compares the first square the opponent captures on, before and after the move, with static exchange evaluation. The causes: a defender moved away, the moved piece stands on a losing square, a threat was already there and ignored, or the move opened a line for a sliding piece. Otherwise it checks the opponent's reply for a fork, pin or skewer. A pattern whose attacking piece can simply be taken for free does not count; the fixtures showed false pins without that rule. The coach says the cause first, in the opponent's voice, and draws its marks: the departed guard in blue and the lost square in red. Each cause has three positions where it must fire and three where it must not.

**2026-11-24. Coach plan A2: the threat search.** `src/engine/threat.ts` passes the move to the other side, a null move with the en passant square cleared, and asks the engine for its best move at depth 10 or 400 ms. It never runs when the side to move is in check, because that position would be illegal. The move counts as a threat when passing costs at least 80 centipawns against the current evaluation: less than a pawn, but more than the 30 to 50 a free tempo is worth. At 150, the coach missed a pawn threat. On the player's turn the coach names the threat ("With Nf6, I threaten Nxe4, taking your pawn on e4."), which also says what a quiet move by the opponent aims at. When a refused move allows exactly that threat, the coach says "This move ignores my threat of …".

**2026-11-24. Coach plan A3: narrating "Show what happens".** `src/play/narrate.ts` gives each move of the refuting line one sentence, read from the board: checkmate, a capture, a recapture with the material balance after it, a check, or new attacks on pieces that would be lost. A recapture must answer a capture on the same square; landing on a square the previous move went to is not enough. Two kinds need the engine and are added afterwards: a player move is "forced" when MultiPV 2 puts the second choice 1.5 pawns lower, and a quiet opponent move names its threat from the A2 null-move search. Each search is 300 ms. The board sentences show at once and the engine sentences replace them when ready, so a slow phone never waits on the engine to read the line.

**2026-11-24. Coach plan A4: features with squares.** `src/strategy/details.ts` returns the features behind the counts with their square or file, each with a fixed sentence on its long-term cost: isolated, doubled and backward pawns, an open file next to the king, a bishop stuck behind its own pawns (three or more own pawns on its colour and four or fewer squares to go to), and the opponent's outposts and advanced passed pawns. Isolated pawns and open files near the king are counted exactly as in `features()`, and a test holds them equal. The end-of-line comparison now names the square ("Nothing can defend your pawn on d4 with a pawn, so it becomes a target.") instead of only a count.

**2026-11-24. Coach plan A5: one long-term reason.** When "Show what happens" reaches the end of the line, the coach gives one reason why the move is worse, from `src/play/reason.ts`. It compares 14 plies of the refuting line with the engine's line, in this order: material lost; a plan read from the opponent's own moves (three moves aimed at the king zone, or two ending in check, or two moves attacking one piece that is later taken); the most serious positional feature that only the played line has; and otherwise a plain "the engine sees a long-term problem it cannot put into one reason here". The reason's arrows and squares are drawn at the last step. The cost in pawns and the full comparison follow it.

**2026-11-24. Coach plan A6: one explanation record.** `src/play/record.ts` holds everything the coach knows about a judged move as plain, versioned data (`version: 1`): the position and move, the verdict with its cost and drop in winning chances, the threat, the cause, the reply line, the narrated steps, the long-term reason, the tags, the board marks and the template sentences. The practice game's verdict, its board marks, the "Show what happens" steps and "Why this is worse" are all rendered from it. Fields may be added as optional without a version change; renaming or removing one bumps the version, because a phrasing model trained on the records would read them. In development builds the verdict has a "Copy record (dev)" button that copies the record as one JSON line; production builds leave it out. A bulk exporter over many games belongs with Part B, which needs it, and would run the engine in Node as the node tests do.

**2026-11-24. Coach plan C2: the Lab.** A new Lab tab is a position sandbox: paste a FEN or set up the board, analyse with the on-device engine at depth 12, 16 or 20 and one to three lines, tap a line to play its first move, step back and forward, flip the board and "Play from here" as a practice game. The threat comes from the A2 null-move search, in neutral words because the Lab has no "you". Every move tried in the Lab gets the practice game's verdict or praise, built from the A6 record. The position is kept in the URL hash with spaces written as underscores (`#/lab/7k/8/…_w_-_-_0_1`), so a link shares it; the hash is updated in place, without a history entry per move. The editor is a grid of buttons with a piece palette, so it works with a keyboard and a screen reader, and it also takes typed edits (`Ke1 qd8 xd4`). Castling rights follow kings and rooks on their home squares, and an illegal setup names its problem and cannot be finished. There is no opening explorer: Lichess serves it from a host other than `lichess.org`, and the app talks only to `lichess.org` and `api.chess.com` unless the maintainer changes that rule. To make room for Lab and Learn in the tab bar, Settings moved to a link in the top bar.

**2026-11-24. Coach plan C1: the Learn tab.** The lessons come from Patzer (MIT, commit ba73060): 4 levels, 12 courses, 70 lessons, from how the pieces move to rook endings. The format is kept: positions and solutions in language-free JSON in `src/learn/content/`, all words in `src/learn/text/en.json` under `<lesson>.<step>`, so a translation cannot change what a lesson teaches. The task rules were rewritten from chess.js to chessops in `src/learn/rules.ts`; kingless teaching boards use chessops' unchecked setup. Step types: explanation with a looping demo, collect the stars, tap the squares, find the move or line, play it out against the on-device engine, and multiple choice. Every board task has a typed alternative. Lesson progress, the step to resume at and the best stars, is kept in a new `lessons` store, database version 2. The English text was edited to the copy rules: no dashes, no exclamation marks except as chess annotation, no "kid" variants. Some glosses in parentheses remain, such as "**e4** (pawn to e4)", and should be rewritten. Porting Patzer's checks to chessops found two lessons with illegal positions, where the side not to move was already in check (`checkmate.m2` and `queen-mate.m1`); both were fixed by moving the queen. `src/learn/content.test.ts` checks every position, line, mate, star par and quiz. `npm run verify:lessons` checks with Stockfish at depth 18 that each lesson's move is the best one by 1.5 pawns. It takes about four minutes, so it is not part of `npm test`. At depth 12 the lite build misjudges six tasks. Each weakness tag maps to lessons in `src/learn/weakness.ts`, and a test checks every id. Time trouble has no lesson. The dashboard, the weakness page and the coach's pattern chips link to the matching lesson. The Lab and Learn screens and the lesson content load on first use, which keeps the entry bundle at 82.6 KB gzip. A board now clears its arrows before it is destroyed: a redraw queued before unmount measured a detached board and drew arrows at NaN.

**2026-11-24. Coach plan D1: browser voices.** The coach can read its verdicts and lesson texts with the browser's speech synthesis. Only voices with `localService` are used, because some browsers offer cloud voices that send the text to a server; when a device has no local voice, the setting and the speak buttons do not appear. Settings has a voice choice and "Read every verdict aloud in practice games". Nothing is read when a screen opens: sound follows a tap on a speak button, or, with that option on, a move the coach judges. Moves are read in words ("Nxe5+" as "knight takes e5, check") and lesson markup is removed. A web page cannot read a phone's mute switch, and whether a phone's speech follows that switch has not been tested on a device, so reading aloud is off by default and every sound follows the player's own action. The e2e test fakes the speech engine with one cloud and one local voice and checks that only the local one is offered and that opening a screen reads nothing. A neural voice (D2) waits for a speed measurement on a phone, as the plan requires.

**2026-11-25. Coach plan B3: the record exporter.** `training/export-records.ts` writes A6 records as JSONL for the phrasing model. It runs the app's own TypeScript under Node: `--experimental-transform-types`, because the engine classes use constructor parameter properties, which plain type stripping rejects, and a resolve hook in `training/ts-hooks.mjs`, because the sources import without file extensions. No dependency was added. `training/record-pipeline.ts` judges a move with the same searches and settings as a refused move in practice games, so the records match what the app shows. Moves come from two CC0 sources: the Lichess puzzle database, where each puzzle starts right before a real losing move, and a Lichess game file, where two random moves per game are judged, which adds inaccuracies and mistakes. Records are spread over four rating bands and three phases, 60% from puzzles. The Node Stockfish build runs on the thread that loads it, so the exporter starts one process per core and joins their files; with 18 processes it writes about 10 records a second, so 20,000 records take about 35 minutes. The output is appended to and resumes after a stop. Lichess files carry zstd skippable frames that Node's decompressor rejects, so the exporter reads them through the `zstd` command. The first trial found a template bug the app also showed, "a inaccuracy", now "an inaccuracy".

**2026-11-25. Coach plan B3: the target writer and the checker.** The phrasing model reads a fact sheet, not the raw record: `factSheet()` in `src/play/phrasing.ts` lists the headline, the cause, the verdict points, the narrated line and the long-term reason. It speaks with the opponent's voice throughout, leaves out move lists after a colon and leaves out the "cannot put into one reason" fallback, which gives the model nothing to say. `checkPhrasing()` checks a text against its sheet: every move, square, number (digits or words up to twenty), piece, pattern word and move class it names must be in the sheet, and a piece must not be given to the side the sheet does not give it to. It also applies the copy rules: two to four sentences, no dashes, parentheses, exclamation marks or filler. The same function filters training targets and will check the model's text in the app. `training/write-targets.ts` writes targets through llama.cpp's server and retries a text that fails the check twice. Writers compared on the same 12 records, thinking off: a 9B Qwen3.5 distill wrote 12 texts in 10 seconds but about half gave a piece or a threat to the wrong side or invented a material result; Qwen3.8-27B (Apache-2.0, 4-bit) took 23 seconds and 9 or 10 of 12 were faithful, the rest adding small unmeasured touches. The 27B writes the targets. Thinking mode took 70 times longer and was dropped. A second pass in which the writer reviews its own text against the sheet caught every 9B error but also rejected 11 of the 12 good 27B texts, so it does not reject texts; its verdict is stored next to each target for the filter step to weigh. DeepSeek V4.1 Flash (MIT), run once through the Freebuff coding agent on the same 12 sheets, was the most faithful writer: it added nothing, at the cost of a stiffer style. It has no batch interface there, so it does not write the targets, but three of its texts are worked examples in the writer's prompt, beside one written by hand. The narration said "you are 2 down" without a unit; it now says "2 pawns down". The forced-move sentence said "anything else loses about 92.6 pawns" when the second choice is a mate; it now says "far more".

**2026-11-25. Every browser voice is offered.** D1 showed only voices marked `localService` and hid spoken coaching when there were none. On the maintainer's devices that hid it everywhere: Chrome on Android often lists no voices at all yet speaks with the device's default voice, and Firefox on Linux reported none either. The maintainer chose to offer every voice. A device voice is still chosen first, a cloud voice is marked "may send text online" in the list, and a browser that lists no voices reads with its default voice. Sound still follows a tap or a move, never a page load.

**2026-11-25. Hints in words, and reading aloud automatically.** A lesson hint used to ring the piece and then draw the move, and the ring alone read as nothing, so the hint seemed to jump straight to the answer. Each tap now also says it in words: "Move your queen." with the ring, then "Queen to g8." with the arrow. Stacked button rows get a 12 px gap. The option "Read every verdict aloud" became "Read aloud automatically": with it on, every text that has a speak button is read when it appears, lessons, coach verdicts and drills alike. Drills and puzzles gained a speak button for the prompt ("Black to move. Win material.") and for the explanation after the answer. A page opened fresh stays silent, because browsers refuse speech before the first tap.
