import { PRODUCTOS_PROVEEDOR } from '../../data/productosProveedor';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';

export type UpnUlCanonicalType = 'UPN' | 'UL';

export type UpnUlMissingField =
  | 'quantity'
  | 'nominalSizeMm'
  | 'heightMm'
  | 'flangeMm'
  | 'price';

export interface UpnUlStructuredData {
  canonicalType: UpnUlCanonicalType;
  quantity?: number;
  nominalSizeMm?: number;
  heightMm?: number;
  flangeMm?: number;
  lengthM: number;
  lengthSource: 'dictated' | 'default';
  price?: number;
  priceUnit: 'USD_KG';
  productId?: string;
  productDescription?: string;
  massNominalKgM?: number;
}

export type UpnUlParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched'
  | 'variant-not-found'
  | 'variant-ambiguous';

export interface UpnUlVoiceParseResult {
  status: UpnUlParseStatus;
  data?: UpnUlStructuredData;
  missingFields: UpnUlMissingField[];
  issues: string[];
  candidateProductIds: string[];
}

interface CatalogEntry {
  canonicalType: UpnUlCanonicalType;
  productId: string;
  description: string;
  nominalSizeMm?: number;
  heightMm?: number;
  flangeMm?: number;
  massNominalKgM: number;
}

const DEFAULT_LENGTH_M = 12;
const NUMBER_PATTERN = '(\\d+(?:,\\d+)?)';
const TYPE_PATTERNS: Record<UpnUlCanonicalType, string> = {
  UPN: '(?:perfil(?:es)?\\s+)?(?:UPN|u\\s+p\\s+n|u\\s+pe\\s+ene)',
  UL: '(?:perfil(?:es)?\\s+)?(?:UL|u\\s+l|u\\s+ele)',
};

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isApplicableType(value: string): value is UpnUlCanonicalType {
  return value === 'UPN' || value === 'UL';
}

function parseCatalog(): CatalogEntry[] {
  return PRODUCTOS_PROVEEDOR.flatMap<CatalogEntry>((product) => {
    if (!isApplicableType(product.tipo)) return [];

    if (product.tipo === 'UPN') {
      const match = product.descripcion.match(/^UPN\s+(\d+(?:\.\d+)?)$/u);
      if (!match) return [];
      const nominalSizeMm = Number(match[1]);
      if (!Number.isFinite(nominalSizeMm)) return [];

      return [{
        canonicalType: 'UPN' as const,
        productId: product.id,
        description: product.descripcion,
        nominalSizeMm,
        massNominalKgM: product.masaNominal,
      }];
    }

    const match = product.descripcion.match(/^UL\s+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/u);
    if (!match) return [];

    const heightMm = Number(match[1]);
    const flangeMm = Number(match[2]);
    if (!Number.isFinite(heightMm) || !Number.isFinite(flangeMm)) return [];

    return [{
      canonicalType: 'UL' as const,
      productId: product.id,
      description: product.descripcion,
      heightMm,
      flangeMm,
      massNominalKgM: product.masaNominal,
    }];
  });
}

const CATALOG = parseCatalog();

function extractQuantity(text: string, canonicalType: UpnUlCanonicalType): number | undefined {
  const pattern = TYPE_PATTERNS[canonicalType];
  const match = text.match(new RegExp(`\\b(\\d+)\\s+${pattern}(?=\\s|$)`, 'iu'));
  if (!match) return undefined;
  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

function extractVariantData(
  text: string,
  canonicalType: UpnUlCanonicalType,
): Pick<UpnUlStructuredData, 'nominalSizeMm' | 'heightMm' | 'flangeMm'> {
  const pattern = TYPE_PATTERNS[canonicalType];

  if (canonicalType === 'UPN') {
    const match = text.match(
      new RegExp(`\\b${pattern}(?:\\s+(?:de|numero|número))?\\s+${NUMBER_PATTERN}(?=\\s|$)`, 'iu'),
    );
    return { nominalSizeMm: match ? parseLocalizedNumber(match[1]) : undefined };
  }

  const match = text.match(
    new RegExp(
      `\\b${pattern}(?:\\s+de)?\\s+${NUMBER_PATTERN}\\s+(?:(?:x|por)\\s+)?${NUMBER_PATTERN}(?=\\s|$)`,
      'iu',
    ),
  );

  return {
    heightMm: match ? parseLocalizedNumber(match[1]) : undefined,
    flangeMm: match ? parseLocalizedNumber(match[2]) : undefined,
  };
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

function getMissingFields(data: UpnUlStructuredData): UpnUlMissingField[] {
  const missing: UpnUlMissingField[] = [];
  if (data.quantity === undefined) missing.push('quantity');
  if (data.canonicalType === 'UPN' && data.nominalSizeMm === undefined) missing.push('nominalSizeMm');
  if (data.canonicalType === 'UL' && data.heightMm === undefined) missing.push('heightMm');
  if (data.canonicalType === 'UL' && data.flangeMm === undefined) missing.push('flangeMm');
  if (data.price === undefined) missing.push('price');
  return missing;
}

function findCatalogMatches(data: UpnUlStructuredData): CatalogEntry[] {
  return CATALOG.filter((candidate) => {
    if (candidate.canonicalType !== data.canonicalType) return false;
    if (data.canonicalType === 'UPN') {
      return data.nominalSizeMm !== undefined && candidate.nominalSizeMm === data.nominalSizeMm;
    }
    return data.heightMm !== undefined && data.flangeMm !== undefined &&
      candidate.heightMm === data.heightMm && candidate.flangeMm === data.flangeMm;
  });
}

/** ETAPA 4 · UPN / UL. No calcula peso, subtotal ni importe. */
export function parseUpnUlVoiceCommand(normalizedText: string): UpnUlVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (identification.status !== 'matched' || !isApplicableType(identification.canonicalType)) {
    return { status: 'not-applicable', missingFields: [], issues: [], candidateProductIds: [] };
  }

  const canonicalType = identification.canonicalType;
  const variantData = extractVariantData(normalizedText, canonicalType);
  const length = extractLength(normalizedText);
  const price = extractPrice(normalizedText);

  const data: UpnUlStructuredData = {
    canonicalType,
    quantity: extractQuantity(normalizedText, canonicalType),
    ...variantData,
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

  const hasVariantData = canonicalType === 'UPN'
    ? data.nominalSizeMm !== undefined
    : data.heightMm !== undefined && data.flangeMm !== undefined;

  if (hasVariantData && catalogMatches.length === 0) {
    issues.push(`La variante dictada no existe en la tabla maestra de ${canonicalType}.`);
    return { status: 'variant-not-found', data, missingFields, issues, candidateProductIds };
  }

  if (catalogMatches.length > 1) {
    issues.push(`Más de una variante de ${canonicalType} coincide con las medidas dictadas.`);
    return { status: 'variant-ambiguous', data, missingFields, issues, candidateProductIds };
  }

  if (missingFields.length > 0 || issues.length > 0) {
    return { status: 'incomplete', data, missingFields, issues, candidateProductIds };
  }

  return { status: 'matched', data, missingFields, issues, candidateProductIds };
}
