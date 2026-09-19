import { normalizeVoiceText } from '../normalization/normalizeVoiceText';
import type { VoiceReadyProduct } from '../products/voiceReadyProduct';

export type ReadyVoiceCorrectionField =
  | 'quantity'
  | 'length'
  | 'price'
  | 'weight';

export interface ReadyVoiceProductCorrectionResult {
  applied: boolean;
  commandText: string;
  appliedFields: ReadyVoiceCorrectionField[];
  issues: string[];
}

type PriceUnit = 'kg' | 'm' | 'Und';

const PRICE_IN_COMMAND = /\b(?:a|precio)\s+\$?\d+(?:[.,]\d{1,3})?\/(?:kg|m|Und)\b/iu;

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatCompactDecimal(value: number): string {
  if (Number.isInteger(value)) return String(value);

  return String(value)
    .replace('.', ',')
    .replace(/,0+$/u, '')
    .replace(/(,\d*?)0+$/u, '$1');
}

function formatPrice(value: number): string {
  return value.toFixed(3).replace('.', ',');
}

function expectedPriceUnit(product: VoiceReadyProduct): PriceUnit {
  if (product.kind === 'meter') return 'm';
  if (product.kind === 'unit') return 'Und';
  return 'kg';
}

function spokenPriceUnit(unit: PriceUnit): string {
  if (unit === 'm') return 'por metro';
  if (unit === 'Und') return 'cada una';
  return 'el kilo';
}

function extractQuantityCorrection(text: string): number | undefined {
  const patterns = [
    /\bcambiar\s+(?:la\s+)?cantidad\s+(?:a|por)\s+(\d+)\b/iu,
    /\bcantidad\s+(?:a\s+|es\s+)?(\d+)\b/iu,
    /\b(?:en\s+realidad\s+)?son\s+(\d+)\b/iu,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const quantity = Number(match[1]);
    if (Number.isInteger(quantity) && quantity > 0) return quantity;
  }

  return undefined;
}

function extractLengthCorrection(text: string): {
  value: number;
  unit: 'm' | 'mm';
} | undefined {
  const patterns = [
    /\bcambiar\s+(?:el\s+)?largo\s+(?:a|por)\s+(\d+(?:,\d+)?)\s*(m|mm)\b/iu,
    /\bel\s+largo\s+es\s+(?:de\s+)?(\d+(?:,\d+)?)\s*(m|mm)\b/iu,
    /\blargo\s+(?:a\s+|es\s+(?:de\s+)?|de\s+)?(\d+(?:,\d+)?)\s*(m|mm)\b/iu,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const value = parseLocalizedNumber(match[1]);
    const unit = match[2].toLocaleLowerCase('es-AR') as 'm' | 'mm';

    if (value !== undefined && value > 0) {
      return { value, unit };
    }
  }

  return undefined;
}

function extractWeightCorrection(text: string): number | undefined {
  const patterns = [
    /\bcambiar\s+(?:el\s+)?peso\s+(?:a|por)\s+(\d+(?:,\d+)?)\s*kg\b/iu,
    /\bel\s+peso\s+es\s+(\d+(?:,\d+)?)\s*kg\b/iu,
    /\bpeso\s+(?:a\s+|es\s+)?(\d+(?:,\d+)?)\s*kg\b/iu,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const value = parseLocalizedNumber(match[1]);
    if (value !== undefined && value > 0) return value;
  }

  return undefined;
}

function extractDirectPrice(text: string): {
  value: number;
  unit: PriceUnit;
} | undefined {
  const match = text.match(
    /\b(?:a|precio)\s+\$?(\d+(?:[.,]\d{1,3})?)\/(kg|m|Und)\b/iu,
  );

  if (!match) return undefined;

  const value = parseLocalizedNumber(match[1]);
  if (value === undefined || value <= 0) return undefined;

  const rawUnit = match[2].toLocaleLowerCase('es-AR');
  const unit: PriceUnit = rawUnit === 'und' ? 'Und' : (rawUnit as 'kg' | 'm');

  return { value, unit };
}

