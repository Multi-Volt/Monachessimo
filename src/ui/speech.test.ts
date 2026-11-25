import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickVoice, sanToWords, speak, speakable, stopSpeaking } from './speech';

const voice = (voiceURI: string, lang: string, isDefault = false, localService = true) =>
  ({
    voiceURI,
    lang,
    default: isDefault,
    localService,
    name: voiceURI,
  }) as SpeechSynthesisVoice;

describe('speech', () => {
  it('reads moves in words', () => {
    expect(sanToWords('Nxe5+')).toBe('knight takes e5, check');
    expect(sanToWords('exd5')).toBe('e pawn takes d5');
    expect(sanToWords('Qh7#')).toBe('queen h7, checkmate');
    expect(sanToWords('e8=Q')).toBe('e8, promotes to queen');
    expect(sanToWords('Rad1')).toBe('rook from a d1');
    expect(sanToWords('O-O-O')).toBe('castles long');
    expect(sanToWords('Qg1+!!')).toBe('queen g1, check');
  });

  it('keeps a move that ends a sentence', () => {
    expect(speakable('Find a better move than Qh4. Stuck? Tap Hint.')).toBe(
      'Find a better move than queen h4. Stuck? Tap Hint.',
    );
    expect(speakable('After 12. Nf3 and 12... e5 it costs about 8.3 pawns.')).toBe(
      'After knight f3 and e5 it costs about 8.3 pawns.',
    );
  });

  it('turns coach text into plain speech', () => {
    expect(speakable('With **Nf6**, I threaten Nxe4, taking your pawn on e4.')).toBe(
      'With knight f6, I threaten knight takes e4, taking your pawn on e4.',
    );
  });

  it('picks the saved voice, else an English default', () => {
    const voices = [voice('fr', 'fr-FR'), voice('en-a', 'en-GB'), voice('en-b', 'en-US', true)];
    expect(pickVoice(voices, 'en-a')?.voiceURI).toBe('en-a');
    expect(pickVoice(voices, 'missing')?.voiceURI).toBe('en-b');
    expect(pickVoice([], undefined)).toBeUndefined();
  });

  it('prefers a device voice to a cloud voice, unless the cloud voice was chosen', () => {
    const voices = [voice('cloud', 'en-US', true, false), voice('device', 'de-DE')];
    expect(pickVoice(voices, undefined)?.voiceURI).toBe('device');
    expect(pickVoice(voices, 'cloud')?.voiceURI).toBe('cloud');
    expect(pickVoice([voice('cloud', 'en-US', true, false)], undefined)?.voiceURI).toBe('cloud');
  });
});

describe('speaking', () => {
  /** A fake engine: `busy` says whether something is being read. */
  function fakeEngine(busy: boolean) {
    const log: string[] = [];
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        voice: unknown = null;
        lang = '';
        onend: (() => void) | null = null;
        constructor(public text: string) {}
      },
    );
    vi.stubGlobal('window', {
      speechSynthesis: {
        speaking: busy,
        pending: false,
        speak: (u: { text: string }) => log.push(`speak ${u.text}`),
        cancel: () => log.push('cancel'),
      },
    });
    return log;
  }
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('speaks at once when nothing is being read', () => {
    const log = fakeEngine(false);
    speak('Correct.', undefined);
    expect(log).toEqual(['speak Correct.']);
  });

  it('waits a moment after cutting off speech, as Chrome needs', () => {
    vi.useFakeTimers();
    const log = fakeEngine(true);
    speak('Not that move.', undefined);
    expect(log).toEqual(['cancel']);
    vi.advanceTimersByTime(150);
    expect(log).toEqual(['cancel', 'speak Not that move.']);
  });

  it('lets a button stop only its own speech', () => {
    const log = fakeEngine(false);
    const first = speak('Black to move.', undefined);
    speak('Well played.', undefined);
    stopSpeaking(first);
    expect(log).toEqual(['speak Black to move.', 'speak Well played.']);
    stopSpeaking();
    expect(log.at(-1)).toBe('cancel');
  });
});
