import { useState } from 'preact/hooks';
import { deleteEverything } from '../../store/db';
import { useServices } from '../../ui/hooks';
import { DEPTH_PRESETS } from '../services';
import { href } from '../router';

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
