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

function parsearFraccionPrecio(frase: string): number | null {
  const normalizada = frase.trim().toLocaleLowerCase('es-AR');

  const ceroMasUnidad = normalizada.match(
    /^cero\s+(un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)$/u,
  );

  if (ceroMasUnidad) {
    return UNIDADES[ceroMasUnidad[1]] ?? null;
  }

  const valor = parsearNumeroEspanol(normalizada);

  if (valor === null || valor < 0 || valor > 99) {
    return null;
  }

  return valor;
}

function normalizarPreciosHablados(texto: string): string {
  const entero = '(?:cero|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)';
  const fraccion = `(?:cero\\s+(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)|${PATRON_PALABRA_NUMERO}(?:(?:\\s+y\\s+|\\s+)(?:${PATRON_PALABRA_NUMERO}))?)`;
  const contextoPrecio =
    '(?=\\s+(?:(?:el\\s+)?(?:kilo|kilos|kg|kilogramo|kilogramos)|(?:por\\s+)?(?:metro|metros|m))\\b)';

  const conSeparador = new RegExp(
    `\\b(${entero})\\s+(?:con|coma)\\s+(${fraccion})${contextoPrecio}`,
    'giu',
  );

  let resultado = texto.replace(
    conSeparador,
    (coincidencia, parteEntera: string, parteDecimal: string) => {
      const enteroNumerico = parsearNumeroEspanol(parteEntera);
      const decimalNumerico = parsearFraccionPrecio(parteDecimal);

      if (enteroNumerico === null || decimalNumerico === null) {
        return coincidencia;
      }

      return `${enteroNumerico},${String(decimalNumerico).padStart(2, '0')}`;
    },
  );

  // Chrome/Android puede mezclar palabras y cifras, por ejemplo
  // "uno con 80 por metro". Ese patrón sigue siendo un precio hablado.
  const conSeparadorMixto = new RegExp(
    `\\b(${entero}|[0-9])\\s+(?:con|coma)\\s+(\\d{1,2})${contextoPrecio}`,
    'giu',
  );

  resultado = resultado.replace(
    conSeparadorMixto,
    (coincidencia, parteEntera: string, parteDecimal: string) => {
      const enteroNumerico = /^\d$/u.test(parteEntera)
        ? Number(parteEntera)
        : parsearNumeroEspanol(parteEntera);
      const decimalNumerico = Number(parteDecimal);

      if (
        enteroNumerico === null ||
        !Number.isInteger(decimalNumerico) ||
        decimalNumerico < 0 ||
        decimalNumerico > 99
      ) {
        return coincidencia;
      }

      return `${enteroNumerico},${String(decimalNumerico).padStart(2, '0')}`;
    },
  );

  const sinSeparador = new RegExp(
    `\\b(${entero})\\s+((?:diez|once|doce|trece|catorce|quince|dieciseis|dieciséis|diecisiete|dieciocho|diecinueve|veinte|veintiuno|veintiun|veintiún|veintiuna|veintidos|veintidós|veintitres|veintitrés|veinticuatro|veinticinco|veintiseis|veintiséis|veintisiete|veintiocho|veintinueve|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)(?:\\s+y\\s+(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))?)${contextoPrecio}`,
    'giu',
  );

  resultado = resultado.replace(
    sinSeparador,
    (coincidencia, parteEntera: string, parteDecimal: string) => {
      const enteroNumerico = parsearNumeroEspanol(parteEntera);
      const decimalNumerico = parsearFraccionPrecio(parteDecimal);

      if (enteroNumerico === null || decimalNumerico === null) {
        return coincidencia;
      }

      return `${enteroNumerico},${String(decimalNumerico).padStart(2, '0')}`;
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

function normalizarDecimalesNumericos(texto: string): string {
  return texto.replace(/\b(\d+)\.(\d{1,2})\b/gu, '$1,$2');
}

function normalizarPrecioCompactado(texto: string): string {
  // SpeechRecognition suele convertir "uno cuarenta" en "140".
  // No se modifica cualquier número de tres cifras seguido de kg: "200 kg"
  // puede ser perfectamente una cantidad. La corrección exige una señal de
  // precio ("a"/"precio") o que toda la frase sea sólo el precio.
  let resultado = texto.replace(
    /\b(a|precio)\s+([1-9])(\d{2})\b(?=\s+(?:(?:el\s+)?(?:kilo|kilos|kg|kilogramo|kilogramos)|(?:por\s+)?(?:metro|metros|m))\b)/giu,
    '$1 $2,$3',
  );

  resultado = resultado.replace(
    /^\s*([1-9])(\d{2})\s+((?:el\s+)?(?:kilo|kilos|kg|kilogramo|kilogramos)|(?:por\s+)?(?:metro|metros|m))\s*[.!]?\s*$/iu,
    '$1,$2 $3',
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

  if (!entero || !/^\d+$/u.test(entero) || !/^\d{0,2}$/u.test(decimales)) {
    return limpio;
  }

  return `${entero},${decimales.padEnd(2, '0')}`;
}

function normalizarUnidadesPrecio(texto: string): string {
  const precio = '(\\$?\\s*\\d+(?:,\\d{1,2})?)';

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
      `^\\s*${precio}\\s+(?:(?:el|por)\\s+)?kg\\s*[.!]?\\s*$`,
      'iu',
    ),
    (_coincidencia, valor: string) => `${formatearPrecioCanonico(valor)}/kg`,
  );

  resultado = resultado.replace(
    new RegExp(
      `^\\s*${precio}\\s+(?:(?:el|por)\\s+)?m\\s*[.!]?\\s*$`,
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
 * ETAPA 2: normalización lingüística determinística.
 *
 * Recibe exactamente el texto devuelto por SpeechRecognition y produce una
 * versión canónica para mostrar y, en etapas posteriores, entregar al
 * CommandInterpreter. No identifica productos ni calcula pesos/importes.
 */
export function normalizeVoiceText(text: string): string {
  let resultado = limpiarEspacios(text);

  if (!resultado) return '';

  resultado = normalizarTerminosReconocidos(resultado);
  resultado = normalizarPreciosHablados(resultado);
  resultado = normalizarNumerosEnPalabras(resultado);
  resultado = normalizarDecimalesNumericos(resultado);
  resultado = normalizarPrecioCompactado(resultado);
  resultado = normalizarUnidades(resultado);
  resultado = normalizarUnidadesPrecio(resultado);
  resultado = normalizarMediosMetros(resultado);
  resultado = normalizarEspesor(resultado);
  resultado = normalizarDimensiones(resultado);

  return limpiarEspacios(resultado);
}
