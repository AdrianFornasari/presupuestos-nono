import type {
  SpeechToTextProvider,
  SpeechToTextSessionHandlers,
  SpeechToTextStartOptions,
} from '../contracts/SpeechToTextProvider';
import type {
  SpeechToTextError,
  SpeechToTextErrorCode,
} from '../types/voice';

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionResultList {
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionResult;
}

interface BrowserSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: BrowserSpeechRecognitionResultList;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message?: string;
}

interface BrowserSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;

  onstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;

  start(): void;
  stop(): void;
  abort(): void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface SpeechEnabledWindow extends Window {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
}

function obtenerConstructorSpeechRecognition():
  | BrowserSpeechRecognitionConstructor
  | null {
  if (typeof window === 'undefined') return null;

  const speechWindow = window as SpeechEnabledWindow;

  return (
    speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition ??
    null
  );
}

function mapearCodigoError(codigo: string): SpeechToTextErrorCode {
  if (codigo === 'not-allowed') return 'permission-denied';
  if (codigo === 'audio-capture') return 'microphone-unavailable';
  if (codigo === 'network') return 'network';
  if (codigo === 'no-speech') return 'no-speech';
  if (codigo === 'aborted') return 'aborted';
  if (codigo === 'service-not-allowed') return 'service-not-allowed';

  return 'unknown';
}

function crearErrorReconocimiento(
  codigo: string,
  mensajeOriginal?: string,
): SpeechToTextError {
  const code = mapearCodigoError(codigo);

  const mensajes: Record<SpeechToTextErrorCode, string> = {
    unsupported:
      'Este navegador no ofrece reconocimiento de voz compatible.',
    'permission-denied':
      'No se concedió permiso para usar el micrófono.',
    'microphone-unavailable':
      'No se pudo acceder al micrófono del dispositivo.',
    network:
      'El servicio de reconocimiento de voz informó un problema de red.',
    'no-speech':
      'No se detectó voz. Probá nuevamente hablando cerca del micrófono.',
    aborted:
      'El reconocimiento de voz fue cancelado.',
    'service-not-allowed':
      'El navegador no permite utilizar el servicio de reconocimiento de voz.',
    unknown:
      'Ocurrió un error durante el reconocimiento de voz.',
  };

  return {
    code,
    message: mensajeOriginal?.trim() || mensajes[code],
    originalCode: codigo,
  };
}

async function solicitarPermisoMicrofono(): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    for (const track of stream.getTracks()) {
      track.stop();
    }
  } catch (error) {
    const nombre =
      error instanceof DOMException
        ? error.name
        : '';

    if (
      nombre === 'NotAllowedError' ||
      nombre === 'PermissionDeniedError'
    ) {
      throw crearErrorReconocimiento('not-allowed');
    }

    if (
      nombre === 'NotFoundError' ||
      nombre === 'DevicesNotFoundError'
    ) {
      throw crearErrorReconocimiento('audio-capture');
    }

    throw crearErrorReconocimiento(
      'audio-capture',
      error instanceof Error ? error.message : undefined,
    );
  }
}

export class BrowserSpeechProvider implements SpeechToTextProvider {
  readonly id = 'browser-speech';
  readonly displayName = 'Reconocimiento de voz del navegador';

  private recognition: BrowserSpeechRecognition | null = null;
  private finalText = '';
  private interimText = '';
  private handlers: SpeechToTextSessionHandlers | null = null;
  private endedWithError = false;

  isSupported(): boolean {
    return obtenerConstructorSpeechRecognition() !== null;
  }

  async start(
    handlers: SpeechToTextSessionHandlers,
    options: SpeechToTextStartOptions = {},
  ): Promise<void> {
    if (this.recognition) {
      this.abort();
    }

    const SpeechRecognitionConstructor =
      obtenerConstructorSpeechRecognition();

    if (!SpeechRecognitionConstructor) {
      handlers.onError({
        code: 'unsupported',
        message:
          'Este navegador no ofrece SpeechRecognition/webkitSpeechRecognition.',
      });
      return;
    }

    this.handlers = handlers;
    this.finalText = '';
    this.interimText = '';
    this.endedWithError = false;

    try {
      await solicitarPermisoMicrofono();
    } catch (error) {
      const speechError =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'message' in error
          ? (error as SpeechToTextError)
          : crearErrorReconocimiento('audio-capture');

      handlers.onError(speechError);
      return;
    }

    const recognition = new SpeechRecognitionConstructor();

    recognition.lang = options.language ?? 'es-AR';
    recognition.continuous = options.continuous ?? true;
    recognition.interimResults = options.interimResults ?? true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.handlers?.onStart();
    };

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim() ?? '';

        if (!transcript) continue;

        if (result.isFinal) {
          finalText = `${finalText} ${transcript}`.trim();
        } else {
          interimText = `${interimText} ${transcript}`.trim();
        }
      }

      this.finalText = finalText;
      this.interimText = interimText;

      this.handlers?.onUpdate({
        finalText: this.finalText,
        interimText: this.interimText,
      });
    };

    recognition.onerror = (event) => {
      this.endedWithError = event.error !== 'aborted';

      this.handlers?.onError(
        crearErrorReconocimiento(event.error, event.message),
      );
    };

    recognition.onend = () => {
      const textoFinal = [
        this.finalText.trim(),
        this.interimText.trim(),
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      const currentHandlers = this.handlers;
      const endedWithError = this.endedWithError;

      this.recognition = null;
      this.handlers = null;
      this.finalText = '';
      this.interimText = '';
      this.endedWithError = false;

      if (!endedWithError || textoFinal) {
        currentHandlers?.onEnd(textoFinal);
      }
    };

    this.recognition = recognition;

    try {
      recognition.start();
    } catch (error) {
      this.recognition = null;
      this.handlers = null;

      handlers.onError(
        crearErrorReconocimiento(
          'unknown',
          error instanceof Error
            ? error.message
            : 'No se pudo iniciar el reconocimiento de voz.',
        ),
      );
    }
  }

  stop(): void {
    this.recognition?.stop();
  }

  abort(): void {
    const recognition = this.recognition;

    this.recognition = null;
    this.handlers = null;
    this.finalText = '';
    this.interimText = '';
    this.endedWithError = false;

    try {
      recognition?.abort();
    } catch {
      // No requiere acción: puede ocurrir si la sesión ya terminó.
    }
  }
}
