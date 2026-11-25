import { useEffect, useRef } from 'preact/hooks';
import { useServices } from './hooks';
import { canSpeak, pickVoice, speak, stopSpeaking, useVoices } from './speech';

/**
 * A button that reads `text` aloud, shown when the browser can speak. If
 * the player turned on "read aloud automatically", the text is also read
 * when it appears, whenever it changes and whenever `repeat` changes, so
 * the same message given twice is read twice. With `auto` false it reads
 * only on a tap: a second button that appears with the main one would cut
 * it off. Browsers refuse speech before the first tap on a page, so a
 * freshly loaded page stays silent.
 */
export function SpeakButton({
  text,
  auto = true,
  repeat,
}: {
  text: string;
  auto?: boolean;
  repeat?: unknown;
}) {
  const services = useServices();
  const voices = useVoices();
  const settings = services?.settings.voice;
  const voice = pickVoice(voices, settings?.uri);
  const mine = useRef<SpeechSynthesisUtterance | undefined>(undefined);
  useEffect(() => {
    if (auto && settings?.readAll && text) mine.current = speak(text, voice);
  }, [text, repeat]);
  // Leaving stops this button's own speech, never another button's.
  useEffect(() => () => stopSpeaking(mine.current), []);
  if (!canSpeak() || !text) return null;
  return (
    <button
      type="button"
      class="speak-button"
      aria-label="Read aloud"
      title="Read aloud"
      onClick={() => (mine.current = speak(text, voice))}
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
