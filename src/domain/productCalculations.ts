/**
 * Reglas determinísticas compartidas para productos del presupuesto.
 * La entrada por voz y el formulario convencional deben reutilizar estas
 * funciones en lugar de mantener fórmulas paralelas.
 */

const DENSIDAD_ACERO_KG_MM3 = 0.00000785;

export function calcularPesoTotalProductoProveedor(
  cantidad: number,
  largoM: number,
  masaNominalKgM: number,
): number {
  if (
    !Number.isInteger(cantidad) ||
    cantidad <= 0 ||
    !Number.isFinite(largoM) ||
    largoM <= 0 ||
    !Number.isFinite(masaNominalKgM) ||
    masaNominalKgM <= 0
  ) {
    return Number.NaN;
  }

  return cantidad * largoM * masaNominalKgM;
}

export function calcularPesoTotalPlanchaAcero(
  cantidad: number,
  largoMm: number,
  anchoMm: number,
  espesorMm: number,
): number {
  if (
    !Number.isInteger(cantidad) ||
    cantidad <= 0 ||
    !Number.isFinite(largoMm) ||
    largoMm <= 0 ||
    !Number.isFinite(anchoMm) ||
    anchoMm <= 0 ||
    !Number.isFinite(espesorMm) ||
    espesorMm <= 0
  ) {
    return Number.NaN;
  }

  return cantidad * largoMm * anchoMm * espesorMm * DENSIDAD_ACERO_KG_MM3;
}
