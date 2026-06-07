import Dexie, { type Table } from 'dexie';
import type {
  ConfiguracionApp,
  LineaPresupuesto,
  Presupuesto,
} from '../types/presupuesto';

class PresupuestosNonoDb extends Dexie {
  presupuestos!: Table<Presupuesto, string>;
  lineasPresupuesto!: Table<LineaPresupuesto, string>;
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
  }
}

export const db = new PresupuestosNonoDb();