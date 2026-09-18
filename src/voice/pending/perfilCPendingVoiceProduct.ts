import type {
  PerfilCMissingField,
  PerfilCStructuredData,
  PerfilCVoiceParseResult,
} from '../parsers/perfilCVoiceParser';
import { parsePerfilCVoiceCommand } from '../parsers/perfilCVoiceParser';

export interface PendingPerfilCVoiceProduct {
  canonicalType: 'Perfil C';
  data: PerfilCStructuredData;
  missingFields: PerfilCMissingField[];
  accumulatedSourceText: string;
  turns: number;
}

export interface PerfilCClarificationResult {
  commandText: string;
  parseResult: PerfilCVoiceParseResult;
  pending: PendingPerfilCVoiceProduct | null;
}

const NUMBER_PATTERN = '(\\d+(?:,\\d+)?)';

function parseLocalizedNumber(value: string): number | undefined {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatLocalizedNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(value).replace('.', ',');
}

function formatPrice(value: number): string {
  return value.toFixed(3).replace('.', ',');
}

function extractPrice(text: string): number | undefined {
  const match = text.match(
    new RegExp(`(?:\\b(?:a|precio)\\s+)?${NUMBER_PATTERN}\\/kg\\b`, 'iu'),
  );

  return match ? parseLocalizedNumber(match[1]) : undefined;
}

function extractThickness(text: string): number | undefined {
  const match = text.match(
    new RegExp(`\\bespesor\\s+${NUMBER_PATTERN}\\s*mm\\b`, 'iu'),
  );

  return match ? parseLocalizedNumber(match[1]) : undefined;
}

