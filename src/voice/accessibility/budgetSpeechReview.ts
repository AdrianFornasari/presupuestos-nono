import type { LineaPresupuesto } from '../../types/presupuesto';
import { prepareSpeechFeedbackText } from './browserSpeechFeedback';

function decimalHablado(valor: number, decimales: number): string {
  return valor.toFixed(decimales).replace('.', ' coma ');
}

/** Lee valores ya cotizados; no calcula pesos ni importes. */
export function buildBudgetSpeechReview(
  lineas: readonly LineaPresupuesto[],
  clienteNombre: string,
  totalUsdTexto: string,
): string[] {
  if (lineas.length === 0) return [];

  const mensajes = [
    `Productos cotizados${clienteNombre.trim() ? ` para ${clienteNombre.trim()}` : ''}. ${lineas.length} productos.`,
  ];

  [...lineas].sort((a, b) => a.orden - b.orden).forEach((linea, indice) => {
    const tipo = linea.tipoCalculo ?? 'peso';
    const descripcion = prepareSpeechFeedbackText(linea.descripcion)
      .replace(/\bmm\b/g, 'milímetros')
      .replace(/\bm\b/g, 'metros')
      .replace(/"/g, ' pulgadas');
    mensajes.push(`Producto ${indice + 1}. ${descripcion}.`);
    mensajes.push(`Unidades ${linea.unidades ?? linea.cantidad}.`);

    if (tipo === 'peso' || tipo === 'plancha') {
      mensajes.push(`Peso cotizado ${decimalHablado(linea.pesoTotal ?? linea.acumulado ?? 0, 3)} kilos.`);
    }
    if ((tipo === 'peso' || tipo === 'metro') && linea.largo !== undefined) {
      mensajes.push(`Largo por pieza ${linea.largo.toLocaleString('es-AR')} metros.`);
    } else if (tipo === 'plancha') {
      if (linea.largo !== undefined) mensajes.push(`Largo ${linea.largo.toLocaleString('es-AR')} milímetros.`);
      if (linea.ancho !== undefined) mensajes.push(`Ancho ${linea.ancho.toLocaleString('es-AR')} milímetros.`);
      if (linea.espesor !== undefined) mensajes.push(`Espesor ${linea.espesor.toLocaleString('es-AR')} milímetros.`);
    }

    const unidadPrecio = tipo === 'metro' ? 'metro' : tipo === 'unidad' ? 'unidad' : 'kilo';
    mensajes.push(`Precio ${decimalHablado(linea.precioUnitario, 4)} dólares por ${unidadPrecio}.`);
    mensajes.push(`Importe ${decimalHablado(linea.subtotal, 2)} dólares.`);
  });

  mensajes.push(`Fin de la lista. Total ${totalUsdTexto.replace(',', ' coma ')} dólares.`);
  return mensajes;
}
