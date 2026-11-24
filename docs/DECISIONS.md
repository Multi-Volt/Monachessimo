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
