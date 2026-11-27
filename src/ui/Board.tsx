import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { captured, MaterialRow } from './Material';
import { boardLook } from './boardTheme';
import { board3dFailed, board3dHealth } from './board3dHealth';
import { useStore } from './store';
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
  /** Called with the square name on every tap or click on the board. */
  onSelect?: (square: string) => void;
  /** Text description for screen readers. */
  label: string;
  /** Show the pieces each side has taken, above and below the board. On by default. */
  material?: boolean;
}

type Board3DModule = typeof import('./Board3D');

/**
 * The board every screen shows: flat, or in 3D when the player chose it in
 * Settings. The 3D board and its pieces load only then; until they are
 * ready, or if the device cannot draw them, the flat board stands in.
 */
export function Board(props: BoardProps) {
  const { three } = useStore(boardLook);
  const { quality } = useStore(board3dHealth);
  const [view, setView] = useState<Board3DModule | 'failed'>();
  useEffect(() => {
    if (!three || view) return;
    void import('./Board3D')
      .then(async (m) => {
        await m.loadSet();
        setView(() => m);
      })
      .catch(() => setView('failed'));
  }, [three]);
  // A board the GPU dropped is drawn again lighter, then flat; see board3dHealth.
  if (three && quality !== 'off' && view && view !== 'failed')
    return (
      <view.Board3D
        key={quality}
        {...props}
        lite={quality === 'lite'}
        onFail={(failure) => (failure ? board3dFailed(failure) : setView('failed'))}
      />
    );
  return <Board2D {...props} />;
}

/** Chessground board that fills its container's width and stays square. */
function Board2D(props: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | undefined>(undefined);
  const onMove = useRef(props.onMove);
  onMove.current = props.onMove;
  const onSelect = useRef(props.onSelect);
  onSelect.current = props.onSelect;

  const state = kingState(props.fen);
  const config = (): Config => ({
    fen: props.fen,
    // Highlights the king of the side to move when it is in check.
    check: state !== 'none',
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
    events: { select: (k) => onSelect.current?.(k) },
    drawable: { enabled: false, visible: true, autoShapes: props.shapes ?? [] },
  });

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, config());
    // Chessground scales arrows by the board's width over its height. A
    // board that is not laid out yet, or is being removed, measures 0 by 0,
    // and its arrows would be drawn at NaN; a 1 by 1 stand-in keeps the
    // numbers finite on a board nobody can see.
    const dom = api.current.state.dom;
    const measure = dom.bounds;
    dom.bounds = Object.assign(
      () => {
        const r = measure();
        return r.width > 0 && r.height > 0 ? r : new DOMRect(r.left, r.top, 1, 1);
      },
      { clear: () => measure.clear() },
    );
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
      // A redraw queued before unmount would measure a detached board and
      // draw arrows at NaN; with no shapes left there is nothing to draw.
      api.current?.setAutoShapes([]);
      api.current?.destroy();
    };
  }, []);

  useEffect(() => {
    api.current?.set(config());
    // The layout may have changed around the board since the last render.
    api.current?.state.dom.bounds.clear();
  });

  const taken = props.material === false ? undefined : takenFor(props.fen);
  const top = props.orientation === 'white' ? 'black' : 'white';
  const who = (c: 'white' | 'black') => (c === 'white' ? 'White' : 'Black');
  return (
    <div class="board-frame">
      {taken && <MaterialRow side={top} taken={taken[top]} label={who(top)} />}
      <div
        class={`board${state === 'mate' ? ' board--mate' : ''}`}
        role="img"
        aria-label={`${props.label}${state === 'mate' ? ' Checkmate.' : state === 'check' ? ' Check.' : ''}`}
      >
        <div ref={el} class="board__cg" />
      </div>
      {taken && (
        <MaterialRow
          side={props.orientation}
          taken={taken[props.orientation]}
          label={who(props.orientation)}
        />
      )}
    </div>
  );
}

/** Whether the side to move is in check or checkmated. */
export function kingState(fen: string): 'none' | 'check' | 'mate' {
  const setup = parseFen(fen);
  if (setup.isErr) return 'none';
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return 'none';
  if (pos.value.isCheckmate()) return 'mate';
  return pos.value.isCheck() ? 'check' : 'none';
}

export function takenFor(fen: string) {
  const setup = parseFen(fen);
  return setup.isErr ? undefined : captured(setup.value.board);
}
