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

export interface VoiceReadyCatalogWeightProduct {
  kind: 'catalog-weight';
  canonicalType: string;
  productId: string;
  description: string;
  quantity: number;
  lengthM: number;
  price: number;
  massNominalKgM: number;
}

export interface VoiceReadyTubeProduct {
  kind: 'tube';
  canonicalType: 'Tubo redondo' | 'Tubo cuadrado' | 'Tubo rectangular';
  description: string;
  quantity: number;
  lengthM: number;
  price: number;
  calculatorShape: 'tubo-redondo' | 'tubo-cuadrado' | 'tubo-rectangular';
  diameterMm?: number;
  sideMm?: number;
  widthMm?: number;
  heightMm?: number;
  thicknessMm: number;
}

export interface VoiceReadyMeterProduct {
  kind: 'meter';
  canonicalType: 'Chapa acanalada' | 'Chapa trapezoidal';
  productId: string;
  description: string;
  material: 'galvanizada' | 'negra';
  quantity: number;
  lengthM: number;
  price: number;
}

export interface VoiceReadyPlanchaProduct {
  kind: 'plancha';
  canonicalType: 'Planchas';
  productId: string;
  description: string;
  quantity: number;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  price: number;
}

export interface VoiceReadyManualWeightProduct {
  kind: 'manual-weight';
  canonicalType: 'Recortes';
  description: string;
  quantity: 1;
  weightKg: number;
  price: number;
}

export interface VoiceReadyUnitProduct {
  kind: 'unit';
  canonicalType: 'Mallas';
  description: string;
  quantity: number;
  price: number;
}

export type VoiceReadyProduct =
  | VoiceReadyCatalogWeightProduct
  | VoiceReadyTubeProduct
  | VoiceReadyMeterProduct
  | VoiceReadyPlanchaProduct
  | VoiceReadyManualWeightProduct
  | VoiceReadyUnitProduct;

interface CatalogWeightData {
  canonicalType: string;
  quantity?: number;
  lengthM: number;
  price?: number;
  productId?: string;
  productDescription?: string;
  massNominalKgM?: number;
}

function catalogWeightProduct(
  status: string,
  data?: CatalogWeightData,
): VoiceReadyCatalogWeightProduct | null {
  if (
    status !== 'matched' ||
    !data ||
    data.quantity === undefined ||
    data.price === undefined ||
    !data.productId ||
    !data.productDescription ||
    data.massNominalKgM === undefined
  ) {
    return null;
  }

  return {
    kind: 'catalog-weight',
    canonicalType: data.canonicalType,
    productId: data.productId,
    description: data.productDescription,
    quantity: data.quantity,
    lengthM: data.lengthM,
    price: data.price,
    massNominalKgM: data.massNominalKgM,
  };
}

function tubeDescription(
  canonicalType: VoiceReadyTubeProduct['canonicalType'],
  values: {
    diameterMm?: number;
    sideMm?: number;
    widthMm?: number;
    heightMm?: number;
    thicknessMm: number;
  },
): string {
  if (canonicalType === 'Tubo redondo') {
    return `${canonicalType} Ø ${values.diameterMm} x ${values.thicknessMm} mm`;
  }

  if (canonicalType === 'Tubo cuadrado') {
    return `${canonicalType} ${values.sideMm} x ${values.sideMm} x ${values.thicknessMm} mm`;
  }

  return `${canonicalType} ${values.widthMm} x ${values.heightMm} x ${values.thicknessMm} mm`;
}

