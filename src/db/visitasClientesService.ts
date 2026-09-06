import { db } from './appDb';
import type {
  DatosNuevaVisita,
  EstadoSyncVisita,
  VisitaCliente,
} from '../types/visitaCliente';

function crearIdVisita(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `visita-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function crearVisitaCliente(
  datos: DatosNuevaVisita,
): Promise<VisitaCliente> {
  const ahora = new Date().toISOString();

  const visita: VisitaCliente = {
    id: crearIdVisita(),
    fecha: datos.fecha,
    cliente: datos.cliente.trim(),
    entrevista: datos.entrevista.trim(),
    estadoSync: 'pendiente',
    creadoEn: ahora,
    actualizadoEn: ahora,
  };

  await db.visitasClientes.add(visita);

  return visita;
}

export async function listarVisitasClientes(
  limite = 30,
): Promise<VisitaCliente[]> {
  return db.visitasClientes
    .orderBy('creadoEn')
    .reverse()
    .limit(limite)
    .toArray();
}

export async function listarVisitasParaSincronizar(): Promise<VisitaCliente[]> {
  const visitas: VisitaCliente[] = await db.visitasClientes.toArray();

  return visitas
    .filter(
      (visita: VisitaCliente) =>
        visita.estadoSync === 'pendiente' ||
        visita.estadoSync === 'error' ||
        visita.estadoSync === 'sincronizando',
    )
    .sort((a: VisitaCliente, b: VisitaCliente) =>
      a.creadoEn.localeCompare(b.creadoEn),
    );
}

export async function actualizarEstadoSyncVisita(
  id: string,
  estadoSync: EstadoSyncVisita,
  ultimoError = '',
): Promise<void> {
  const cambios: Partial<VisitaCliente> = {
    estadoSync,
    actualizadoEn: new Date().toISOString(),
  };

  if (estadoSync === 'sincronizada') {
    cambios.sincronizadaEn = new Date().toISOString();
    cambios.ultimoError = '';
  } else if (ultimoError) {
    cambios.ultimoError = ultimoError;
  }

  await db.visitasClientes.update(id, cambios);
}
