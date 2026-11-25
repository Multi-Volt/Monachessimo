import { useEffect, useState } from 'preact/hooks';
import { deleteEverything } from '../../store/db';
import { useServices } from '../../ui/hooks';
import { DEPTH_PRESETS } from '../services';
import { href } from '../router';
import { useStore } from '../../ui/store';
import { install, isIos, pwaState } from '../../pwa/register';
import { BOARD_PRESETS, DEFAULT_BOARD, type BoardColors } from '../../ui/boardTheme';
import { canSpeak, pickVoice, speak, useVoices, voiceLabel } from '../../ui/speech';
import {
  deleteModel,
  getManifest,
  loadModel,
  modelState,
  type ModelManifest,
} from '../../play/coachModel';

/** Spoken coaching. Shown when the browser can speak. */
function VoicePanel() {
  const services = useServices()!;
  const voices = useVoices();
  const [v, setV] = useState(services.settings.voice ?? { readAll: false });
  if (!canSpeak()) return null;
  const save = async (next: typeof v) => {
    setV(next);
    await services.saveSettings({ ...services.settings, voice: next });
  };
  const chosen = pickVoice(voices, v.uri);
  return (
    <div class="panel">
      <h2>Spoken coaching</h2>
      <p class="hint">
        Voices that run on this device come first. A voice marked “may send text online” can send
        what it reads to the browser maker. Without automatic reading, sound plays only when you tap
        a speak button.
      </p>
      {voices.length ? (
        <div class="field">
          <label for="voice">Voice</label>
          <select
            id="voice"
            value={chosen?.voiceURI}
            onChange={(e) => void save({ ...v, uri: e.currentTarget.value })}
          >
            {voices.map((x) => (
              <option key={x.voiceURI} value={x.voiceURI}>
                {voiceLabel(x)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p class="hint">
          This browser lists no voices, so it reads with the device's default voice.
        </p>
      )}
      <label class="choice">
        <input
          type="checkbox"
          checked={v.readAll}
          onChange={(e) => void save({ ...v, readAll: e.currentTarget.checked })}
        />
        <span>Read aloud automatically: every text with a speak button, as it appears</span>
      </label>
      <div class="row">
        <button
          type="button"
          class="button"
          onClick={() => speak('Nf3 develops the knight and attacks e5.', chosen)}
        >
          Try the voice
        </button>
      </div>
    </div>
  );
}

const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/** The on-device wording model. Shown when this build ships one. */
function CoachModelPanel() {
  const services = useServices()!;
  const [manifest, setManifest] = useState<ModelManifest>();
  const [on, setOn] = useState(!!services.settings.coachModel);
  const { state } = useStore(modelState);
  useEffect(() => {
    void getManifest().then(setManifest);
  }, []);
  if (!manifest) return null;
  const save = async (next: boolean) => {
    setOn(next);
    await services.saveSettings({ ...services.settings, coachModel: next });
    if (next) void loadModel().catch(() => undefined);
    else await deleteModel();
  };
  return (
    <div class="panel">
      <h2>Coach wording</h2>
      <p class="hint">
        A small language model on this device rewrites the coach's notes on a refused move into
        plain sentences. The notes still appear first, and the model's text replaces them only when
        it matches every fact. It is an experiment and slow for now: on a phone the sentences can
        take half a minute. It downloads {mb(manifest.bytes)} once and works offline after that.
        Turning it off deletes it from this device.
      </p>
      <label class="choice">
        <input type="checkbox" checked={on} onChange={(e) => void save(e.currentTarget.checked)} />
        <span>Word the coach's explanations with the model</span>
      </label>
      {on && (
        <p class="hint" role="status">
          {state.kind === 'loading'
            ? `Downloading the model: ${mb(state.loaded)} of ${mb(state.total)}.`
            : state.kind === 'ready'
              ? `The model is ready. Version ${manifest.version}.`
              : state.kind === 'failed'
                ? `The model could not load, so the coach uses its notes. ${state.message}`
                : 'The model loads when you next play.'}
        </p>
      )}
    </div>
  );
}

function BoardPanel() {
  const services = useServices()!;
  const current = services.settings.board ?? DEFAULT_BOARD;
  const [colors, setColors] = useState<BoardColors>(current);
  const presetKey = Object.keys(BOARD_PRESETS).find((k) => {
    const p = BOARD_PRESETS[k]!.colors;
    return p.light === colors.light && p.dark === colors.dark;
  });
  const [custom, setCustom] = useState(!presetKey);
  const choose = async (c: BoardColors) => {
    setColors(c);
    await services.saveSettings({ ...services.settings, board: c });
  };
  return (
    <div class="panel">
      <h2>Board colors</h2>
      <div class="board-preview" aria-hidden="true">
        {Array.from({ length: 16 }, (_, i) => (
          <span
            key={i}
            style={{ background: (Math.floor(i / 4) + i) % 2 === 0 ? colors.light : colors.dark }}
          />
        ))}
      </div>
      <fieldset class="field">
        <legend>Squares</legend>
        <div class="swatches">
          {Object.entries(BOARD_PRESETS).map(([k, p]) => (
            <label key={k} class="swatch">
              <input
                type="radio"
                name="board"
                checked={!custom && presetKey === k}
                onChange={() => {
                  setCustom(false);
                  void choose(p.colors);
                }}
              />
              <span class="swatch__chip" aria-hidden="true">
                <span style={{ background: p.colors.light }} />
                <span style={{ background: p.colors.dark }} />
              </span>
              <span>{p.label}</span>
            </label>
          ))}
          <label class="swatch">
            <input type="radio" name="board" checked={custom} onChange={() => setCustom(true)} />
            <span class="swatch__chip" aria-hidden="true">
              <span style={{ background: colors.light }} />
              <span style={{ background: colors.dark }} />
            </span>
            <span>Custom</span>
          </label>
        </div>
      </fieldset>
      {custom && (
        <div class="row">
          <label class="color-field">
            <input
              type="color"
              value={colors.light}
              onInput={(e) => void choose({ ...colors, light: e.currentTarget.value })}
            />
            <span>Light squares</span>
          </label>
          <label class="color-field">
            <input
              type="color"
              value={colors.dark}
              onInput={(e) => void choose({ ...colors, dark: e.currentTarget.value })}
            />
            <span>Dark squares</span>
          </label>
        </div>
      )}
    </div>
  );
}

function InstallPanel() {
  const pwa = useStore(pwaState);
  if (__OFFLINE__)
    return (
      <div class="panel">
        <h2>Offline copy</h2>
        <p>
          You are using the offline copy. It keeps its own data in this browser, apart from the
          website.
        </p>
      </div>
    );
  return (
    <div class="panel">
      <h2>Install and offline use</h2>
      {pwa.installed ? (
        <p>Monachessimo is installed on this device.</p>
      ) : pwa.canInstall ? (
        <button type="button" class="button button--primary" onClick={() => void install()}>
          Install Monachessimo
        </button>
      ) : isIos() ? (
        <p>In Safari, tap Share, then Add to Home Screen.</p>
      ) : (
        <p>Use your browser's menu to install this site as an app.</p>
      )}
      <p>
        <a href="offline/monachessimo.html" download="monachessimo.html">
          Download the offline copy
        </a>{' '}
        <span class="hint">It is one HTML file of about 3 MB.</span>
      </p>
      <p class="hint">
        {pwa.offlineReady
          ? 'The app and the engine are saved for offline use. Puzzles you have opened are saved too.'
          : 'After the first visit, the app and the engine work without a connection.'}
      </p>
    </div>
  );
}

type Preset = keyof typeof DEPTH_PRESETS;

const PRESET_TEXT: Record<Preset, string> = {
  quick: 'Quick. Depth 10, then 15 on flagged moves. Finds fewer subtle mistakes.',
  standard: 'Standard. Depth 12, then 18 on flagged moves.',
  thorough: 'Thorough. Depth 14, then 20 on flagged moves. Slow on phones.',
};

export function Settings() {
  const services = useServices();
  const [message, setMessage] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!services) return <p class="screen">Loading settings…</p>;
  const s = services.settings;
  const cores = navigator.hardwareConcurrency || 2;
  const preset =
    (Object.keys(DEPTH_PRESETS) as Preset[]).find(
      (k) => JSON.stringify(DEPTH_PRESETS[k]) === JSON.stringify(s.analysis),
    ) ?? 'standard';

  const save = async (patch: Partial<typeof s>) => {
    await services.saveSettings({ ...s, ...patch });
    setMessage('Settings saved.');
  };

  const exportData = async () => {
    const data = await services.repo.exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monachessimo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Export file created.');
  };

  const importData = async (file: File | undefined) => {
    if (!file) return;
    try {
      const n = await services.repo.importAll(JSON.parse(await file.text()));
      setMessage(`Imported ${n} records.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'This file could not be read.');
    }
  };

  const wipe = async () => {
    await services.runner.pause();
    services.pool.terminate();
    await deleteEverything();
    location.hash = '';
    location.reload();
  };

  return (
    <section class="screen" aria-labelledby="settings-title">
      <h1 id="settings-title">Settings</h1>
      {message && (
        <p class="notice" role="status">
          {message}
        </p>
      )}

      <div class="panel">
        <h2>Engine</h2>
        <div class="field">
          <label for="workers">Engines running at once</label>
          <select
            id="workers"
            value={s.workers}
            onChange={(e) => void save({ workers: Number(e.currentTarget.value) })}
          >
            {Array.from({ length: Math.max(1, Math.min(cores, 8)) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <p class="hint">
            This device reports {cores} processor cores. Each engine uses one core and about 20 MB
            of memory. Use fewer if the phone gets hot or the page reloads.
          </p>
        </div>
        <fieldset class="field">
          <legend>Analysis depth</legend>
          {(Object.keys(DEPTH_PRESETS) as Preset[]).map((k) => (
            <label key={k} class="choice">
              <input
                type="radio"
                name="preset"
                checked={preset === k}
                onChange={() => void save({ analysis: DEPTH_PRESETS[k] })}
              />
              <span>{PRESET_TEXT[k]}</span>
            </label>
          ))}
          <p class="hint">Changing depth analyzes your games again with the new setting.</p>
        </fieldset>
      </div>

      <BoardPanel />

      <VoicePanel />
      <CoachModelPanel />

      <InstallPanel />

      <div class="panel">
        <h2>Your data</h2>
        <p>Everything is stored in this browser. Export a file to move it to another device.</p>
        <div class="stack">
          <button type="button" class="button" onClick={() => void exportData()}>
            Export all data
          </button>
          <label class="button">
            Import data from a file
            <input
              type="file"
              accept="application/json,.json"
              class="visually-hidden"
              onChange={(e) => void importData(e.currentTarget.files?.[0])}
            />
          </label>
          {!confirmDelete ? (
            <button
              type="button"
              class="button button--danger"
              onClick={() => setConfirmDelete(true)}
            >
              Delete everything
            </button>
          ) : (
            <div class="panel panel--danger" role="alert">
              <p>
                This deletes all games, analysis and practice history from this browser. It cannot
                be undone.
              </p>
              <div class="row">
                <button type="button" class="button button--danger" onClick={() => void wipe()}>
                  Delete everything
                </button>
                <button type="button" class="button" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <p>
        <a href={href('about')}>About, credits and privacy</a>
      </p>
    </section>
  );
}
