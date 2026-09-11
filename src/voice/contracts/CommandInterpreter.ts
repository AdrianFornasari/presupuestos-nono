import type { VoiceCommandResult } from '../types/voice';

export interface CommandInterpretationContext {
  pendingProductId?: string;
}

export interface CommandInterpreter {
  readonly id: string;
  readonly displayName: string;

  interpret(
    text: string,
    context?: CommandInterpretationContext,
  ): Promise<VoiceCommandResult>;
}
