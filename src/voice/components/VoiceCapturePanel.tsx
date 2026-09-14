import {
  useEffect,
  useRef,
  useState,
} from 'react';
import type { SpeechToTextProvider } from '../contracts/SpeechToTextProvider';
import { normalizeVoiceText } from '../normalization/normalizeVoiceText';
import { parsePerfilCVoiceCommand } from '../parsers/perfilCVoiceParser';
import { parseTuboVoiceCommand } from '../parsers/tuboVoiceParser';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';
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
  const normalizedText = normalizeVoiceText(finalText);
  const productIdentification = identifyVoiceProduct(normalizedText);
  const perfilCParseResult = parsePerfilCVoiceCommand(normalizedText);
  const tuboParseResult = parseTuboVoiceCommand(normalizedText);
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
        continuous: false,
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
          Etapa 4 · Perfil C y tubos
        </span>
      </div>

      <p className="empty-text">
        El micrófono convierte un dictado en una única transcripción.
        Se conserva el texto original y su versión normalizada. Para Perfil C
        y tubos, esta etapa extrae cantidad, medidas, espesor, largo y precio.
        Perfil C busca la variante exacta en la tabla maestra; los tubos dejan
        los datos listos para la calculadora existente. No calcula peso,
        subtotal ni importe y todavía no agrega productos al presupuesto.
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
        Texto reconocido (original)
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
        <label className="field-label">
          Texto normalizado
          <textarea
            className="text-area"
            rows={5}
            readOnly
            value={normalizedText}
            placeholder="La versión normalizada aparecerá aquí..."
            style={{ whiteSpace: 'pre-wrap' }}
          />
        </label>
      )}

      {finalText && status === 'result' && (
        <div
          style={{
            border: '1px solid currentColor',
            borderRadius: '12px',
            padding: '12px',
            marginTop: '12px',
            marginBottom: '14px',
          }}
        >
          <strong>Identificación de producto</strong>

          {productIdentification.status === 'matched' && (
            <div style={{ marginTop: '8px' }}>
              <div>
                Producto: <strong>{productIdentification.canonicalType}</strong>
              </div>

              {productIdentification.source === 'master' ? (
                productIdentification.exactProductId ? (
                  <div className="empty-text" style={{ marginTop: '6px' }}>
                    Coincidencia única en tabla maestra: {productIdentification.exactProductId}.
                  </div>
                ) : (
                  <div className="empty-text" style={{ marginTop: '6px' }}>
                    Familia encontrada en tabla maestra: {productIdentification.candidateProductIds.length} variantes candidatas.
                    La variante exacta se resolverá en la Etapa 4.
                  </div>
                )
              ) : (
                <div className="empty-text" style={{ marginTop: '6px' }}>
                  Producto especial del flujo estable, sin subproducto de tabla.
                </div>
              )}
            </div>
          )}

          {productIdentification.status === 'ambiguous' && (
            <div style={{ marginTop: '8px' }}>
              <div>Producto ambiguo.</div>
              <div className="empty-text" style={{ marginTop: '6px' }}>
                Posibles familias: {productIdentification.canonicalTypes.join(' · ')}.
              </div>
            </div>
          )}

          {productIdentification.status === 'not-found' && (
            <div className="empty-text" style={{ marginTop: '8px' }}>
              No se identificó una familia de producto conocida.
            </div>
          )}
        </div>
      )}

      {finalText &&
        status === 'result' &&
        perfilCParseResult.status !== 'not-applicable' &&
        perfilCParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de Perfil C</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Cantidad:{' '}
                <strong>
                  {perfilCParseResult.data.quantity ?? 'faltante'}
                </strong>
              </div>

              <div>
                Medidas:{' '}
                <strong>
                  {perfilCParseResult.data.heightMm !== undefined &&
                  perfilCParseResult.data.flangeMm !== undefined &&
                  perfilCParseResult.data.lipMm !== undefined
                    ? `${perfilCParseResult.data.heightMm} x ${perfilCParseResult.data.flangeMm} x ${perfilCParseResult.data.lipMm} mm`
                    : 'faltantes'}
                </strong>
              </div>

              <div>
                Espesor:{' '}
                <strong>
                  {perfilCParseResult.data.thicknessMm !== undefined
                    ? `${perfilCParseResult.data.thicknessMm} mm`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Largo:{' '}
                <strong>
                  {perfilCParseResult.data.lengthM} m
                </strong>{' '}
                <span className="empty-text">
                  ({perfilCParseResult.data.lengthSource === 'default'
                    ? 'predeterminado'
                    : 'dictado'})
                </span>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {perfilCParseResult.data.price !== undefined
                    ? `${perfilCParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/kg`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Variante de tabla:{' '}
                <strong>
                  {perfilCParseResult.data.productDescription ??
                    'sin coincidencia exacta todavía'}
                </strong>
              </div>

              {perfilCParseResult.data.productId && (
                <div className="empty-text">
                  ID de producto: {perfilCParseResult.data.productId}
                </div>
              )}
            </div>

            {perfilCParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                Perfil C interpretado completamente y vinculado a una variante
                real de la tabla maestra. Todavía no se agrega al presupuesto.
              </div>
            )}

            {perfilCParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {perfilCParseResult.missingFields
                  .map((field) => {
                    if (field === 'quantity') return 'cantidad';
                    if (field === 'heightMm') return 'alto';
                    if (field === 'flangeMm') return 'ala';
                    if (field === 'lipMm') return 'labio';
                    if (field === 'thicknessMm') return 'espesor';
                    return 'precio USD/kg';
                  })
                  .join(' · ')}.
              </div>
            )}

            {perfilCParseResult.issues.map((issue) => (
              <div
                key={issue}
                className="message-box"
                style={{ marginTop: '10px' }}
              >
                {issue}
              </div>
            ))}
          </div>
        )}

      {finalText &&
        status === 'result' &&
        tuboParseResult.status !== 'not-applicable' &&
        tuboParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de tubos</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Producto:{' '}
                <strong>{tuboParseResult.data.canonicalType}</strong>
              </div>

              <div>
                Cantidad:{' '}
                <strong>{tuboParseResult.data.quantity ?? 'faltante'}</strong>
              </div>

              {tuboParseResult.data.canonicalType === 'Tubo redondo' && (
                <div>
                  Diámetro exterior:{' '}
                  <strong>
                    {tuboParseResult.data.diameterMm !== undefined
                      ? `${tuboParseResult.data.diameterMm} mm`
                      : 'faltante'}
                  </strong>
                </div>
              )}

              {tuboParseResult.data.canonicalType === 'Tubo cuadrado' && (
                <div>
                  Lado exterior:{' '}
                  <strong>
                    {tuboParseResult.data.sideMm !== undefined
                      ? `${tuboParseResult.data.sideMm} mm`
                      : 'faltante'}
                  </strong>
                </div>
              )}

              {tuboParseResult.data.canonicalType === 'Tubo rectangular' && (
                <div>
                  Medidas exteriores:{' '}
                  <strong>
                    {tuboParseResult.data.widthMm !== undefined &&
                    tuboParseResult.data.heightMm !== undefined
                      ? `${tuboParseResult.data.widthMm} x ${tuboParseResult.data.heightMm} mm`
                      : 'faltantes'}
                  </strong>
                </div>
              )}

              <div>
                Espesor:{' '}
                <strong>
                  {tuboParseResult.data.thicknessMm !== undefined
                    ? `${tuboParseResult.data.thicknessMm} mm`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Largo:{' '}
                <strong>{tuboParseResult.data.lengthM} m</strong>{' '}
                <span className="empty-text">
                  ({tuboParseResult.data.lengthSource === 'default'
                    ? 'predeterminado'
                    : 'dictado'})
                </span>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {tuboParseResult.data.price !== undefined
                    ? `${tuboParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/kg`
                    : 'faltante'}
                </strong>
              </div>

              <div className="empty-text">
                Calculadora: {tuboParseResult.data.calculatorShape}
              </div>
            </div>

            {tuboParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                Tubo interpretado completamente. Los datos quedaron listos
                para reutilizar la calculadora de metales existente. Todavía
                no se calcula peso ni se agrega el producto al presupuesto.
              </div>
            )}

            {tuboParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {tuboParseResult.missingFields
                  .map((field) => {
                    if (field === 'quantity') return 'cantidad';
                    if (field === 'diameterMm') return 'diámetro exterior';
                    if (field === 'sideMm') return 'lado exterior';
                    if (field === 'widthMm') return 'ancho exterior';
                    if (field === 'heightMm') return 'alto exterior';
                    if (field === 'thicknessMm') return 'espesor';
                    return 'precio USD/kg';
                  })
                  .join(' · ')}.
              </div>
            )}

            {tuboParseResult.issues.map((issue) => (
              <div
                key={issue}
                className="message-box"
                style={{ marginTop: '10px' }}
              >
                {issue}
              </div>
            ))}
          </div>
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
            ¿La transcripción original fue correcta?
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
        Pruebas sugeridas: 10 perfiles C 100 x 50 x 15 espesor 2 mm a
        1,400/kg · 5 tubos cuadrados de 50 x 50 x 2, largo 12 m, a
        1,500/kg · 4 tubos rectangulares de 100 x 50 x 2, largo 6 m, a
        1,650/kg · 3 tubos redondos de 60 x 2, largo 6 m, a 1,700/kg.
        La voz sólo estructura los datos; el peso sigue siendo responsabilidad
        de la lógica determinística existente.
      </p>
    </div>
  );
}

export default VoiceCapturePanel;
