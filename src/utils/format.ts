export function formatearNumeroPresupuesto(numero: number): string {
  return String(numero).padStart(5, '0');
}

export function fechaHoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fechaHoraAhoraISO(): string {
  return new Date().toISOString();
}

function normalizarCero(valor: number, decimales: number): number {
  if (!Number.isFinite(valor)) return 0;

  const factor = 10 ** decimales;
  const redondeado = Math.round((valor + Number.EPSILON) * factor) / factor;

  return Math.abs(redondeado) < 1 / factor ? 0 : redondeado;
}

export function formatearEntero(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
  }).format(normalizarCero(valor, 0));
}

export function formatearImporteUSD(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizarCero(valor, 2));
}

export function formatearDecimal4(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(normalizarCero(valor, 4));
}

export function formatearDecimal2SinMiles(valor: number): string {
  return normalizarCero(valor, 2).toFixed(2).replace('.', ',');
}

export function redondearImporte(valor: number): number {
  return normalizarCero(valor, 2);
}

export function parsearNumeroDecimal(
  valor: FormDataEntryValue | string | null,
): number {
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

export function parsearEntero(
  valor: FormDataEntryValue | string | null,
): number {
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