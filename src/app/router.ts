import { useEffect, useState } from 'preact/hooks';

/**
 * Hash routes work on any static host without server rewrites.
 * Examples: #/, #/games, #/game/lichess:abcd1234
 */
export function parseRoute(hash: string): string[] {
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function href(...parts: string[]): string {
  return `#/${parts.map(encodeURIComponent).join('/')}`;
}

export function navigate(...parts: string[]): void {
  location.hash = href(...parts);
}
