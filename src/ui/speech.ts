import { useEffect, useState } from 'preact/hooks';

/**
 * Spoken coaching with the browser's own voices. Only voices that run on the
 * device (`localService`) are used: some browsers offer cloud voices that
 * send the text to a server. With no local voice, nothing is offered.
 */

const synth = (): SpeechSynthesis | undefined =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined;

export function localVoices(): SpeechSynthesisVoice[] {
  return (synth()?.getVoices() ?? []).filter((v) => v.localService);
}

/** The device's local voices; the list fills in after the browser loads it. */
export function useLocalVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(localVoices);
  useEffect(() => {
    const s = synth();
    if (!s) return;
    const on = () => setVoices(localVoices());
    s.addEventListener('voiceschanged', on);
    on();
    return () => s.removeEventListener('voiceschanged', on);
  }, []);
  return voices;
}

/** The chosen voice, else an English one, else the first. */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  uri: string | undefined,
): SpeechSynthesisVoice | undefined {
  return (
    voices.find((v) => v.voiceURI === uri) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en') && v.default) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    voices[0]
  );
}

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
  return text
    .replace(/\*\*/g, '')
    .replace(/(\d+)\.(\.\.)?\s?(?=[KQRBNO a-h])/g, '')
    .replace(/…/g, '')
    .replace(SAN, (s) => {
      // A bare square such as "e4" in a sentence is read as it is.
      return /^[a-h][1-8]$/.test(s) ? s : sanToWords(s);
    });
}

export function speak(text: string, voice: SpeechSynthesisVoice | undefined): void {
  const s = synth();
  if (!s || !voice) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  u.voice = voice;
  u.lang = voice.lang;
  s.speak(u);
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