function extractLength(text: string): number | undefined {
  const explicitMatch = text.match(
    new RegExp(`\\blargo\\s+${NUMBER_PATTERN}\\s*m\\b`, 'iu'),
  );
  const genericMatch = text.match(
    new RegExp(`\\b${NUMBER_PATTERN}\\s*m\\b`, 'iu'),
  );
  const match = explicitMatch ?? genericMatch;

  if (!match) return undefined;

  const parsed = parseLocalizedNumber(match[1]);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function extractDimensionCandidates(text: string): number[] {
  const triple = text.match(
    new RegExp(
      `\\b${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\b`,
      'iu',
    ),
  );

  if (triple) {
    return triple
      .slice(1, 4)
      .map((value) => parseLocalizedNumber(value))
      .filter((value): value is number => value !== undefined);
  }

  const pair = text.match(
    new RegExp(`\\b${NUMBER_PATTERN}\\s*x\\s*${NUMBER_PATTERN}\\b`, 'iu'),
  );

  if (pair) {
    return pair
      .slice(1, 3)
      .map((value) => parseLocalizedNumber(value))
      .filter((value): value is number => value !== undefined);
  }

  // Para una aclaración breve como "15, del 2, a uno cuarenta", la
  // normalización deja algo equivalente a "15 espesor 2 mm a 1,400/kg".
  // Eliminamos primero números cuyo significado ya está explicitado para no
  // confundir espesor, largo o precio con una dimensión faltante.
  const withoutKnownValues = text
    .replace(/\bespesor\s+\d+(?:,\d+)?\s*mm\b/giu, ' ')
    .replace(/\b(?:largo\s+)?\d+(?:,\d+)?\s*m\b/giu, ' ')
    .replace(/\b(?:a|precio)?\s*\d+(?:,\d{1,3})?\/kg\b/giu, ' ')
    .replace(/\bperfil(?:es)?\s+C\b/giu, ' ');

  return Array.from(
    withoutKnownValues.matchAll(/\b(\d+(?:,\d+)?)\b/giu),
    (match) => parseLocalizedNumber(match[1]),
  ).filter((value): value is number => value !== undefined);
}

function buildCanonicalCommand(data: PerfilCStructuredData): string {
  const parts: string[] = [];

  if (data.quantity !== undefined) {
    parts.push(String(data.quantity));
  }

  parts.push('perfil C');

  if (
    data.heightMm !== undefined &&
    data.flangeMm !== undefined &&
    data.lipMm !== undefined
  ) {
    parts.push(
      `${formatLocalizedNumber(data.heightMm)} x ${formatLocalizedNumber(data.flangeMm)} x ${formatLocalizedNumber(data.lipMm)}`,
    );
  } else if (
    data.heightMm !== undefined &&
    data.flangeMm !== undefined
  ) {
    parts.push(
      `${formatLocalizedNumber(data.heightMm)} x ${formatLocalizedNumber(data.flangeMm)}`,
    );
  }

  if (data.thicknessMm !== undefined) {
    parts.push(`espesor ${formatLocalizedNumber(data.thicknessMm)} mm`);
  }

  if (data.lengthSource === 'dictated') {
    parts.push(`largo ${formatLocalizedNumber(data.lengthM)} m`);
  }

  if (data.price !== undefined) {
    parts.push(`a ${formatPrice(data.price)}/kg`);
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function fillMissingDimensions(
  data: PerfilCStructuredData,
  candidates: number[],
): PerfilCStructuredData {
  const next = { ...data };
  const missingOrder: Array<'heightMm' | 'flangeMm' | 'lipMm'> = [];

  if (next.heightMm === undefined) missingOrder.push('heightMm');
  if (next.flangeMm === undefined) missingOrder.push('flangeMm');
  if (next.lipMm === undefined) missingOrder.push('lipMm');

  missingOrder.forEach((field, index) => {
    const value = candidates[index];
    if (value !== undefined && value > 0) {
      next[field] = value;
    }
  });

  return next;
}

export function createPendingPerfilCVoiceProduct(
  parseResult: PerfilCVoiceParseResult,
  normalizedText: string,
): PendingPerfilCVoiceProduct | null {
  if (
    parseResult.status !== 'incomplete' ||
    !parseResult.data ||
    parseResult.missingFields.length === 0
  ) {
    return null;
  }

  return {
    canonicalType: 'Perfil C',
    data: { ...parseResult.data },
    missingFields: [...parseResult.missingFields],
    accumulatedSourceText: normalizedText.trim(),
    turns: 1,
  };
}

export function applyPerfilCClarification(
  pending: PendingPerfilCVoiceProduct,
  normalizedClarification: string,
): PerfilCClarificationResult {
  let data: PerfilCStructuredData = { ...pending.data };

  const price = extractPrice(normalizedClarification);
  if (price !== undefined && price > 0) {
    data.price = price;
  }

  const thickness = extractThickness(normalizedClarification);
  if (thickness !== undefined && thickness > 0) {
    data.thicknessMm = thickness;
  }

  const length = extractLength(normalizedClarification);
  if (length !== undefined && length > 0) {
    data.lengthM = length;
    data.lengthSource = 'dictated';
  }

  const dimensionCandidates = extractDimensionCandidates(normalizedClarification);
  data = fillMissingDimensions(data, dimensionCandidates);

  // Cantidad se completa sólo en una forma inequívoca: "cantidad 10".
  // Evitamos tomar un número suelto como cantidad porque podría ser una
  // dimensión pendiente (por ejemplo el labio 15).
  if (data.quantity === undefined) {
    const quantityMatch = normalizedClarification.match(/\bcantidad\s+(\d+)\b/iu);
    if (quantityMatch) {
      const quantity = Number(quantityMatch[1]);
      if (Number.isInteger(quantity) && quantity > 0) {
        data.quantity = quantity;
      }
    }
  }

  const commandText = buildCanonicalCommand(data);
  const parseResult = parsePerfilCVoiceCommand(commandText);

  const nextPending =
    parseResult.status === 'incomplete' && parseResult.data
      ? {
          canonicalType: 'Perfil C' as const,
          data: { ...parseResult.data },
          missingFields: [...parseResult.missingFields],
          accumulatedSourceText: [
            pending.accumulatedSourceText,
            normalizedClarification.trim(),
          ]
            .filter(Boolean)
            .join(' | '),
          turns: pending.turns + 1,
        }
      : null;

  return {
    commandText,
    parseResult,
    pending: nextPending,
  };
}

export function perfilCMissingFieldLabel(field: PerfilCMissingField): string {
  if (field === 'quantity') return 'cantidad';
  if (field === 'heightMm') return 'alto';
  if (field === 'flangeMm') return 'ala';
  if (field === 'lipMm') return 'labio';
  if (field === 'thicknessMm') return 'espesor';
  return 'precio USD/kg';
}
