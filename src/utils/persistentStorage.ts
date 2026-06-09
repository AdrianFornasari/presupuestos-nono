export type EstadoAlmacenamientoPersistente =
  | 'no_soportado'
  | 'activo'
  | 'rechazado'
  | 'error';

export async function solicitarAlmacenamientoPersistente(): Promise<EstadoAlmacenamientoPersistente> {
  try {
    if (!('storage' in navigator) || !('persist' in navigator.storage)) {
      return 'no_soportado';
    }

    const yaPersistente = await navigator.storage.persisted();

    if (yaPersistente) {
      return 'activo';
    }

    const concedido = await navigator.storage.persist();

    return concedido ? 'activo' : 'rechazado';
  } catch {
    return 'error';
  }
}

export function textoEstadoAlmacenamiento(
  estado: EstadoAlmacenamientoPersistente,
): string {
  if (estado === 'activo') {
    return 'Almacenamiento protegido en la tablet.';
  }

  if (estado === 'rechazado') {
    return 'La tablet no concedió almacenamiento protegido. Usá copias de seguridad.';
  }

  if (estado === 'no_soportado') {
    return 'El navegador no informa almacenamiento protegido. Usá copias de seguridad.';
  }

  return 'No se pudo verificar el almacenamiento protegido.';
}