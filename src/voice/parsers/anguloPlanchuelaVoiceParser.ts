import { PRODUCTOS_PROVEEDOR } from '../../data/productosProveedor';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';

export type AnguloPlanchuelaCanonicalType =
  | 'Ángulo alas iguales'
  | 'Planchuela';

export type AnguloPlanchuelaMissingField =
  | 'quantity'
  | 'sizeInches'
  | 'thicknessInches'
  | 'price';

export interface AnguloPlanchuelaStructuredData {
  canonicalType: AnguloPlanchuelaCanonicalType;
  quantity?: number;
  sizeInches?: number;
  thicknessInches?: number;
  lengthM: number;
  lengthSource: 'dictated' | 'default';
  price?: number;
  priceUnit: 'USD_KG';
  productId?: string;
  productDescription?: string;
  massNominalKgM?: number;
}

export type AnguloPlanchuelaParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched'
  | 'variant-not-found'
  | 'variant-ambiguous';

export interface AnguloPlanchuelaVoiceParseResult {
  status: AnguloPlanchuelaParseStatus;
  data?: AnguloPlanchuelaStructuredData;
  missingFields: AnguloPlanchuelaMissingField[];
  issues: string[];
  candidateProductIds: string[];
}

interface CatalogEntry {
  canonicalType: AnguloPlanchuelaCanonicalType;
  productId: string;
  description: string;
  sizeInches: number;
  thicknessInches: number;
  massNominalKgM: number;
}

const DEFAULT_LENGTH_M = 12;
const NUMBER_PATTERN = '(\\d+(?:,\\d+)?)';

const TYPE_PATTERNS: Record<AnguloPlanchuelaCanonicalType, string> = {
  'Ángulo alas iguales':
    '(?:(?:perfil(?:es)?\\s+)?(?:ángulo|angulo)(?:s)?(?:\\s+alas\\s+iguales)?)',
  Planchuela: 'planchuela(?:s)?',
};

const DENOMINATOR_WORDS: Record<string, number> = {
  medio: 2,
  media: 2,
  medios: 2,
  medias: 2,
  cuarto: 4,
  cuartos: 4,
  octavo: 8,
  octavos: 8,
  dieciseisavo: 16,
  dieciseisavos: 16,
  'dieciséisavo': 16,
  'dieciséisavos': 16,
};

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
}

function parseSimpleFraction(value: string): number | undefined {
  const match = value.match(/^(\d+)\s*\/\s*(\d+)$/u);
  if (!match) return undefined;

  const numerator = Number(match[1]);
  const denominator = Number(match[2]);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return undefined;
  }

  return numerator / denominator;
}

