import { PRODUCTOS_PROVEEDOR } from '../../data/productosProveedor';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';

export type PerfilUMissingField =
  | 'quantity'
  | 'heightMm'
  | 'flangeMm'
  | 'thicknessMm'
  | 'price';

export interface PerfilUStructuredData {
  canonicalType: 'Perfil U';
  quantity?: number;
  heightMm?: number;
  flangeMm?: number;
  thicknessMm?: number;
  lengthM: number;
  lengthSource: 'dictated' | 'default';
  price?: number;
  priceUnit: 'USD_KG';
  productId?: string;
  productDescription?: string;
  massNominalKgM?: number;
}

export type PerfilUParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched'
  | 'variant-not-found'
  | 'variant-ambiguous';

export interface PerfilUVoiceParseResult {
  status: PerfilUParseStatus;
  data?: PerfilUStructuredData;
  missingFields: PerfilUMissingField[];
  issues: string[];
  candidateProductIds: string[];
}

interface CatalogEntry {
  productId: string;
  description: string;
  heightMm: number;
  flangeMm: number;
  thicknessMm: number;
  massNominalKgM: number;
}

const DEFAULT_LENGTH_M = 12;
const NUMBER_PATTERN = '(\\d+(?:,\\d+)?)';
const TYPE_PATTERN = '(?:perfil(?:es)?\\s+U|canal\\s+U)';

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
}

function parseCatalog(): CatalogEntry[] {
  return PRODUCTOS_PROVEEDOR.flatMap((product) => {
    if (product.tipo !== 'Perfil U') return [];

    const match = product.descripcion.match(
      /^Perfil U\s+(\d+(?:\.\d+)?)\s+x\s+(\d+(?:\.\d+)?)\s+x\s+(\d+(?:\.\d+)?)$/u,
    );

    if (!match) return [];

    const heightMm = Number(match[1]);
    const flangeMm = Number(match[2]);
    const thicknessMm = Number(match[3]);

    if (
      !Number.isFinite(heightMm) ||
      !Number.isFinite(flangeMm) ||
      !Number.isFinite(thicknessMm)
    ) {
      return [];
    }

    return [
      {
        productId: product.id,
        description: product.descripcion,
        heightMm,
        flangeMm,
        thicknessMm,
        massNominalKgM: product.masaNominal,
      },
    ];
  });
}

const CATALOG = parseCatalog();

function extractQuantity(text: string): number | undefined {
  const match = text.match(
    new RegExp(`\\b(\\d+)\\s+${TYPE_PATTERN}\\b`, 'iu'),
  );

  if (!match) return undefined;

  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

function extractDimensions(text: string): {
  heightMm?: number;
  flangeMm?: number;
  thicknessMm?: number;
} {
  const compact = text.match(
    new RegExp(
      `\\b${TYPE_PATTERN}(?:\\s+de)?\\s+${NUMBER_PATTERN}\\s+x\\s+${NUMBER_PATTERN}\\s+x\\s+${NUMBER_PATTERN}(?=\\s|$)`,
      'iu',
    ),
  );

  if (compact) {
    return {
      heightMm: parseLocalizedNumber(compact[1]),
      flangeMm: parseLocalizedNumber(compact[2]),
      thicknessMm: parseLocalizedNumber(compact[3]),
    };
  }

  const withThickness = text.match(
    new RegExp(
      `\\b${TYPE_PATTERN}(?:\\s+de)?\\s+${NUMBER_PATTERN}\\s+x\\s+${NUMBER_PATTERN}\\s+espesor\\s+${NUMBER_PATTERN}\\s*mm\\b`,
      'iu',
    ),
  );

  if (withThickness) {
    return {
      heightMm: parseLocalizedNumber(withThickness[1]),
      flangeMm: parseLocalizedNumber(withThickness[2]),
      thicknessMm: parseLocalizedNumber(withThickness[3]),
    };
  }

  const base = text.match(
    new RegExp(
      `\\b${TYPE_PATTERN}(?:\\s+de)?\\s+${NUMBER_PATTERN}\\s+x\\s+${NUMBER_PATTERN}(?=\\s|$)`,
      'iu',
    ),
  );
  const thickness = text.match(
    new RegExp(`\\bespesor\\s+${NUMBER_PATTERN}\\s*mm\\b`, 'iu'),
  );

  return {
    heightMm: base ? parseLocalizedNumber(base[1]) : undefined,
    flangeMm: base ? parseLocalizedNumber(base[2]) : undefined,
    thicknessMm: thickness ? parseLocalizedNumber(thickness[1]) : undefined,
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

function getMissingFields(data: PerfilUStructuredData): PerfilUMissingField[] {
  const missing: PerfilUMissingField[] = [];

  if (data.quantity === undefined) missing.push('quantity');
  if (data.heightMm === undefined) missing.push('heightMm');
  if (data.flangeMm === undefined) missing.push('flangeMm');
  if (data.thicknessMm === undefined) missing.push('thicknessMm');
  if (data.price === undefined) missing.push('price');

  return missing;
}

function findCatalogMatches(data: PerfilUStructuredData): CatalogEntry[] {
  if (
    data.heightMm === undefined ||
    data.flangeMm === undefined ||
    data.thicknessMm === undefined
  ) {
    return [];
  }

  return CATALOG.filter(
    (candidate) =>
      nearlyEqual(candidate.heightMm, data.heightMm!) &&
      nearlyEqual(candidate.flangeMm, data.flangeMm!) &&
      nearlyEqual(candidate.thicknessMm, data.thicknessMm!),
  );
}

/**
 * ETAPA 4 · Perfil U
 *
 * Extrae cantidad, alto, ala, espesor, largo y precio desde el texto
 * normalizado y resuelve la variante exacta sólo contra PRODUCTOS_PROVEEDOR.
 *
 * No calcula peso, subtotal ni importe.
 */
export function parsePerfilUVoiceCommand(
  normalizedText: string,
): PerfilUVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (
    identification.status !== 'matched' ||
    identification.canonicalType !== 'Perfil U'
  ) {
    return {
      status: 'not-applicable',
      missingFields: [],
      issues: [],
      candidateProductIds: [],
    };
  }

  const dimensions = extractDimensions(normalizedText);
  const length = extractLength(normalizedText);
  const price = extractPrice(normalizedText);

  const data: PerfilUStructuredData = {
    canonicalType: 'Perfil U',
    quantity: extractQuantity(normalizedText),
    heightMm: dimensions.heightMm,
    flangeMm: dimensions.flangeMm,
    thicknessMm: dimensions.thicknessMm,
    lengthM: length.value,
    lengthSource: length.source,
    price: price.unit === 'kg' ? price.value : undefined,
    priceUnit: 'USD_KG',
  };

  const issues: string[] = [];

  if (price.value !== undefined && price.unit !== 'kg') {
    issues.push('Perfil U debe cotizarse en USD/kg.');
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

  if (
    data.heightMm !== undefined &&
    data.flangeMm !== undefined &&
    data.thicknessMm !== undefined &&
    catalogMatches.length === 0
  ) {
    issues.push(
      `La variante Perfil U ${data.heightMm} x ${data.flangeMm} x ${data.thicknessMm} no existe en la tabla maestra.`,
    );

    return {
      status: 'variant-not-found',
      data,
      missingFields,
      issues,
      candidateProductIds,
    };
  }

  if (catalogMatches.length > 1) {
    issues.push('Más de una variante de Perfil U coincide con las medidas dictadas.');

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
