import { PRODUCTOS_PROVEEDOR } from '../../data/productosProveedor';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';

export type HeaHebWCanonicalType = 'HEA' | 'HEB' | 'W (H)' | 'W (I)';

export type HeaHebWMissingField =
  | 'quantity'
  | 'nominalSizeMm'
  | 'designationKgM'
  | 'price';

export interface HeaHebWStructuredData {
  canonicalType: HeaHebWCanonicalType;
  quantity?: number;
  nominalSizeMm?: number;
  designationKgM?: number;
  requestedShapeCode?: 'W' | 'HP';
  lengthM: number;
  lengthSource: 'dictated' | 'default';
  price?: number;
  priceUnit: 'USD_KG';
  productId?: string;
  productDescription?: string;
  massNominalKgM?: number;
}

export type HeaHebWParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched'
  | 'variant-not-found'
  | 'variant-ambiguous';

export interface HeaHebWVoiceParseResult {
  status: HeaHebWParseStatus;
  data?: HeaHebWStructuredData;
  missingFields: HeaHebWMissingField[];
  issues: string[];
  candidateProductIds: string[];
}

interface CatalogEntry {
  canonicalType: HeaHebWCanonicalType;
  productId: string;
  description: string;
  nominalSizeMm: number;
  designationKgM?: number;
  shapeCode?: 'W' | 'HP';
  massNominalKgM: number;
}

const DEFAULT_LENGTH_M = 12;
const NUMBER_PATTERN = '(\\d+(?:,\\d+)?)';

const TYPE_PATTERNS: Record<HeaHebWCanonicalType, string> = {
  HEA: '(?:perfil(?:es)?\\s+)?HEA',
  HEB: '(?:perfil(?:es)?\\s+)?HEB',
  'W (H)': '(?:perfil(?:es)?\\s+)?(?:W\\s+H|HP)',
  'W (I)': '(?:perfil(?:es)?\\s+)?W\\s+I',
};

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isHeaHebWType(value: string): value is HeaHebWCanonicalType {
  return value === 'HEA' || value === 'HEB' || value === 'W (H)' || value === 'W (I)';
}

function parseCatalog(): CatalogEntry[] {
  const catalog: CatalogEntry[] = [];

  for (const product of PRODUCTOS_PROVEEDOR) {
    if (!isHeaHebWType(product.tipo)) continue;

    if (product.tipo === 'HEA') {
      const match = product.descripcion.match(/^HEA\s+(\d+(?:[.,]\d+)?)\s+\([HI]\)$/u);
      if (!match) continue;

      const nominalSizeMm = parseLocalizedNumber(match[1]);
      if (nominalSizeMm === undefined) continue;

      catalog.push({
        canonicalType: 'HEA',
        productId: product.id,
        description: product.descripcion,
        nominalSizeMm,
        massNominalKgM: product.masaNominal,
      });
      continue;
    }

    if (product.tipo === 'HEB') {
      const match = product.descripcion.match(/^HEB\s+(\d+(?:[.,]\d+)?)$/u);
      if (!match) continue;

      const nominalSizeMm = parseLocalizedNumber(match[1]);
      if (nominalSizeMm === undefined) continue;

      catalog.push({
        canonicalType: 'HEB',
        productId: product.id,
        description: product.descripcion,
        nominalSizeMm,
        massNominalKgM: product.masaNominal,
      });
      continue;
    }

    const match = product.descripcion.match(
      /^W\s+\(([HI])\)\s*-\s*(W|HP)\s+(\d+)\s*x\s*([0-9]+(?:,[0-9]+)?)$/u,
    );

    if (!match) continue;

    const nominalSizeMm = Number(match[3]);
    const designationKgM = parseLocalizedNumber(match[4]);

    if (!Number.isFinite(nominalSizeMm) || designationKgM === undefined) {
      continue;
    }

    catalog.push({
      canonicalType: product.tipo,
      productId: product.id,
      description: product.descripcion,
      nominalSizeMm,
      designationKgM,
      shapeCode: match[2] as 'W' | 'HP',
      massNominalKgM: product.masaNominal,
    });
  }

  return catalog;
}

const CATALOG = parseCatalog();

