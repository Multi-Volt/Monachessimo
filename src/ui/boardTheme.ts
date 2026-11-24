/** Square colors for every board in the app. */
export interface BoardColors {
  light: string;
  dark: string;
}

export const BOARD_PRESETS: Record<string, { label: string; colors: BoardColors }> = {
  olive: { label: 'Olive wood', colors: { light: '#ecdcbc', dark: '#ae8a5c' } },
  green: { label: 'Green', colors: { light: '#eeeed2', dark: '#769656' } },
  blue: { label: 'Blue', colors: { light: '#dee3e6', dark: '#8ca2ad' } },
  gray: { label: 'Gray', colors: { light: '#e4e4e4', dark: '#9a9a9a' } },
  walnut: { label: 'Walnut', colors: { light: '#e8cfa6', dark: '#8b5a2b' } },
  coral: { label: 'Coral', colors: { light: '#f2e6dc', dark: '#d08a6e' } },
};

export const DEFAULT_BOARD: BoardColors = BOARD_PRESETS.olive!.colors;

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Dark or light ink for coordinates, whichever reads better on both square colors. */
export function coordInk(c: BoardColors): string {
  const dark = '#2e2112';
  const light = '#fbf7f0';
  const worst = (ink: string) => Math.min(contrast(ink, c.light), contrast(ink, c.dark));
  return worst(dark) >= worst(light) ? dark : light;
}

export function isHexColor(s: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(s);
}

/** Applies the colors to every board through CSS custom properties. */
export function applyBoardColors(c: BoardColors | undefined): void {
  const colors = c && isHexColor(c.light) && isHexColor(c.dark) ? c : DEFAULT_BOARD;
  const root = document.documentElement.style;
  root.setProperty('--sq-light', colors.light);
  root.setProperty('--sq-dark', colors.dark);
  root.setProperty('--coord', coordInk(colors));
}
