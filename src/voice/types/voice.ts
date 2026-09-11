export type VoiceCaptureStatus =
  | 'idle'
  | 'requesting-permission'
  | 'listening'
  | 'result'
  | 'error';

export type VoiceTranscriptionEvaluation =
  | 'correcta'
  | 'incorrecta';

export interface SpeechToTextUpdate {
  finalText: string;
  interimText: string;
}

export type SpeechToTextErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'microphone-unavailable'
  | 'network'
  | 'no-speech'
  | 'aborted'
  | 'service-not-allowed'
  | 'unknown';

export interface SpeechToTextError {
  code: SpeechToTextErrorCode;
  message: string;
  originalCode?: string;
}

export interface VoiceTranscriptionLog {
  id: string;
  presupuestoId?: string;
  transcripcion: string;
  fechaHora: string;
  evaluacion?: VoiceTranscriptionEvaluation;
  textoEsperado?: string;
  actualizadoEn: string;
}

/*
 * Tipos preparados para las siguientes etapas.
 * En la Etapa 1 todavía NO se generan VoiceProductDraft.
 */
export interface VoiceProductDraft {
  productId?: string;
  productFamily?: string;
  quantity?: number;
  lengthM?: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  lipMm?: number;
  thicknessMm?: number;
  weightKg?: number;
  price?: number;
  priceUnit?: 'USD_KG' | 'USD_M';
  sourceText: string;
}

export interface VoiceCommandResult {
  products: VoiceProductDraft[];
  originalText: string;
  unresolvedFragments?: string[];
}

export interface VoiceValidationIssue {
  field?: string;
  code: string;
  message: string;
}

export interface VoiceValidationResult {
  valid: boolean;
  issues: VoiceValidationIssue[];
}
