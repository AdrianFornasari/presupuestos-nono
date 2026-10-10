import type { LineaPresupuesto } from '../../types/presupuesto';
import { prepareSpeechFeedbackText } from './browserSpeechFeedback';

function decimalHablado(valor: number, decimales: number): string {
  return valor.toFixed(decimales).replace('.', ' coma ');
}

/** Evita enviar fracciones con barra al lector cuando expresan pulgadas. */
function descripcionHablada(descripcion: string): string {
  const numeradores = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis',
    'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince'];
  const denominadores: Record<string, string> = {
    '2': 'medio', '4': 'cuarto', '8': 'octavo', '16': 'dieciseisavo',
  };

  return prepareSpeechFeedbackText(descripcion)
    .replace(
      /\b(?:(\d+)\s+)?(\d+)\s*\/\s*(16|8|4|2)\s*(?:["”″]|pulgadas?\b)/giu,
      (original, entero: string | undefined, numerador: string, denominador: string) => {
        const cantidad = Number(numerador);
        if (cantidad < 1 || cantidad >= Number(denominador)) return original;
        const fraccion = `${numeradores[cantidad]} ${denominadores[denominador]}${cantidad > 1 ? 's' : ''}`;
        const unidadEntera = entero === '1' ? 'una pulgada' : `${entero} pulgadas`;
        if (entero && Number(entero) > 0) {
          return `${unidadEntera} y ${denominador === '2' ? 'media' : fraccion}`;
        }
        return denominador === '2' ? 'media pulgada' : `${fraccion} de pulgada`;
      },
    )
    .replace(/(^|[^\w/.,])1\s*(?:["”″]|pulgadas?\b)/giu, '$1una pulgada')
    .replace(/\bmm\b/g, 'milímetros')
    .replace(/\bm\b/g, 'metros')
    .replace(/["”″]/g, ' pulgadas');
}

/** Lee valores ya cotizados; no calcula pesos ni importes. */
export interface BudgetSpeechReviewSection {
  productIndex: number | null;
  messages: string[];
}

export function buildBudgetSpeechReviewSections(
  lineas: readonly LineaPresupuesto[],
  clienteNombre: string,
  totalUsdTexto: string,
): BudgetSpeechReviewSection[] {
  if (lineas.length === 0) return [];

  const sections: BudgetSpeechReviewSection[] = [{ productIndex: null, messages: [
    `Productos cotizados${clienteNombre.trim() ? ` para ${clienteNombre.trim()}` : ''}. ${lineas.length} productos.`,
  ] }];

  [...lineas].sort((a, b) => a.orden - b.orden).forEach((linea, indice) => {
    const mensajes: string[] = [];
    const tipo = linea.tipoCalculo ?? 'peso';
    const descripcion = descripcionHablada(linea.descripcion);
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
    sections.push({ productIndex: indice, messages: mensajes });
  });

  sections.push({ productIndex: null, messages: [`Fin de la lista. Total ${totalUsdTexto.replace(',', ' coma ')} dólares.`] });
  return sections;
}

export function buildBudgetSpeechReview(
  lineas: readonly LineaPresupuesto[],
  clienteNombre: string,
  totalUsdTexto: string,
): string[] {
  return buildBudgetSpeechReviewSections(lineas, clienteNombre, totalUsdTexto)
    .flatMap((section) => section.messages);
}