export function buildVoiceReadyProduct(
  normalizedCommand: string,
): VoiceReadyProduct | null {
  const perfilC = parsePerfilCVoiceCommand(normalizedCommand);
  const perfilCReady = catalogWeightProduct(perfilC.status, perfilC.data);
  if (perfilCReady) return perfilCReady;

  const ipnIpe = parseIpnIpeVoiceCommand(normalizedCommand);
  const ipnIpeReady = catalogWeightProduct(ipnIpe.status, ipnIpe.data);
  if (ipnIpeReady) return ipnIpeReady;

  const heaHebW = parseHeaHebWVoiceCommand(normalizedCommand);
  const heaHebWReady = catalogWeightProduct(heaHebW.status, heaHebW.data);
  if (heaHebWReady) return heaHebWReady;

  const upnUl = parseUpnUlVoiceCommand(normalizedCommand);
  const upnUlReady = catalogWeightProduct(upnUl.status, upnUl.data);
  if (upnUlReady) return upnUlReady;

  const perfilU = parsePerfilUVoiceCommand(normalizedCommand);
  const perfilUReady = catalogWeightProduct(perfilU.status, perfilU.data);
  if (perfilUReady) return perfilUReady;

  const anguloPlanchuela = parseAnguloPlanchuelaVoiceCommand(normalizedCommand);
  const anguloPlanchuelaReady = catalogWeightProduct(
    anguloPlanchuela.status,
    anguloPlanchuela.data,
  );
  if (anguloPlanchuelaReady) return anguloPlanchuelaReady;

  const barra = parseBarraVoiceCommand(normalizedCommand);
  const barraReady = catalogWeightProduct(barra.status, barra.data);
  if (barraReady) return barraReady;

  const tubo = parseTuboVoiceCommand(normalizedCommand);
  if (
    tubo.status === 'matched' &&
    tubo.data &&
    tubo.data.quantity !== undefined &&
    tubo.data.price !== undefined &&
    tubo.data.thicknessMm !== undefined
  ) {
    const dimensions = {
      diameterMm: tubo.data.diameterMm,
      sideMm: tubo.data.sideMm,
      widthMm: tubo.data.widthMm,
      heightMm: tubo.data.heightMm,
      thicknessMm: tubo.data.thicknessMm,
    };

    return {
      kind: 'tube',
      canonicalType: tubo.data.canonicalType,
      description: tubeDescription(tubo.data.canonicalType, dimensions),
      quantity: tubo.data.quantity,
      lengthM: tubo.data.lengthM,
      price: tubo.data.price,
      calculatorShape: tubo.data.calculatorShape,
      ...dimensions,
    };
  }

  const chapa = parseChapaTechoVoiceCommand(normalizedCommand);
  if (
    chapa.status === 'matched' &&
    chapa.data &&
    chapa.data.quantity !== undefined &&
    chapa.data.material !== undefined &&
    chapa.data.lengthM !== undefined &&
    chapa.data.price !== undefined &&
    chapa.data.productId
  ) {
    return {
      kind: 'meter',
      canonicalType: chapa.data.canonicalType,
      productId: chapa.data.productId,
      description: `${chapa.data.productDescription ?? chapa.data.canonicalType} ${chapa.data.material}`,
      material: chapa.data.material,
      quantity: chapa.data.quantity,
      lengthM: chapa.data.lengthM,
      price: chapa.data.price,
    };
  }

  const plancha = parsePlanchaVoiceCommand(normalizedCommand);
  if (
    plancha.status === 'matched' &&
    plancha.data &&
    plancha.data.quantity !== undefined &&
    plancha.data.lengthMm !== undefined &&
    plancha.data.widthMm !== undefined &&
    plancha.data.thicknessMm !== undefined &&
    plancha.data.price !== undefined &&
    plancha.data.productId
  ) {
    return {
      kind: 'plancha',
      canonicalType: 'Planchas',
      productId: plancha.data.productId,
      description: `Planchas ${plancha.data.lengthMm} x ${plancha.data.widthMm} x ${plancha.data.thicknessMm} mm`,
      quantity: plancha.data.quantity,
      lengthMm: plancha.data.lengthMm,
      widthMm: plancha.data.widthMm,
      thicknessMm: plancha.data.thicknessMm,
      price: plancha.data.price,
    };
  }

  const recorte = parseRecorteVoiceCommand(normalizedCommand);
  if (
    recorte.status === 'matched' &&
    recorte.data &&
    recorte.data.weightKg !== undefined &&
    recorte.data.price !== undefined
  ) {
    return {
      kind: 'manual-weight',
      canonicalType: 'Recortes',
      description: 'Recortes',
      quantity: 1,
      weightKg: recorte.data.weightKg,
      price: recorte.data.price,
    };
  }

  const malla = parseMallaVoiceCommand(normalizedCommand);
  if (
    malla.status === 'matched' &&
    malla.data &&
    malla.data.quantity !== undefined &&
    malla.data.price !== undefined
  ) {
    return {
      kind: 'unit',
      canonicalType: 'Mallas',
      description: 'Mallas',
      quantity: malla.data.quantity,
      price: malla.data.price,
    };
  }

  return null;
}
