import { speakSpeechFeedbackSequence, stopSpeechFeedback } from './browserSpeechFeedback';
import type { BudgetSpeechReviewSection } from './budgetSpeechReview';

export const MIN_BUDGET_SPEECH_RATE = 0.5;
export const MAX_BUDGET_SPEECH_RATE = 1.5;
export const DEFAULT_BUDGET_SPEECH_RATE = 0.92;

export interface BudgetSpeechPlaybackState {
  status: 'reading' | 'paused' | 'finished' | 'stopped';
  productIndex: number;
  rate: number;
}

/** Conserva la posición por fragmento y navega por productos completos. */
export function createBudgetSpeechPlayback(
  sections: readonly BudgetSpeechReviewSection[],
  onState: (state: BudgetSpeechPlaybackState) => void,
) {
  const entries = sections.flatMap((section) => section.messages.map((text) => ({
    text, productIndex: section.productIndex,
  })));
  const starts = entries.flatMap((entry, index) => entry.productIndex !== null &&
    (index === 0 || entries[index - 1].productIndex !== entry.productIndex) ? [index] : []);
  let cursor = 0;
  let revision = 0;
  let state: BudgetSpeechPlaybackState = {
    status: 'paused', productIndex: 0, rate: DEFAULT_BUDGET_SPEECH_RATE,
  };
  const publish = () => onState({ ...state });

  function cancelCurrent() {
    revision += 1;
    stopSpeechFeedback();
  }

  function play(from: number) {
    if (!entries.length || state.status === 'stopped') return;
    cancelCurrent();
    cursor = Math.max(0, Math.min(from, entries.length - 1));
    const currentRevision = revision;
    const start = cursor;
    state = { ...state, status: 'reading' };
    publish();
    const supported = speakSpeechFeedbackSequence(
      entries.slice(start).map((entry) => entry.text),
      (reason) => {
        if (currentRevision !== revision) return;
        state = { ...state, status: reason === 'completed' ? 'finished' : 'paused' };
        publish();
      },
      { rate: state.rate },
      (index) => {
        if (currentRevision !== revision) return;
        cursor = start + index;
        state = { ...state, productIndex: entries[cursor].productIndex ?? state.productIndex };
        publish();
      },
    );
    if (!supported) {
      state = { ...state, status: 'paused' };
      publish();
    }
  }

  return {
    start: () => play(0),
    pause: () => {
      if (state.status !== 'reading') return;
      cancelCurrent();
      state = { ...state, status: 'paused' };
      publish();
    },
    resume: () => {
      if (state.status === 'reading' || state.status === 'stopped') return;
      // Tras terminar, vuelve al inicio del último producto seleccionado.
      play(state.status === 'finished' ? starts[state.productIndex] ?? 0 : cursor);
    },
    move: (direction: -1 | 1) => {
      const target = state.productIndex + direction;
      if (target < 0 || target >= starts.length || state.status === 'stopped') return;
      play(starts[target]);
    },
    changeRate: (delta: number) => {
      if (state.status === 'stopped') return;
      const rate = Math.max(MIN_BUDGET_SPEECH_RATE, Math.min(MAX_BUDGET_SPEECH_RATE,
        Math.round((state.rate + delta) * 100) / 100));
      if (rate === state.rate) return;
      state = { ...state, rate };
      if (state.status === 'reading') play(cursor);
      else publish();
    },
    stop: () => {
      cancelCurrent();
      state = { ...state, status: 'stopped' };
      publish();
    },
  };
}
