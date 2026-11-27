// The board in 3D, drawn with three.js (MIT). The pieces are "Chess Set" by
// Riley Queen from Poly Haven (CC0), in public/3d/chess-set; the squares are
// drawn here in the app's board colors, so the set's own board is left out.
// The squares carry a faint grain from "Oak Veneer 01" by Jenelle van
// Heerden (Poly Haven, CC0), turned grey so they keep their colors. Dragging
// turns the board and pinching zooms; a tap on a piece, then a square, moves.
// It takes the flat board's props, so every screen can show either.
import { useEffect, useRef } from 'preact/hooks';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { parseFen } from 'chessops/fen';
import { makeSquare, parseSquare } from 'chessops/util';
import type { Square } from 'chessops/types';
import { kingState, takenFor, type BoardProps } from './Board';
import { MaterialRow } from './Material';
import { boardLook, mix, type BoardColors } from './boardTheme';
import type { Board3dFailure } from './board3dHealth';

/**
 * The widest drawing buffer, in device pixels: larger ones crash some phone
 * GPUs, such as an unfolded Pixel 10 Pro Fold. The light board draws fewer.
 */
const MAX_PIXELS = 1280;
const MAX_PIXELS_LITE = 900;

/** The set's square size and board height, in its own units (meters). */
const SQ = 0.058;
const TOP = 0.0174;

/** A square's center: the a-file on White's left, rank 1 nearest White. */
function center(sq: Square, y = TOP): THREE.Vector3 {
  return new THREE.Vector3(3.5 * SQ - (sq % 8) * SQ, y, (Math.floor(sq / 8) - 3.5) * SQ);
}

function squareAt(p: THREE.Vector3): Square | undefined {
  const f = Math.round(3.5 - p.x / SQ);
  const r = Math.round(p.z / SQ + 3.5);
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : undefined;
}

type Pieces = Map<string, THREE.Object3D>;
let set: Promise<Pieces> | undefined;

const IVORY = '#f4e4c1';
const tinted = new Map<THREE.Material, THREE.Material>();

/** The set's white material with an ivory tint, made once and shared. */
function ivory(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) return material.map((m) => ivory(m) as THREE.Material);
  let t = tinted.get(material);
  if (!t) {
    t = material.clone();
    if ('color' in t && t.color instanceof THREE.Color) t.color.set(IVORY);
    tinted.set(material, t);
  }
  return t;
}

// A soft dark patch under each piece, where it meets the board.
const CONTACT_SHAPE = new THREE.PlaneGeometry(SQ * 0.95, SQ * 0.95).rotateX(-Math.PI / 2);
let contactMaterial: THREE.MeshBasicMaterial | undefined;

function contactShadow(): THREE.MeshBasicMaterial {
  if (contactMaterial) return contactMaterial;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const fade = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  fade.addColorStop(0, 'rgba(0,0,0,0.28)');
  fade.addColorStop(0.55, 'rgba(0,0,0,0.12)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 64, 64);
  contactMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
  });
  return contactMaterial;
}

/** One model per color and role, from the set's 32 pieces. */
export function loadSet(): Promise<Pieces> {
  set ??= new GLTFLoader()
    .loadAsync(`${import.meta.env.BASE_URL}3d/chess-set/chess_set_1k.gltf`)
    .then((gltf) => {
      const out: Pieces = new Map();
      gltf.scene.traverse((o) => {
        const m = /^piece_(king|queen|rook|bishop|knight|pawn)_(white|black)/.exec(o.name);
        const key = m && `${m[2]} ${m[1]}`;
        if (!key || out.has(key)) return;
        const proto = o.clone();
        proto.position.set(0, 0, 0);
        proto.traverse((c) => {
          c.castShadow = true;
          // White's pieces are warmed a little toward ivory.
          if (m[2] === 'white' && c instanceof THREE.Mesh) c.material = ivory(c.material);
        });
        out.set(key, proto);
      });
      return out;
    })
    .catch((e: unknown) => {
      set = undefined;
      throw e;
    });
  return set;
}

const BRUSH: Record<string, string> = {
  green: '#15781b',
  red: '#882020',
  blue: '#003088',
  yellow: '#e68f00',
};

