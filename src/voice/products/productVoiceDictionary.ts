import {
  PRODUCTOS_PROVEEDOR,
  TIPOS_PRODUCTO_ESPECIALES,
} from '../../data/productosProveedor';

export type VoiceProductIdentification =
  | {
      status: 'matched';
      matchedAlias: string;
      canonicalType: string;
      source: 'master' | 'special';
      candidateProductIds: string[];
      exactProductId?: string;
    }
  | {
      status: 'ambiguous';
      matchedAlias: string;
      canonicalTypes: string[];
    }
  | {
      status: 'not-found';
    };

type VoiceProductAliasEntry = {
  aliases: readonly string[];
  canonicalTypes: readonly string[];
};

const MASTER_TYPES = new Set(
  PRODUCTOS_PROVEEDOR.map((producto) => producto.tipo),
);

const SPECIAL_TYPES = new Set<string>(TIPOS_PRODUCTO_ESPECIALES);

/**
 * Diccionario lingüístico de ETAPA 3.
 *
 * Sólo contiene sinónimos/frases de reconocimiento. Los productos reales,
 * descripciones, masas nominales e IDs siguen viniendo de PRODUCTOS_PROVEEDOR.
 * Los productos sin subproducto reutilizan las constantes que usa el editor
 * convencional y que también se exportan desde productosProveedor.ts.
 */
const PRODUCT_ALIAS_DICTIONARY: readonly VoiceProductAliasEntry[] = [
  {
    canonicalTypes: ['Perfil C'],
    aliases: [
      'perfil c',
      'perfiles c',
      'perfil ce',
      'perfiles ce',
      'canal c',
      'canal ce',
    ],
  },
  {
    canonicalTypes: ['Perfil U'],
    aliases: ['perfil u', 'perfiles u', 'canal u'],
  },
  {
    canonicalTypes: ['IPN'],
    aliases: ['ipn', 'ypn', 'ipene'],
  },
  {
    canonicalTypes: ['IPE'],
    aliases: ['ipe', 'ype'],
  },
  {
    canonicalTypes: ['UPN'],
    aliases: ['upn', 'u p n', 'u pe ene', 'perfil upn', 'perfiles upn'],
  },
  {
    canonicalTypes: ['HEA'],
    aliases: ['hea', 'h e a', 'perfil hea', 'perfiles hea'],
  },
  {
    canonicalTypes: ['HEB'],
    aliases: ['heb', 'h e b', 'perfil heb', 'perfiles heb'],
  },
  {
    canonicalTypes: ['UL'],
    aliases: ['ul', 'u l', 'u ele', 'perfil ul', 'perfiles ul'],
  },
  {
    canonicalTypes: ['W (H)'],
    aliases: [
      'w h',
      'perfil w h',
      'doble ve h',
      'doble ve hache',
      'doble v h',
      'doble u h',
      'hp',
      'perfil hp',
    ],
  },
  {
    canonicalTypes: ['W (I)'],
    aliases: [
      'w i',
      'perfil w i',
      'doble ve i',
      'doble v i',
      'doble u i',
    ],
  },
  {
    canonicalTypes: ['Ángulo alas iguales'],
    aliases: [
      'angulo',
      'angulos',
      'perfil angulo',
      'angulo alas iguales',
      'angulos alas iguales',
    ],
  },
  {
    canonicalTypes: ['Planchuela'],
    aliases: ['planchuela', 'planchuelas'],
  },
  {
    canonicalTypes: ['Barra redonda'],
    aliases: ['barra redonda', 'barras redondas', 'hierro redondo'],
  },
  {
    canonicalTypes: ['Barra cuadrada'],
    aliases: ['barra cuadrada', 'barras cuadradas', 'hierro cuadrado'],
  },
  {
    canonicalTypes: ['Chapa acanalada'],
    aliases: ['chapa acanalada', 'chapas acanaladas'],
  },
  {
    canonicalTypes: ['Chapa trapezoidal'],
    aliases: ['chapa trapezoidal', 'chapas trapezoidales'],
  },
  {
    canonicalTypes: ['Planchas'],
    aliases: ['plancha', 'planchas'],
  },
  {
    canonicalTypes: ['Tubo redondo'],
    aliases: [
      'tubo redondo',
      'tubos redondos',
      'caño redondo',
      'caños redondos',
    ],
  },
  {
    canonicalTypes: ['Tubo cuadrado'],
    aliases: [
      'tubo cuadrado',
      'tubos cuadrados',
      'caño cuadrado',
      'caños cuadrados',
    ],
  },
  {
    canonicalTypes: ['Tubo rectangular'],
    aliases: [
      'tubo rectangular',
      'tubos rectangulares',
      'caño rectangular',
      'caños rectangulares',
    ],
  },
  {
    canonicalTypes: ['Recortes'],
    aliases: ['recorte', 'recortes'],
  },
  {
    canonicalTypes: ['Mallas'],
    aliases: ['malla', 'mallas', 'maya', 'mayas', 'masha', 'mashas'],
  },

  // Expresiones válidas pero insuficientes para elegir una familia exacta.
  // Se devuelven como ambiguas en vez de adivinar.
  {
    canonicalTypes: ['IPN', 'IPE', 'HEA', 'HEB', 'W (H)', 'W (I)'],
    aliases: ['doble t', 'perfil doble t'],
  },
  {
    canonicalTypes: ['Chapa acanalada', 'Chapa trapezoidal', 'Planchas'],
    aliases: ['chapa', 'chapas'],
  },
  {
    canonicalTypes: ['Tubo redondo', 'Tubo cuadrado', 'Tubo rectangular'],
    aliases: ['tubo', 'tubos', 'caño', 'caños'],
  },
  {
    canonicalTypes: ['Barra redonda', 'Barra cuadrada'],
    aliases: ['barra', 'barras'],
  },
];

