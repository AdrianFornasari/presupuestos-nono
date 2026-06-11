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

export function parsearNumeroDecimal(valor: FormDataEntryValue | null): number {
  if (valor === null) return Number.NaN;

  const texto = String(valor).trim().replace(/\./g, '').replace(',', '.');

  if (!texto) return Number.NaN;

  const numero = Number(texto);

  if (!Number.isFinite(numero)) {
    return Number.NaN;
  }

  return numero;
}

export function parsearEntero(valor: FormDataEntryValue | null): number {
  const numero = parsearNumeroDecimal(valor);

  if (!Number.isInteger(numero)) {
    return Number.NaN;
  }

  return numero;
}