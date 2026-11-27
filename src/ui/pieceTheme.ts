// Piece colors for every board: the flat board's pieces are Chessground's
// cburnett SVGs, redrawn with the chosen fills in a stylesheet added to the
// page; the 3D board tints its pieces' materials (see Board3D).
import cburnett from 'chessground/assets/chessground.cburnett.css?raw';
import { boardLook } from './boardTheme';

/** Piece colors: White's pieces and Black's pieces. */
export interface PieceColors {
  light: string;
  dark: string;
}

export const PIECE_PRESETS: Record<string, { label: string; colors: PieceColors }> = {
  ivory: { label: 'Ivory and ebony', colors: { light: '#f4e4c1', dark: '#2b2420' } },
  classic: { label: 'White and black', colors: { light: '#ffffff', dark: '#000000' } },
  maple: { label: 'Maple and walnut', colors: { light: '#f0d9a8', dark: '#5a3a22' } },
  silver: { label: 'Silver and charcoal', colors: { light: '#e3e6ea', dark: '#3a3f46' } },
  crimson: { label: 'Cream and crimson', colors: { light: '#f3ead8', dark: '#8a1c22' } },
  navy: { label: 'Pearl and navy', colors: { light: '#eef1f5', dark: '#1f2f55' } },
};

export const DEFAULT_PIECES: PieceColors = PIECE_PRESETS.ivory!.colors;

const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

/**
 * The flat pieces with `c`'s fills: White's #fff and Black's #000 fills
 * change, the dark outlines and Black's light details stay. Black's pieces
 * also leave many shapes to the default fill, black, so their root takes the
 * dark color too. `source` is the cburnett stylesheet.
 */
export function pieceCss(c: PieceColors, source: string = cburnett): string {
  const rules: string[] = [];
  const re =
    /\.cg-wrap piece\.(\w+)\.(white|black) \{\s*background-image: url\('data:image\/svg\+xml;base64,([^']+)'\)/g;
  for (const [, role, color, data] of source.matchAll(re)) {
    const svg = atob(data!);
    const fill = color === 'white' ? c.light : c.dark;
    const from = color === 'white' ? /fill="#fff(fff)?"/g : /fill="#000(000)?"/g;
    let out = svg.replace(from, `fill="${fill}"`);
    if (color === 'black') out = out.replace('<svg ', `<svg fill="${fill}" `);
    rules.push(
      `.cg-wrap piece.${role}.${color}{background-image:url('data:image/svg+xml;base64,${btoa(out)}')}`,
    );
  }
  return rules.join('\n');
}

let sheet: CSSStyleSheet | undefined;

/**
 * Applies piece colors to every board; missing or invalid means the default.
 * The flat pieces' styles go in a constructed stylesheet: the page's content
 * security policy blocks inline style elements, not the CSS object model.
 */
export function applyPieceColors(c: PieceColors | undefined): void {
  const colors = c && isHex(c.light) && isHex(c.dark) ? c : DEFAULT_PIECES;
  boardLook.set({ pieces: colors });
  if (typeof document === 'undefined' || typeof CSSStyleSheet === 'undefined') return;
  const plain = colors.light === '#ffffff' && colors.dark === '#000000';
  if (!sheet) {
    sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  sheet.replaceSync(plain ? '' : pieceCss(colors));
}
