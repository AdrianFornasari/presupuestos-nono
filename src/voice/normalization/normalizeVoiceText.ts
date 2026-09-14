const UNIDADES: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  'dieciséis': 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintiun: 21,
  veintiún: 21,
  veintiuna: 21,
  veintidos: 22,
  'veintidós': 22,
  veintitres: 23,
  'veintitrés': 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  'veintiséis': 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
};

const DECENAS: Record<string, number> = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

const CENTENAS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

const PALABRAS_NUMERO = [
  ...Object.keys(UNIDADES),
  ...Object.keys(DECENAS),
  ...Object.keys(CENTENAS),
  'mil',
].sort((a, b) => b.length - a.length);

const PATRON_PALABRA_NUMERO = PALABRAS_NUMERO
  .map((palabra) => palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

const REGEX_SECUENCIA_NUMERICA = new RegExp(
  `\\b(?:${PATRON_PALABRA_NUMERO})(?:(?:\\s+y\\s+|\\s+)(?:${PATRON_PALABRA_NUMERO}))*\\b`,
  'giu',
);

function limpiarPalabra(palabra: string): string {
  return palabra.toLocaleLowerCase('es-AR');
}

function parsearNumeroEspanol(frase: string): number | null {
  const tokens = frase
    .trim()
    .split(/\s+/u)
    .map(limpiarPalabra)
    .filter((token) => token !== 'y');

  if (tokens.length === 0) return null;

  let total = 0;
  let parcial = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const siguiente = tokens[index + 1];

    if (token === 'mil') {
      total += (parcial || 1) * 1000;
      parcial = 0;
      continue;
    }

    const centena = CENTENAS[token];
    if (centena !== undefined) {
      parcial += centena;
      continue;
    }

    const decena = DECENAS[token];
    if (decena !== undefined) {
      parcial += decena;
      continue;
    }

    const unidad = UNIDADES[token];
    if (unidad !== undefined) {
      // "dos mil" es válido; "uno cuarenta" no es un cardinal español
      // estándar y se reserva para precios hablados (1,40).
      if (
        unidad >= 0 &&
        unidad <= 9 &&
        siguiente &&
        DECENAS[siguiente] !== undefined
      ) {
        return null;
      }

      parcial += unidad;
      continue;
    }

    return null;
  }

  return total + parcial;
}

function palabraADigito(palabra: string): string | null {
  const valor = UNIDADES[limpiarPalabra(palabra)];

  if (valor === undefined || valor < 0 || valor > 9) {
    return null;
  }

  return String(valor);
}

function parsearFraccionPrecio(frase: string): string | null {
  const normalizada = frase
    .trim()
    .toLocaleLowerCase('es-AR')
    .replace(/\s+/gu, ' ');

  if (!normalizada) return null;

  // Si SpeechRecognition ya devolvió cifras, se preserva el ancho porque
  // "05" significa 0,05 y luego se completa a tres decimales como 050.
  if (/^\d{1,3}$/u.test(normalizada)) {
    return normalizada;
  }

  const tokens = normalizada
    .split(/\s+/u)
    .filter((token) => token !== 'y');

  // Forma dígito por dígito: "cuatro dos cinco" -> 425.
  if (tokens.length >= 1 && tokens.length <= 3) {
    const digitos = tokens.map(palabraADigito);

    if (digitos.every((digito) => digito !== null)) {
      return digitos.join('');
    }
  }

  // Forma agrupada habitual del rubro: "cuatro veinticinco" -> 425,
  // "cero ochenta" -> 080. El primer grupo debe ser un solo dígito y el
  // segundo un número entre 10 y 99.
  if (tokens.length >= 2) {
    const primerDigito = palabraADigito(tokens[0]);
    const resto = parsearNumeroEspanol(tokens.slice(1).join(' '));

    if (
      primerDigito !== null &&
      resto !== null &&
      resto >= 10 &&
      resto <= 99
    ) {
      return `${primerDigito}${String(resto).padStart(2, '0')}`;
    }
  }

  // Forma cardinal: "cuarenta" -> 40, "cuatrocientos veinticinco" -> 425.
  const valor = parsearNumeroEspanol(normalizada);

  if (valor === null || valor < 0 || valor > 999) {
    return null;
  }

  return String(valor);
}

