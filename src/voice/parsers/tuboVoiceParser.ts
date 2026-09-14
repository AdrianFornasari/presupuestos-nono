import { identifyVoiceProduct } from '../products/productVoiceDictionary';

export type TuboCanonicalType =
  | 'Tubo redondo'
  | 'Tubo cuadrado'
  | 'Tubo rectangular';

export type TuboCalculatorShape =
  | 'tubo-redondo'
  | 'tubo-cuadrado'
  | 'tubo-rectangular';

export type TuboMissingField =
  | 'quantity'
  | 'diameterMm'
  | 'sideMm'
  | 'widthMm'
  | 'heightMm'
  | 'thicknessMm'
  | 'price';

export interface TuboStructuredData {
  canonicalType: TuboCanonicalType;
  calculatorShape: TuboCalculatorShape;
  quantity?: number;
  diameterMm?: number;
  sideMm?: number;
  widthMm?: number;
  heightMm?: number;
  thicknessMm?: number;
  lengthM: number;
  lengthSource: 'dictated' | 'default';
  price?: number;
  priceUnit: 'USD_KG';
  calculatorValues: {
    diametroExteriorMm?: number;
    ladoExteriorMm?: number;
    anchoExteriorMm?: number;
    altoExteriorMm?: number;
    espesorTuboMm?: number;
    largoMm: number;
  };
}

export type TuboParseStatus =
  | 'not-applicable'
  | 'incomplete'
  | 'matched'
  | 'invalid-geometry';

export interface TuboVoiceParseResult {
  status: TuboParseStatus;
  data?: TuboStructuredData;
  missingFields: TuboMissingField[];
  issues: string[];
}

const DEFAULT_LENGTH_M = 12;
const NUMBER_PATTERN = '(\\d+(?:,\\d+)?)';

const PRODUCT_ALIAS_PATTERNS: Record<TuboCanonicalType, string> = {
  'Tubo redondo':
    '(?:tubo(?:s)?\\s+redondo(?:s)?|cañ(?:o|os)\\s+redondo(?:s)?)',
  'Tubo cuadrado':
    '(?:tubo(?:s)?\\s+cuadrado(?:s)?|cañ(?:o|os)\\s+cuadrado(?:s)?)',
  'Tubo rectangular':
    '(?:tubo(?:s)?\\s+rectangular(?:es)?|cañ(?:o|os)\\s+rectangular(?:es)?)',
};

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isTuboCanonicalType(value: string): value is TuboCanonicalType {
  return (
    value === 'Tubo redondo' ||
    value === 'Tubo cuadrado' ||
    value === 'Tubo rectangular'
  );
}

function shapeForType(type: TuboCanonicalType): TuboCalculatorShape {
  if (type === 'Tubo redondo') return 'tubo-redondo';
  if (type === 'Tubo cuadrado') return 'tubo-cuadrado';
  return 'tubo-rectangular';
}

