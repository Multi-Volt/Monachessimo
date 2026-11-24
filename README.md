# Monachessimo

Monachessimo is a free chess trainer that runs in your browser. You enter a Lichess or Chess.com username. The app imports your games, runs Stockfish on your own device, finds the mistakes you repeat, and builds practice from them.

Live site: https://multi-volt.github.io/Monachessimo/

## Status

Phase 0 of [BUILD_PLAN.md](BUILD_PLAN.md) is done. The live site is a placeholder page. Game import, analysis, and drills come in later phases.

## Privacy

Your games, analysis, and practice history stay in your browser's storage on your device. The app sends requests only to Lichess and Chess.com, and only to fetch your public games. It has no accounts, no cookies, and no analytics.

## Development

You need Node.js 22.12 or newer. CI uses Node 26.

```sh
npm install
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run lint         # ESLint
npm run typecheck    # TypeScript, strict mode
npm run build        # typecheck, then production build into dist/
npm run test:e2e     # Playwright at a 360x740 phone viewport, against the build
```

Before the first `npm run test:e2e`, run `npx playwright install chromium`.

To build for GitHub Pages locally, set the base path to the repository name:

```sh
BASE_PATH=/Monachessimo/ npm run build
```

## Deployment

Every push to `main` runs `.github/workflows/ci.yml`. The workflow checks formatting, lint, types, and unit tests, builds the site, fails if any shipped file is over 25 MiB, runs the Playwright test, and then deploys `dist/` to GitHub Pages.

The repository's Pages source must be set to GitHub Actions under Settings, Pages, Build and deployment.

## License

Monachessimo is free software under the GNU General Public License, version 3 or later. See [LICENSE](LICENSE). Third-party code and credits are listed in [THIRD_PARTY.md](THIRD_PARTY.md).

## Credits

The interface is reviewed with [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky (@heydamir), used under CC BY 4.0.

Project text is edited with the [unslop prose skill](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md) by Lauren Tan, used under the MIT License.
