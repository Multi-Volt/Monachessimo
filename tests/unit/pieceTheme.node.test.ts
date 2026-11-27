import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PIECE_PRESETS, pieceCss } from '../../src/ui/pieceTheme';

const source = readFileSync('node_modules/chessground/assets/chessground.cburnett.css', 'utf8');

describe('piece colors', () => {
  it('redraws all twelve flat pieces with the chosen fills, keeping the outlines', () => {
    const css = pieceCss(PIECE_PRESETS.crimson!.colors, source);
    expect(css.split('\n')).toHaveLength(12);
    const svg = (role: string, side: string) =>
      atob(
        new RegExp(
          `piece\\.${role}\\.${side}\\{background-image:url\\('data:image/svg\\+xml;base64,([^']+)`,
        ).exec(css)![1]!,
      );
    expect(svg('pawn', 'white')).toContain('fill="#f3ead8"');
    expect(svg('pawn', 'white')).toContain('stroke="#000"');
    expect(svg('knight', 'black')).toContain('fill="#8a1c22"');
    // Shapes with no fill of their own, such as Black's pawn and rook, take it from the root.
    expect(svg('pawn', 'black')).toMatch(/^<svg fill="#8a1c22"/);
    expect(svg('rook', 'black')).toMatch(/^<svg fill="#8a1c22"/);
    // Black's light details stay light.
    expect(svg('knight', 'black')).toContain('#ececec');
  });
});
