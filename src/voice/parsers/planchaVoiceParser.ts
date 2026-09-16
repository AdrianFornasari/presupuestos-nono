import { PRODUCTOS_PROVEEDOR } from '../../data/productosProveedor';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';

export type PlanchaMissingField =
  | 'quantity'
  | 'lengthMm'
  | 'widthMm'
  | 'thicknessMm'
  | 'price';

export interface PlanchaStructuredData {
  canonicalType: 'Planchas';
  quantity?: number;
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  price?: number;
  priceUnit: 'USD_KG';
  productId?: string;
  productDescription?: string;
}

export type PlanchaParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched';

export interface PlanchaVoiceParseResult {
  status: PlanchaParseStatus;
  data?: PlanchaStructuredData;
  missingFields: PlanchaMissingField[];
  issues: string[];
}

const NUMBER = '(\\d+(?:,\\d+)?)';
const UNIT = '(mm|m)';
const PLANCHA_ALIAS = 'plancha(?:s)?';

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toMillimeters(value: string, unit?: string): number | undefined {
  const parsed = parseLocalizedNumber(value);

  if (parsed === undefined || parsed <= 0) return undefined;

  return unit?.toLocaleLowerCase('es-AR') === 'm'
    ? parsed * 1000
    : parsed;
}

function extractQuantity(text: string): number | undefined {
  const match = text.match(
    new RegExp(`\\b(\\d+)\\s+${PLANCHA_ALIAS}\\b`, 'iu'),
  );

  if (!match) return undefined;

  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

function extractExplicitDimension(
  text: string,
  label: 'largo' | 'ancho',
): number | undefined {
  const match = text.match(
    new RegExp(`\\b${label}\\s+${NUMBER}\\s*${UNIT}?\\b`, 'iu'),
  );

  if (!match) return undefined;

  return toMillimeters(match[1], match[2]);
}

function extractExplicitThickness(text: string): number | undefined {
  const match = text.match(
    new RegExp(`\\bespesor\\s+${NUMBER}\\s*(?:mm)?\\b`, 'iu'),
  );

  if (!match) return undefined;

  return toMillimeters(match[1], 'mm');
}

function extractCompactDimensions(text: string): {
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
} {
  const triple = text.match(
    new RegExp(
      `\\b${PLANCHA_ALIAS}\\b(?:\\s+de)?\\s+${NUMBER}\\s*${UNIT}?\\s*(?:x|por)\\s*${NUMBER}\\s*${UNIT}?\\s*(?:x|por)\\s*${NUMBER}\\s*(mm|m)?\\b`,
      'iu',
    ),
  );

  if (triple) {
    return {
      lengthMm: toMillimeters(triple[1], triple[2]),
      widthMm: toMillimeters(triple[3], triple[4]),
      thicknessMm: toMillimeters(triple[5], triple[6] ?? 'mm'),
    };
  }

  const pair = text.match(
    new RegExp(
      `\\b${PLANCHA_ALIAS}\\b(?:\\s+de)?\\s+${NUMBER}\\s*${UNIT}?\\s*(?:x|por)\\s*${NUMBER}\\s*${UNIT}?\\b`,
      'iu',
    ),
  );

  if (!pair) return {};

  return {
    lengthMm: toMillimeters(pair[1], pair[2]),
    widthMm: toMillimeters(pair[3], pair[4]),
  };
}

function extractDimensions(text: string): {
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
} {
  const compact = extractCompactDimensions(text);

  return {
    lengthMm: extractExplicitDimension(text, 'largo') ?? compact.lengthMm,
    widthMm: extractExplicitDimension(text, 'ancho') ?? compact.widthMm,
    thicknessMm: extractExplicitThickness(text) ?? compact.thicknessMm,
  };
}

function extractPrice(text: string): {
  value?: number;
  unit?: 'kg' | 'm' | 'Und';
} {
  const match = text.match(
    /\b(?:a|precio)\s+(\d+(?:,\d{1,3})?)\/(kg|m|Und)\b/iu,
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

function findMasterProduct() {
  return PRODUCTOS_PROVEEDOR.find(
    (product) =>
      product.tipo === 'Planchas' && product.tipoCalculo === 'plancha',
  );
}

function getMissingFields(
  data: PlanchaStructuredData,
): PlanchaMissingField[] {
  const missing: PlanchaMissingField[] = [];

  if (data.quantity === undefined) missing.push('quantity');
  if (data.lengthMm === undefined) missing.push('lengthMm');
  if (data.widthMm === undefined) missing.push('widthMm');
  if (data.thicknessMm === undefined) missing.push('thicknessMm');
  if (data.price === undefined) missing.push('price');

  return missing;
}

/**
 * ETAPA 4 · Planchas
 *
 * Extrae únicamente datos estructurados desde el texto normalizado:
 * cantidad, largo, ancho, espesor y precio USD/kg. Largo y ancho se expresan
 * internamente en milímetros para coincidir con el flujo convencional.
 *
 * Si el usuario dicta largo/ancho en metros, sólo se convierte la unidad a mm;
 * no se calcula peso, subtotal ni importe. Esos cálculos siguen perteneciendo
 * a la lógica determinística existente de Presupuestos Nono.
 */
export function parsePlanchaVoiceCommand(
  normalizedText: string,
): PlanchaVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (
    identification.status !== 'matched' ||
    identification.canonicalType !== 'Planchas'
  ) {
    return {
      status: 'not-applicable',
      missingFields: [],
      issues: [],
    };
  }

  const dimensions = extractDimensions(normalizedText);
  const price = extractPrice(normalizedText);
  const masterProduct = findMasterProduct();

  const data: PlanchaStructuredData = {
    canonicalType: 'Planchas',
    quantity: extractQuantity(normalizedText),
    lengthMm: dimensions.lengthMm,
    widthMm: dimensions.widthMm,
    thicknessMm: dimensions.thicknessMm,
    price: price.unit === 'kg' ? price.value : undefined,
    priceUnit: 'USD_KG',
    productId: masterProduct?.id,
    productDescription: masterProduct?.descripcion,
  };

  const issues: string[] = [];

  if (price.value !== undefined && price.unit !== 'kg') {
    issues.push('Las planchas deben cotizarse en USD/kg.');
  }

  if (!masterProduct) {
    issues.push(
      'Planchas no está disponible como producto tipo plancha en la tabla maestra.',
    );
  }

  const missingFields = getMissingFields(data);

  if (missingFields.length > 0 || !masterProduct) {
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