function extractQuantity(
  text: string,
  canonicalType: TuboCanonicalType,
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

function extractLength(text: string): {
  value: number;
  source: 'dictated' | 'default';
} {
  const explicitMatch = text.match(
    new RegExp(`\\blargo\\s+${NUMBER_PATTERN}\\s*m\\b`, 'iu'),
  );

  const genericMatches = [...text.matchAll(
    new RegExp(`\\b${NUMBER_PATTERN}\\s*m\\b`, 'giu'),
  )];

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

function extractExplicitThickness(text: string): number | undefined {
  const match = text.match(
    new RegExp(`\\bespesor\\s+${NUMBER_PATTERN}\\s*mm\\b`, 'iu'),
  );

  return match ? parseLocalizedNumber(match[1]) : undefined;
}

function extractRedondoDimensions(text: string): {
  diameterMm?: number;
  thicknessMm?: number;
} {
  const explicitDiameter = text.match(
    new RegExp(`\\bdi[aá]metro(?:\\s+exterior)?\\s+${NUMBER_PATTERN}(?:\\s*mm)?\\b`, 'iu'),
  );

  const aliasPattern = PRODUCT_ALIAS_PATTERNS['Tubo redondo'];

  const dimensionsAfterAlias = text.match(
    new RegExp(
      `\\b${aliasPattern}(?:\\s+de)?\\s+${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\b`,
      'iu',
    ),
  );

  const singleAfterAlias = text.match(
    new RegExp(
      `\\b${aliasPattern}(?:\\s+de)?\\s+${NUMBER_PATTERN}(?:\\s*mm)?(?=\\s+(?:espesor|largo|a|precio)|$)`,
      'iu',
    ),
  );

  const thicknessExplicit = extractExplicitThickness(text);

  if (dimensionsAfterAlias) {
    return {
      diameterMm: parseLocalizedNumber(dimensionsAfterAlias[1]),
      thicknessMm:
        thicknessExplicit ?? parseLocalizedNumber(dimensionsAfterAlias[2]),
    };
  }

  return {
    diameterMm:
      (explicitDiameter && parseLocalizedNumber(explicitDiameter[1])) ||
      (singleAfterAlias && parseLocalizedNumber(singleAfterAlias[1])) ||
      undefined,
    thicknessMm: thicknessExplicit,
  };
}

function extractCuadradoDimensions(text: string): {
  sideMm?: number;
  thicknessMm?: number;
  sidePair?: [number, number];
} {
  const aliasPattern = PRODUCT_ALIAS_PATTERNS['Tubo cuadrado'];
  const triple = text.match(
    new RegExp(
      `\\b${aliasPattern}(?:\\s+de)?\\s+${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\b`,
      'iu',
    ),
  );

  const pair = text.match(
    new RegExp(
      `\\b${aliasPattern}(?:\\s+de)?\\s+${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\b`,
      'iu',
    ),
  );

  const explicitThickness = extractExplicitThickness(text);

  if (triple) {
    const first = parseLocalizedNumber(triple[1]);
    const second = parseLocalizedNumber(triple[2]);
    const thickness =
      explicitThickness ?? parseLocalizedNumber(triple[3]);

    return {
      sideMm: first,
      thicknessMm: thickness,
      sidePair:
        first !== undefined && second !== undefined
          ? [first, second]
          : undefined,
    };
  }

  if (pair) {
    const first = parseLocalizedNumber(pair[1]);
    const second = parseLocalizedNumber(pair[2]);

    return {
      sideMm: first,
      thicknessMm: explicitThickness ?? second,
      sidePair:
        explicitThickness !== undefined &&
        first !== undefined &&
        second !== undefined
          ? [first, second]
          : undefined,
    };
  }

  const sideOnly = text.match(
    new RegExp(
      `\\b${aliasPattern}(?:\\s+de)?\\s+${NUMBER_PATTERN}(?:\\s*mm)?(?=\\s+(?:espesor|largo|a|precio)|$)`,
      'iu',
    ),
  );

  return {
    sideMm: sideOnly ? parseLocalizedNumber(sideOnly[1]) : undefined,
    thicknessMm: explicitThickness,
  };
}

function extractRectangularDimensions(text: string): {
  widthMm?: number;
  heightMm?: number;
  thicknessMm?: number;
} {
  const aliasPattern = PRODUCT_ALIAS_PATTERNS['Tubo rectangular'];
  const triple = text.match(
    new RegExp(
      `\\b${aliasPattern}(?:\\s+de)?\\s+${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\b`,
      'iu',
    ),
  );

  const pair = text.match(
    new RegExp(
      `\\b${aliasPattern}(?:\\s+de)?\\s+${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\b`,
      'iu',
    ),
  );

  const explicitThickness = extractExplicitThickness(text);

  if (triple) {
    return {
      widthMm: parseLocalizedNumber(triple[1]),
      heightMm: parseLocalizedNumber(triple[2]),
      thicknessMm:
        explicitThickness ?? parseLocalizedNumber(triple[3]),
    };
  }

  if (pair) {
    return {
      widthMm: parseLocalizedNumber(pair[1]),
      heightMm: parseLocalizedNumber(pair[2]),
      thicknessMm: explicitThickness,
    };
  }

  return {
    thicknessMm: explicitThickness,
  };
}

function missingFieldsFor(data: TuboStructuredData): TuboMissingField[] {
  const missing: TuboMissingField[] = [];

  if (data.quantity === undefined) missing.push('quantity');

  if (data.canonicalType === 'Tubo redondo') {
    if (data.diameterMm === undefined) missing.push('diameterMm');
  } else if (data.canonicalType === 'Tubo cuadrado') {
    if (data.sideMm === undefined) missing.push('sideMm');
  } else {
    if (data.widthMm === undefined) missing.push('widthMm');
    if (data.heightMm === undefined) missing.push('heightMm');
  }

  if (data.thicknessMm === undefined) missing.push('thicknessMm');
  if (data.price === undefined) missing.push('price');

  return missing;
}

function buildCalculatorValues(
  data: Omit<TuboStructuredData, 'calculatorValues'>,
): TuboStructuredData['calculatorValues'] {
  const base = {
    espesorTuboMm: data.thicknessMm,
    largoMm: data.lengthM * 1000,
  };

  if (data.canonicalType === 'Tubo redondo') {
    return {
      ...base,
      diametroExteriorMm: data.diameterMm,
    };
  }

  if (data.canonicalType === 'Tubo cuadrado') {
    return {
      ...base,
      ladoExteriorMm: data.sideMm,
    };
  }

  return {
    ...base,
    anchoExteriorMm: data.widthMm,
    altoExteriorMm: data.heightMm,
  };
}

function validateGeometry(
  data: TuboStructuredData,
  squarePair?: [number, number],
): string[] {
  const issues: string[] = [];

  if (data.lengthM <= 0) {
    issues.push('El largo debe ser mayor que 0.');
  }

  if (data.thicknessMm !== undefined && data.thicknessMm <= 0) {
    issues.push('El espesor debe ser mayor que 0.');
  }

  if (
    data.canonicalType === 'Tubo cuadrado' &&
    squarePair &&
    Math.abs(squarePair[0] - squarePair[1]) > 0.0001
  ) {
    issues.push(
      'Tubo cuadrado requiere lados exteriores iguales. Para lados distintos usá Tubo rectangular.',
    );
  }

  if (
    data.canonicalType === 'Tubo redondo' &&
    data.diameterMm !== undefined &&
    data.thicknessMm !== undefined &&
    data.thicknessMm * 2 >= data.diameterMm
  ) {
    issues.push(
      'El espesor debe ser menor que la mitad del diámetro exterior.',
    );
  }

  if (
    data.canonicalType === 'Tubo cuadrado' &&
    data.sideMm !== undefined &&
    data.thicknessMm !== undefined &&
    data.thicknessMm * 2 >= data.sideMm
  ) {
    issues.push(
      'El espesor debe ser menor que la mitad del lado exterior.',
    );
  }

  if (
    data.canonicalType === 'Tubo rectangular' &&
    data.widthMm !== undefined &&
    data.heightMm !== undefined &&
    data.thicknessMm !== undefined &&
    (data.thicknessMm * 2 >= data.widthMm ||
      data.thicknessMm * 2 >= data.heightMm)
  ) {
    issues.push(
      'El espesor debe ser menor que la mitad de ambos lados exteriores.',
    );
  }

  return issues;
}

/**
 * ETAPA 4 · Tubos
 *
 * Extrae únicamente datos estructurados compatibles con la calculadora de
 * metales existente. No calcula peso, masa, subtotal ni importe.
 */
export function parseTuboVoiceCommand(
  normalizedText: string,
): TuboVoiceParseResult {
  const identification = identifyVoiceProduct(normalizedText);

  if (
    identification.status !== 'matched' ||
    !isTuboCanonicalType(identification.canonicalType)
  ) {
    return {
      status: 'not-applicable',
      missingFields: [],
      issues: [],
    };
  }

  const canonicalType = identification.canonicalType;
  const length = extractLength(normalizedText);
  const price = extractPrice(normalizedText);

  let diameterMm: number | undefined;
  let sideMm: number | undefined;
  let widthMm: number | undefined;
  let heightMm: number | undefined;
  let thicknessMm: number | undefined;
  let squarePair: [number, number] | undefined;

  if (canonicalType === 'Tubo redondo') {
    const dimensions = extractRedondoDimensions(normalizedText);
    diameterMm = dimensions.diameterMm;
    thicknessMm = dimensions.thicknessMm;
  } else if (canonicalType === 'Tubo cuadrado') {
    const dimensions = extractCuadradoDimensions(normalizedText);
    sideMm = dimensions.sideMm;
    thicknessMm = dimensions.thicknessMm;
    squarePair = dimensions.sidePair;
  } else {
    const dimensions = extractRectangularDimensions(normalizedText);
    widthMm = dimensions.widthMm;
    heightMm = dimensions.heightMm;
    thicknessMm = dimensions.thicknessMm;
  }

  const baseData: Omit<TuboStructuredData, 'calculatorValues'> = {
    canonicalType,
    calculatorShape: shapeForType(canonicalType),
    quantity: extractQuantity(normalizedText, canonicalType),
    diameterMm,
    sideMm,
    widthMm,
    heightMm,
    thicknessMm,
    lengthM: length.value,
    lengthSource: length.source,
    price: price.unit === 'kg' ? price.value : undefined,
    priceUnit: 'USD_KG',
  };

  const data: TuboStructuredData = {
    ...baseData,
    calculatorValues: buildCalculatorValues(baseData),
  };

  const issues = validateGeometry(data, squarePair);

  if (price.value !== undefined && price.unit !== 'kg') {
    issues.push('Los tubos deben cotizarse en USD/kg.');
  }

  const missingFields = missingFieldsFor(data);

  if (issues.length > 0) {
    return {
      status: 'invalid-geometry',
      data,
      missingFields,
      issues,
    };
  }

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
    missingFields,
    issues,
  };
}
