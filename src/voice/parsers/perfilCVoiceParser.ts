import { PRODUCTOS_PROVEEDOR } from '../../data/productosProveedor';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';

export type PerfilCMissingField =
  | 'quantity'
  | 'heightMm'
  | 'flangeMm'
  | 'lipMm'
  | 'thicknessMm'
  | 'price';

export interface PerfilCStructuredData {
  canonicalType: 'Perfil C';
  quantity?: number;
  heightMm?: number;
  flangeMm?: number;
  lipMm?: number;
  thicknessMm?: number;
  lengthM: number;
  lengthSource: 'dictated' | 'default';
  price?: number;
  priceUnit: 'USD_KG';
  productId?: string;
  productDescription?: string;
  massNominalKgM?: number;
}

export type PerfilCParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched'
  | 'variant-not-found'
  | 'variant-ambiguous';

export interface PerfilCVoiceParseResult {
  status: PerfilCParseStatus;
  data?: PerfilCStructuredData;
  missingFields: PerfilCMissingField[];
  issues: string[];
  candidateProductIds: string[];
}

interface PerfilCCatalogDimensions {
  productId: string;
  description: string;
  massNominalKgM: number;
  heightMm: number;
  flangeMm: number;
  lipMm: number;
  thicknessMm: number;
}

const DEFAULT_LENGTH_M = 12;
const NUMBER_PATTERN = '(\\d+(?:,\\d+)?)';
const PERFIL_C_ALIAS_PATTERN = '(?:perfil(?:es)?\\s+C|canal\\s+(?:C|ce))';

function parseLocalizedNumber(value: string): number | undefined {
  const normalized = value.replace(',', '.');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
}

function parseCatalogPerfilC(): PerfilCCatalogDimensions[] {
  return PRODUCTOS_PROVEEDOR
    .filter((product) => product.tipo === 'Perfil C')
    .flatMap((product) => {
      const match = product.descripcion.match(
        /^Perfil C\s+(\d+(?:\.\d+)?)\s+x\s+(\d+(?:\.\d+)?)\s+x\s+(\d+(?:\.\d+)?)\s+x\s+(\d+(?:\.\d+)?)$/u,
      );

      if (!match) return [];

      const heightMm = Number(match[1]);
      const flangeMm = Number(match[2]);
      const lipMm = Number(match[3]);
      const thicknessMm = Number(match[4]);

      if (
        !Number.isFinite(heightMm) ||
        !Number.isFinite(flangeMm) ||
        !Number.isFinite(lipMm) ||
        !Number.isFinite(thicknessMm)
      ) {
        return [];
      }

      return [
        {
          productId: product.id,
          description: product.descripcion,
          massNominalKgM: product.masaNominal,
          heightMm,
          flangeMm,
          lipMm,
          thicknessMm,
        },
      ];
    });
}

const PERFIL_C_CATALOG = parseCatalogPerfilC();

