export type VoiceControlCommand =
  | 'cancel-turn'
  | 'restart-product'
  | 'repeat-status'
  | 'discard-product';

function normalizeControlText(value: string): string {
  return value
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectInText(text: string): VoiceControlCommand | null {
  if (!text) return null;

  if (
    /^(repetir|repeti|repite)( (el )?estado)?$/.test(text) ||
    /^(volver|volve|vuelve) a escuchar( el estado)?$/.test(text) ||
    /^leer de nuevo$/.test(text) ||
    /^no entendi( lo que dijiste)?$/.test(text) ||
    /^que dijiste$/.test(text)
  ) {
    return 'repeat-status';
  }

  if (
    /^(empezar|empeza|empieza) de nuevo$/.test(text) ||
    /^(volver|volve|vuelve) a empezar$/.test(text) ||
    /^reiniciar( el)? producto$/.test(text) ||
    /^nuevo producto desde cero$/.test(text)
  ) {
    return 'restart-product';
  }

  if (
    /^(descartar|descarta|desechar|desecha) (este )?producto$/.test(text) ||
    /^(olvidar|olvida) (este )?producto$/.test(text) ||
    /^cancelar este producto$/.test(text)
  ) {
    return 'discard-product';
  }

  if (
    /^(cancelar|cancela|cancelo|cancelar esto|cancela esto)$/.test(text)
  ) {
    return 'cancel-turn';
  }

  return null;
}

export function detectVoiceControlCommand(
  normalizedText: string,
  rawText: string,
): VoiceControlCommand | null {
  const raw = normalizeControlText(rawText);
  const normalized = normalizeControlText(normalizedText);

  return detectInText(raw) ?? detectInText(normalized);
}
