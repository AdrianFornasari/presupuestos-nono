import { PRODUCTOS_PROVEEDOR } from '../../data/productosProveedor';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';

export type ChapaTechoCanonicalType =
  | 'Chapa acanalada'
  | 'Chapa trapezoidal';

export type ChapaTechoMaterial = 'galvanizada' | 'negra';

export type ChapaTechoMissingField =
  | 'quantity'
  | 'material'
  | 'lengthM'
  | 'price';

export interface ChapaTechoStructuredData {
  canonicalType: ChapaTechoCanonicalType;
  quantity?: number;
  material?: ChapaTechoMaterial;
  lengthM?: number;
  price?: number;
  priceUnit: 'USD_M';
  productId?: string;
  productDescription?: string;
}

export type ChapaTechoParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched';

export interface ChapaTechoVoiceParseResult {
  status: ChapaTechoParseStatus;
  data?: ChapaTechoStructuredData;
  missingFields: ChapaTechoMissingField[];
  issues: string[];
}

const NUMBER_PATTERN = '(\\d+(?:,\\d+)?)';

const PRODUCT_ALIAS_PATTERNS: Record<ChapaTechoCanonicalType, string> = {
  'Chapa acanalada': 'chapa(?:s)?\\s+acanalada(?:s)?',
  'Chapa trapezoidal': 'chapa(?:s)?\\s+trapezoidal(?:es)?',
};

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isChapaTechoCanonicalType(
  value: string,
): value is ChapaTechoCanonicalType {
  return value === 'Chapa acanalada' || value === 'Chapa trapezoidal';
}

function extractQuantity(
  text: string,
  canonicalType: ChapaTechoCanonicalType,
): number | undefined {
  const match = text.match(
    new RegExp(
      `\\b(\\d+)\\s+${PRODUCT_ALIAS_PATTERNS[canonicalType]}\\b`,
      'iu',
    ),
  );

  if (!match) return undefined;

  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

function extractMaterial(text: string): ChapaTechoMaterial | undefined {
  if (/\bgalvanizad(?:a|as|o|os)\b/iu.test(text)) {
    return 'galvanizada';
  }

  if (/\bnegr(?:a|as|o|os)\b/iu.test(text)) {
    return 'negra';
  }

  return undefined;
}

function extractLength(text: string): number | undefined {
  const explicitMatch = text.match(
    new RegExp(`\\blargo\\s+${NUMBER_PATTERN}\\s*m\\b`, 'iu'),
  );

  const genericMatches = [
    ...text.matchAll(new RegExp(`\\b${NUMBER_PATTERN}\\s*m\\b`, 'giu')),
  ];

  const match = explicitMatch ?? genericMatches.at(-1);

  if (!match) return undefined;

  const value = parseLocalizedNumber(match[1]);
  return value !== undefined && value > 0 ? value : undefined;
}

function extractPrice(text: string): {
  value?: number;
  unit?: 'kg' | 'm' | 'Und';
} {
  const match = text.match(
    /\b(?:a|precio)\s+(\d+(?:,\d{1,3})?)\/(kg|m|Und)\b/iu,
  );

  if (!match) return {};

  const unit = match[2].toLocaleLowerCase('es-AR');

  return {
    value: parseLocalizedNumber(match[1]),
    unit: unit === 'und' ? 'Und' : (unit as 'kg' | 'm'),
  };
}

function findMasterProduct(canonicalType: ChapaTechoCanonicalType) {
  return PRODUCTOS_PROVEEDOR.find(
    (product) => product.tipo === canonicalType && product.tipoCalculo === 'metro',
  );
}

function getMissingFields(
  data: ChapaTechoStructuredData,
): ChapaTechoMissingField[] {
  const missing: ChapaTechoMissingField[] = [];

  if (data.quantity === undefined) missing.push('quantity');
  if (data.material === undefined) missing.push('material');
  if (data.lengthM === undefined) missing.push('lengthM');
  if (data.price === undefined) missing.push('price');

  return missing;
}

/**
 * ETAPA 4 · Chapas para techos
 *
 * Extrae únicamente datos estructurados desde el texto normalizado para
 * Chapa acanalada y Chapa trapezoidal. La forma del producto se vincula con
 * PRODUCTOS_PROVEEDOR; el material (galvanizada/negra) es un atributo del
 * pedido y no crea una segunda tabla de productos.
 *
 * No calcula metros totales, subtotal, importe ni peso. Esos cálculos siguen
 * perteneciendo a la lógica determinística del flujo estable.
 */
export function parseChapaTechoVoiceCommand(
  normalizedText: string,
): ChapaTechoVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (
    identification.status !== 'matched' ||
    !isChapaTechoCanonicalType(identification.canonicalType)
  ) {
    return {
      status: 'not-applicable',
      missingFields: [],
      issues: [],
    };
  }

  const canonicalType = identification.canonicalType;
  const price = extractPrice(normalizedText);
  const masterProduct = findMasterProduct(canonicalType);

  const data: ChapaTechoStructuredData = {
    canonicalType,
    quantity: extractQuantity(normalizedText, canonicalType),
    material: extractMaterial(normalizedText),
    lengthM: extractLength(normalizedText),
    price: price.unit === 'm' ? price.value : undefined,
    priceUnit: 'USD_M',
    productId: masterProduct?.id,
    productDescription: masterProduct?.descripcion,
  };

  const issues: string[] = [];

  if (price.value !== undefined && price.unit !== 'm') {
    issues.push(
      `${canonicalType} debe cotizarse en USD/m.`,
    );
  }

  if (!masterProduct) {
    issues.push(
      `${canonicalType} no está disponible como producto por metro en la tabla maestra.`,
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