function normalizeLookupText(value: string): string {
  return value
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[()]/gu, ' ')
    .replace(/[^a-z0-9ñ\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function aliasMatches(text: string, alias: string): boolean {
  const normalizedAlias = normalizeLookupText(alias);

  if (!normalizedAlias) return false;

  return new RegExp(
    `(?:^|\\s)${escapeRegExp(normalizedAlias)}(?=$|\\s|\\d)`,
    'u',
  ).test(text);
}

function isKnownCanonicalType(type: string): boolean {
  return MASTER_TYPES.has(type) || SPECIAL_TYPES.has(type);
}

function resolveMatchedType(
  canonicalType: string,
  matchedAlias: string,
): VoiceProductIdentification {
  if (!isKnownCanonicalType(canonicalType)) {
    return { status: 'not-found' };
  }

  if (SPECIAL_TYPES.has(canonicalType)) {
    return {
      status: 'matched',
      matchedAlias,
      canonicalType,
      source: 'special',
      candidateProductIds: [],
    };
  }

  const candidateProductIds = PRODUCTOS_PROVEEDOR
    .filter((producto) => producto.tipo === canonicalType)
    .map((producto) => producto.id);

  return {
    status: 'matched',
    matchedAlias,
    canonicalType,
    source: 'master',
    candidateProductIds,
    exactProductId:
      candidateProductIds.length === 1
        ? candidateProductIds[0]
        : undefined,
  };
}

/**
 * ETAPA 3: identifica únicamente la familia/tipo de producto.
 *
 * No extrae cantidad, medidas, precio ni calcula nada. Para familias con
 * múltiples variantes devuelve los IDs candidatos de la tabla maestra; la
 * selección de la variante exacta se reserva para ETAPA 4.
 */
export function identifyVoiceProduct(
  normalizedText: string,
): VoiceProductIdentification {
  const lookupText = normalizeLookupText(normalizedText);

  if (!lookupText) {
    return { status: 'not-found' };
  }

  const aliases = PRODUCT_ALIAS_DICTIONARY.flatMap((entry) =>
    entry.aliases.map((alias) => ({
      alias,
      normalizedAlias: normalizeLookupText(alias),
      canonicalTypes: entry.canonicalTypes,
    })),
  ).sort(
    (left, right) =>
      right.normalizedAlias.length - left.normalizedAlias.length,
  );

  const match = aliases.find((entry) =>
    aliasMatches(lookupText, entry.normalizedAlias),
  );

  if (!match) {
    return { status: 'not-found' };
  }

  const canonicalTypes = match.canonicalTypes.filter(isKnownCanonicalType);

  if (canonicalTypes.length === 0) {
    return { status: 'not-found' };
  }

  if (canonicalTypes.length > 1) {
    return {
      status: 'ambiguous',
      matchedAlias: match.alias,
      canonicalTypes: [...canonicalTypes],
    };
  }

  return resolveMatchedType(canonicalTypes[0], match.alias);
}
