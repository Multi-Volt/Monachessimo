import { useEffect, useRef } from 'preact/hooks';
import { useServices } from './hooks';
import { pickVoice, speak, stopSpeaking, useLocalVoices } from './speech';

/**
 * A button that reads `text` with a voice on the device, shown only when
 * the device has one. With `auto`, the text is also read whenever it
 * changes, if the player turned on "read every verdict aloud". The text a
 * screen opens with is never read: sound needs a tap or a move first.
 */
export function SpeakButton({ text, auto = false }: { text: string; auto?: boolean }) {
  const services = useServices();
  const voices = useLocalVoices();
  const settings = services?.settings.voice;
  const voice = pickVoice(voices, settings?.uri);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (auto && settings?.readAll && text) speak(text, voice);
  }, [text]);
  useEffect(() => () => stopSpeaking(), []);
  if (!voice || !text) return null;
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
