import { useEffect } from 'preact/hooks';
import { useServices } from './hooks';
import { canSpeak, pickVoice, speak, stopSpeaking, useVoices } from './speech';

/**
 * A button that reads `text` aloud, shown when the browser can speak. If
 * the player turned on "read aloud automatically", the text is also read
 * when it appears and whenever it changes. Browsers refuse speech before the
 * first tap on a page, so a freshly loaded page stays silent.
 */
export function SpeakButton({ text }: { text: string }) {
  const services = useServices();
  const voices = useVoices();
  const settings = services?.settings.voice;
  const voice = pickVoice(voices, settings?.uri);
  useEffect(() => {
    if (settings?.readAll && text) speak(text, voice);
  }, [text]);
  useEffect(() => () => stopSpeaking(), []);
  if (!canSpeak() || !text) return null;
  return (
    <button
      type="button"
      class="speak-button"
      aria-label="Read aloud"
      title="Read aloud"
      onClick={() => speak(text, voice)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
