import { describe, expect, it } from 'vitest';
import { pickVoice, sanToWords, speakable } from './speech';

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
