export function formatearNumeroPresupuesto(numero: number): string {
  return String(numero).padStart(5, '0');
}

export function fechaHoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fechaHoraAhoraISO(): string {
  return new Date().toISOString();
}

export function formatearImporteUSD(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}