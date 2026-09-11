import {
  useEffect,
  useRef,
  useState,
} from 'react';
import type { SpeechToTextProvider } from '../contracts/SpeechToTextProvider';
import type {
  SpeechToTextError,
  VoiceCaptureStatus,
  VoiceTranscriptionEvaluation,
} from '../types/voice';

interface VoiceCapturePanelProps {
  provider: SpeechToTextProvider;
  presupuestoId?: string;
  onTranscriptionFinal?: (
    text: string,
    presupuestoId?: string,
  ) => Promise<string | undefined>;
  onEvaluation?: (
    logId: string,
    evaluation: VoiceTranscriptionEvaluation,
    expectedText?: string,
  ) => Promise<void>;
}

function textoEstado(status: VoiceCaptureStatus): string {
  if (status === 'requesting-permission') {
    return 'Solicitando acceso al micrófono...';
  }

  if (status === 'listening') {
    return 'Escuchando...';
  }

  if (status === 'result') {
    return 'Transcripción finalizada.';
  }

  if (status === 'error') {
    return 'No se pudo completar el reconocimiento.';
  }

  return 'Listo para dictar.';
}

function VoiceCapturePanel({
  provider,
  presupuestoId,
  onTranscriptionFinal,
  onEvaluation,
}: VoiceCapturePanelProps) {
  const [status, setStatus] =
    useState<VoiceCaptureStatus>('idle');
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [error, setError] =
    useState<SpeechToTextError | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [evaluation, setEvaluation] =
    useState<VoiceTranscriptionEvaluation | null>(null);
  const [expectedText, setExpectedText] = useState('');
  const [savingEvaluation, setSavingEvaluation] = useState(false);
  const mountedRef = useRef(true);

  const supported = provider.isSupported();
  const visibleTranscript = [
    finalText.trim(),
    interimText.trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      provider.abort();
    };
  }, [provider]);

  async function iniciarDictado() {
    setStatus('requesting-permission');
    setFinalText('');
    setInterimText('');
    setError(null);
    setLogId(null);
    setEvaluation(null);
    setExpectedText('');

    await provider.start(
      {
        onStart: () => {
          if (!mountedRef.current) return;
          setStatus('listening');
        },

        onUpdate: (update) => {
          if (!mountedRef.current) return;
          setFinalText(update.finalText);
          setInterimText(update.interimText);
        },

        onEnd: (text) => {
          if (!mountedRef.current) return;

          const limpio = text.trim();

          setFinalText(limpio);
          setInterimText('');

          if (!limpio) {
            setStatus('idle');
            return;
          }

          setStatus('result');

          if (onTranscriptionFinal) {
            void onTranscriptionFinal(
              limpio,
              presupuestoId,
            ).then((id) => {
              if (
                mountedRef.current &&
                typeof id === 'string' &&
                id
              ) {
                setLogId(id);
              }
            });
          }
        },

        onError: (speechError) => {
          if (!mountedRef.current) return;

          if (speechError.code === 'aborted') {
            setStatus('idle');
            return;
          }

          setError(speechError);
          setStatus('error');
        },
      },
      {
        language: 'es-AR',
        continuous: true,
        interimResults: true,
      },
    );
  }

  function detenerDictado() {
    provider.stop();
  }

  function limpiarTranscripcion() {
    provider.abort();
    setStatus('idle');
    setFinalText('');
    setInterimText('');
    setError(null);
    setLogId(null);
    setEvaluation(null);
    setExpectedText('');
  }

  async function guardarEvaluacion(
    nuevaEvaluacion: VoiceTranscriptionEvaluation,
  ) {
    setEvaluation(nuevaEvaluacion);

    if (
      nuevaEvaluacion === 'incorrecta' ||
      !logId ||
      !onEvaluation
    ) {
      return;
    }

    setSavingEvaluation(true);

    try {
      await onEvaluation(logId, 'correcta');
    } finally {
      if (mountedRef.current) {
        setSavingEvaluation(false);
      }
    }
  }

  async function guardarCorreccion() {
    if (
      !logId ||
      !onEvaluation ||
      !expectedText.trim()
    ) {
      return;
    }

    setSavingEvaluation(true);

    try {
      await onEvaluation(
        logId,
        'incorrecta',
        expectedText.trim(),
      );
    } finally {
      if (mountedRef.current) {
        setSavingEvaluation(false);
      }
    }
  }

  return (
    <div className="form-card">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p
            className="eyebrow"
            style={{ marginBottom: '4px' }}
          >
            Experimental
          </p>
          <h2 style={{ marginTop: 0 }}>
            Carga de producto por voz
          </h2>
        </div>

        <span
          style={{
            border: '1px solid currentColor',
            borderRadius: '999px',
            padding: '6px 10px',
            fontSize: '0.85rem',
          }}
        >
          Etapa 1 · sólo transcripción
        </span>
      </div>

      <p className="empty-text">
        El micrófono sólo convierte voz en texto. En esta
        etapa no interpreta productos ni modifica el
        presupuesto.
      </p>

      {!supported && (
        <div className="message-box">
          Este navegador no ofrece reconocimiento de voz
          compatible. Probá con Chrome en Android.
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          marginBottom: '14px',
        }}
      >
        {status !== 'listening' ? (
          <button
            type="button"
            className="primary-button"
            onClick={() => void iniciarDictado()}
            disabled={!supported || status === 'requesting-permission'}
          >
            🎤 Dictar producto
          </button>
        ) : (
          <button
            type="button"
            className="danger-button"
            onClick={detenerDictado}
          >
            Detener
          </button>
        )}

        {visibleTranscript && status !== 'listening' && (
          <button
            type="button"
            className="secondary-button"
            onClick={limpiarTranscripcion}
          >
            Borrar transcripción
          </button>
        )}
      </div>

      <div
        aria-live="polite"
        style={{
          border: '1px solid currentColor',
          borderRadius: '12px',
          padding: '12px',
          marginBottom: '14px',
          opacity: status === 'idle' ? 0.78 : 1,
        }}
      >
        <strong>
          {status === 'listening' ? '🔴 ' : ''}
          {textoEstado(status)}
        </strong>
      </div>

      {error && (
        <div className="message-box">
          {error.message}
          {error.originalCode
            ? ` (${error.originalCode})`
            : ''}
        </div>
      )}

      <label className="field-label">
        Texto reconocido
        <textarea
          className="text-area"
          rows={5}
          readOnly
          value={visibleTranscript}
          placeholder="La transcripción aparecerá exactamente aquí..."
          style={{ whiteSpace: 'pre-wrap' }}
        />
      </label>

      {status === 'listening' && interimText && (
        <p className="empty-text">
          Resultado parcial: {interimText}
        </p>
      )}

      {finalText && status === 'result' && (
        <div
          style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(128, 128, 128, 0.5)',
          }}
        >
          <strong>
            ¿La transcripción fue correcta?
          </strong>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              marginTop: '10px',
            }}
          >
            <button
              type="button"
              className={
                evaluation === 'correcta'
                  ? 'primary-button'
                  : 'secondary-button'
              }
              onClick={() =>
                void guardarEvaluacion('correcta')
              }
              disabled={savingEvaluation || !logId}
            >
              Sí
            </button>

            <button
              type="button"
              className={
                evaluation === 'incorrecta'
                  ? 'primary-button'
                  : 'secondary-button'
              }
              onClick={() =>
                void guardarEvaluacion('incorrecta')
              }
              disabled={savingEvaluation || !logId}
            >
              No
            </button>
          </div>

          {evaluation === 'incorrecta' && (
            <div style={{ marginTop: '14px' }}>
              <label className="field-label">
                ¿Qué quisiste decir?
                <textarea
                  className="text-area"
                  rows={4}
                  value={expectedText}
                  onChange={(event) =>
                    setExpectedText(
                      event.currentTarget.value,
                    )
                  }
                  placeholder="Escribí la frase correcta para comparar con el reconocimiento..."
                />
              </label>

              <button
                type="button"
                className="primary-button"
                onClick={() => void guardarCorreccion()}
                disabled={
                  savingEvaluation ||
                  !expectedText.trim() ||
                  !logId
                }
              >
                Guardar evaluación
              </button>
            </div>
          )}
        </div>
      )}

      <p
        className="empty-text"
        style={{ marginTop: '16px' }}
      >
        Pruebas sugeridas: Perfil C · Perfil U · IPN · IPE ·
        doble T · ángulo · planchuela · chapa · tubo · caño ·
        galvanizada · trapezoidal · acanalada · números,
        medidas y precios decimales.
      </p>
    </div>
  );
}

export default VoiceCapturePanel;
