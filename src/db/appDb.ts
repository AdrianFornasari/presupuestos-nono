import Dexie, { type Table } from 'dexie';
import type {
  ConfiguracionApp,
  LineaPresupuesto,
  PdfPresupuesto,
  Presupuesto,
} from '../types/presupuesto';

class PresupuestosNonoDb extends Dexie {
  presupuestos!: Table<Presupuesto, string>;
  lineasPresupuesto!: Table<LineaPresupuesto, string>;
  pdfsPresupuesto!: Table<PdfPresupuesto, string>;
  configuracion!: Table<ConfiguracionApp, string>;

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
  }
}

export const db = new PresupuestosNonoDb();