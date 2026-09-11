import type {
  SpeechToTextError,
  SpeechToTextUpdate,
} from '../types/voice';

export interface SpeechToTextSessionHandlers {
  onStart: () => void;
  onUpdate: (update: SpeechToTextUpdate) => void;
  onEnd: (finalText: string) => void;
  onError: (error: SpeechToTextError) => void;
}

export interface SpeechToTextStartOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export interface SpeechToTextProvider {
  readonly id: string;
  readonly displayName: string;

  isSupported(): boolean;

  start(
    handlers: SpeechToTextSessionHandlers,
    options?: SpeechToTextStartOptions,
  ): Promise<void>;

  stop(): void;

  abort(): void;
}
