import { db } from './appDb';
import { APP_VERSION } from '../config/appVersion';
import { normalizeVoiceText } from '../voice/normalization/normalizeVoiceText';
import { buildVoiceReadyProduct } from '../voice/products/voiceReadyProduct';
import type { VoiceTranscriptionLog } from '../voice/types/voice';

function analizarTextoGuardado(registro: VoiceTranscriptionLog) {
  try {
    const textoNormalizado = normalizeVoiceText(registro.transcripcion);
    return {
      textoNormalizado,
      resultadoInterpretacion: buildVoiceReadyProduct(textoNormalizado),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'No se pudo analizar este texto.',
    };
  }
}

function datosDispositivo() {
  return {
    navegador: typeof navigator === 'undefined' ? null : navigator.userAgent,
    idioma: typeof navigator === 'undefined' ? null : navigator.language,
    zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
    anchoVentanaPx: typeof window === 'undefined' ? null : window.innerWidth,
    altoVentanaPx: typeof window === 'undefined' ? null : window.innerHeight,
    reconocimientoVozDisponible: typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
    lecturaVozDisponible: typeof window !== 'undefined' &&
      'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  };
}

export async function crearRegistroVozJson() {
  // Exportar el historial completo; la lista de revisión habitual tiene límite 100.
  const registros = await db.voiceTranscriptions.orderBy('fechaHora').toArray();
  if (registros.length === 0) {
    throw new Error('No hay transcripciones guardadas. Realizá un dictado de prueba y volvé a exportar.');
  }

  const ahora = new Date();
  const partes = [ahora.getFullYear(), ahora.getMonth() + 1, ahora.getDate(),
    ahora.getHours(), ahora.getMinutes(), ahora.getSeconds()];
  const sello = partes.map((parte, index) => index === 0 ? String(parte) : String(parte).padStart(2, '0'));
  const nombreArchivo = `registro-voz-presupuestos-nono-${sello.slice(0, 3).join('')}-${sello.slice(3).join('')}.json`;
  const contenido = {
    tipo: 'presupuestos-nono-registro-voz',
    versionFormato: 1,
    versionApp: APP_VERSION,
    creadoEn: ahora.toISOString(),
    dispositivoAlExportar: datosDispositivo(),
    alcanceAnalisis: 'El análisis se genera al exportar con la versión actual, a partir de cada texto aislado. No reconstruye el estado histórico de aclaraciones, correcciones ni acciones realizadas.',
    totalTranscripciones: registros.length,
    transcripciones: registros.map((registro) => ({
      ...registro,
      analisisAlExportar: analizarTextoGuardado(registro),
    })),
  };

  return { nombreArchivo, contenido: JSON.stringify(contenido, null, 2), totalRegistros: registros.length };
}

export async function descargarRegistroVoz() {
  const archivo = await crearRegistroVozJson();
  const blob = new Blob([archivo.contenido], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = archivo.nombreArchivo;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Dar tiempo al navegador para iniciar la descarga antes de liberar el archivo.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { nombreArchivo: archivo.nombreArchivo, totalRegistros: archivo.totalRegistros };
}
