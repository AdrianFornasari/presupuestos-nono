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

/**
 * Convierte expresiones imperiales habituales del catálogo y del dictado a
 * pulgadas decimales. Soporta 1/2, 1 1/2, "una pulgada y media" ya
 * normalizada como "1 1/2 pulgadas", y fracciones habladas como "3 octavos".
 */
export function parseInchExpression(value: string): number | undefined {
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

  // Corrige descripciones históricas del catálogo como "31/2" = 3 1/2".
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

  const spacedFraction = normalized.match(
    /^(\d+)\s+(\d+)\s+(cuarto|cuartos|octavo|octavos|dieciseisavo|dieciseisavos|dieciséisavo|dieciséisavos)$/u,
  );
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

export function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
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
