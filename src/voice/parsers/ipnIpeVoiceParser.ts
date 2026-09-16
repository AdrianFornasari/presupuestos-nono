import { PRODUCTOS_PROVEEDOR } from '../../data/productosProveedor';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';

export type IpnIpeCanonicalType = 'IPN' | 'IPE';

export type IpnIpeMissingField =
  | 'quantity'
  | 'nominalSizeMm'
  | 'price';

export interface IpnIpeStructuredData {
  canonicalType: IpnIpeCanonicalType;
  quantity?: number;
  nominalSizeMm?: number;
  lengthM: number;
  lengthSource: 'dictated' | 'default';
  price?: number;
  priceUnit: 'USD_KG';
  productId?: string;
  productDescription?: string;
  massNominalKgM?: number;
}

export type IpnIpeParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched'
  | 'variant-not-found'
  | 'variant-ambiguous';

export interface IpnIpeVoiceParseResult {
  status: IpnIpeParseStatus;
  data?: IpnIpeStructuredData;
  missingFields: IpnIpeMissingField[];
  issues: string[];
  candidateProductIds: string[];
}

interface CatalogEntry {
  canonicalType: IpnIpeCanonicalType;
  productId: string;
  description: string;
  nominalSizeMm: number;
  massNominalKgM: number;
}

const DEFAULT_LENGTH_M = 12;
const NUMBER_PATTERN = '(\\d+(?:,\\d+)?)';

const TYPE_PATTERNS: Record<IpnIpeCanonicalType, string> = {
  IPN: '(?:perfil(?:es)?\\s+)?IPN',
  IPE: '(?:perfil(?:es)?\\s+)?IPE',
};

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isIpnIpeType(value: string): value is IpnIpeCanonicalType {
  return value === 'IPN' || value === 'IPE';
}

function parseCatalog(): CatalogEntry[] {
  return PRODUCTOS_PROVEEDOR.flatMap((product) => {
    if (!isIpnIpeType(product.tipo)) return [];

    const match = product.descripcion.match(
      /^(IPN|IPE)\s+(\d+(?:\.\d+)?)$/u,
    );

    if (!match || match[1] !== product.tipo) return [];

    const nominalSizeMm = Number(match[2]);

    if (!Number.isFinite(nominalSizeMm)) return [];

    return [
      {
        canonicalType: product.tipo,
        productId: product.id,
        description: product.descripcion,
        nominalSizeMm,
        massNominalKgM: product.masaNominal,
      },
    ];
  });
}

const CATALOG = parseCatalog();

function extractQuantity(
  text: string,
  canonicalType: IpnIpeCanonicalType,
): number | undefined {
  const pattern = TYPE_PATTERNS[canonicalType];
  const match = text.match(
    new RegExp(`\\b(\\d+)\\s+${pattern}\\b`, 'iu'),
  );

  if (!match) return undefined;

  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

function extractNominalSize(
  text: string,
  canonicalType: IpnIpeCanonicalType,
): number | undefined {
  const pattern = TYPE_PATTERNS[canonicalType];
  const match = text.match(
    new RegExp(
      `\\b${pattern}(?:\\s+(?:de|numero|número))?\\s+${NUMBER_PATTERN}(?=\\s|$)`,
      'iu',
    ),
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
  data: IpnIpeStructuredData,
): IpnIpeMissingField[] {
  const missing: IpnIpeMissingField[] = [];

  if (data.quantity === undefined) missing.push('quantity');
  if (data.nominalSizeMm === undefined) missing.push('nominalSizeMm');
  if (data.price === undefined) missing.push('price');

  return missing;
}

function findCatalogMatches(
  canonicalType: IpnIpeCanonicalType,
  nominalSizeMm: number | undefined,
): CatalogEntry[] {
  if (nominalSizeMm === undefined) return [];

  return CATALOG.filter(
    (candidate) =>
      candidate.canonicalType === canonicalType &&
      Math.abs(candidate.nominalSizeMm - nominalSizeMm) < 0.0001,
  );
}

/**
 * ETAPA 4 · IPN / IPE
 *
 * Extrae cantidad, medida nominal, largo y precio desde el texto normalizado y
 * resuelve la variante exacta exclusivamente contra PRODUCTOS_PROVEEDOR.
 *
 * No calcula peso, subtotal ni importe. La masa nominal expuesta proviene de la
 * tabla maestra y queda disponible para la lógica determinística existente.
 */
export function parseIpnIpeVoiceCommand(
  normalizedText: string,
): IpnIpeVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (
    identification.status !== 'matched' ||
    !isIpnIpeType(identification.canonicalType)
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

  const data: IpnIpeStructuredData = {
    canonicalType,
    quantity: extractQuantity(normalizedText, canonicalType),
    nominalSizeMm: extractNominalSize(normalizedText, canonicalType),
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
  const catalogMatches = findCatalogMatches(
    canonicalType,
    data.nominalSizeMm,
  );
  const candidateProductIds = catalogMatches.map(
    (candidate) => candidate.productId,
  );

  if (catalogMatches.length === 1) {
    const exact = catalogMatches[0];
    data.productId = exact.productId;
    data.productDescription = exact.description;
    data.massNominalKgM = exact.massNominalKgM;
  }

  if (data.nominalSizeMm !== undefined && catalogMatches.length === 0) {
    issues.push(
      `La medida ${data.nominalSizeMm} no existe en la tabla maestra de ${canonicalType}.`,
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
      `Más de una variante de ${canonicalType} coincide con la medida dictada.`,
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