interface View {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  light: THREE.MeshLambertMaterial;
  dark: THREE.MeshLambertMaterial;
  frame: THREE.MeshLambertMaterial;
  plane: THREE.Mesh;
  pieces: THREE.Group;
  marks: THREE.Group;
  controls: OrbitControls;
  /** The file letters and rank numbers on the frame. */
  labels: THREE.Group;
  ink: THREE.MeshBasicMaterial[];
  /** The side the camera was last placed for. */
  side?: 'white' | 'black';
  /** What was last drawn, so an unchanged board is not drawn again. */
  drawn?: string;
  /** The position whose pieces stand on the board. */
  piecesFen?: string;
  render: () => void;
}

/** A letter or number as a white glyph on a clear square, tinted by its material. */
function glyph(text: string): THREE.MeshBasicMaterial {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.font = '600 48px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
}

/**
 * Coordinates on the frame for the player's side: files along the near
 * edge, ranks along the left, each lying flat and upright from that side.
 */
function placeLabels(group: THREE.Group, ink: THREE.MeshBasicMaterial[], side: 'white' | 'black') {
  group.clear();
  const size = 0.32 * SQ;
  const edge = 4.18 * SQ;
  const shape = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
  const white = side === 'white';
  const add = (i: number, x: number, z: number) => {
    const m = new THREE.Mesh(shape, ink[i]!);
    m.position.set(x, TOP + 0.0003, z);
    // A flat glyph reads upright from the side the camera starts on.
    m.rotation.y = white ? Math.PI : 0;
    group.add(m);
  };
  for (let f = 0; f < 8; f++) add(f, center(f).x, white ? -edge : edge);
  for (let r = 0; r < 8; r++) add(8 + r, white ? edge : -edge, center(r * 8).z);
}

/** How strong the grain is: 0 is flat color, 1 the wood's full contrast. */
const GRAIN = 0.35;

/**
 * The wood texture as grey grain around 1, so it multiplies a square's
 * color only a little; also the factor that keeps the mean color as chosen.
 */
async function grain(): Promise<{ texture: THREE.Texture; mean: number }> {
  const img = await new THREE.ImageLoader().loadAsync(
    `${import.meta.env.BASE_URL}3d/wood/oak_veneer_01_diff_1k.jpg`,
  );
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  let max = 0;
  const lum = new Float32Array(px.length / 4);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = 0.2126 * px[4 * i]! + 0.7152 * px[4 * i + 1]! + 0.0722 * px[4 * i + 2]!;
    max = Math.max(max, lum[i]!);
  }
  let sum = 0;
  for (let i = 0; i < lum.length; i++) {
    const v = 255 * (1 - GRAIN * (1 - lum[i]! / max));
    sum += v;
    px[4 * i] = px[4 * i + 1] = px[4 * i + 2] = v;
  }
  g.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  // Grey data, not a color: a value of 1 leaves the square's color as it is.
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return { texture, mean: sum / lum.length / 255 };
}

