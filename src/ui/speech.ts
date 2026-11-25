import { useEffect, useState } from 'preact/hooks';

/**
 * Spoken coaching with the browser's own voices. Every voice is offered,
 * but one that runs on the device (`localService`) is chosen first: some
 * browsers offer cloud voices that send the text to a server, and those are
 * marked. Some browsers, Chrome on Android among them, list no voices at all
 * and still speak with the device's default voice, so speech is offered
 * whenever the browser has it.
 */

const synth = (): SpeechSynthesis | undefined =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined;

/** Whether the browser can speak at all. */
export const canSpeak = (): boolean => synth() !== undefined;

const allVoices = (): SpeechSynthesisVoice[] => synth()?.getVoices() ?? [];

/** The browser's voices; the list fills in after the browser loads it. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(allVoices);
  useEffect(() => {
    const s = synth();
    if (!s) return;
    const on = () => setVoices(allVoices());
    s.addEventListener('voiceschanged', on);
    on();
    return () => s.removeEventListener('voiceschanged', on);
  }, []);
  return voices;
}

/**
 * The chosen voice. Otherwise a device voice before a cloud one: an English
 * default, then any English voice, then the first.
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  uri: string | undefined,
): SpeechSynthesisVoice | undefined {
  const saved = voices.find((v) => v.voiceURI === uri);
  if (saved) return saved;
  const en = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith('en');
  for (const pool of [voices.filter((v) => v.localService), voices])
    for (const test of [(v: SpeechSynthesisVoice) => en(v) && v.default, en, () => true]) {
      const found = pool.find(test);
      if (found) return found;
    }
  return undefined;
}

/** A voice's name in the voice list, marking voices that may send text online. */
export const voiceLabel = (v: SpeechSynthesisVoice): string =>
  `${v.name}, ${v.lang}${v.localService ? '' : ', may send text online'}`;

const PIECE: Record<string, string> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
};

/** One SAN move in words: "Nxe5+" is "knight takes e5, check". */
export function sanToWords(san: string): string {
  if (/^O-O-O/.test(san))
    return `castles long${san.endsWith('#') ? ', checkmate' : san.endsWith('+') ? ', check' : ''}`;
  if (/^O-O/.test(san))
    return `castles${san.endsWith('#') ? ', checkmate' : san.endsWith('+') ? ', check' : ''}`;
  const m = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?([+#])?[!?]*$/.exec(san);
  if (!m) return san;
  const [, piece, file, rank, takes, to, promo, check] = m;
  const who = piece ? PIECE[piece]! : file && takes ? `${file} pawn` : '';
  const from = piece && (file || rank) ? ` from ${file ?? ''}${rank ?? ''}` : '';
  const parts = [`${who}${from}`.trim(), takes ? 'takes' : '', to!].filter(Boolean);
  let out = parts.join(' ');
  if (promo) out += `, promotes to ${PIECE[promo]}`;
  if (check === '+') out += ', check';
  if (check === '#') out += ', checkmate';
  return out;
}

const SAN = /\b(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?[!?]*/g;

/** Coach text as it should be read: no markup, moves in words. */
export function speakable(text: string): string {
  return (
    text
      .replace(/\*\*/g, '')
      // Move numbers such as "12." or "12...", but not the rank that ends "Qh4." in a sentence.
      .replace(/(?<![\w.])\d+\.(?:\.\.)?\s?(?=[KQRBNOa-h])/g, '')
      .replace(/…/g, '')
      .replace(SAN, (s) => {
        // A bare square such as "e4" in a sentence is read as it is.
        return /^[a-h][1-8]$/.test(s) ? s : sanToWords(s);
      })
  );
}

/** Reads text aloud; without a voice, with the device's default voice. */
export function speak(text: string, voice: SpeechSynthesisVoice | undefined): void {
  const s = synth();
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else u.lang = 'en';
  s.speak(u);
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
