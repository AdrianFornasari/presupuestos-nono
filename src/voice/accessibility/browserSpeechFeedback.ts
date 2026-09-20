export interface SpeechFeedbackOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

const DEFAULT_LANGUAGE = 'es-AR';

export function isSpeechFeedbackSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

function findSpanishVoice(language: string): SpeechSynthesisVoice | undefined {
  if (!isSpeechFeedbackSupported()) return undefined;

  const voices = window.speechSynthesis.getVoices();
  const normalizedLanguage = language.toLocaleLowerCase('es-AR');

  return (
    voices.find(
      (voice) => voice.lang.toLocaleLowerCase('es-AR') === normalizedLanguage,
    ) ??
    voices.find((voice) =>
      voice.lang.toLocaleLowerCase('es-AR').startsWith('es-ar'),
    ) ??
    voices.find((voice) =>
      voice.lang.toLocaleLowerCase('es-AR').startsWith('es'),
    )
  );
}

export function stopSpeechFeedback(): void {
  if (!isSpeechFeedbackSupported()) return;
  window.speechSynthesis.cancel();
}

export function speakSpeechFeedback(
  text: string,
  options: SpeechFeedbackOptions = {},
): boolean {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (!cleanText || !isSpeechFeedbackSupported()) return false;

  const language = options.language ?? DEFAULT_LANGUAGE;
  const utterance = new SpeechSynthesisUtterance(cleanText);
  const voice = findSpanishVoice(language);

  utterance.lang = language;
  utterance.rate = options.rate ?? 0.92;
  utterance.pitch = options.pitch ?? 1;
  utterance.volume = options.volume ?? 1;

  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}