export function Board3D(
  props: BoardProps & {
    /** Draw a lighter board: no smoothing, cast shadows or reflections, fewer pixels. */
    lite?: boolean;
    /** The board cannot be drawn: with what failed when the GPU dropped it. */
    onFail?: (failure?: Board3dFailure) => void;
  },
) {
  const lite = !!props.lite;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<View | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;
  const selected = useRef<Square | undefined>(undefined);
  const shownFen = useRef('');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !lite, alpha: true });
    } catch {
      latest.current.onFail?.();
      return;
    }
    // Shadows are worked out again only when pieces move.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    // The GPU's name, for the report if it drops the board.
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : undefined;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.enabled = !lite;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    // Lit so that a square facing up shows about its chosen color.
    scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a68', 1.5));
    // A room reflected in the pieces' polish. It is given to the pieces only:
    // the squares keep the light their colors were matched to.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const sun = new THREE.DirectionalLight('#fff6e8', 1.9);
    sun.position.set(-0.4, 1.2, -0.6);
    sun.castShadow = !lite;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -0.35, right: 0.35, top: 0.35, bottom: -0.35 });
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    // A faint light from the other side, so the backs of the pieces are not flat.
    const fill = new THREE.DirectionalLight('#dfe8ff', 0.45);
    fill.position.set(0.6, 0.5, 0.8);
    scene.add(fill);

    const light = new THREE.MeshLambertMaterial();
    const dark = new THREE.MeshLambertMaterial();
    const frame = new THREE.MeshLambertMaterial();
    for (let sq = 0; sq < 64; sq++) {
      const isDark = ((sq % 8) + Math.floor(sq / 8)) % 2 === 0;
      // Each square shows its own part of the wood, turned a quarter on
      // alternate squares, as an inlaid board is.
      const tile = new THREE.PlaneGeometry(SQ, SQ).rotateX(-Math.PI / 2);
      const uv = tile.attributes.uv!;
      for (let i = 0; i < uv.count; i++) {
        const [u, w] = isDark ? [uv.getY(i), uv.getX(i)] : [uv.getX(i), uv.getY(i)];
        uv.setXY(i, ((sq % 8) + u) / 8, (Math.floor(sq / 8) + w) / 8);
      }
      const m = new THREE.Mesh(tile, isDark ? dark : light);
      m.position.copy(center(sq));
      m.receiveShadow = true;
      scene.add(m);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(8.7 * SQ, TOP, 8.7 * SQ), frame);
    base.position.y = TOP / 2 - 0.0002;
    base.receiveShadow = true;
    scene.add(base);
    // Taps are found on this invisible plane over the squares.
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(8 * SQ, 8 * SQ).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    plane.position.y = TOP;
    scene.add(plane);
    const pieces = new THREE.Group();
    const marks = new THREE.Group();
    const labels = new THREE.Group();
    const ink = [...'abcdefgh12345678'].map(glyph);
    scene.add(pieces, marks, labels);

    const render = () => renderer.render(scene, camera);
    // Drag to turn the board, pinch or scroll to zoom; the camera stays
    // above the board and looks at its center.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 0.55;
    controls.maxDistance = 1.6;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = 1.3;
    controls.addEventListener('change', render);
    view.current = {
      renderer,
      scene,
      camera,
      light,
      dark,
      frame,
      plane,
      pieces,
      marks,
      controls,
      labels,
      ink,
      render,
    };

    const size = () => {
      const w = el.clientWidth;
      if (!w) return;
      // A wide screen at a high pixel density, such as an unfolded phone,
      // would ask for a drawing buffer the GPU drops; cap it.
      renderer.setPixelRatio(
        Math.min(devicePixelRatio, lite ? 1.5 : 2, (lite ? MAX_PIXELS_LITE : MAX_PIXELS) / w),
      );
      renderer.setSize(w, w);
      render();
    };
    const resize = new ResizeObserver(size);
    resize.observe(el);
    size();

    // The grain darkens on average; the colors are raised to make up for it.
    let lift = 1;
    const paint = (c: BoardColors) => {
      light.color.set(c.light).multiplyScalar(lift);
      dark.color.set(c.dark).multiplyScalar(lift);
      frame.color.set(mix(c.dark, '#000000', 0.45)).multiplyScalar(lift);
      for (const m of ink) m.color.set(c.light);
      render();
    };
    paint(boardLook.get().colors);
    const offColors = boardLook.subscribe((l) => paint(l.colors));

    // A tap, not a drag: the pointer goes up near where it went down.
    let down: { x: number; y: number } | undefined;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) return;
      down = undefined;
      const sq = pick(e);
      if (sq !== undefined) tap(sq);
    };
    const ray = new THREE.Raycaster();
    const pick = (e: PointerEvent): Square | undefined => {
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(pieces.children, true)[0];
      let o: THREE.Object3D | null = hit?.object ?? null;
      while (o && o.userData.square === undefined) o = o.parent;
      const onPiece = o ? (o.userData.square as Square) : undefined;
      const p = ray.intersectObject(plane)[0]?.point;
      const onBoard = p ? squareAt(p) : undefined;
      // A nearer piece's head can stand over the square the player means.
      // With a piece selected, a legal square under the tap wins; otherwise
      // a piece that can move wins over one in front of it.
      const dests = latest.current.movable?.dests;
      const from = selected.current;
      const legal = (sq: Square | undefined) =>
        sq !== undefined &&
        from !== undefined &&
        !!dests?.get(makeSquare(from))?.includes(makeSquare(sq));
      const movable = (sq: Square | undefined) =>
        sq !== undefined && !!dests?.get(makeSquare(sq))?.length;
      if (legal(onBoard) && !legal(onPiece)) return onBoard;
      if (movable(onBoard) && !movable(onPiece)) return onBoard;
      return onPiece ?? onBoard;
    };
    const tap = (sq: Square) => {
      const p = latest.current;
      const name = makeSquare(sq);
      p.onSelect?.(name);
      const from = selected.current;
      const dests = p.movable?.dests;
      if (from !== undefined && dests?.get(makeSquare(from))?.includes(name)) {
        selected.current = undefined;
        p.onMove?.(makeSquare(from), name);
      } else if (from !== sq && dests?.get(name)?.length) selected.current = sq;
      else selected.current = undefined;
      sync();
    };
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onDown);
    // If the GPU drops the board anyway, the flat board takes its place.
    const onLost = (e: Event) => {
      e.preventDefault();
      latest.current.onFail?.({
        ...(gpu ? { gpu } : {}),
        width: canvas.width,
        height: canvas.height,
        quality: lite ? 'lite' : 'full',
        at: Date.now(),
      });
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('pointerup', onUp);
    // For tests: where a square's center is on the page.
    Object.assign(canvas, {
      squarePoint: (name: string) => {
        const sq = parseSquare(name);
        if (sq === undefined) return undefined;
        const v = center(sq).project(camera);
        const r = canvas.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
    });

    let live = true;
    void grain()
      .then(({ texture, mean }) => {
        if (!live) return;
        for (const m of [light, dark, frame]) {
          m.map = texture;
          m.needsUpdate = true;
        }
        lift = 1 / mean;
        paint(boardLook.get().colors);
      })
      // Without the wood the squares stay plain colors.
      .catch(() => undefined);
    void loadSet()
      .then((protos) => {
        if (!live) return;
        for (const proto of protos.values())
          proto.traverse((o) => {
            if (!(o instanceof THREE.Mesh)) return;
            for (const m of [o.material].flat())
              if (m instanceof THREE.MeshStandardMaterial) {
                m.envMap = lite ? null : room;
                m.envMapIntensity = 0.6;
                m.needsUpdate = true;
              }
          });
        if (view.current) delete view.current.drawn;
        sync();
      })
      .catch(() => latest.current.onFail?.());

    return () => {
      live = false;
      offColors();
      resize.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      controls.dispose();
      room.dispose();
      for (const m of ink) {
        m.map?.dispose();
        m.dispose();
      }
      renderer.dispose();
      canvas.remove();
      view.current = undefined;
    };
  }, []);

  /** Puts the pieces, highlights and arrows where the props say. */
  const sync = () => {
    const v = view.current;
    if (!v) return;
    const p = latest.current;
    if (p.fen !== shownFen.current) {
      shownFen.current = p.fen;
      selected.current = undefined;
    }
    // Screens re-render often; the board is drawn again only when what it
    // shows has changed. Drawing in software, as on some phones, is slow.
    const sel = selected.current;
    const key = JSON.stringify([
      p.fen,
      p.orientation,
      p.lastMove,
      p.shapes,
      sel,
      sel !== undefined ? p.movable?.dests.get(makeSquare(sel)) : undefined,
    ]);
    if (key === v.drawn) return;
    v.drawn = key;
    // From the player's side when the game starts or the board turns over;
    // after that the camera stays where the player turned it.
    if (v.side !== p.orientation) {
      v.side = p.orientation;
      v.camera.position.set(0, 0.92, p.orientation === 'white' ? -0.7 : 0.7);
      v.controls.target.set(0, 0, 0);
      v.controls.update();
      placeLabels(v.labels, v.ink, p.orientation);
    }

    void set?.then((protos) => {
      if (v.piecesFen === p.fen) return;
      v.piecesFen = p.fen;
      v.renderer.shadowMap.needsUpdate = true;
      v.pieces.clear();
      const setup = parseFen(p.fen);
      if (setup.isErr) return;
      for (const [sq, piece] of setup.value.board) {
        const proto = protos.get(`${piece.color} ${piece.role}`);
        if (!proto) continue;
        const o = proto.clone();
        o.position.copy(center(sq));
        o.userData.square = sq;
        v.pieces.add(o);
        const contact = new THREE.Mesh(CONTACT_SHAPE, contactShadow());
        contact.position.copy(center(sq, TOP + 0.0002));
        v.pieces.add(contact);
      }
      v.render();
    });

    v.marks.clear();
    const flat = (sq: Square, color: string, opacity: number, size = SQ) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      m.position.copy(center(sq, TOP + 0.0004));
      v.marks.add(m);
    };
    for (const k of p.lastMove ?? []) {
      const sq = parseSquare(k);
      if (sq !== undefined) flat(sq, '#9bc700', 0.45);
    }
    const state = kingState(p.fen);
    if (state !== 'none') {
      const setup = parseFen(p.fen);
      const turn = p.fen.split(' ')[1] === 'b' ? 'black' : 'white';
      const king = setup.isOk ? setup.value.board.kingOf(turn) : undefined;
      if (king !== undefined) flat(king, '#d0302a', 0.6);
    }
    if (sel !== undefined) {
      flat(sel, '#14551e', 0.5);
      const setup = parseFen(p.fen);
      for (const d of p.movable?.dests.get(makeSquare(sel)) ?? []) {
        const sq = parseSquare(d);
        if (sq === undefined) continue;
        const taken = setup.isOk && setup.value.board.has(sq);
        const dot = new THREE.Mesh(
          taken
            ? new THREE.RingGeometry(SQ * 0.38, SQ * 0.48, 32).rotateX(-Math.PI / 2)
            : new THREE.CircleGeometry(SQ * 0.16, 24).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: '#14551e',
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
          }),
        );
        dot.position.copy(center(sq, TOP + 0.0008));
        v.marks.add(dot);
      }
    }
    for (const s of p.shapes ?? []) {
      const from = parseSquare(s.orig);
      if (from === undefined) continue;
      const color = BRUSH[s.brush ?? 'green'] ?? BRUSH.green!;
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const to = s.dest ? parseSquare(s.dest) : undefined;
      if (to === undefined || to === from) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(SQ * 0.4, SQ * 0.47, 32).rotateX(-Math.PI / 2),
          material,
        );
        ring.position.copy(center(from, TOP + 0.001));
        v.marks.add(ring);
        continue;
      }
      // A flat arrow on the board: a shaft and a head, from center to center.
      const a = center(from, TOP + 0.001);
      const b = center(to, TOP + 0.001);
      const len = a.distanceTo(b);
      const head = SQ * 0.4;
      const shape = new THREE.Shape();
      const w = SQ * 0.09;
      shape.moveTo(-w, 0);
      shape.lineTo(-w, len - head);
      shape.lineTo(-head * 0.6, len - head);
      shape.lineTo(0, len);
      shape.lineTo(head * 0.6, len - head);
      shape.lineTo(w, len - head);
      shape.lineTo(w, 0);
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2), material);
      arrow.position.copy(a);
      arrow.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      v.marks.add(arrow);
    }
    v.render();
  };

  useEffect(sync);

  const taken = props.material === false ? undefined : takenFor(props.fen);
  const top = props.orientation === 'white' ? 'black' : 'white';
  const who = (c: 'white' | 'black') => (c === 'white' ? 'White' : 'Black');
  const state = kingState(props.fen);
  return (
    <div class="board-frame">
      {taken && <MaterialRow side={top} taken={taken[top]} label={who(top)} />}
      <div
        class="board board--3d"
        role="img"
        aria-label={`${props.label}${state === 'mate' ? ' Checkmate.' : state === 'check' ? ' Check.' : ''}`}
      >
        <div ref={host} class="board__3d" />
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
