import { identifyVoiceProduct } from '../products/productVoiceDictionary';

export type RecorteMissingField = 'weightKg' | 'price';

export interface RecorteStructuredData {
  canonicalType: 'Recortes';
  quantity: 1;
  weightKg?: number;
  price?: number;
  priceUnit: 'USD_KG';
  inputMethod: 'manual-peso';
}

export type RecorteParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched';

export interface RecorteVoiceParseResult {
  status: RecorteParseStatus;
  data?: RecorteStructuredData;
  missingFields: RecorteMissingField[];
  issues: string[];
}

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractWeightKg(text: string): number | undefined {
  const beforeProduct = text.match(
    /\b(\d+(?:,\d+)?)\s*kg\s+(?:de\s+)?recortes?\b/iu,
  );

  if (beforeProduct) {
    const value = parseLocalizedNumber(beforeProduct[1]);
    return value !== undefined && value > 0 ? value : undefined;
  }

  const afterProduct = text.match(
    /\brecortes?\b[^/]*?\b(?:peso\s+)?(\d+(?:,\d+)?)\s*kg\b/iu,
  );

  if (!afterProduct) return undefined;

  const value = parseLocalizedNumber(afterProduct[1]);
  return value !== undefined && value > 0 ? value : undefined;
}

function extractPrice(text: string): {
  value?: number;
  unit?: 'kg' | 'm' | 'Und';
} {
  const match = text.match(
    /\b(?:a|precio)\s+\$?(\d+(?:,\d{1,3})?)\/(kg|m|Und)\b/iu,
  );

  if (!match) return {};

  const normalizedUnit = match[2].toLocaleLowerCase('es-AR');

  return {
    value: parseLocalizedNumber(match[1]),
    unit:
      normalizedUnit === 'und'
        ? 'Und'
        : (normalizedUnit as 'kg' | 'm'),
  };
}

function getMissingFields(
  data: RecorteStructuredData,
): RecorteMissingField[] {
  const missing: RecorteMissingField[] = [];

  if (data.weightKg === undefined) missing.push('weightKg');
  if (data.price === undefined) missing.push('price');

  return missing;
}

/**
 * ETAPA 4.4 · Recortes
 *
 * Recortes reutiliza exactamente el modo manual-peso del flujo estable.
 * La voz sólo extrae el peso total manual y el precio USD/kg. La cantidad de
 * línea queda fijada en 1, igual que en el editor convencional.
 *
 * No calcula peso, subtotal ni importe: el peso ya es un dato manual dictado.
 */
export function parseRecorteVoiceCommand(
  normalizedText: string,
): RecorteVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (
    identification.status !== 'matched' ||
    identification.canonicalType !== 'Recortes'
  ) {
    return {
      status: 'not-applicable',
      missingFields: [],
      issues: [],
    };
  }

  const price = extractPrice(normalizedText);

  const data: RecorteStructuredData = {
    canonicalType: 'Recortes',
    quantity: 1,
    weightKg: extractWeightKg(normalizedText),
    price: price.unit === 'kg' ? price.value : undefined,
    priceUnit: 'USD_KG',
    inputMethod: 'manual-peso',
  };

  const issues: string[] = [];

  if (price.value !== undefined && price.unit !== 'kg') {
    issues.push('Recortes debe cotizarse en USD/kg.');
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
