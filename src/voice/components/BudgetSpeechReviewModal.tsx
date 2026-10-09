import { useEffect, useRef, useState } from 'react';
import type { LineaPresupuesto } from '../../types/presupuesto';
import { buildBudgetSpeechReviewSections } from '../accessibility/budgetSpeechReview';
import {
  createBudgetSpeechPlayback,
  DEFAULT_BUDGET_SPEECH_RATE,
  MIN_BUDGET_SPEECH_RATE,
  MAX_BUDGET_SPEECH_RATE,
} from '../accessibility/budgetSpeechPlayback';
import type { BudgetSpeechPlaybackState } from '../accessibility/budgetSpeechPlayback';
import './BudgetSpeechReviewModal.css';

interface Props {
  lineas: readonly LineaPresupuesto[];
  clienteNombre: string;
  totalUsdTexto: string;
  onClose: () => void;
}

export default function BudgetSpeechReviewModal({ lineas, clienteNombre, totalUsdTexto, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stopButtonRef = useRef<HTMLButtonElement>(null);
  const playbackRef = useRef<ReturnType<typeof createBudgetSpeechPlayback> | null>(null);
  const [state, setState] = useState<BudgetSpeechPlaybackState>({
    status: 'paused', productIndex: 0, rate: DEFAULT_BUDGET_SPEECH_RATE,
  });
  const orderedLines = [...lineas].sort((a, b) => a.orden - b.orden);
  const product = orderedLines[state.productIndex];

  useEffect(() => {
    let active = true;
    const dialog = dialogRef.current;
    const playback = createBudgetSpeechPlayback(
      buildBudgetSpeechReviewSections(lineas, clienteNombre, totalUsdTexto),
      (nextState) => { if (active) setState(nextState); },
    );
    playbackRef.current = playback;
    dialog?.showModal();
    stopButtonRef.current?.focus();
    playback.start();

    return () => {
      active = false;
      playback.stop();
      playbackRef.current = null;
      dialog?.close();
    };
  }, [lineas, clienteNombre, totalUsdTexto]);

  function stopAndClose() {
    playbackRef.current?.stop();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="budget-speech-dialog"
      aria-labelledby="budget-speech-title"
      aria-describedby="budget-speech-product"
      onCancel={(event) => { event.preventDefault(); stopAndClose(); }}
    >
      <h2 id="budget-speech-title">Lectura del presupuesto</h2>
      <div id="budget-speech-product" className="budget-speech-product" aria-live="polite">
        <strong>Producto {state.productIndex + 1} de {orderedLines.length}</strong>
        <div>{product?.descripcion}</div>
      </div>
      <p role="status">
        {state.status === 'reading' ? 'Leyendo' : state.status === 'finished' ? 'Lectura finalizada' : 'Lectura en pausa'}
        {' · '}Velocidad {state.rate.toLocaleString('es-AR', { maximumFractionDigits: 2 })}×
      </p>
      <div className="budget-speech-controls">
        <button type="button" className="secondary-button" disabled={state.rate <= MIN_BUDGET_SPEECH_RATE}
          onClick={() => playbackRef.current?.changeRate(-0.1)}>Más lento</button>
        <button type="button" className="secondary-button" disabled={state.rate >= MAX_BUDGET_SPEECH_RATE}
          onClick={() => playbackRef.current?.changeRate(0.1)}>Más rápido</button>
        <button type="button" className="secondary-button" disabled={state.productIndex === 0}
          onClick={() => playbackRef.current?.move(-1)}>Producto anterior</button>
        <button type="button" className="secondary-button" disabled={state.productIndex >= orderedLines.length - 1}
          onClick={() => playbackRef.current?.move(1)}>Producto siguiente</button>
      </div>
      <div className="budget-speech-actions">
        <button type="button" className="primary-button"
          onClick={() => state.status === 'reading' ? playbackRef.current?.pause() : playbackRef.current?.resume()}>
          {state.status === 'reading' ? 'Pausar lectura' : 'Reanudar lectura'}
        </button>
        <button ref={stopButtonRef} type="button" className="secondary-button" onClick={stopAndClose}>
          Detener lectura
        </button>
      </div>
    </dialog>
  );
}
