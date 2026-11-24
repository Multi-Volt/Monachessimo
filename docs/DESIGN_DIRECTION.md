# Design direction

Chosen by the maintainer on 2026-11-24 from three options proposed in the unslop UI pass (heydamir/unslop, CC BY 4.0). The other options were Scriptorium (parchment and rubric red) and Scoresheet (graphite and felt green).

## Direction: Bottega

- **Product.** A free trainer that finds the chess mistakes you repeat in your own games and gives you practice on them.
- **Character.** Warm, practiced, lively.
- **World.** An Italian workshop or café table: terracotta, olive wood, espresso, afternoon light.
- **Moments.** The board, in olive-wood tones. The weakness bars on the dashboard, filled in terracotta. Everything else stays quiet.
- **Signature.** Hand-cut tally marks for practice streaks. They appear only where the app counts days or sessions of practice.

## Tokens

Surfaces stay near neutral with a warm tint. Color lives in the accent, the board and the weakness bars.

| Role                       | Light       | Dark        |
| -------------------------- | ----------- | ----------- |
| Page background            | `#f8f4ec`   | `#171411`   |
| Card                       | `#fdfbf6`   | `#1f1b17`   |
| Raised (input, active row) | `#f0e9dc`   | `#29241f`   |
| Hairline                   | text at 10% | text at 10% |
| Primary text               | `#221d17`   | `#f0e8dc`   |
| Secondary text             | `#5e554a`   | `#b5ab9c`   |
| Muted text                 | `#72685c`   | `#958b7c`   |
| Accent (terracotta)        | `#a84b24`   | `#e3926a`   |
| Text on accent             | `#ffffff`   | `#1d120c`   |
| Good (olive)               | `#566426`   | `#aebd72`   |
| Blunder (wine)             | `#9b1d35`   | `#f08aa0`   |
| Mistake (ochre)            | `#855600`   | `#e2b45e`   |
| Inaccuracy (slate)         | `#4b5f70`   | `#9fb5c8`   |
| Board light square         | `#ecdcbc`   | same        |
| Board dark square          | `#ae8a5c`   | same        |

Mistake colors differ from the terracotta accent in hue, and every class also carries its symbol (`??`, `?`, `?!`) and a word, so color is never the only signal.

## Type

Figtree, self-hosted from `@fontsource-variable/figtree` (OFL-1.1). Weights 400, 500 and 600 only. Sentence case. Tabular figures for evaluations, counts and clocks.

| Use             | Size / line height | Weight |
| --------------- | ------------------ | ------ |
| Meta, counts    | 13 / 18            | 400    |
| Body            | 16 / 24            | 400    |
| Section heading | 18 / 24            | 600    |
| Page title      | 28 / 32            | 500    |
| Wordmark        | 18                 | 600    |

## Shape and spacing

- 4 px grid. Page edge 16 on phones, 24 from 40rem up.
- Radius: tags 6, controls 10, cards 14.
- Touch targets at least 44 px. Tab bar rows 56.
- Depth on light: `0 1px 2px rgba(34, 29, 23, 0.06)` on cards. On dark: surface steps and hairlines only.

## Motion

One curve, `cubic-bezier(0.22, 1, 0.36, 1)`. 150 ms for hover and press, 180 ms for board moves. Nothing loops. All motion is off under `prefers-reduced-motion`.

## Rules for new screens

- One primary action per screen, in terracotta. Everything else is a secondary button on the raised surface.
- No icons until the maintainer supplies them in `assets/`. Tabs and buttons use words.
- No emoji, gradients between hues, glows, or uppercase tracked labels.
