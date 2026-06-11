import type { LineaPresupuesto } from '../types/presupuesto';
import { fechaHoraAhoraISO } from '../utils/format';
import { db } from './appDb';

interface NuevaLineaPresupuesto {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  acumulado: number;
}

export async function listarLineasPorPresupuesto(
  presupuestoId: string,
): Promise<LineaPresupuesto[]> {
  return db.lineasPresupuesto
    .where('presupuestoId')
    .equals(presupuestoId)
    .sortBy('orden');
}

export async function agregarLineaPresupuesto(
  presupuestoId: string,
  datos: NuevaLineaPresupuesto,
): Promise<void> {
  const ahora = fechaHoraAhoraISO();

  await db.transaction(
    'rw',
    db.lineasPresupuesto,
    db.presupuestos,
    async () => {
      const lineasActuales = await db.lineasPresupuesto
        .where('presupuestoId')
        .equals(presupuestoId)
        .toArray();

      const orden =
        lineasActuales.length === 0
          ? 1
          : Math.max(...lineasActuales.map((linea) => linea.orden)) + 1;

      const subtotal = datos.cantidad * datos.precioUnitario;

      const nuevaLinea: LineaPresupuesto = {
        id: crypto.randomUUID(),
        presupuestoId,
        orden,
        descripcion: datos.descripcion,
        cantidad: datos.cantidad,
        unidad: datos.unidad,
        precioUnitario: datos.precioUnitario,
        acumulado: datos.acumulado,
        subtotal,
        creadoEn: ahora,
        actualizadoEn: ahora,
      };

      await db.lineasPresupuesto.put(nuevaLinea);
      await recalcularTotalPresupuestoDentroTransaccion(presupuestoId);
    },
  );
}

export async function eliminarLineaPresupuesto(
  presupuestoId: string,
  lineaId: string,
): Promise<void> {
  await db.transaction(
    'rw',
    db.lineasPresupuesto,
    db.presupuestos,
    async () => {
      await db.lineasPresupuesto.delete(lineaId);
      await reordenarLineasDentroTransaccion(presupuestoId);
      await recalcularTotalPresupuestoDentroTransaccion(presupuestoId);
    },
  );
}

async function reordenarLineasDentroTransaccion(
  presupuestoId: string,
): Promise<void> {
  const lineas = await db.lineasPresupuesto
    .where('presupuestoId')
    .equals(presupuestoId)
    .sortBy('orden');

  await Promise.all(
    lineas.map((linea, index) =>
      db.lineasPresupuesto.update(linea.id, {
        orden: index + 1,
        actualizadoEn: fechaHoraAhoraISO(),
      }),
    ),
  );
}

async function recalcularTotalPresupuestoDentroTransaccion(
  presupuestoId: string,
): Promise<void> {
  const ahora = fechaHoraAhoraISO();

  const lineas = await db.lineasPresupuesto
    .where('presupuestoId')
    .equals(presupuestoId)
    .toArray();

  const total = lineas.reduce((acum, linea) => acum + linea.subtotal, 0);

  await db.presupuestos.update(presupuestoId, {
    subtotal: total,
    total,
    estadoDrive: 'pendiente',
    actualizadoEn: ahora,
  });
}