function normalizarFraccionPrecio(fraccion: string): string | null {
  const parsed = parsearFraccionPrecio(fraccion);

  if (parsed === null || !/^\d{1,3}$/u.test(parsed)) {
    return null;
  }

  return parsed.padEnd(3, '0');
}


function normalizarPrefijoPrecioPegado(texto: string): string {
  // SpeechRecognition a veces elimina el espacio después de la preposición
  // de precio: "a uno ochocientos" puede llegar como "a1 800".
  // Sólo se corrige cuando inmediatamente después hay una unidad inequívoca
  // de precio, para no alterar códigos, medidas ni otras cadenas alfanuméricas.
  const unidadPrecio =
    '(?:(?:el\\s+|por\\s+)?(?:kilo|kilos|kg|kilogramo|kilogramos)|(?:por\\s+)?(?:metro|metros|m)|(?:cada\\s+(?:una|uno)|por\\s+unidad|unidad|und))';

  return texto.replace(
    new RegExp(
      `\\b(a|precio)(?=\\d\\s+\\d{1,3}\\s+${unidadPrecio}\\b)`,
      'giu',
    ),
    '$1 ',
  );
}

function normalizarPreciosHablados(texto: string): string {
  const entero =
    '(?:cero|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|[0-9])';
  const componenteDecimal = `(?:${PATRON_PALABRA_NUMERO}|\\d{1,3})`;
  const fraccion = `(?:${componenteDecimal})(?:(?:\\s+y\\s+|\\s+)${componenteDecimal}){0,3}`;
  const unidadPrecio =
    '(?:(?:el\\s+|por\\s+)?(?:kilo|kilos|kg|kilogramo|kilogramos)|(?:por\\s+)?(?:metro|metros|m)|(?:cada\\s+(?:una|uno)|por\\s+unidad|unidad|und))';
  const unidadPrecioSolo =
    '(?:(?:el|por)\\s+(?:kilo|kilos|kg|kilogramo|kilogramos|metro|metros|m)|(?:cada\\s+(?:una|uno)|por\\s+unidad|unidad|und))';

  const parsearEntero = (valor: string): number | null => {
    if (/^[0-9]$/u.test(valor)) return Number(valor);
    return parsearNumeroEspanol(valor);
  };

  const reemplazar = (
    coincidencia: string,
    prefijo: string,
    parteEntera: string,
    parteDecimal: string,
  ): string => {
    const enteroNumerico = parsearEntero(parteEntera);
    const decimalCanonico = normalizarFraccionPrecio(parteDecimal);

    if (enteroNumerico === null || decimalCanonico === null) {
      return coincidencia;
    }

    return `${prefijo}${enteroNumerico},${decimalCanonico}`;
  };

  // Dentro de una frase completa exigimos una señal explícita de precio.
  // Esto evita confundir medidas como "2 12 m" con un precio.
  const conSeparadorContextual = new RegExp(
    `\\b(a|precio)\\s+(${entero})\\s+(?:con|coma)\\s+(${fraccion})(?=\\s+${unidadPrecio}\\b)`,
    'giu',
  );

  let resultado = texto.replace(
    conSeparadorContextual,
    (coincidencia, prefijo: string, parteEntera: string, parteDecimal: string) =>
      reemplazar(coincidencia, `${prefijo} `, parteEntera, parteDecimal),
  );

  const sinSeparadorContextual = new RegExp(
    `\\b(a|precio)\\s+(${entero})\\s+(${fraccion})(?=\\s+${unidadPrecio}\\b)`,
    'giu',
  );

  resultado = resultado.replace(
    sinSeparadorContextual,
    (coincidencia, prefijo: string, parteEntera: string, parteDecimal: string) =>
      reemplazar(coincidencia, `${prefijo} `, parteEntera, parteDecimal),
  );

  // Si toda la frase es solamente un precio, no hace falta el prefijo "a".
  const conSeparadorSolo = new RegExp(
    `^\\s*(${entero})\\s+(?:con|coma)\\s+(${fraccion})\\s+(${unidadPrecioSolo})\\s*[.!]?\\s*$`,
    'iu',
  );

  resultado = resultado.replace(
    conSeparadorSolo,
    (coincidencia, parteEntera: string, parteDecimal: string, unidad: string) => {
      const enteroNumerico = parsearEntero(parteEntera);
      const decimalCanonico = normalizarFraccionPrecio(parteDecimal);

      if (enteroNumerico === null || decimalCanonico === null) {
        return coincidencia;
      }

      return `${enteroNumerico},${decimalCanonico} ${unidad}`;
    },
  );

  const sinSeparadorSolo = new RegExp(
    `^\\s*(${entero})\\s+(${fraccion})\\s+(${unidadPrecioSolo})\\s*[.!]?\\s*$`,
    'iu',
  );

  resultado = resultado.replace(
    sinSeparadorSolo,
    (coincidencia, parteEntera: string, parteDecimal: string, unidad: string) => {
      const enteroNumerico = parsearEntero(parteEntera);
      const decimalCanonico = normalizarFraccionPrecio(parteDecimal);

      if (enteroNumerico === null || decimalCanonico === null) {
        return coincidencia;
      }

      return `${enteroNumerico},${decimalCanonico} ${unidad}`;
    },
  );

  return resultado;
}