function extractQuantity(text: string): number | undefined {
  const match = text.match(
    new RegExp(`\\b(\\d+)\\s+${PERFIL_C_ALIAS_PATTERN}\\b`, 'iu'),
  );

  if (!match) return undefined;

  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

function extractDimensions(text: string): {
  heightMm?: number;
  flangeMm?: number;
  lipMm?: number;
} {
  const match = text.match(
    new RegExp(
      `\\b${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\b`,
      'iu',
    ),
  );

  if (!match) return {};

  return {
    heightMm: parseLocalizedNumber(match[1]),
    flangeMm: parseLocalizedNumber(match[2]),
    lipMm: parseLocalizedNumber(match[3]),
  };
}

function extractThickness(text: string): number | undefined {
  const match = text.match(
    new RegExp(`\\bespesor\\s+${NUMBER_PATTERN}\\s*mm\\b`, 'iu'),
  );

  return match ? parseLocalizedNumber(match[1]) : undefined;
}

function extractLength(text: string): {
  value: number;
  source: 'dictated' | 'default';
} {
  const explicitMatch = text.match(
    new RegExp(`\\blargo\\s+${NUMBER_PATTERN}\\s*m\\b`, 'iu'),
  );

  const genericMatch = text.match(
    new RegExp(`\\b${NUMBER_PATTERN}\\s*m\\b`, 'iu'),
  );

  const match = explicitMatch ?? genericMatch;

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

  return {
    value: parseLocalizedNumber(match[1]),
    unit:
      match[2].toLocaleLowerCase('es-AR') === 'und'
        ? 'Und'
        : (match[2].toLocaleLowerCase('es-AR') as 'kg' | 'm'),
  };
}

function getMissingFields(
  data: PerfilCStructuredData,
): PerfilCMissingField[] {
  const missing: PerfilCMissingField[] = [];

  if (data.quantity === undefined) missing.push('quantity');
  if (data.heightMm === undefined) missing.push('heightMm');
  if (data.flangeMm === undefined) missing.push('flangeMm');
  if (data.lipMm === undefined) missing.push('lipMm');
  if (data.thicknessMm === undefined) missing.push('thicknessMm');
  if (data.price === undefined) missing.push('price');

  return missing;
}

function findCatalogMatches(
  data: PerfilCStructuredData,
): PerfilCCatalogDimensions[] {
  if (
    data.heightMm === undefined ||
    data.flangeMm === undefined ||
    data.lipMm === undefined ||
    data.thicknessMm === undefined
  ) {
    return [];
  }

  return PERFIL_C_CATALOG.filter(
    (candidate) =>
      approximatelyEqual(candidate.heightMm, data.heightMm as number) &&
      approximatelyEqual(candidate.flangeMm, data.flangeMm as number) &&
      approximatelyEqual(candidate.lipMm, data.lipMm as number) &&
      approximatelyEqual(candidate.thicknessMm, data.thicknessMm as number),
  );
}

/**
 * ETAPA 4 · Perfil C
 *
 * Extrae datos estructurados desde el texto ya normalizado y selecciona la
 * variante exacta exclusivamente contra PRODUCTOS_PROVEEDOR.
 *
 * No calcula peso, masa, subtotal ni importe. La masa nominal que se expone
 * proviene de la tabla maestra de productos, no de una fórmula de voz.
 */
export function parsePerfilCVoiceCommand(
  normalizedText: string,
): PerfilCVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (
    identification.status !== 'matched' ||
    identification.canonicalType !== 'Perfil C'
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

  const data: PerfilCStructuredData = {
    canonicalType: 'Perfil C',
    quantity: extractQuantity(normalizedText),
    heightMm: dimensions.heightMm,
    flangeMm: dimensions.flangeMm,
    lipMm: dimensions.lipMm,
    thicknessMm: extractThickness(normalizedText),
    lengthM: length.value,
    lengthSource: length.source,
    price: price.unit === 'kg' ? price.value : undefined,
    priceUnit: 'USD_KG',
  };

  const issues: string[] = [];

  if (price.value !== undefined && price.unit !== 'kg') {
    issues.push('Perfil C debe cotizarse en USD/kg.');
  }

  const missingFields = getMissingFields(data);
  const hasCompleteVariantData =
    data.heightMm !== undefined &&
    data.flangeMm !== undefined &&
    data.lipMm !== undefined &&
    data.thicknessMm !== undefined;

  const catalogMatches = findCatalogMatches(data);
  const candidateProductIds = catalogMatches.map(
    (candidate) => candidate.productId,
  );

  if (catalogMatches.length === 1) {
    const exact = catalogMatches[0];
    data.productId = exact.productId;
    data.productDescription = exact.description;
    data.massNominalKgM = exact.massNominalKgM;
  }

  if (hasCompleteVariantData && catalogMatches.length === 0) {
    issues.push(
      'La combinación de medidas y espesor no existe en la tabla maestra de Perfil C.',
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
    issues.push(
      'Más de una variante de Perfil C coincide con las medidas dictadas.',
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
