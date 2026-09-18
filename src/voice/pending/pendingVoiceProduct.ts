import { parseAnguloPlanchuelaVoiceCommand } from '../parsers/anguloPlanchuelaVoiceParser';
import { parseBarraVoiceCommand } from '../parsers/barraVoiceParser';
import { parseChapaTechoVoiceCommand } from '../parsers/chapaTechoVoiceParser';
import { parseHeaHebWVoiceCommand } from '../parsers/heaHebWVoiceParser';
import { parseIpnIpeVoiceCommand } from '../parsers/ipnIpeVoiceParser';
import { parseMallaVoiceCommand } from '../parsers/mallaVoiceParser';
import { parsePerfilCVoiceCommand } from '../parsers/perfilCVoiceParser';
import { parsePerfilUVoiceCommand } from '../parsers/perfilUVoiceParser';
import { parsePlanchaVoiceCommand } from '../parsers/planchaVoiceParser';
import { parseRecorteVoiceCommand } from '../parsers/recorteVoiceParser';
import { parseTuboVoiceCommand } from '../parsers/tuboVoiceParser';
import { parseUpnUlVoiceCommand } from '../parsers/upnUlVoiceParser';
import {
  applyPerfilCClarification,
  createPendingPerfilCVoiceProduct,
  perfilCMissingFieldLabel,
} from './perfilCPendingVoiceProduct';
import type { PendingPerfilCVoiceProduct } from './perfilCPendingVoiceProduct';
import { identifyVoiceProduct } from '../products/productVoiceDictionary';
import { normalizeVoiceText } from '../normalization/normalizeVoiceText';

export type PendingVoiceFamily =
  | 'perfil-c'
  | 'tubo'
  | 'chapa-techo'
  | 'plancha'
  | 'recorte'
  | 'malla'
  | 'ipn-ipe'
  | 'perfil-u'
  | 'angulo-planchuela'
  | 'hea-heb-w'
  | 'upn-ul'
  | 'barra';

interface MinimalParseResult {
  status: string;
  data?: {
    canonicalType?: string;
  };
  missingFields: readonly string[];
}

interface ParserEntry {
  family: PendingVoiceFamily;
  parse: (text: string) => MinimalParseResult;
}

const PARSERS: readonly ParserEntry[] = [
  { family: 'perfil-c', parse: parsePerfilCVoiceCommand },
  { family: 'tubo', parse: parseTuboVoiceCommand },
  { family: 'chapa-techo', parse: parseChapaTechoVoiceCommand },
  { family: 'plancha', parse: parsePlanchaVoiceCommand },
  { family: 'recorte', parse: parseRecorteVoiceCommand },
  { family: 'malla', parse: parseMallaVoiceCommand },
  { family: 'ipn-ipe', parse: parseIpnIpeVoiceCommand },
  { family: 'perfil-u', parse: parsePerfilUVoiceCommand },
  { family: 'angulo-planchuela', parse: parseAnguloPlanchuelaVoiceCommand },
  { family: 'hea-heb-w', parse: parseHeaHebWVoiceCommand },
  { family: 'upn-ul', parse: parseUpnUlVoiceCommand },
  { family: 'barra', parse: parseBarraVoiceCommand },
];

export interface PendingVoiceProduct {
  family: PendingVoiceFamily;
  canonicalType: string;
  commandText: string;
  missingFields: string[];
  turns: number;
  perfilCPending?: PendingPerfilCVoiceProduct;
}

export interface PendingVoiceClarificationResult {
  commandText: string;
  pending: PendingVoiceProduct | null;
  clarificationApplied: boolean;
  completedCanonicalType?: string;
}

function parseWithFamily(
  family: PendingVoiceFamily,
  text: string,
): MinimalParseResult {
  const entry = PARSERS.find((item) => item.family === family);
  if (!entry) {
    return { status: 'not-applicable', missingFields: [] };
  }
  return entry.parse(text);
}

function findApplicableParse(text: string): {
  family: PendingVoiceFamily;
  result: MinimalParseResult;
} | null {
  for (const entry of PARSERS) {
    const result = entry.parse(text);
    if (result.status !== 'not-applicable') {
      return { family: entry.family, result };
    }
  }
  return null;
}

function buildPendingFromParse(
  family: PendingVoiceFamily,
  commandText: string,
  result: MinimalParseResult,
  turns: number,
): PendingVoiceProduct | null {
  if (
    result.status !== 'incomplete' ||
    !result.data?.canonicalType ||
    result.missingFields.length === 0
  ) {
    return null;
  }

  if (family === 'perfil-c') {
    const perfilCResult = parsePerfilCVoiceCommand(commandText);
    const perfilCPending = createPendingPerfilCVoiceProduct(
      perfilCResult,
      commandText,
    );

    if (!perfilCPending) return null;

    return {
      family,
      canonicalType: perfilCPending.canonicalType,
      commandText,
      missingFields: [...perfilCPending.missingFields],
      turns,
      perfilCPending,
    };
  }

  return {
    family,
    canonicalType: result.data.canonicalType,
    commandText,
    missingFields: [...result.missingFields],
    turns,
  };
}

