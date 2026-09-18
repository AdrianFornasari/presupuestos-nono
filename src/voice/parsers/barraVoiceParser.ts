import { PRODUCTOS_PROVEEDOR } from '../../data/productosProveedor';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';
import { formatInches, nearlyEqual, parseInchExpression } from './imperialMeasure';

export type BarraCanonicalType = 'Barra redonda' | 'Barra cuadrada';
export type BarraMissingField = 'quantity' | 'sizeInches' | 'price';

export interface BarraStructuredData {
  canonicalType: BarraCanonicalType;
  quantity?: number;
  sizeInches?: number;
  lengthM: number;
  lengthSource: 'dictated' | 'default';
  price?: number;
  priceUnit: 'USD_KG';
  productId?: string;
  productDescription?: string;
  massNominalKgM?: number;
}

export type BarraParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched'
  | 'variant-not-found'
  | 'variant-ambiguous';

export interface BarraVoiceParseResult {
  status: BarraParseStatus;
  data?: BarraStructuredData;
  missingFields: BarraMissingField[];
  issues: string[];
  candidateProductIds: string[];
}

interface CatalogEntry {
  canonicalType: BarraCanonicalType;
  productId: string;
  description: string;
  sizeInches: number;
  massNominalKgM: number;
}

const DEFAULT_LENGTH_M = 12;
const NUMBER_PATTERN = '(\\d+(?:,\\d+)?)';
const TYPE_PATTERNS: Record<BarraCanonicalType, string> = {
  'Barra redonda': '(?:barra(?:s)?\\s+redonda(?:s)?|hierro\\s+redondo)',
  'Barra cuadrada': '(?:barra(?:s)?\\s+cuadrada(?:s)?|hierro\\s+cuadrado)',
};

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isApplicableType(value: string): value is BarraCanonicalType {
  return value === 'Barra redonda' || value === 'Barra cuadrada';
}

function parseCatalog(): CatalogEntry[] {
  return PRODUCTOS_PROVEEDOR.flatMap((product) => {
    if (!isApplicableType(product.tipo)) return [];
    const prefix = `${product.tipo} `;
    if (!product.descripcion.startsWith(prefix)) return [];
    const sizeInches = parseInchExpression(product.descripcion.slice(prefix.length));
    if (sizeInches === undefined) return [];
    return [{
      canonicalType: product.tipo,
      productId: product.id,
      description: product.descripcion,
      sizeInches,
      massNominalKgM: product.masaNominal,
    }];
  });
}

const CATALOG = parseCatalog();

function extractQuantity(text: string, canonicalType: BarraCanonicalType): number | undefined {
  const pattern = TYPE_PATTERNS[canonicalType];
  const match = text.match(new RegExp(`\\b(\\d+)\\s+${pattern}(?=\\s|$)`, 'iu'));
  if (!match) return undefined;
  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

function extractSize(text: string, canonicalType: BarraCanonicalType): number | undefined {
  const pattern = TYPE_PATTERNS[canonicalType];
  const typeMatch = new RegExp(`${pattern}(?=\\s|$)`, 'iu').exec(text);
  if (!typeMatch || typeMatch.index === undefined) return undefined;

  let tail = text.slice(typeMatch.index + typeMatch[0].length).trim();
  tail = tail.replace(/^de\s+/iu, '');
  tail = tail.replace(
    /\s+(?:(?:largo\s+)?\d+(?:,\d+)?\s*m\b|(?:a|precio)\s+\d).*$/iu,
    '',
  );
  tail = tail.replace(/\s+de\s*$/iu, '').trim();
  return parseInchExpression(tail);
}

function extractLength(text: string): { value: number; source: 'dictated' | 'default' } {
  const explicitMatch = text.match(new RegExp(`\\blargo\\s+${NUMBER_PATTERN}\\s*m\\b`, 'iu'));
  const genericMatches = [...text.matchAll(new RegExp(`\\b${NUMBER_PATTERN}\\s*m\\b`, 'giu'))];
  const match = explicitMatch ?? genericMatches.at(-1);

  if (match) {
    const value = parseLocalizedNumber(match[1]);
    if (value !== undefined && value > 0) return { value, source: 'dictated' };
  }

  return { value: DEFAULT_LENGTH_M, source: 'default' };
}

function extractPrice(text: string): { value?: number; unit?: 'kg' | 'm' | 'Und' } {
  const match = text.match(/\b(?:a|precio)\s+(\d+(?:,\d{1,3})?)\/(kg|m|Und)\b/iu);
  if (!match) return {};
  const unit = match[2].toLocaleLowerCase('es-AR');
  return {
    value: parseLocalizedNumber(match[1]),
    unit: unit === 'und' ? 'Und' : (unit as 'kg' | 'm'),
  };
}

function getMissingFields(data: BarraStructuredData): BarraMissingField[] {
  const missing: BarraMissingField[] = [];
  if (data.quantity === undefined) missing.push('quantity');
  if (data.sizeInches === undefined) missing.push('sizeInches');
  if (data.price === undefined) missing.push('price');
  return missing;
}

function findCatalogMatches(data: BarraStructuredData): CatalogEntry[] {
  if (data.sizeInches === undefined) return [];
  return CATALOG.filter(
    (candidate) => candidate.canonicalType === data.canonicalType && nearlyEqual(candidate.sizeInches, data.sizeInches!),
  );
}

/** ETAPA 4 · Barras redondas / cuadradas. No calcula peso ni subtotal. */
export function parseBarraVoiceCommand(normalizedText: string): BarraVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (identification.status !== 'matched' || !isApplicableType(identification.canonicalType)) {
    return { status: 'not-applicable', missingFields: [], issues: [], candidateProductIds: [] };
  }

  const canonicalType = identification.canonicalType;
  const length = extractLength(normalizedText);
  const price = extractPrice(normalizedText);

  const data: BarraStructuredData = {
    canonicalType,
    quantity: extractQuantity(normalizedText, canonicalType),
    sizeInches: extractSize(normalizedText, canonicalType),
    lengthM: length.value,
    lengthSource: length.source,
    price: price.unit === 'kg' ? price.value : undefined,
    priceUnit: 'USD_KG',
  };

  const issues: string[] = [];
  if (price.value !== undefined && price.unit !== 'kg') {
    issues.push(`${canonicalType} debe cotizarse en USD/kg.`);
  }

  const missingFields = getMissingFields(data);
  const catalogMatches = findCatalogMatches(data);
  const candidateProductIds = catalogMatches.map((candidate) => candidate.productId);

  if (catalogMatches.length === 1) {
    const exact = catalogMatches[0];
    data.productId = exact.productId;
    data.productDescription = exact.description;
    data.massNominalKgM = exact.massNominalKgM;
  }

  if (data.sizeInches !== undefined && catalogMatches.length === 0) {
    issues.push(`La variante ${canonicalType} ${formatInches(data.sizeInches)} no existe en la tabla maestra.`);
    return { status: 'variant-not-found', data, missingFields, issues, candidateProductIds };
  }

  if (catalogMatches.length > 1) {
    issues.push(`Más de una variante de ${canonicalType} coincide con la medida dictada.`);
    return { status: 'variant-ambiguous', data, missingFields, issues, candidateProductIds };
  }

  if (missingFields.length > 0 || issues.length > 0) {
    return { status: 'incomplete', data, missingFields, issues, candidateProductIds };
  }

  return { status: 'matched', data, missingFields, issues, candidateProductIds };
}
