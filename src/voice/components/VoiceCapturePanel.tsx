import {
  useEffect,
  useRef,
  useState,
} from 'react';
import type { SpeechToTextProvider } from '../contracts/SpeechToTextProvider';
import { normalizeVoiceText } from '../normalization/normalizeVoiceText';
import { parseChapaTechoVoiceCommand } from '../parsers/chapaTechoVoiceParser';
import { parsePerfilCVoiceCommand } from '../parsers/perfilCVoiceParser';
import { parseIpnIpeVoiceCommand } from '../parsers/ipnIpeVoiceParser';
import { parseHeaHebWVoiceCommand } from '../parsers/heaHebWVoiceParser';
import { parseUpnUlVoiceCommand } from '../parsers/upnUlVoiceParser';
import { parsePerfilUVoiceCommand } from '../parsers/perfilUVoiceParser';
import { parseAnguloPlanchuelaVoiceCommand } from '../parsers/anguloPlanchuelaVoiceParser';
import { formatInches } from '../parsers/imperialMeasure';
import { parseBarraVoiceCommand } from '../parsers/barraVoiceParser';
import { parseMallaVoiceCommand } from '../parsers/mallaVoiceParser';
import { parsePlanchaVoiceCommand } from '../parsers/planchaVoiceParser';
import { parseRecorteVoiceCommand } from '../parsers/recorteVoiceParser';
import { parseTuboVoiceCommand } from '../parsers/tuboVoiceParser';
import {
  applyPendingVoiceClarification,
  createPendingVoiceProduct,
  pendingVoiceMissingFieldLabel,
} from '../pending/pendingVoiceProduct';
import type { PendingVoiceProduct } from '../pending/pendingVoiceProduct';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';
import { buildVoiceReadyProduct } from '../products/voiceReadyProduct';
import type { VoiceReadyProduct } from '../products/voiceReadyProduct';
import {
  applyReadyVoiceProductCorrection,
  readyVoiceCorrectionFieldLabel,
} from '../corrections/readyVoiceProductCorrection';
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
  onAddProduct?: (product: VoiceReadyProduct) => Promise<void>;
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
  onAddProduct,
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
  const [interpretationText, setInterpretationText] = useState('');
  const [pendingProduct, setPendingProduct] =
    useState<PendingVoiceProduct | null>(null);
  const [clarificationApplied, setClarificationApplied] = useState(false);
  const [completedPendingProduct, setCompletedPendingProduct] = useState<string | null>(null);
  const [savingEvaluation, setSavingEvaluation] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [addProductError, setAddProductError] = useState('');
  const [lastAddedProduct, setLastAddedProduct] = useState('');
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionMessage, setCorrectionMessage] = useState('');
  const [correctionError, setCorrectionError] = useState('');
  const mountedRef = useRef(true);

  const supported = provider.isSupported();
  const normalizedText = normalizeVoiceText(finalText);
  const effectiveInterpretationText = interpretationText || normalizedText;
  const productIdentification = identifyVoiceProduct(effectiveInterpretationText);
  const perfilCParseResult = parsePerfilCVoiceCommand(effectiveInterpretationText);
  const ipnIpeParseResult = parseIpnIpeVoiceCommand(effectiveInterpretationText);
  const heaHebWParseResult = parseHeaHebWVoiceCommand(effectiveInterpretationText);
  const upnUlParseResult = parseUpnUlVoiceCommand(effectiveInterpretationText);
  const perfilUParseResult = parsePerfilUVoiceCommand(effectiveInterpretationText);
  const anguloPlanchuelaParseResult =
    parseAnguloPlanchuelaVoiceCommand(effectiveInterpretationText);
  const anguloPlanchuelaCanonicalType =
    anguloPlanchuelaParseResult.data?.canonicalType;
  const barraParseResult = parseBarraVoiceCommand(effectiveInterpretationText);
  const tuboParseResult = parseTuboVoiceCommand(effectiveInterpretationText);
  const chapaTechoParseResult = parseChapaTechoVoiceCommand(effectiveInterpretationText);
  const planchaParseResult = parsePlanchaVoiceCommand(effectiveInterpretationText);
  const recorteParseResult = parseRecorteVoiceCommand(effectiveInterpretationText);
  const mallaParseResult = parseMallaVoiceCommand(effectiveInterpretationText);
  const readyProduct = effectiveInterpretationText
    ? buildVoiceReadyProduct(effectiveInterpretationText)
    : null;
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

  async function iniciarDictado(mode: 'product' | 'correction' = 'product') {
    const correctionBaseText = mode === 'correction'
      ? effectiveInterpretationText
      : '';
    const correctionBaseProduct = mode === 'correction'
      ? readyProduct
      : null;

    setCorrectionMode(mode === 'correction');
    setCorrectionMessage('');
    setCorrectionError('');
    setStatus('requesting-permission');
    setFinalText('');
    setInterimText('');
    setError(null);
    setLogId(null);
    setEvaluation(null);
    setExpectedText('');
    setClarificationApplied(false);
    setAddProductError('');
    setLastAddedProduct('');

    if (mode === 'product' && !pendingProduct) {
      setInterpretationText('');
    }
    setCompletedPendingProduct(null);

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

          if (mode === 'correction') {
            setCorrectionMode(false);
          }

          setFinalText(limpio);
          setInterimText('');

          if (!limpio) {
            setStatus('idle');
            return;
          }

          const normalizado = normalizeVoiceText(limpio);

          if (mode === 'correction' && correctionBaseText && correctionBaseProduct) {
            const correction = applyReadyVoiceProductCorrection(
              correctionBaseText,
              correctionBaseProduct,
              normalizado,
              limpio,
            );

            if (correction.applied) {
              const correctedReadyProduct = buildVoiceReadyProduct(
                correction.commandText,
              );

              if (correctedReadyProduct) {
                setInterpretationText(correction.commandText);
                setPendingProduct(null);
                setClarificationApplied(false);
                setCompletedPendingProduct(null);
                setCorrectionMessage(
                  `Corrección aplicada: ${correction.appliedFields
                    .map(readyVoiceCorrectionFieldLabel)
                    .join(' · ')}.`,
                );
                setCorrectionError(
                  correction.issues.length > 0
                    ? correction.issues.join(' ')
                    : '',
                );
              } else {
                setInterpretationText(correctionBaseText);
                setCorrectionError(
                  'La corrección dejaría el producto incompleto o inválido. No se aplicó.',
                );
              }
            } else {
              setInterpretationText(correctionBaseText);
              setCorrectionError(correction.issues.join(' '));
            }

            setCorrectionMode(false);
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

            return;
          }

          if (pendingProduct) {
            const clarification = applyPendingVoiceClarification(
              pendingProduct,
              normalizado,
              limpio,
            );

            setInterpretationText(clarification.commandText);
            setPendingProduct(clarification.pending);
            setClarificationApplied(clarification.clarificationApplied);
            setCompletedPendingProduct(
              clarification.completedCanonicalType ?? null,
            );
          } else {
            setInterpretationText(normalizado);
            setPendingProduct(createPendingVoiceProduct(normalizado));
            setClarificationApplied(false);
            setCompletedPendingProduct(null);
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

          setCorrectionMode(false);

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
    setInterpretationText('');
    setPendingProduct(null);
    setClarificationApplied(false);
    setCompletedPendingProduct(null);
    setAddProductError('');
    setLastAddedProduct('');
    setCorrectionMode(false);
    setCorrectionMessage('');
    setCorrectionError('');
  }

  function cancelarProductoPendiente() {
    provider.abort();
    setStatus('idle');
    setFinalText('');
    setInterimText('');
    setError(null);
    setInterpretationText('');
    setPendingProduct(null);
    setClarificationApplied(false);
    setCompletedPendingProduct(null);
    setCorrectionMode(false);
    setCorrectionMessage('');
    setCorrectionError('');
  }

  async function iniciarCorreccionProducto() {
    if (!readyProduct || status === 'listening') return;
    await iniciarDictado('correction');
  }

  async function agregarProductoAlPresupuesto() {
    if (!readyProduct || !onAddProduct || addingProduct) return;

    setAddingProduct(true);
    setAddProductError('');

    try {
      await onAddProduct(readyProduct);

      if (!mountedRef.current) return;

      setLastAddedProduct(readyProduct.description);
      setStatus('idle');
      setFinalText('');
      setInterimText('');
      setInterpretationText('');
      setPendingProduct(null);
      setClarificationApplied(false);
      setCompletedPendingProduct(null);
      setLogId(null);
      setEvaluation(null);
      setExpectedText('');
      setCorrectionMode(false);
      setCorrectionMessage('');
      setCorrectionError('');
    } catch (addError) {
      if (!mountedRef.current) return;

      setAddProductError(
        addError instanceof Error
          ? addError.message
          : 'No se pudo agregar el producto al presupuesto.',
      );
    } finally {
      if (mountedRef.current) {
        setAddingProduct(false);
      }
    }
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
          Etapa 7.1 · Corrección antes de agregar
        </span>
      </div>

      <p className="empty-text">
        El micrófono mantiene la sesión activa hasta que pulses Detener. Todos los
        parsers implementados siguen resolviendo contra la lógica y la tabla maestra
        existentes. Cuando un producto queda incompleto, los dictados siguientes se
        aplican al mismo producto pendiente. Cuando queda completo podés corregir por
        voz cantidad, largo o precio antes de agregarlo; en Recortes también podés
        corregir el peso manual. La corrección se vuelve a validar antes de aceptarse.
        El peso, subtotal e importe se calculan exclusivamente con las reglas
        determinísticas actuales al confirmar el alta.
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
          {correctionMode && status === 'listening'
            ? 'Escuchando corrección...'
            : textoEstado(status)}
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

      {finalText &&
        status === 'result' &&
        effectiveInterpretationText &&
        effectiveInterpretationText !== normalizedText && (
          <label className="field-label">
            Interpretación acumulada
            <textarea
              className="text-area"
              rows={5}
              readOnly
              value={effectiveInterpretationText}
              placeholder="El producto pendiente y sus aclaraciones aparecerán aquí..."
              style={{ whiteSpace: 'pre-wrap' }}
            />
          </label>
        )}

      {pendingProduct && (
        <div className="message-box" style={{ marginTop: '12px' }}>
          <strong>Producto pendiente: {pendingProduct.canonicalType}</strong>

          {clarificationApplied && (
            <div style={{ marginTop: '8px' }}>
              ✓ Aclaración aplicada al mismo producto.
            </div>
          )}

          <div
            style={{
              marginTop: '10px',
              border: '1px solid currentColor',
              borderRadius: '10px',
              padding: '10px',
            }}
          >
            <div className="empty-text">Entendí:</div>
            <div style={{ marginTop: '4px', fontWeight: 600 }}>
              {pendingProduct.commandText}
            </div>
          </div>

          <div style={{ marginTop: '10px' }}>
            <strong>Falta:</strong>
            <ul style={{ margin: '6px 0 0 20px', padding: 0 }}>
              {pendingProduct.missingFields.map((field) => (
                <li key={field}>
                  {pendingVoiceMissingFieldLabel(pendingProduct, field)}
                </li>
              ))}
            </ul>
          </div>

          <div className="empty-text" style={{ marginTop: '8px' }}>
            Dictá solamente la información faltante. Si falta cantidad y no resulta
            inequívoca, podés decir “cantidad” seguido del número. La respuesta se
            aplicará a este mismo producto. Turnos de voz acumulados: {pendingProduct.turns}.
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={cancelarProductoPendiente}
            style={{ marginTop: '10px' }}
          >
            Cancelar producto pendiente
          </button>
        </div>
      )}

      {clarificationApplied && !pendingProduct && status === 'result' && (
        <div className="message-box" style={{ marginTop: '12px' }}>
          <strong>
            ✓ Producto completo{completedPendingProduct
              ? `: ${completedPendingProduct}`
              : ''}
          </strong>

          <div
            style={{
              marginTop: '10px',
              border: '1px solid currentColor',
              borderRadius: '10px',
              padding: '10px',
            }}
          >
            <div className="empty-text">Entendí:</div>
            <div style={{ marginTop: '4px', fontWeight: 600 }}>
              {effectiveInterpretationText}
            </div>
          </div>

          <div style={{ marginTop: '10px' }}>
            Estado: <strong>datos completos y listos para agregar</strong>.
          </div>
          <div className="empty-text" style={{ marginTop: '6px' }}>
            Revisá los datos estructurados y usá “Agregar al presupuesto”.
          </div>
        </div>
      )}

      {readyProduct && status === 'result' && (
        <div className="message-box" style={{ marginTop: '12px' }}>
          <strong>✓ Producto listo para agregar al presupuesto</strong>
          <div className="empty-text" style={{ marginTop: '6px' }}>
            {readyProduct.description}
          </div>

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
              className="secondary-button"
              onClick={() => void iniciarCorreccionProducto()}
              disabled={addingProduct}
            >
              Corregir por voz
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={() => void agregarProductoAlPresupuesto()}
              disabled={!onAddProduct || addingProduct}
            >
              {addingProduct ? 'Agregando...' : 'Agregar al presupuesto'}
            </button>
          </div>

          <div className="empty-text" style={{ marginTop: '8px' }}>
            Podés decir, por ejemplo: “cambiar el precio a uno seiscientos”,
            “el largo es seis metros” o “son diez”.
          </div>
        </div>
      )}

      {correctionMessage && (
        <div className="message-box" style={{ marginTop: '12px' }}>
          ✓ {correctionMessage}
        </div>
      )}

      {correctionError && (
        <div className="message-box" style={{ marginTop: '12px' }}>
          {correctionError}
        </div>
      )}

      {addProductError && (
        <div className="message-box" style={{ marginTop: '12px' }}>
          {addProductError}
        </div>
      )}

      {lastAddedProduct && (
        <div className="message-box" style={{ marginTop: '12px' }}>
          ✓ Producto agregado al presupuesto: <strong>{lastAddedProduct}</strong>.
        </div>
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
                    La variante exacta se valida en los datos estructurados de abajo.
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
                real de la tabla maestra. Está listo para agregar al presupuesto.
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
        ipnIpeParseResult.status !== 'not-applicable' &&
        ipnIpeParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de IPN / IPE</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Producto:{' '}
                <strong>{ipnIpeParseResult.data.canonicalType}</strong>
              </div>

              <div>
                Cantidad:{' '}
                <strong>{ipnIpeParseResult.data.quantity ?? 'faltante'}</strong>
              </div>

              <div>
                Medida nominal:{' '}
                <strong>
                  {ipnIpeParseResult.data.nominalSizeMm !== undefined
                    ? `${ipnIpeParseResult.data.nominalSizeMm}`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Largo:{' '}
                <strong>{ipnIpeParseResult.data.lengthM} m</strong>{' '}
                <span className="empty-text">
                  ({ipnIpeParseResult.data.lengthSource === 'default'
                    ? 'predeterminado'
                    : 'dictado'})
                </span>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {ipnIpeParseResult.data.price !== undefined
                    ? `${ipnIpeParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/kg`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Variante de tabla:{' '}
                <strong>
                  {ipnIpeParseResult.data.productDescription ??
                    'sin coincidencia exacta todavía'}
                </strong>
              </div>

              {ipnIpeParseResult.data.productId && (
                <div className="empty-text">
                  ID de producto: {ipnIpeParseResult.data.productId}
                </div>
              )}

              {ipnIpeParseResult.data.massNominalKgM !== undefined && (
                <div className="empty-text">
                  Masa nominal de tabla: {ipnIpeParseResult.data.massNominalKgM} kg/m
                </div>
              )}
            </div>

            {ipnIpeParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                {ipnIpeParseResult.data.canonicalType} interpretado completamente y
                vinculado a una variante real de la tabla maestra. Está listo para
                agregar al presupuesto.
              </div>
            )}

            {ipnIpeParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {ipnIpeParseResult.missingFields
                  .map((field) => {
                    if (field === 'quantity') return 'cantidad';
                    if (field === 'nominalSizeMm') return 'medida nominal';
                    return 'precio USD/kg';
                  })
                  .join(' · ')}.
              </div>
            )}

            {ipnIpeParseResult.issues.map((issue) => (
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
        heaHebWParseResult.status !== 'not-applicable' &&
        heaHebWParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de HEA / HEB / W</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Producto:{' '}
                <strong>{heaHebWParseResult.data.canonicalType}</strong>
              </div>

              <div>
                Cantidad:{' '}
                <strong>{heaHebWParseResult.data.quantity ?? 'faltante'}</strong>
              </div>

              <div>
                Medida nominal:{' '}
                <strong>
                  {heaHebWParseResult.data.nominalSizeMm !== undefined
                    ? `${heaHebWParseResult.data.nominalSizeMm}`
                    : 'faltante'}
                </strong>
              </div>

              {(heaHebWParseResult.data.canonicalType === 'W (H)' ||
                heaHebWParseResult.data.canonicalType === 'W (I)') && (
                <div>
                  Segundo valor de designación:{' '}
                  <strong>
                    {heaHebWParseResult.data.designationKgM !== undefined
                      ? `${heaHebWParseResult.data.designationKgM}`
                      : 'faltante'}
                  </strong>
                </div>
              )}

              <div>
                Largo:{' '}
                <strong>{heaHebWParseResult.data.lengthM} m</strong>{' '}
                <span className="empty-text">
                  ({heaHebWParseResult.data.lengthSource === 'default'
                    ? 'predeterminado'
                    : 'dictado'})
                </span>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {heaHebWParseResult.data.price !== undefined
                    ? `${heaHebWParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/kg`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Variante de tabla:{' '}
                <strong>
                  {heaHebWParseResult.data.productDescription ??
                    'sin coincidencia exacta todavía'}
                </strong>
              </div>

              {heaHebWParseResult.data.productId && (
                <div className="empty-text">
                  ID de producto: {heaHebWParseResult.data.productId}
                </div>
              )}

              {heaHebWParseResult.data.massNominalKgM !== undefined && (
                <div className="empty-text">
                  Masa nominal de tabla: {heaHebWParseResult.data.massNominalKgM} kg/m
                </div>
              )}
            </div>

            {heaHebWParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                {heaHebWParseResult.data.canonicalType} interpretado completamente y
                vinculado a una variante real de la tabla maestra. Está listo para
                agregar al presupuesto.
              </div>
            )}

            {heaHebWParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {heaHebWParseResult.missingFields
                  .map((field) => {
                    if (field === 'quantity') return 'cantidad';
                    if (field === 'nominalSizeMm') return 'medida nominal';
                    if (field === 'designationKgM') {
                      return 'segundo valor de designación W';
                    }
                    return 'precio USD/kg';
                  })
                  .join(' · ')}.
              </div>
            )}

            {heaHebWParseResult.issues.map((issue) => (
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
        upnUlParseResult.status !== 'not-applicable' &&
        upnUlParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de UPN / UL</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Producto:{' '}
                <strong>{upnUlParseResult.data.canonicalType}</strong>
              </div>

              <div>
                Cantidad:{' '}
                <strong>{upnUlParseResult.data.quantity ?? 'faltante'}</strong>
              </div>

              {upnUlParseResult.data.canonicalType === 'UPN' ? (
                <div>
                  Medida nominal:{' '}
                  <strong>
                    {upnUlParseResult.data.nominalSizeMm !== undefined
                      ? `${upnUlParseResult.data.nominalSizeMm}`
                      : 'faltante'}
                  </strong>
                </div>
              ) : (
                <div>
                  Medidas:{' '}
                  <strong>
                    {upnUlParseResult.data.heightMm !== undefined &&
                    upnUlParseResult.data.flangeMm !== undefined
                      ? `${upnUlParseResult.data.heightMm} x ${upnUlParseResult.data.flangeMm} mm`
                      : 'faltantes'}
                  </strong>
                </div>
              )}

              <div>
                Largo:{' '}
                <strong>{upnUlParseResult.data.lengthM} m</strong>{' '}
                <span className="empty-text">
                  ({upnUlParseResult.data.lengthSource === 'default'
                    ? 'predeterminado'
                    : 'dictado'})
                </span>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {upnUlParseResult.data.price !== undefined
                    ? `${upnUlParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/kg`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Variante de tabla:{' '}
                <strong>
                  {upnUlParseResult.data.productDescription ??
                    'sin coincidencia exacta todavía'}
                </strong>
              </div>

              {upnUlParseResult.data.productId && (
                <div className="empty-text">
                  ID de producto: {upnUlParseResult.data.productId}
                </div>
              )}

              {upnUlParseResult.data.massNominalKgM !== undefined && (
                <div className="empty-text">
                  Masa nominal de tabla: {upnUlParseResult.data.massNominalKgM} kg/m
                </div>
              )}
            </div>

            {upnUlParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                {upnUlParseResult.data.canonicalType} interpretado completamente y
                vinculado a una variante real de la tabla maestra. Está listo para
                agregar al presupuesto.
              </div>
            )}

            {upnUlParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {upnUlParseResult.missingFields
                  .map((field) => {
                    if (field === 'quantity') return 'cantidad';
                    if (field === 'nominalSizeMm') return 'medida nominal';
                    if (field === 'heightMm') return 'alto';
                    if (field === 'flangeMm') return 'ala';
                    return 'precio USD/kg';
                  })
                  .join(' · ')}.
              </div>
            )}

            {upnUlParseResult.issues.map((issue) => (
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
        perfilUParseResult.status !== 'not-applicable' &&
        perfilUParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de Perfil U</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Cantidad:{' '}
                <strong>{perfilUParseResult.data.quantity ?? 'faltante'}</strong>
              </div>

              <div>
                Medidas:{' '}
                <strong>
                  {perfilUParseResult.data.heightMm !== undefined &&
                  perfilUParseResult.data.flangeMm !== undefined
                    ? `${perfilUParseResult.data.heightMm} x ${perfilUParseResult.data.flangeMm} mm`
                    : 'faltantes'}
                </strong>
              </div>

              <div>
                Espesor:{' '}
                <strong>
                  {perfilUParseResult.data.thicknessMm !== undefined
                    ? `${perfilUParseResult.data.thicknessMm} mm`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Largo:{' '}
                <strong>{perfilUParseResult.data.lengthM} m</strong>{' '}
                <span className="empty-text">
                  ({perfilUParseResult.data.lengthSource === 'default'
                    ? 'predeterminado'
                    : 'dictado'})
                </span>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {perfilUParseResult.data.price !== undefined
                    ? `${perfilUParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/kg`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Variante de tabla:{' '}
                <strong>
                  {perfilUParseResult.data.productDescription ??
                    'sin coincidencia exacta todavía'}
                </strong>
              </div>

              {perfilUParseResult.data.productId && (
                <div className="empty-text">
                  ID de producto: {perfilUParseResult.data.productId}
                </div>
              )}

              {perfilUParseResult.data.massNominalKgM !== undefined && (
                <div className="empty-text">
                  Masa nominal de tabla: {perfilUParseResult.data.massNominalKgM} kg/m
                </div>
              )}
            </div>

            {perfilUParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                Perfil U interpretado completamente y vinculado a una variante real
                de la tabla maestra. Está listo para agregar al presupuesto.
              </div>
            )}

            {perfilUParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {perfilUParseResult.missingFields
                  .map((field) => {
                    if (field === 'quantity') return 'cantidad';
                    if (field === 'heightMm') return 'alto';
                    if (field === 'flangeMm') return 'ala';
                    if (field === 'thicknessMm') return 'espesor';
                    return 'precio USD/kg';
                  })
                  .join(' · ')}.
              </div>
            )}

            {perfilUParseResult.issues.map((issue) => (
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
        anguloPlanchuelaParseResult.status !== 'not-applicable' &&
        anguloPlanchuelaParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de Ángulo / Planchuela</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Producto:{' '}
                <strong>{anguloPlanchuelaParseResult.data.canonicalType}</strong>
              </div>

              <div>
                Cantidad:{' '}
                <strong>
                  {anguloPlanchuelaParseResult.data.quantity ?? 'faltante'}
                </strong>
              </div>

              <div>
                Medidas:{' '}
                <strong>
                  {anguloPlanchuelaParseResult.data.sizeInches !== undefined &&
                  anguloPlanchuelaParseResult.data.thicknessInches !== undefined
                    ? `${formatInches(anguloPlanchuelaParseResult.data.sizeInches)} x ${formatInches(anguloPlanchuelaParseResult.data.thicknessInches)}`
                    : 'faltantes'}
                </strong>
              </div>

              <div>
                Largo:{' '}
                <strong>{anguloPlanchuelaParseResult.data.lengthM} m</strong>{' '}
                <span className="empty-text">
                  ({anguloPlanchuelaParseResult.data.lengthSource === 'default'
                    ? 'predeterminado'
                    : 'dictado'})
                </span>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {anguloPlanchuelaParseResult.data.price !== undefined
                    ? `${anguloPlanchuelaParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/kg`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Variante de tabla:{' '}
                <strong>
                  {anguloPlanchuelaParseResult.data.productDescription ??
                    'sin coincidencia exacta todavía'}
                </strong>
              </div>

              {anguloPlanchuelaParseResult.data.productId && (
                <div className="empty-text">
                  ID de producto: {anguloPlanchuelaParseResult.data.productId}
                </div>
              )}

              {anguloPlanchuelaParseResult.data.massNominalKgM !== undefined && (
                <div className="empty-text">
                  Masa nominal de tabla: {anguloPlanchuelaParseResult.data.massNominalKgM} kg/m
                </div>
              )}
            </div>

            {anguloPlanchuelaParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                {anguloPlanchuelaParseResult.data.canonicalType} interpretado completamente
                y vinculado a una variante real de la tabla maestra. Está listo para
                agregar al presupuesto.
              </div>
            )}

            {anguloPlanchuelaParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {anguloPlanchuelaParseResult.missingFields
                  .map((field) => {
                    if (field === 'quantity') return 'cantidad';
                    if (field === 'sizeInches') {
                      return anguloPlanchuelaCanonicalType === 'Ángulo alas iguales'
                        ? 'medida del ala en pulgadas'
                        : 'ancho en pulgadas';
                    }
                    if (field === 'thicknessInches') return 'espesor en pulgadas';
                    return 'precio USD/kg';
                  })
                  .join(' · ')}.
              </div>
            )}

            {anguloPlanchuelaParseResult.issues.map((issue) => (
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
        barraParseResult.status !== 'not-applicable' &&
        barraParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de Barras</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Producto:{' '}
                <strong>{barraParseResult.data.canonicalType}</strong>
              </div>

              <div>
                Cantidad:{' '}
                <strong>{barraParseResult.data.quantity ?? 'faltante'}</strong>
              </div>

              <div>
                Medida:{' '}
                <strong>
                  {barraParseResult.data.sizeInches !== undefined
                    ? formatInches(barraParseResult.data.sizeInches)
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Largo:{' '}
                <strong>{barraParseResult.data.lengthM} m</strong>{' '}
                <span className="empty-text">
                  ({barraParseResult.data.lengthSource === 'default'
                    ? 'predeterminado'
                    : 'dictado'})
                </span>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {barraParseResult.data.price !== undefined
                    ? `${barraParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/kg`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Variante de tabla:{' '}
                <strong>
                  {barraParseResult.data.productDescription ??
                    'sin coincidencia exacta todavía'}
                </strong>
              </div>

              {barraParseResult.data.productId && (
                <div className="empty-text">
                  ID de producto: {barraParseResult.data.productId}
                </div>
              )}

              {barraParseResult.data.massNominalKgM !== undefined && (
                <div className="empty-text">
                  Masa nominal de tabla: {barraParseResult.data.massNominalKgM} kg/m
                </div>
              )}
            </div>

            {barraParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                {barraParseResult.data.canonicalType} interpretada completamente y
                vinculada a una variante real de la tabla maestra. Está lista para
                agregar al presupuesto.
              </div>
            )}

            {barraParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {barraParseResult.missingFields
                  .map((field) => {
                    if (field === 'quantity') return 'cantidad';
                    if (field === 'sizeInches') return 'medida en pulgadas';
                    return 'precio USD/kg';
                  })
                  .join(' · ')}.
              </div>
            )}

            {barraParseResult.issues.map((issue) => (
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

      {finalText &&
        status === 'result' &&
        chapaTechoParseResult.status !== 'not-applicable' &&
        chapaTechoParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de chapas</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Producto:{' '}
                <strong>{chapaTechoParseResult.data.canonicalType}</strong>
              </div>

              <div>
                Material:{' '}
                <strong>
                  {chapaTechoParseResult.data.material ?? 'faltante'}
                </strong>
              </div>

              <div>
                Cantidad:{' '}
                <strong>
                  {chapaTechoParseResult.data.quantity ?? 'faltante'}
                </strong>
              </div>

              <div>
                Largo por unidad:{' '}
                <strong>
                  {chapaTechoParseResult.data.lengthM !== undefined
                    ? `${chapaTechoParseResult.data.lengthM} m`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {chapaTechoParseResult.data.price !== undefined
                    ? `${chapaTechoParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/m`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Producto de tabla:{' '}
                <strong>
                  {chapaTechoParseResult.data.productDescription ??
                    'sin coincidencia'}
                </strong>
              </div>

              {chapaTechoParseResult.data.productId && (
                <div className="empty-text">
                  ID de producto: {chapaTechoParseResult.data.productId}
                </div>
              )}
            </div>

            {chapaTechoParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                Chapa interpretada completamente y vinculada al producto real
                de la tabla maestra. El material queda como atributo del pedido.
                Está listo para agregar al presupuesto; los metros totales se calcularán
                con la lógica determinística al confirmar.
              </div>
            )}

            {chapaTechoParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {chapaTechoParseResult.missingFields
                  .map((field) => {
                    if (field === 'quantity') return 'cantidad';
                    if (field === 'material') return 'material (galvanizada o negra)';
                    if (field === 'lengthM') return 'largo por unidad';
                    return 'precio USD/m';
                  })
                  .join(' · ')}.
              </div>
            )}

            {chapaTechoParseResult.issues.map((issue) => (
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
        planchaParseResult.status !== 'not-applicable' &&
        planchaParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de planchas</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Producto: <strong>Planchas</strong>
              </div>

              <div>
                Cantidad:{' '}
                <strong>{planchaParseResult.data.quantity ?? 'faltante'}</strong>
              </div>

              <div>
                Largo:{' '}
                <strong>
                  {planchaParseResult.data.lengthMm !== undefined
                    ? `${planchaParseResult.data.lengthMm} mm`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Ancho:{' '}
                <strong>
                  {planchaParseResult.data.widthMm !== undefined
                    ? `${planchaParseResult.data.widthMm} mm`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Espesor:{' '}
                <strong>
                  {planchaParseResult.data.thicknessMm !== undefined
                    ? `${planchaParseResult.data.thicknessMm} mm`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {planchaParseResult.data.price !== undefined
                    ? `${planchaParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/kg`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Producto de tabla:{' '}
                <strong>
                  {planchaParseResult.data.productDescription ??
                    'sin coincidencia'}
                </strong>
              </div>

              {planchaParseResult.data.productId && (
                <div className="empty-text">
                  ID de producto: {planchaParseResult.data.productId}
                </div>
              )}
            </div>

            {planchaParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                Plancha interpretada completamente y vinculada al producto real
                de la tabla maestra. Largo y ancho quedan expresados en mm, como
                en el flujo convencional. Está lista para agregar al presupuesto.
              </div>
            )}

            {planchaParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {planchaParseResult.missingFields
                  .map((field) => {
                    if (field === 'quantity') return 'cantidad';
                    if (field === 'lengthMm') return 'largo';
                    if (field === 'widthMm') return 'ancho';
                    if (field === 'thicknessMm') return 'espesor';
                    return 'precio USD/kg';
                  })
                  .join(' · ')}.
              </div>
            )}

            {planchaParseResult.issues.map((issue) => (
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
        recorteParseResult.status !== 'not-applicable' &&
        recorteParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de Recortes</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Producto: <strong>Recortes</strong>
              </div>

              <div>
                Peso total manual:{' '}
                <strong>
                  {recorteParseResult.data.weightKg !== undefined
                    ? `${recorteParseResult.data.weightKg} kg`
                    : 'faltante'}
                </strong>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {recorteParseResult.data.price !== undefined
                    ? `${recorteParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/kg`
                    : 'faltante'}
                </strong>
              </div>

              <div className="empty-text">
                Método de ingreso: manual-peso · cantidad de línea: 1
              </div>
            </div>

            {recorteParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                Recortes interpretado completamente. El peso es un dato manual
                dictado; todavía no se calcula subtotal ni se agrega el producto al
                presupuesto.
              </div>
            )}

            {recorteParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {recorteParseResult.missingFields
                  .map((field) =>
                    field === 'weightKg' ? 'peso total en kg' : 'precio USD/kg',
                  )
                  .join(' · ')}.
              </div>
            )}

            {recorteParseResult.issues.map((issue) => (
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
        mallaParseResult.status !== 'not-applicable' &&
        mallaParseResult.data && (
          <div
            style={{
              border: '1px solid currentColor',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '12px',
              marginBottom: '14px',
            }}
          >
            <strong>Etapa 4 · Datos estructurados de Mallas</strong>

            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
              <div>
                Producto: <strong>Mallas</strong>
              </div>

              <div>
                Cantidad:{' '}
                <strong>{mallaParseResult.data.quantity ?? 'faltante'}</strong>
              </div>

              <div>
                Precio:{' '}
                <strong>
                  {mallaParseResult.data.price !== undefined
                    ? `${mallaParseResult.data.price
                        .toFixed(3)
                        .replace('.', ',')}/Und`
                    : 'faltante'}
                </strong>
              </div>

              <div className="empty-text">
                Método de ingreso: manual-unidad · sin largo ni peso
              </div>
            </div>

            {mallaParseResult.status === 'matched' && (
              <div className="message-box" style={{ marginTop: '12px' }}>
                Mallas interpretado completamente. Se cotiza por unidad y no
                corresponde largo, peso ni calculadora. Está listo para agregar al
                presupuesto.
              </div>
            )}

            {mallaParseResult.missingFields.length > 0 && (
              <div className="empty-text" style={{ marginTop: '10px' }}>
                Faltan datos: {mallaParseResult.missingFields
                  .map((field) =>
                    field === 'quantity' ? 'cantidad' : 'precio USD/Und',
                  )
                  .join(' · ')}.
              </div>
            )}

            {mallaParseResult.issues.map((issue) => (
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
        Pruebas sugeridas para esta etapa: 200 kg de recortes a 0,800/kg ·
        3 mallas a 50,000/Und · 200 kg de recortes · 3 mallas. Recortes reutiliza
        el ingreso manual de peso y Mallas el ingreso por unidad; la voz todavía
        no agrega productos al presupuesto.
      </p>
    </div>
  );
}

export default VoiceCapturePanel;
