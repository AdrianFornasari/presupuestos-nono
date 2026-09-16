import { identifyVoiceProduct } from '../products/productVoiceDictionary';

export type MallaMissingField = 'quantity' | 'price';

export interface MallaStructuredData {
  canonicalType: 'Mallas';
  quantity?: number;
  price?: number;
  priceUnit: 'USD_UND';
  inputMethod: 'manual-unidad';
}

export type MallaParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched';

export interface MallaVoiceParseResult {
  status: MallaParseStatus;
  data?: MallaStructuredData;
  missingFields: MallaMissingField[];
  issues: string[];
}

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractQuantity(text: string): number | undefined {
  const match = text.match(/\b(\d+)\s+mallas?\b/iu);

  if (!match) return undefined;

  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

function extractPrice(text: string): {
  value?: number;
  unit?: 'kg' | 'm' | 'Und';
} {
  const canonical = text.match(
    /\b(?:a|precio)\s+\$?(\d+(?:,\d{1,3})?)\/(kg|m|Und)\b/iu,
  );

  if (canonical) {
    const normalizedUnit = canonical[2].toLocaleLowerCase('es-AR');

    return {
      value: parseLocalizedNumber(canonical[1]),
      unit:
        normalizedUnit === 'und'
          ? 'Und'
          : (normalizedUnit as 'kg' | 'm'),
    };
  }

  // Respaldo para una salida residual del reconocedor/normalizador como
  // "3 mallas a 50 dólares cada una". Se interpreta sólo porque la expresión
  // "cada una" hace inequívoca la unidad de precio.
  const each = text.match(
    /\b(?:a|precio)\s+\$?(\d+(?:,\d{1,3})?)\s+(?:dolares?|dólares?)\s+cada\s+(?:una|uno)\b/iu,
  );

  if (!each) return {};

  return {
    value: parseLocalizedNumber(each[1]),
    unit: 'Und',
  };
}

function getMissingFields(
  data: MallaStructuredData,
): MallaMissingField[] {
  const missing: MallaMissingField[] = [];

  if (data.quantity === undefined) missing.push('quantity');
  if (data.price === undefined) missing.push('price');

  return missing;
}

/**
 * ETAPA 4.4 · Mallas
 *
 * Mallas reutiliza exactamente el modo manual-unidad del flujo estable.
 * La voz extrae sólo cantidad y precio USD/Und. No corresponde largo, peso,
 * masa nominal ni calculadora.
 */
export function parseMallaVoiceCommand(
  normalizedText: string,
): MallaVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (
    identification.status !== 'matched' ||
    identification.canonicalType !== 'Mallas'
  ) {
    return {
      status: 'not-applicable',
      missingFields: [],
      issues: [],
    };
  }

  const price = extractPrice(normalizedText);

  const data: MallaStructuredData = {
    canonicalType: 'Mallas',
    quantity: extractQuantity(normalizedText),
    price: price.unit === 'Und' ? price.value : undefined,
    priceUnit: 'USD_UND',
    inputMethod: 'manual-unidad',
  };

  const issues: string[] = [];

  if (price.value !== undefined && price.unit !== 'Und') {
    issues.push('Mallas debe cotizarse en USD/Und.');
  }

  const missingFields = getMissingFields(data);

  if (missingFields.length > 0) {
    return {
      status: 'incomplete',
      data,
      missingFields,
      issues,
    };
  }

  return {
    status: 'matched',
    data,
    missingFields: [],
    issues,
  };
}
