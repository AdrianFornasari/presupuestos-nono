import type {
  VoiceProductDraft,
  VoiceValidationResult,
} from '../types/voice';

export interface ProductVoiceValidator {
  validate(product: VoiceProductDraft): Promise<VoiceValidationResult>;
}
