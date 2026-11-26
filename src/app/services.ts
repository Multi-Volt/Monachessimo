import { AnalysisRunner } from '../analysis/runner';
import { DEFAULT_SETTINGS, type AnalysisSettings } from '../analysis/types';
import { EnginePool, defaultPoolSize } from '../engine/pool';
import { workerTransport } from '../engine/worker';
import { Repo } from '../store/repo';
import { retagIfNeeded } from '../profile/data';
import { applyBoardColors, boardLook, type BoardColors } from '../ui/boardTheme';

export interface AppSettings {
  workers: number;
  analysis: AnalysisSettings;
  /** Square colors. Missing means the default olive wood. */
  board?: BoardColors;
  /** Spoken coaching with a voice on the device. Missing means off. */
  voice?: VoiceSettings;
  /** Word the coach's explanations with the on-device model. Missing means off. */
  coachModel?: boolean;
  /** Show boards in 3D. Missing means 3D; a device without WebGL shows them flat. */
  board3d?: boolean;
}

export interface VoiceSettings {
  /** The chosen local voice; missing means an English one. */
  uri?: string;
  /** Read every verdict aloud after the player's move. */
  readAll: boolean;
}

/** Depth presets shown in Settings. "Standard" matches the build plan. */
export const DEPTH_PRESETS: Record<'quick' | 'standard' | 'thorough', AnalysisSettings> = {
  quick: {
    ...DEFAULT_SETTINGS,
    fastDepth: 10,
    fastMovetime: 150,
    deepDepth: 15,
    deepMovetime: 800,
  },
  standard: DEFAULT_SETTINGS,
  thorough: {
    ...DEFAULT_SETTINGS,
    fastDepth: 14,
    fastMovetime: 500,
    deepDepth: 20,
    deepMovetime: 3000,
  },
};

export interface Services {
  repo: Repo;
  pool: EnginePool;
  runner: AnalysisRunner;
  settings: AppSettings;
  saveSettings(s: AppSettings): Promise<void>;
}

let services: Promise<Services> | undefined;

/** Opens storage and starts the engine pool once, on first use. */
export function getServices(): Promise<Services> {
  services ??= (async () => {
    const repo = await Repo.open();
    const settings = await repo.getSetting<AppSettings>('app', {
      workers: defaultPoolSize(),
      analysis: DEFAULT_SETTINGS,
    });
    applyBoardColors(settings.board);
    boardLook.set({ three: settings.board3d ?? true });
    await retagIfNeeded(repo, settings.analysis);
    const pool = new EnginePool(workerTransport, settings.workers);
    const runner = new AnalysisRunner(repo, pool, settings.analysis);
    const s: Services = {
      repo,
      pool,
      runner,
      settings,
      async saveSettings(next) {
        s.settings = next;
        await repo.setSetting('app', next);
        pool.resize(next.workers);
        applyBoardColors(next.board);
        boardLook.set({ three: next.board3d ?? true });
        runner.setSettings(next.analysis);
      },
    };
    return s;
  })();
  return services;
}