export function createPendingVoiceProduct(
  normalizedText: string,
): PendingVoiceProduct | null {
  const applicable = findApplicableParse(normalizedText);
  if (!applicable) return null;

  return buildPendingFromParse(
    applicable.family,
    normalizedText.trim(),
    applicable.result,
    1,
  );
}

function splitPriceTail(text: string): { head: string; priceTail: string } {
  const match = /\s+(?=(?:a|precio)\s+\$?\d+(?:,\d{1,3})?\/(?:kg|m|Und)\b)/iu.exec(text);
  if (!match || match.index === undefined) {
    return { head: text.trim(), priceTail: '' };
  }

  return {
    head: text.slice(0, match.index).trim(),
    priceTail: text.slice(match.index).trim(),
  };
}

function insertBeforePrice(base: string, addition: string): string {
  const { head, priceTail } = splitPriceTail(base);
  return [head, addition.trim(), priceTail]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function insertBeforeLengthOrPrice(base: string, addition: string): string {
  const tailMatch = /\s+(?=(?:(?:de\s+)?(?:largo\s+)?\d+(?:,\d+)?\s*m\b|(?:a|precio)\s+\$?\d+(?:,\d{1,3})?\/(?:kg|m|Und)\b))/iu.exec(base);

  if (!tailMatch || tailMatch.index === undefined) {
    return `${base.trim()} ${addition.trim()}`.replace(/\s+/g, ' ').trim();
  }

  return [
    base.slice(0, tailMatch.index).trim(),
    addition.trim(),
    base.slice(tailMatch.index).trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractExplicitQuantity(text: string): {
  quantity?: number;
  remainingText: string;
} {
  const explicit = text.match(/\bcantidad\s+(\d+)\b/iu);
  if (!explicit) {
    return { remainingText: text.trim() };
  }

  const quantity = Number(explicit[1]);
  return {
    quantity:
      Number.isInteger(quantity) && quantity > 0 ? quantity : undefined,
    remainingText: text.replace(explicit[0], ' ').replace(/\s+/g, ' ').trim(),
  };
}

function prependQuantity(base: string, quantity: number): string {
  return `${quantity} ${base}`.replace(/\s+/g, ' ').trim();
}

function shouldTreatBareNumberAsQuantity(
  pending: PendingVoiceProduct,
  clarification: string,
): number | undefined {
  if (
    pending.missingFields.length !== 1 ||
    pending.missingFields[0] !== 'quantity'
  ) {
    return undefined;
  }

  const match = clarification.trim().match(/^(\d+)$/u);
  if (!match) return undefined;

  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : undefined;
}

function startsWithNumber(text: string): boolean {
  return /^\d+(?:,\d+)?\b/u.test(text.trim());
}

function mergeGenericClarification(
  pending: PendingVoiceProduct,
  normalizedClarification: string,
): string {
  let clarification = normalizedClarification.trim();
  let base = pending.commandText.trim();

  const quantityInfo = extractExplicitQuantity(clarification);
  const bareQuantity = shouldTreatBareNumberAsQuantity(pending, clarification);
  const quantity = quantityInfo.quantity ?? bareQuantity;

  if (quantity !== undefined) {
    base = prependQuantity(base, quantity);
    clarification = bareQuantity !== undefined ? '' : quantityInfo.remainingText;
  }

  if (!clarification) {
    return base;
  }

  if (
    pending.family === 'hea-heb-w' &&
    pending.missingFields.includes('designationKgM') &&
    startsWithNumber(clarification) &&
    !/^x\b/iu.test(clarification)
  ) {
    clarification = `x ${clarification}`;
    return insertBeforeLengthOrPrice(base, clarification);
  }

  if (
    pending.family === 'upn-ul' &&
    pending.canonicalType === 'UL' &&
    pending.missingFields.includes('flangeMm') &&
    startsWithNumber(clarification) &&
    !/^(?:x|por)\b/iu.test(clarification)
  ) {
    clarification = `x ${clarification}`;
    return insertBeforeLengthOrPrice(base, clarification);
  }

  if (
    pending.family === 'angulo-planchuela' &&
    pending.missingFields.includes('thicknessInches') &&
    !/^(?:x|por)\b/iu.test(clarification)
  ) {
    clarification = `por ${clarification}`;
    return insertBeforeLengthOrPrice(base, clarification);
  }

  if (
    pending.family === 'ipn-ipe' ||
    pending.family === 'hea-heb-w' ||
    pending.family === 'upn-ul' ||
    pending.family === 'perfil-u' ||
    pending.family === 'tubo' ||
    pending.family === 'angulo-planchuela' ||
    pending.family === 'barra'
  ) {
    const hasVariantMissing = pending.missingFields.some((field) =>
      [
        'nominalSizeMm',
        'designationKgM',
        'heightMm',
        'flangeMm',
        'diameterMm',
        'sideMm',
        'widthMm',
        'thicknessMm',
        'sizeInches',
        'thicknessInches',
      ].includes(field),
    );

    if (hasVariantMissing) {
      return insertBeforeLengthOrPrice(base, clarification);
    }
  }

  if (
    pending.family === 'plancha' ||
    pending.family === 'chapa-techo' ||
    pending.family === 'recorte'
  ) {
    return insertBeforePrice(base, clarification);
  }

  return `${base} ${clarification}`.replace(/\s+/g, ' ').trim();
}

export function applyPendingVoiceClarification(
  pending: PendingVoiceProduct,
  normalizedClarification: string,
  rawClarification?: string,
): PendingVoiceClarificationResult {
  let clarification = normalizedClarification.trim();

  // Una respuesta aislada como “doscientos kilos” puede ser normalizada por
  // la capa general como si fuera un precio. Cuando el producto pendiente es
  // Recortes y falta el peso, re-normalizamos el texto crudo con la palabra
  // “peso” para hacer inequívoco que se trata de kg manuales y no de USD/kg.
  if (
    pending.family === 'recorte' &&
    pending.missingFields.includes('weightKg') &&
    rawClarification?.trim()
  ) {
    clarification = normalizeVoiceText(`peso ${rawClarification.trim()}`);
  }
  if (!clarification) {
    return {
      commandText: pending.commandText,
      pending,
      clarificationApplied: false,
    };
  }

  const explicitIdentification = identifyVoiceProduct(clarification);
  if (explicitIdentification.status !== 'not-found') {
    return {
      commandText: clarification,
      pending: createPendingVoiceProduct(clarification),
      clarificationApplied: false,
    };
  }

  if (pending.family === 'perfil-c' && pending.perfilCPending) {
    const result = applyPerfilCClarification(
      pending.perfilCPending,
      clarification,
    );

    const nextPending = result.pending
      ? {
          family: 'perfil-c' as const,
          canonicalType: 'Perfil C',
          commandText: result.commandText,
          missingFields: [...result.pending.missingFields],
          turns: result.pending.turns,
          perfilCPending: result.pending,
        }
      : null;

    return {
      commandText: result.commandText,
      pending: nextPending,
      clarificationApplied: true,
      completedCanonicalType: nextPending ? undefined : 'Perfil C',
    };
  }

  const mergedCommand = mergeGenericClarification(pending, clarification);
  const parseResult = parseWithFamily(pending.family, mergedCommand);
  const nextPending = buildPendingFromParse(
    pending.family,
    mergedCommand,
    parseResult,
    pending.turns + 1,
  );

  return {
    commandText: mergedCommand,
    pending: nextPending,
    clarificationApplied: true,
    completedCanonicalType:
      nextPending || parseResult.status === 'not-applicable'
        ? undefined
        : pending.canonicalType,
  };
}

function priceLabelForFamily(family: PendingVoiceFamily): string {
  if (family === 'chapa-techo') return 'precio USD/m';
  if (family === 'malla') return 'precio USD/Und';
  return 'precio USD/kg';
}

export function pendingVoiceMissingFieldLabel(
  pending: PendingVoiceProduct,
  field: string,
): string {
  if (pending.family === 'perfil-c' && pending.perfilCPending) {
    return perfilCMissingFieldLabel(
      field as PendingPerfilCVoiceProduct['missingFields'][number],
    );
  }

  if (field === 'quantity') return 'cantidad';
  if (field === 'heightMm') return 'alto';
  if (field === 'flangeMm') return 'ala';
  if (field === 'lipMm') return 'labio';
  if (field === 'widthMm') return 'ancho';
  if (field === 'diameterMm') return 'diámetro';
  if (field === 'sideMm') return 'lado';
  if (field === 'thicknessMm') return 'espesor';
  if (field === 'lengthM') return 'largo';
  if (field === 'lengthMm') return 'largo';
  if (field === 'widthMm') return 'ancho';
  if (field === 'material') return 'material (galvanizada o negra)';
  if (field === 'weightKg') return 'peso en kg';
  if (field === 'nominalSizeMm') return 'medida nominal';
  if (field === 'designationKgM') return 'segundo valor de designación W';
  if (field === 'sizeInches') return 'medida en pulgadas';
  if (field === 'thicknessInches') return 'espesor en pulgadas';
  if (field === 'price') return priceLabelForFamily(pending.family);
  return field;
}
