import Dexie, { type Table } from 'dexie';
import type {
  ConfiguracionApp,
  LineaPresupuesto,
  PdfPresupuesto,
  Presupuesto,
} from '../types/presupuesto';
import type { VisitaCliente } from '../types/visitaCliente';
import type { VoiceTranscriptionLog } from '../voice/types/voice';

class PresupuestosNonoDb extends Dexie {
  presupuestos!: Table<Presupuesto, string>;
  lineasPresupuesto!: Table<LineaPresupuesto, string>;
  pdfsPresupuesto!: Table<PdfPresupuesto, string>;
  configuracion!: Table<ConfiguracionApp, string>;
  visitasClientes!: Table<VisitaCliente, string>;
  voiceTranscriptions!: Table<VoiceTranscriptionLog, string>;

  constructor() {
    super('presupuestos-nono-db');

    this.version(1).stores({
      presupuestos:
        'id, numero, numeroFormateado, fechaEmision, clienteNombre, estado, estadoDrive, actualizadoEn',
      lineasPresupuesto:
        'id, presupuestoId, orden, descripcion, actualizadoEn',
      configuracion: 'id',
    });

    this.version(2).stores({
      presupuestos:
        'id, numero, numeroFormateado, fechaEmision, clienteNombre, estado, estadoDrive, actualizadoEn',
      lineasPresupuesto:
        'id, presupuestoId, orden, descripcion, actualizadoEn',
      pdfsPresupuesto:
        'id, presupuestoId, version, nombreArchivo, creadoEn',
      configuracion: 'id',
    });

    this.version(3).stores({
      presupuestos:
        'id, numero, numeroFormateado, fechaEmision, clienteNombre, estado, estadoDrive, actualizadoEn',
      lineasPresupuesto:
        'id, presupuestoId, orden, descripcion, actualizadoEn',
      pdfsPresupuesto:
        'id, presupuestoId, version, nombreArchivo, creadoEn',
      configuracion: 'id',
      visitasClientes:
        'id, fecha, cliente, estadoSync, creadoEn, actualizadoEn',
    });

    this.version(4).stores({
      presupuestos:
        'id, numero, numeroFormateado, fechaEmision, clienteNombre, estado, estadoDrive, actualizadoEn',
      lineasPresupuesto:
        'id, presupuestoId, orden, descripcion, actualizadoEn',
      pdfsPresupuesto:
        'id, presupuestoId, version, nombreArchivo, creadoEn',
      configuracion: 'id',
      visitasClientes:
        'id, fecha, cliente, estadoSync, creadoEn, actualizadoEn',
      voiceTranscriptions:
        'id, fechaHora, presupuestoId, evaluacion, actualizadoEn',
    });
  }
}

export const db = new PresupuestosNonoDb();
