import { db } from './appDb';
import type {
  VoiceTranscriptionEvaluation,
  VoiceTranscriptionLog,
} from '../voice/types/voice';

function crearIdTranscripcion(): string {
  if (
    typeof crypto !== 'undefined' &&
    'randomUUID' in crypto
  ) {
    return crypto.randomUUID();
  }

  return `voice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function registrarTranscripcionVoz(
  transcripcion: string,
  presupuestoId?: string,
): Promise<VoiceTranscriptionLog> {
  const ahora = new Date().toISOString();

  const registro: VoiceTranscriptionLog = {
    id: crearIdTranscripcion(),
    presupuestoId,
    transcripcion: transcripcion.trim(),
    fechaHora: ahora,
    actualizadoEn: ahora,
  };

  await db.voiceTranscriptions.add(registro);

  return registro;
}

export async function evaluarTranscripcionVoz(
  id: string,
  evaluacion: VoiceTranscriptionEvaluation,
  textoEsperado?: string,
): Promise<void> {
  await db.voiceTranscriptions.update(id, {
    evaluacion,
    textoEsperado:
      evaluacion === 'incorrecta'
        ? textoEsperado?.trim() || undefined
        : undefined,
    actualizadoEn: new Date().toISOString(),
  });
}

export async function listarTranscripcionesVoz(
  limite = 100,
): Promise<VoiceTranscriptionLog[]> {
  return db.voiceTranscriptions
    .orderBy('fechaHora')
    .reverse()
    .limit(limite)
    .toArray();
}
