import type { VisitaCliente } from '../types/visitaCliente';

/*
 * Pegá aquí la URL /exec que entrega Google Apps Script después de desplegar
 * el proyecto como "Aplicación web".
 *
 * Ejemplo:
 * https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxx/exec
 */
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzWXueqBPnqCTClHUgQJOL1fnlxWZn8-E-dPa7Xa38xH81Jxmb0hd-wPWL1S4LAm8VH/exec';

export function estaConfiguradaSincronizacionVisitas(): boolean {
  return (
    GOOGLE_SCRIPT_URL.startsWith('https://script.google.com/macros/s/') &&
    GOOGLE_SCRIPT_URL.endsWith('/exec')
  );
}

export async function enviarVisitaAGoogleSheets(
  visita: VisitaCliente,
): Promise<void> {
  if (!estaConfiguradaSincronizacionVisitas()) {
    throw new Error(
      'Todavía no se configuró la URL de Google Apps Script.',
    );
  }

  const respuesta = await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      id: visita.id,
      fecha: visita.fecha,
      cliente: visita.cliente,
      entrevista: visita.entrevista,
    }),
  });

  if (!respuesta.ok) {
    throw new Error(
      `Google Apps Script respondió con HTTP ${respuesta.status}.`,
    );
  }

  const texto = await respuesta.text();

  if (!texto.trim()) {
    return;
  }

  try {
    const resultado = JSON.parse(texto) as {
      ok?: boolean;
      error?: string;
    };

    if (resultado.ok === false) {
      throw new Error(
        resultado.error || 'Google Apps Script rechazó la visita.',
      );
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return;
    }

    throw error;
  }
}
