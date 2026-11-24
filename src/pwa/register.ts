import { createStore } from '../ui/store';

export interface PwaState {
  /** A new version is downloaded and waits for a reload. */
  needRefresh: boolean;
  /** The app shell and engine are cached for offline use. */
  offlineReady: boolean;
  /** Android Chrome's install prompt, when the browser offers one. */
  canInstall: boolean;
  installed: boolean;
}

export const pwaState = createStore<PwaState>({
  needRefresh: false,
  offlineReady: false,
  canInstall: false,
  installed: typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
});

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | undefined;
let update: ((reload?: boolean) => Promise<void>) | undefined;

/** Registers the service worker and listens for the install prompt. */
export async function startPwa(): Promise<void> {
  if (__OFFLINE__ || !('serviceWorker' in navigator)) return;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    pwaState.set({ canInstall: true });
  });
  addEventListener('appinstalled', () => pwaState.set({ canInstall: false, installed: true }));
  const { registerSW } = await import('virtual:pwa-register');
  update = registerSW({
    onNeedRefresh: () => pwaState.set({ needRefresh: true }),
    onOfflineReady: () => pwaState.set({ offlineReady: true }),
  });
}

export async function applyUpdate(): Promise<void> {
  await update?.(true);
}

export async function install(): Promise<void> {
  if (!deferred) return;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = undefined;
  pwaState.set({ canInstall: false, installed: choice.outcome === 'accepted' });
}

/** True on iPhone and iPad Safari, which install through the Share menu. */
export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