function extractQuantity(
  text: string,
  canonicalType: HeaHebWCanonicalType,
): number | undefined {
  const pattern = TYPE_PATTERNS[canonicalType];
  const match = text.match(new RegExp(`\\b(\\d+)\\s+${pattern}\\b`, 'iu'));

  if (!match) return undefined;

  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

function extractNominalSize(
  text: string,
  canonicalType: HeaHebWCanonicalType,
): number | undefined {
  const pattern = TYPE_PATTERNS[canonicalType];
  const match = text.match(
    new RegExp(
      `\\b${pattern}(?:\\s+(?:de|numero|número))?\\s+${NUMBER_PATTERN}(?=\\s|$|\\s*x\\s*)`,
      'iu',
    ),
  );

  return match ? parseLocalizedNumber(match[1]) : undefined;
}

function extractWDesignation(
  text: string,
  canonicalType: 'W (H)' | 'W (I)',
): {
  nominalSizeMm?: number;
  designationKgM?: number;
  requestedShapeCode?: 'W' | 'HP';
} {
  const pattern = TYPE_PATTERNS[canonicalType];
  const match = text.match(
    new RegExp(
      `\\b${pattern}(?:\\s+(?:de|numero|número))?\\s+${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}(?=\\s|$)`,
      'iu',
    ),
  );

  const requestedShapeCode = /\bHP\b/iu.test(text) ? 'HP' : undefined;

  if (!match) {
    return {
      nominalSizeMm: extractNominalSize(text, canonicalType),
      requestedShapeCode,
    };
  }

  return {
    nominalSizeMm: parseLocalizedNumber(match[1]),
    designationKgM: parseLocalizedNumber(match[2]),
    requestedShapeCode,
  };
}

function extractLength(text: string): {
  value: number;
  source: 'dictated' | 'default';
} {
  const explicitMatch = text.match(
    new RegExp(`\\blargo\\s+${NUMBER_PATTERN}\\s*m\\b`, 'iu'),
  );

  const genericMatches = [
    ...text.matchAll(new RegExp(`\\b${NUMBER_PATTERN}\\s*m\\b`, 'giu')),
  ];

  const match = explicitMatch ?? genericMatches.at(-1);

  if (match) {
    const value = parseLocalizedNumber(match[1]);
    if (value !== undefined && value > 0) {
      return { value, source: 'dictated' };
    }
  }

  return { value: DEFAULT_LENGTH_M, source: 'default' };
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

function getMissingFields(
  data: HeaHebWStructuredData,
): HeaHebWMissingField[] {
  const missing: HeaHebWMissingField[] = [];

  if (data.quantity === undefined) missing.push('quantity');
  if (data.nominalSizeMm === undefined) missing.push('nominalSizeMm');
  if (
    (data.canonicalType === 'W (H)' || data.canonicalType === 'W (I)') &&
    data.designationKgM === undefined
  ) {
    missing.push('designationKgM');
  }
  if (data.price === undefined) missing.push('price');

  return missing;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
}

function findCatalogMatches(data: HeaHebWStructuredData): CatalogEntry[] {
  if (data.nominalSizeMm === undefined) return [];

  return CATALOG.filter((candidate) => {
    if (candidate.canonicalType !== data.canonicalType) return false;
    if (!nearlyEqual(candidate.nominalSizeMm, data.nominalSizeMm!)) return false;

    if (data.canonicalType === 'HEA' || data.canonicalType === 'HEB') {
      return true;
    }

    if (data.designationKgM === undefined) return true;

    if (
      candidate.designationKgM === undefined ||
      !nearlyEqual(candidate.designationKgM, data.designationKgM)
    ) {
      return false;
    }

    if (data.requestedShapeCode && candidate.shapeCode !== data.requestedShapeCode) {
      return false;
    }

    return true;
  });
}

/**
 * ETAPA 4 · HEA / HEB / W
 *
 * HEA y HEB se resuelven por su medida nominal. Las familias W (H) y W (I)
 * se resuelven por los dos valores de designación de la tabla (por ejemplo
 * W 200 x 52,0). El segundo valor es parte del nombre de la variante y no se
 * utiliza como sustituto de masa nominal: la masa real siempre proviene de
 * PRODUCTOS_PROVEEDOR.
 *
 * No calcula peso, subtotal ni importe.
 */
export function parseHeaHebWVoiceCommand(
  normalizedText: string,
): HeaHebWVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (
    identification.status !== 'matched' ||
    !isHeaHebWType(identification.canonicalType)
  ) {
    return {
      status: 'not-applicable',
      missingFields: [],
      issues: [],
      candidateProductIds: [],
    };
  }

  const canonicalType = identification.canonicalType;
  const length = extractLength(normalizedText);
  const price = extractPrice(normalizedText);
  const wDesignation =
    canonicalType === 'W (H)' || canonicalType === 'W (I)'
      ? extractWDesignation(normalizedText, canonicalType)
      : undefined;

  const data: HeaHebWStructuredData = {
    canonicalType,
    quantity: extractQuantity(normalizedText, canonicalType),
    nominalSizeMm:
      wDesignation?.nominalSizeMm ??
      extractNominalSize(normalizedText, canonicalType),
    designationKgM: wDesignation?.designationKgM,
    requestedShapeCode: wDesignation?.requestedShapeCode,
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

  const hasEnoughVariantData =
    data.nominalSizeMm !== undefined &&
    (canonicalType === 'HEA' ||
      canonicalType === 'HEB' ||
      data.designationKgM !== undefined);

  if (hasEnoughVariantData && catalogMatches.length === 0) {
    const designationText =
      canonicalType === 'W (H)' || canonicalType === 'W (I)'
        ? `${data.nominalSizeMm} x ${data.designationKgM}`
        : `${data.nominalSizeMm}`;

    issues.push(
      `La variante ${canonicalType} ${designationText} no existe en la tabla maestra.`,
    );

    return {
      status: 'variant-not-found',
      data,
      missingFields,
      issues,
      candidateProductIds,
    };
  }

  if (hasEnoughVariantData && catalogMatches.length > 1) {
    issues.push(
      `Más de una variante de ${canonicalType} coincide con la designación dictada.`,
    );

    return {
      status: 'variant-ambiguous',
      data,
      missingFields,
      issues,
      candidateProductIds,
    };
  }

  if (missingFields.length > 0 || issues.length > 0) {
    return {
      status: 'incomplete',
      data,
      missingFields,
      issues,
      candidateProductIds,
    };
  }

  return {
    status: 'matched',
    data,
    missingFields,
    issues,
    candidateProductIds,
  };
}