function parseSpokenFraction(value: string): number | undefined {
  const normalized = value
    .toLocaleLowerCase('es-AR')
    .replace(/[“”″']/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  const simple = parseSimpleFraction(normalized);
  if (simple !== undefined) return simple;

  const onlyWordDenominator = DENOMINATOR_WORDS[normalized];
  if (onlyWordDenominator !== undefined) {
    return 1 / onlyWordDenominator;
  }

  const wordFraction = normalized.match(
    /^(\d+)\s+(medio|media|medios|medias|cuarto|cuartos|octavo|octavos|dieciseisavo|dieciseisavos|dieciséisavo|dieciséisavos)$/u,
  );

  if (wordFraction) {
    const numerator = Number(wordFraction[1]);
    const denominator = DENOMINATOR_WORDS[wordFraction[2]];

    if (Number.isFinite(numerator) && denominator) {
      return numerator / denominator;
    }
  }

  return undefined;
}

function parseInchExpression(value: string): number | undefined {
  let normalized = value
    .toLocaleLowerCase('es-AR')
    .replace(/[“”″]/gu, '"')
    .replace(/\bpulgadas?\b/gu, ' ')
    .replace(/"/gu, ' ')
    .replace(/^\s*de\s+/u, '')
    .replace(/\s+de\s*$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!normalized) return undefined;

  // Corrige descripciones históricas como "31/2" que significan 3 1/2".
  const compactMixed = normalized.match(/^(\d)(\d)\s*\/\s*(\d+)$/u);
  if (compactMixed) {
    const whole = Number(compactMixed[1]);
    const numerator = Number(compactMixed[2]);
    const denominator = Number(compactMixed[3]);

    if (denominator > 0 && numerator < denominator) {
      return whole + numerator / denominator;
    }
  }

  const mixedSlash = normalized.match(/^(\d+)\s+(\d+\s*\/\s*\d+)$/u);
  if (mixedSlash) {
    const whole = Number(mixedSlash[1]);
    const fraction = parseSimpleFraction(mixedSlash[2]);

    if (Number.isFinite(whole) && fraction !== undefined) {
      return whole + fraction;
    }
  }

  const withY = normalized.match(/^(\d+(?:,\d+)?)\s+y\s+(.+)$/u);
  if (withY) {
    const whole = parseLocalizedNumber(withY[1]);
    const fraction = parseSpokenFraction(withY[2]);

    if (whole !== undefined && fraction !== undefined) {
      return whole + fraction;
    }
  }

  const fraction = parseSpokenFraction(normalized);
  if (fraction !== undefined) return fraction;

  // Caso de tabla "2 1/4" después de quitar comillas.
  const spacedFraction = normalized.match(/^(\d+)\s+(\d+)\s+(cuarto|cuartos|octavo|octavos|dieciseisavo|dieciseisavos|dieciséisavo|dieciséisavos)$/u);
  if (spacedFraction) {
    const whole = Number(spacedFraction[1]);
    const numerator = Number(spacedFraction[2]);
    const denominator = DENOMINATOR_WORDS[spacedFraction[3]];

    if (Number.isFinite(whole) && denominator) {
      return whole + numerator / denominator;
    }
  }

  normalized = normalized.replace(/\s+/gu, '');
  return parseLocalizedNumber(normalized);
}

function parseCatalog(): CatalogEntry[] {
  return PRODUCTOS_PROVEEDOR.flatMap((product) => {
    if (
      product.tipo !== 'Ángulo alas iguales' &&
      product.tipo !== 'Planchuela'
    ) {
      return [];
    }

    const prefix = `${product.tipo} `;
    if (!product.descripcion.startsWith(prefix)) return [];

    const measures = product.descripcion.slice(prefix.length);
    const parts = measures.split(/\s+x\s+/u);
    if (parts.length !== 2) return [];

    const sizeInches = parseInchExpression(parts[0]);
    const thicknessInches = parseInchExpression(parts[1]);

    if (sizeInches === undefined || thicknessInches === undefined) {
      return [];
    }

    return [
      {
        canonicalType: product.tipo,
        productId: product.id,
        description: product.descripcion,
        sizeInches,
        thicknessInches,
        massNominalKgM: product.masaNominal,
      },
    ];
  });
}

const CATALOG = parseCatalog();

function isApplicableType(
  value: string,
): value is AnguloPlanchuelaCanonicalType {
  return value === 'Ángulo alas iguales' || value === 'Planchuela';
}

function extractQuantity(
  text: string,
  canonicalType: AnguloPlanchuelaCanonicalType,
): number | undefined {
  const pattern = TYPE_PATTERNS[canonicalType];
  const match = text.match(
    new RegExp(`\\b(\\d+)\\s+${pattern}(?=\\s|$)`, 'iu'),
  );

  if (!match) return undefined;

  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

function extractImperialDimensions(
  text: string,
  canonicalType: AnguloPlanchuelaCanonicalType,
): { sizeInches?: number; thicknessInches?: number } {
  const pattern = TYPE_PATTERNS[canonicalType];
  const typeMatch = new RegExp(`${pattern}(?=\\s|$)`, 'iu').exec(text);

  if (!typeMatch || typeMatch.index === undefined) return {};

  let tail = text.slice(typeMatch.index + typeMatch[0].length).trim();
  tail = tail.replace(/^de\s+/iu, '');

  // El largo y el precio pertenecen al pedido, no a la sección de la variante.
  tail = tail.replace(
    /\s+(?:(?:largo\s+)?\d+(?:,\d+)?\s*m\b|(?:a|precio)\s+\d).*$/iu,
    '',
  );
  tail = tail.replace(/\s+de\s*$/iu, '').trim();

  const separator = /\s+(?:x|por)\s+/iu.exec(tail);
  if (!separator || separator.index === undefined) return {};

  const left = tail.slice(0, separator.index).trim();
  const right = tail
    .slice(separator.index + separator[0].length)
    .replace(/\s+de\s*$/iu, '')
    .trim();

  return {
    sizeInches: parseInchExpression(left),
    thicknessInches: parseInchExpression(right),
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
  data: AnguloPlanchuelaStructuredData,
): AnguloPlanchuelaMissingField[] {
  const missing: AnguloPlanchuelaMissingField[] = [];

  if (data.quantity === undefined) missing.push('quantity');
  if (data.sizeInches === undefined) missing.push('sizeInches');
  if (data.thicknessInches === undefined) missing.push('thicknessInches');
  if (data.price === undefined) missing.push('price');

  return missing;
}

function findCatalogMatches(
  data: AnguloPlanchuelaStructuredData,
): CatalogEntry[] {
  if (data.sizeInches === undefined || data.thicknessInches === undefined) {
    return [];
  }

  return CATALOG.filter(
    (candidate) =>
      candidate.canonicalType === data.canonicalType &&
      nearlyEqual(candidate.sizeInches, data.sizeInches!) &&
      nearlyEqual(candidate.thicknessInches, data.thicknessInches!),
  );
}

export function formatInches(value: number | undefined): string {
  if (value === undefined) return 'faltante';

  const whole = Math.floor(value + 0.000001);
  const fraction = value - whole;
  const sixteenths = Math.round(fraction * 16);

  if (sixteenths === 0) return `${whole}"`;
  if (sixteenths === 16) return `${whole + 1}"`;

  const gcd = (left: number, right: number): number => {
    let a = left;
    let b = right;
    while (b !== 0) {
      const next = a % b;
      a = b;
      b = next;
    }
    return Math.abs(a);
  };

  const divisor = gcd(sixteenths, 16);
  const numerator = sixteenths / divisor;
  const denominator = 16 / divisor;
  const fractionText = `${numerator}/${denominator}"`;

  return whole > 0 ? `${whole} ${fractionText}` : fractionText;
}

/**
 * ETAPA 4 · Ángulo alas iguales / Planchuela
 *
 * Resuelve medidas imperiales contra las descripciones reales de la tabla
 * maestra. Tolera tanto fracciones escritas (2 x 1/4) como formas habituales
 * de dictado ya normalizadas parcialmente (2 pulgadas por 1 cuarto).
 *
 * No calcula peso, subtotal ni importe.
 */
export function parseAnguloPlanchuelaVoiceCommand(
  normalizedText: string,
): AnguloPlanchuelaVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (
    identification.status !== 'matched' ||
    !isApplicableType(identification.canonicalType)
  ) {
    return {
      status: 'not-applicable',
      missingFields: [],
      issues: [],
      candidateProductIds: [],
    };
  }

  const canonicalType = identification.canonicalType;
  const dimensions = extractImperialDimensions(normalizedText, canonicalType);
  const length = extractLength(normalizedText);
  const price = extractPrice(normalizedText);

  const data: AnguloPlanchuelaStructuredData = {
    canonicalType,
    quantity: extractQuantity(normalizedText, canonicalType),
    sizeInches: dimensions.sizeInches,
    thicknessInches: dimensions.thicknessInches,
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

  if (
    data.sizeInches !== undefined &&
    data.thicknessInches !== undefined &&
    catalogMatches.length === 0
  ) {
    issues.push(
      `La variante ${canonicalType} ${formatInches(data.sizeInches)} x ${formatInches(data.thicknessInches)} no existe en la tabla maestra.`,
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
      `Más de una variante de ${canonicalType} coincide con las medidas dictadas.`,
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
