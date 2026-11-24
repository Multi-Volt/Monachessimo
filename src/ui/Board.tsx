import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useEffect, useRef } from 'preact/hooks';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';

export interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  lastMove?: [string, string] | undefined;
  shapes?: DrawShape[];
  /** When set, the player to move can drag pieces. */
  movable?: { color: 'white' | 'black'; dests: Map<string, string[]> } | undefined;
  onMove?: (orig: string, dest: string) => void;
  /** Text description for screen readers. */
  label: string;
}

/** Chessground board that fills its container's width and stays square. */
export function Board(props: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | undefined>(undefined);
  const onMove = useRef(props.onMove);
  onMove.current = props.onMove;

  const config = (): Config => ({
    fen: props.fen,
    orientation: props.orientation,
    turnColor: props.fen.split(' ')[1] === 'b' ? 'black' : 'white',
    // Chessground clears the highlight only when lastMove is present and undefined.
    lastMove: props.lastMove as Key[] | undefined as Key[],
    coordinates: true,
    // Never view-only: Chessground binds touch and mouse handlers only when
    // the board is created, so a board that later becomes movable must start
    // interactive. With no movable color, nothing can be moved.
    viewOnly: false,
    animation: {
      enabled: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      duration: 180,
    },
    movable: {
      free: false,
      ...(props.movable
        ? { color: props.movable.color, dests: props.movable.dests as Map<Key, Key[]> }
        : { color: undefined as unknown as 'white', dests: new Map() }),
      showDests: true,
      events: { after: (o, d) => onMove.current?.(o, d) },
    },
    premovable: { enabled: false },
    drawable: { enabled: false, visible: true, autoShapes: props.shapes ?? [] },
  });

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, config());
    // Chessground caches where the board sits on the page and refreshes that
    // only on scroll and resize. When content above the board changes height
    // (a longer question on the next drill), the board moves and taps land
    // on the wrong squares. Refresh the cache at the start of every touch or
    // click, before Chessground reads it.
    const refresh = () => api.current?.state.dom.bounds.clear();
    const wrap = el.current;
    wrap.addEventListener('touchstart', refresh, { capture: true, passive: true });
    wrap.addEventListener('mousedown', refresh, { capture: true, passive: true });
    return () => {
      wrap.removeEventListener('touchstart', refresh, { capture: true });
      wrap.removeEventListener('mousedown', refresh, { capture: true });
      api.current?.destroy();
    };
  }, []);

  useEffect(() => {
    api.current?.set(config());
    // The layout may have changed around the board since the last render.
    api.current?.state.dom.bounds.clear();
  });

  return (
    <div class="board" role="img" aria-label={props.label}>
      <div ref={el} class="board__cg" />
    </div>
  );
}