function normalizarNumerosEnPalabras(texto: string): string {
  return texto.replace(
    REGEX_SECUENCIA_NUMERICA,
    (coincidencia: string, offset: number, cadenaCompleta: string) => {
      const antes = cadenaCompleta.slice(0, offset);

      // "cada una" es una expresión de unidad, no una cantidad a reescribir.
      if (/cada\s+$/iu.test(antes) && /^(?:un|uno|una)$/iu.test(coincidencia)) {
        return coincidencia;
      }

      const valor = parsearNumeroEspanol(coincidencia);
      return valor === null ? coincidencia : String(valor);
    },
  );
}

function normalizarSeparadoresDecimalesGenerales(texto: string): string {
  // Decimales de medidas/cantidades que no son precios. Se limita a cifras
  // ya reconocidas para no reinterpretar lenguaje libre.
  return texto
    .replace(/\b(\d+)\s+coma\s+(\d{1,3})\b/giu, '$1,$2')
    .replace(
      /\b(\d+)\s+con\s+(\d{1,3})\b(?=\s+(?:mm|mil[ií]metros?|m|metros?|kg|kilos?|kilogramos?)\b)/giu,
      '$1,$2',
    );
}

function normalizarDecimalesNumericos(texto: string): string {
  return texto.replace(/\b(\d+)\.(\d{1,3})\b/gu, '$1,$2');
}

function normalizarPrecioCompactado(texto: string): string {
  // SpeechRecognition puede compactar precios hablados:
  // "uno cuarenta" -> 140   => 1,400
  // "uno cuatro veinticinco" -> 1425 => 1,425
  // La corrección sólo se hace en contexto explícito de precio para no tocar
  // cantidades legítimas como "200 kg de recortes".
  const contextoUnidad =
    '(?=\\s+(?:(?:el\\s+)?(?:kilo|kilos|kg|kilogramo|kilogramos)|(?:por\\s+)?(?:metro|metros|m)|(?:cada\\s+(?:una|uno)|por\\s+unidad|unidad|und))\\b)';

  let resultado = texto.replace(
    new RegExp(
      `\\b(a|precio)\\s+([0-9])(\\d{2,3})\\b${contextoUnidad}`,
      'giu',
    ),
    (_coincidencia, prefijo: string, entero: string, decimales: string) =>
      `${prefijo} ${entero},${decimales.padEnd(3, '0')}`,
  );

  resultado = resultado.replace(
    new RegExp(
      `^\\s*([0-9])(\\d{2,3})\\s+((?:(?:el\\s+)?(?:kilo|kilos|kg|kilogramo|kilogramos)|(?:por\\s+)?(?:metro|metros|m)|(?:cada\\s+(?:una|uno)|por\\s+unidad|unidad|und)))\\s*[.!]?\\s*$`,
      'iu',
    ),
    (_coincidencia, entero: string, decimales: string, unidad: string) =>
      `${entero},${decimales.padEnd(3, '0')} ${unidad}`,
  );

  return resultado;
}

