export type EstadoSyncVisita =
  | 'pendiente'
  | 'sincronizando'
  | 'sincronizada'
  | 'error';

export interface VisitaCliente {
  id: string;
  fecha: string;
  cliente: string;
  entrevista: string;
  estadoSync: EstadoSyncVisita;
  ultimoError?: string;
  sincronizadaEn?: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface DatosNuevaVisita {
  fecha: string;
  cliente: string;
  entrevista: string;
}
