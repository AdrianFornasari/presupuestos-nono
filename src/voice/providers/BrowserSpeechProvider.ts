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

interface NormalizedSpeechOptions {
  language: string;
  continuous: boolean;
  interimResults: boolean;
}

const AUTO_RESTART_DELAY_MS = 250;

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
    const nombre = error instanceof DOMException ? error.name : '';

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

function unirSegmentos(segmentos: string[]): string {
  return segmentos
    .map((segmento) => segmento.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizarParaComparacion(texto: string): string[] {
  return texto
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
}

function contarPrefijoComun(a: string[], b: string[]): number {
  const limite = Math.min(a.length, b.length);
  let cantidad = 0;

  while (cantidad < limite && a[cantidad] === b[cantidad]) {
    cantidad += 1;
  }

  return cantidad;
}

function contarSuperposicionFinalInicio(a: string[], b: string[]): number {
  const limite = Math.min(a.length, b.length);

  for (let cantidad = limite; cantidad >= 1; cantidad -= 1) {
    const finalA = a.slice(a.length - cantidad);
    const inicioB = b.slice(0, cantidad);

    if (finalA.every((token, index) => token === inicioB[index])) {
      return cantidad;
    }
  }

  return 0;
}

/**
 * Fusiona dos hipótesis del Web Speech API sin asumir que cada resultado
 * "final" es un segmento independiente.
 *
 * En algunos Chrome/Android, durante una misma frase se emiten como finales
 * hipótesis progresivas completas ("cinco", "cinco tubos", "cinco tubos
 * cuadrados", ...). En escritorio, en cambio, pueden recibirse segmentos
 * finales realmente independientes. Esta función distingue ambos patrones:
 * reemplaza hipótesis acumulativas y concatena sólo continuaciones reales.
 */
function fusionarTextoReconocido(anterior: string, siguiente: string): string {
  const previo = anterior.trim();
  const nuevo = siguiente.trim();

  if (!previo) return nuevo;
  if (!nuevo) return previo;

  const tokensPrevio = tokenizarParaComparacion(previo);
  const tokensNuevo = tokenizarParaComparacion(nuevo);

  if (tokensPrevio.length === 0) return nuevo;
  if (tokensNuevo.length === 0) return previo;

  const previoNormalizado = tokensPrevio.join(' ');
  const nuevoNormalizado = tokensNuevo.join(' ');

  if (previoNormalizado === nuevoNormalizado) {
    return previo;
  }

  if (nuevoNormalizado.startsWith(`${previoNormalizado} `)) {
    return nuevo;
  }

  if (previoNormalizado.startsWith(`${nuevoNormalizado} `)) {
    return previo;
  }

  const prefijoComun = contarPrefijoComun(tokensPrevio, tokensNuevo);
  const proporcionPrefijo =
    prefijoComun / Math.max(1, Math.min(tokensPrevio.length, tokensNuevo.length));

  // Android puede corregir una hipótesis acumulativa previa (por ejemplo,
  // "50%" -> "50 por 50"). Si ambas frases comparten un prefijo fuerte y la
  // nueva no es una regresión grande, la nueva reemplaza a la anterior.
  if (
    prefijoComun >= 2 &&
    proporcionPrefijo >= 0.6 &&
    tokensNuevo.length >= Math.floor(tokensPrevio.length * 0.75)
  ) {
    return nuevo;
  }

  const superposicion = contarSuperposicionFinalInicio(
    tokensPrevio,
    tokensNuevo,
  );

  if (superposicion > 0) {
    const tokensOriginalesNuevo = nuevo.split(/\s+/g);
    return unirSegmentos([
      previo,
      tokensOriginalesNuevo.slice(superposicion).join(' '),
    ]);
  }

  return unirSegmentos([previo, nuevo]);
}

function combinarResultados(
  resultados: BrowserSpeechRecognitionResultList,
  usarFinales: boolean,
): string {
  let combinado = '';

  for (let index = 0; index < resultados.length; index += 1) {
    const resultado = resultados[index];

    if (resultado.isFinal !== usarFinales) {
      continue;
    }

    const transcript = resultado[0]?.transcript?.trim() ?? '';

    if (!transcript) {
      continue;
    }

    combinado = fusionarTextoReconocido(combinado, transcript);
  }

  return combinado;
}

export class BrowserSpeechProvider implements SpeechToTextProvider {
  readonly id = 'browser-speech';
  readonly displayName = 'Reconocimiento de voz del navegador';

  private recognition: BrowserSpeechRecognition | null = null;
  private handlers: SpeechToTextSessionHandlers | null = null;
  private options: NormalizedSpeechOptions | null = null;

  private committedFinalText = '';
  private activeCycleFinalText = '';
  private interimText = '';

  private shouldKeepListening = false;
  private stopRequested = false;
  private abortRequested = false;
  private fatalError = false;
  private startNotified = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  isSupported(): boolean {
    return obtenerConstructorSpeechRecognition() !== null;
  }

  async start(
    handlers: SpeechToTextSessionHandlers,
    options: SpeechToTextStartOptions = {},
  ): Promise<void> {
    if (this.recognition || this.handlers || this.restartTimer) {
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
    this.options = {
      language: options.language ?? 'es-AR',
      continuous: options.continuous ?? false,
      interimResults: options.interimResults ?? true,
    };

    this.committedFinalText = '';
    this.activeCycleFinalText = '';
    this.interimText = '';
    this.shouldKeepListening = true;
    this.stopRequested = false;
    this.abortRequested = false;
    this.fatalError = false;
    this.startNotified = false;

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

      this.limpiarEstado();
      handlers.onError(speechError);
      return;
    }

    if (!this.handlers || this.abortRequested) {
      return;
    }

    this.iniciarCicloReconocimiento(SpeechRecognitionConstructor);
  }

  stop(): void {
    if (!this.handlers) {
      return;
    }

    this.stopRequested = true;
    this.shouldKeepListening = false;
    this.cancelarReinicio();

    const recognition = this.recognition;

    if (!recognition) {
      this.finalizarSesion();
      return;
    }

    try {
      recognition.stop();
    } catch {
      this.recognition = null;
      this.finalizarSesion();
    }
  }

  abort(): void {
    const recognition = this.recognition;

    this.abortRequested = true;
    this.shouldKeepListening = false;
    this.stopRequested = false;
    this.cancelarReinicio();

    this.recognition = null;
    this.handlers = null;
    this.options = null;
    this.committedFinalText = '';
    this.activeCycleFinalText = '';
    this.interimText = '';
    this.fatalError = false;
    this.startNotified = false;

    try {
      recognition?.abort();
    } catch {
      // Puede ocurrir si el navegador ya terminó internamente la sesión.
    }
  }

  private iniciarCicloReconocimiento(
    SpeechRecognitionConstructor: BrowserSpeechRecognitionConstructor,
  ): void {
    if (
      !this.handlers ||
      !this.options ||
      !this.shouldKeepListening ||
      this.stopRequested ||
      this.abortRequested ||
      this.fatalError
    ) {
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    this.activeCycleFinalText = '';
    this.interimText = '';

    recognition.lang = this.options.language;
    recognition.continuous = this.options.continuous;
    recognition.interimResults = this.options.interimResults;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!this.startNotified) {
        this.startNotified = true;
        this.handlers?.onStart();
      }
    };

    recognition.onresult = (event) => {
      if (!this.handlers) {
        return;
      }

      // Se recalcula la hipótesis del ciclo completo en cada evento. Esto es
      // deliberado: algunos Chrome/Android marcan como "finales" múltiples
      // versiones progresivas de la misma frase. No deben acumularse como si
      // fueran segmentos independientes.
      this.activeCycleFinalText = combinarResultados(event.results, true);
      this.interimText = combinarResultados(event.results, false);
      this.emitirActualizacion();
    };

    recognition.onerror = (event) => {
      if (!this.handlers) {
        return;
      }

      if (event.error === 'aborted' && this.abortRequested) {
        return;
      }

      if (
        event.error === 'no-speech' &&
        this.options?.continuous &&
        this.shouldKeepListening &&
        !this.stopRequested
      ) {
        return;
      }

      if (event.error === 'aborted' && this.stopRequested) {
        return;
      }

      this.fatalError = true;
      this.shouldKeepListening = false;
      this.cancelarReinicio();

      this.handlers.onError(
        crearErrorReconocimiento(event.error, event.message),
      );
    };

    recognition.onend = () => {
      if (this.recognition === recognition) {
        this.recognition = null;
      }

      if (this.activeCycleFinalText) {
        this.committedFinalText = fusionarTextoReconocido(
          this.committedFinalText,
          this.activeCycleFinalText,
        );
      }

      this.activeCycleFinalText = '';
      this.interimText = '';

      if (this.handlers) {
        this.emitirActualizacion();
      }

      if (this.abortRequested || !this.handlers) {
        return;
      }

      if (this.fatalError) {
        this.limpiarEstado();
        return;
      }

      if (this.stopRequested || !this.shouldKeepListening) {
        this.finalizarSesion();
        return;
      }

      if (this.options?.continuous) {
        this.programarReinicio(SpeechRecognitionConstructor);
        return;
      }

      this.finalizarSesion();
    };

    this.recognition = recognition;

    try {
      recognition.start();
    } catch (error) {
      if (this.recognition === recognition) {
        this.recognition = null;
      }

      this.fatalError = true;
      this.shouldKeepListening = false;

      const currentHandlers = this.handlers;
      this.limpiarEstado();

      currentHandlers?.onError(
        crearErrorReconocimiento(
          'unknown',
          error instanceof Error
            ? error.message
            : 'No se pudo iniciar el reconocimiento de voz.',
        ),
      );
    }
  }

  private programarReinicio(
    SpeechRecognitionConstructor: BrowserSpeechRecognitionConstructor,
  ): void {
    this.cancelarReinicio();

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;

      if (
        !this.handlers ||
        !this.shouldKeepListening ||
        this.stopRequested ||
        this.abortRequested ||
        this.fatalError
      ) {
        return;
      }

      this.iniciarCicloReconocimiento(SpeechRecognitionConstructor);
    }, AUTO_RESTART_DELAY_MS);
  }

  private emitirActualizacion(): void {
    this.handlers?.onUpdate({
      finalText: fusionarTextoReconocido(
        this.committedFinalText,
        this.activeCycleFinalText,
      ),
      interimText: this.interimText,
    });
  }

  private finalizarSesion(): void {
    const currentHandlers = this.handlers;
    const textoFinal = fusionarTextoReconocido(
      this.committedFinalText,
      this.activeCycleFinalText,
    );

    this.limpiarEstado();
    currentHandlers?.onEnd(textoFinal);
  }

  private cancelarReinicio(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private limpiarEstado(): void {
    this.cancelarReinicio();

    this.recognition = null;
    this.handlers = null;
    this.options = null;
    this.committedFinalText = '';
    this.activeCycleFinalText = '';
    this.interimText = '';
    this.shouldKeepListening = false;
    this.stopRequested = false;
    this.abortRequested = false;
    this.fatalError = false;
    this.startNotified = false;
  }
}