function normalizarTerminosReconocidos(texto: string): string {
  return texto
    .replace(/\b(?:masha|maya)\b/giu, 'malla')
    .replace(/\b(?:mashas|mayas)\b/giu, 'mallas')
    .replace(/\bypn\b/giu, 'IPN')
    .replace(/\bipn\b/giu, 'IPN')
    .replace(/\b(?:ipe|ype)\b/giu, 'IPE')
    .replace(/\bperfil(?:es)?\s+c\b/giu, (coincidencia) =>
      coincidencia.toLocaleLowerCase('es-AR').startsWith('perfiles')
        ? 'perfiles C'
        : 'perfil C',
    )
    .replace(/\bperfil(?:es)?\s+u\b/giu, (coincidencia) =>
      coincidencia.toLocaleLowerCase('es-AR').startsWith('perfiles')
        ? 'perfiles U'
        : 'perfil U',
    )
    .replace(/\bdoble\s+t\b/giu, 'doble T');
}

function normalizarUnidades(texto: string): string {
  return texto
    .replace(/\bmil[ií]metros?\b/giu, 'mm')
    .replace(/\bkilogramos?\b/giu, 'kg')
    .replace(/\bkilos?\b/giu, 'kg')
    .replace(/\bmetros?\b/giu, 'm');
}

function formatearPrecioCanonico(valor: string): string {
  const limpio = valor.replace(/\$/gu, '').replace(/\s+/gu, '');
  const [entero, decimales = ''] = limpio.split(',');

  if (!entero || !/^\d+$/u.test(entero) || !/^\d{0,3}$/u.test(decimales)) {
    return limpio;
  }

  return `${entero},${decimales.padEnd(3, '0')}`;
}

function normalizarUnidadesPrecio(texto: string): string {
  const precio = '(\\$?\\s*\\d+(?:,\\d{1,3})?)';

  let resultado = texto.replace(
    new RegExp(
      `\\b(a|precio)\\s+${precio}\\s+(?:(?:el|por)\\s+)?kg\\b`,
      'giu',
    ),
    (_coincidencia, prefijo: string, valor: string) =>
      `${prefijo} ${formatearPrecioCanonico(valor)}/kg`,
  );

  resultado = resultado.replace(
    new RegExp(
      `\\b(a|precio)\\s+${precio}\\s+(?:(?:el|por)\\s+)?m\\b`,
      'giu',
    ),
    (_coincidencia, prefijo: string, valor: string) =>
      `${prefijo} ${formatearPrecioCanonico(valor)}/m`,
  );

  resultado = resultado.replace(
    new RegExp(
      `^\\s*${precio}\\s+(?:el|por)\\s+kg\\s*[.!]?\\s*$`,
      'iu',
    ),
    (_coincidencia, valor: string) => `${formatearPrecioCanonico(valor)}/kg`,
  );

  resultado = resultado.replace(
    new RegExp(
      `^\\s*${precio}\\s+(?:el|por)\\s+m\\s*[.!]?\\s*$`,
      'iu',
    ),
    (_coincidencia, valor: string) => `${formatearPrecioCanonico(valor)}/m`,
  );

  // Para productos por unidad (por ejemplo Mallas), "cada una" expresa la
  // unidad de cotización. Sólo se normaliza dentro de un contexto de precio.
  resultado = resultado.replace(
    new RegExp(
      `\\b(a|precio)\\s+${precio}\\s+(?:cada\\s+(?:una|uno)|por\\s+unidad|unidad|und)\\b`,
      'giu',
    ),
    (_coincidencia, prefijo: string, valor: string) =>
      `${prefijo} ${formatearPrecioCanonico(valor)}/Und`,
  );

  return resultado;
}