function rawPriceTail(rawText: string): string | undefined {
  const match = rawText.match(
    /\bprecio\b(?:\s+(?:a|es|de))?\s+(.+)$/iu,
  );

  if (!match) return undefined;

  return match[1]
    .replace(/[.!?]+$/gu, '')
    .trim();
}

function extractPriceCorrection(
  normalizedText: string,
  rawText: string,
  expectedUnit: PriceUnit,
): { value: number; unit: PriceUnit } | undefined {
  const direct = extractDirectPrice(normalizedText);
  if (direct) return direct;

  const tail = rawPriceTail(rawText);
  if (!tail) return undefined;

  const alreadyHasUnit = /\b(?:kilo|kilos|kg|kilogramo|kilogramos|metro|metros|m|unidad|unidades|und)\b|\bcada\s+(?:una|uno)\b/iu.test(
    tail,
  );

  const synthetic = normalizeVoiceText(
    `a ${tail}${alreadyHasUnit ? '' : ` ${spokenPriceUnit(expectedUnit)}`}`,
  );

  return extractDirectPrice(synthetic);
}

function replaceLeadingQuantity(commandText: string, quantity: number): string {
  if (/^\s*\d+\b/u.test(commandText)) {
    return commandText.replace(/^\s*\d+\b/u, String(quantity)).trim();
  }

  return `${quantity} ${commandText}`.replace(/\s+/gu, ' ').trim();
}

