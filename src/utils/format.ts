export function formatearNumeroPresupuesto(numero: number): string {
  return String(numero).padStart(5, '0');
}

export function fechaHoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fechaHoraAhoraISO(): string {
  return new Date().toISOString();
}

export function formatearEntero(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
  }).format(valor);
}

export function formatearImporteUSD(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

export function formatearDecimal4(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(valor);
}

export function formatearDecimal2SinMiles(valor: number): string {
  return valor.toFixed(2).replace('.', ',');
}

export function redondearImporte(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Acepta coma o punto como separador decimal.
 * Nunca interpreta puntos como separador de miles.
 *
 * Ejemplos:
 * 2,5     => 2.5
 * 2.5     => 2.5
 * 10,0000 => 10
 * 10.0000 => 10
 *
 * No usar separadores de miles en el ingreso manual.
 */
export function parsearNumeroDecimal(valor: FormDataEntryValue | null): number {
  if (valor === null) return Number.NaN;

  const textoOriginal = String(valor).trim();

  if (!textoOriginal) return Number.NaN;

  const textoNormalizado = textoOriginal.replace(',', '.');

  const cantidadDePuntos = (textoNormalizado.match(/\./g) || []).length;

  if (cantidadDePuntos > 1) {
    return Number.NaN;
  }

  const formatoValido = /^\d+(\.\d+)?$/.test(textoNormalizado);

  if (!formatoValido) {
    return Number.NaN;
  }

  const numero = Number(textoNormalizado);

  if (!Number.isFinite(numero)) {
    return Number.NaN;
  }

  return numero;
}

export function parsearEntero(valor: FormDataEntryValue | null): number {
  if (valor === null) return Number.NaN;

  const texto = String(valor).trim();

  if (!texto) return Number.NaN;

  const formatoValido = /^\d+$/.test(texto);

  if (!formatoValido) {
    return Number.NaN;
  }

  const numero = Number(texto);

  if (!Number.isInteger(numero)) {
    return Number.NaN;
  }

  return numero;
}