function normalizarPrecisionFinalPrecios(texto: string): string {
  // Última barrera de consistencia: cualquier precio que ya tenga unidad
  // canónica termina siempre con coma y exactamente tres decimales.
  // También elimina un eventual "$" residual del reconocimiento.
  return texto.replace(
    /(?:\$\s*)?(\d+)(?:,(\d{1,3}))?\/(kg|m|und)\b/giu,
    (_coincidencia, entero: string, decimales = '', unidad: string) => {
      const unidadCanonica =
        unidad.toLocaleLowerCase('es-AR') === 'und' ? 'Und' : unidad.toLocaleLowerCase('es-AR');
      return `${entero},${decimales.padEnd(3, '0')}/${unidadCanonica}`;
    },
  );
}

function normalizarEspesor(texto: string): string {
  let resultado = texto.replace(
    /\bdel\s+(\d+(?:,\d+)?)(?:\s*mm\b)?/giu,
    'espesor $1 mm',
  );

  resultado = resultado.replace(
    /\bespesor\s+(\d+(?:,\d+)?)(?:\s*mm\b)?/giu,
    'espesor $1 mm',
  );

  return resultado;
}

function normalizarDimensiones(texto: string): string {
  // El número de la derecha se mira con lookahead pero no se consume. Así una
  // cadena como "100 por 50 por 15" puede normalizar ambos separadores.
  return texto.replace(
    /(\d+(?:,\d+)?)\s*(?:por|x|×|%)\s*(?=\d+(?:,\d+)?)/giu,
    '$1 x ',
  );
}

function normalizarMediosMetros(texto: string): string {
  return texto.replace(
    /\b(\d+)\s+m\s+y\s+medio\b/giu,
    (_coincidencia, metros: string) => `${metros},5 m`,
  );
}

function limpiarEspacios(texto: string): string {
  return texto
    .replace(/\s+/gu, ' ')
    .replace(/\s+([,.;:])/gu, '$1')
    .trim();
}

/**
 * ETAPA 2.5: normalización lingüística determinística.
 *
 * Convención de precios: coma como separador decimal y tres decimales
 * canónicos (por ejemplo 1,400/kg, 1,800/m y 50,000/Und).
 *
 * Recibe exactamente el texto devuelto por SpeechRecognition y produce una
 * versión canónica para mostrar y, en etapas posteriores, entregar al
 * CommandInterpreter. No identifica productos ni calcula pesos/importes.
 */
export function normalizeVoiceText(text: string): string {
  let resultado = limpiarEspacios(text);

  if (!resultado) return '';

  resultado = normalizarTerminosReconocidos(resultado);
  resultado = normalizarPrefijoPrecioPegado(resultado);
  resultado = normalizarPreciosHablados(resultado);
  resultado = normalizarNumerosEnPalabras(resultado);
  resultado = normalizarSeparadoresDecimalesGenerales(resultado);
  resultado = normalizarDecimalesNumericos(resultado);
  resultado = normalizarPrecioCompactado(resultado);
  resultado = normalizarUnidades(resultado);
  resultado = normalizarUnidadesPrecio(resultado);
  resultado = normalizarPrecisionFinalPrecios(resultado);
  resultado = normalizarMediosMetros(resultado);
  resultado = normalizarEspesor(resultado);
  resultado = normalizarDimensiones(resultado);

  return limpiarEspacios(resultado);
}