function insertBeforePrice(commandText: string, addition: string): string {
  const match = PRICE_IN_COMMAND.exec(commandText);

  if (!match || match.index === undefined) {
    return `${commandText.trim()} ${addition.trim()}`
      .replace(/\s+/gu, ' ')
      .trim();
  }

  return [
    commandText.slice(0, match.index).trim(),
    addition.trim(),
    commandText.slice(match.index).trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function replaceOrInsertLengthMeters(
  commandText: string,
  lengthM: number,
): string {
  const canonical = `largo ${formatCompactDecimal(lengthM)} m`;
  const explicit = /\blargo\s+\d+(?:,\d+)?\s*m\b/iu;

  if (explicit.test(commandText)) {
    return commandText.replace(explicit, canonical).replace(/\s+/gu, ' ').trim();
  }

  // Los comandos creados desde voz suelen conservar el largo en lenguaje natural,
  // por ejemplo: "... de 12 m a 1,500/kg". Si agregáramos simplemente
  // "largo 6 m", quedarían dos largos y el parser podría seguir tomando el
  // primero (12 m). Reemplazamos el último largo en metros previo al precio.
  const priceMatch = PRICE_IN_COMMAND.exec(commandText);
  const searchEnd = priceMatch?.index ?? commandText.length;
  const prefix = commandText.slice(0, searchEnd);
  const naturalLength = /\b(?:de\s+)?\d+(?:,\d+)?\s*m\b/giu;
  const matches = Array.from(prefix.matchAll(naturalLength));
  const lastMatch = matches.at(-1);

  if (lastMatch && lastMatch.index !== undefined) {
    return [
      commandText.slice(0, lastMatch.index),
      canonical,
      commandText.slice(lastMatch.index + lastMatch[0].length),
    ]
      .join('')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  return insertBeforePrice(commandText, canonical);
}

function replaceOrInsertPlanchaLength(
  commandText: string,
  lengthMm: number,
): string {
  const canonical = `largo ${formatCompactDecimal(lengthMm)} mm`;
  const explicit = /\blargo\s+\d+(?:,\d+)?\s*(?:mm|m)\b/iu;

  if (explicit.test(commandText)) {
    return commandText.replace(explicit, canonical).replace(/\s+/gu, ' ').trim();
  }

  return insertBeforePrice(commandText, canonical);
}

function replacePrice(
  commandText: string,
  value: number,
  unit: PriceUnit,
): string {
  const canonical = `a ${formatPrice(value)}/${unit}`;

  if (PRICE_IN_COMMAND.test(commandText)) {
    return commandText
      .replace(PRICE_IN_COMMAND, canonical)
      .replace(/\s+/gu, ' ')
      .trim();
  }

  return `${commandText.trim()} ${canonical}`.replace(/\s+/gu, ' ').trim();
}

function replaceOrInsertRecorteWeight(
  commandText: string,
  weightKg: number,
): string {
  const canonical = `peso ${formatCompactDecimal(weightKg)} kg`;
  const explicit = /\bpeso\s+\d+(?:,\d+)?\s*kg\b/iu;

  if (explicit.test(commandText)) {
    return commandText.replace(explicit, canonical).replace(/\s+/gu, ' ').trim();
  }

  const beforeProduct = /\b\d+(?:,\d+)?\s*kg\s+(?=(?:de\s+)?recortes?\b)/iu;
  if (beforeProduct.test(commandText)) {
    return commandText
      .replace(beforeProduct, `${formatCompactDecimal(weightKg)} kg `)
      .replace(/\s+/gu, ' ')
      .trim();
  }

  const afterProduct = /(\brecortes?\b)([\s\S]*?)(\b\d+(?:,\d+)?\s*kg\b)/iu;
  if (afterProduct.test(commandText)) {
    return commandText
      .replace(afterProduct, `$1$2${formatCompactDecimal(weightKg)} kg`)
      .replace(/\s+/gu, ' ')
      .trim();
  }

  return insertBeforePrice(commandText, canonical);
}

export function applyReadyVoiceProductCorrection(
  commandText: string,
  product: VoiceReadyProduct,
  normalizedCorrection: string,
  rawCorrection: string,
): ReadyVoiceProductCorrectionResult {
  let nextCommand = commandText.trim();
  const appliedFields: ReadyVoiceCorrectionField[] = [];
  const issues: string[] = [];

  const quantity = extractQuantityCorrection(normalizedCorrection);
  if (quantity !== undefined) {
    if (product.kind === 'manual-weight') {
      issues.push('Recortes usa una única línea con peso manual; corregí el peso, no la cantidad.');
    } else {
      nextCommand = replaceLeadingQuantity(nextCommand, quantity);
      appliedFields.push('quantity');
    }
  }

  const length = extractLengthCorrection(normalizedCorrection);
  if (length) {
    if (
      product.kind === 'catalog-weight' ||
      product.kind === 'tube' ||
      product.kind === 'meter'
    ) {
      const lengthM = length.unit === 'mm' ? length.value / 1000 : length.value;

      if (lengthM > 0) {
        nextCommand = replaceOrInsertLengthMeters(nextCommand, lengthM);
        appliedFields.push('length');
      }
    } else if (product.kind === 'plancha') {
      const lengthMm = length.unit === 'm' ? length.value * 1000 : length.value;

      if (lengthMm > 0) {
        nextCommand = replaceOrInsertPlanchaLength(nextCommand, lengthMm);
        appliedFields.push('length');
      }
    } else {
      issues.push(
        product.kind === 'unit'
          ? 'Mallas no utiliza largo.'
          : 'Recortes no utiliza largo; corregí el peso manual si corresponde.',
      );
    }
  }

  const weight = extractWeightCorrection(normalizedCorrection);
  if (weight !== undefined) {
    if (product.kind === 'manual-weight') {
      nextCommand = replaceOrInsertRecorteWeight(nextCommand, weight);
      appliedFields.push('weight');
    } else {
      issues.push('El peso manual sólo corresponde a Recortes.');
    }
  }

  const expectedUnit = expectedPriceUnit(product);
  const price = extractPriceCorrection(
    normalizedCorrection,
    rawCorrection,
    expectedUnit,
  );

  if (price) {
    if (price.unit !== expectedUnit) {
      issues.push(
        `La unidad de precio correcta para este producto es /${expectedUnit}.`,
      );
    } else {
      nextCommand = replacePrice(nextCommand, price.value, expectedUnit);
      appliedFields.push('price');
    }
  }

  if (appliedFields.length === 0 && issues.length === 0) {
    issues.push(
      'No reconocí una corrección de cantidad, largo o precio. Para Recortes también podés corregir el peso.',
    );
  }

  return {
    applied: appliedFields.length > 0,
    commandText: nextCommand,
    appliedFields,
    issues,
  };
}

export function readyVoiceCorrectionFieldLabel(
  field: ReadyVoiceCorrectionField,
): string {
  if (field === 'quantity') return 'cantidad';
  if (field === 'length') return 'largo';
  if (field === 'weight') return 'peso';
  return 'precio';
}
