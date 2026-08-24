import type {
  LineaPresupuesto,
  TipoCalculoLinea,
} from '../types/presupuesto';
import { fechaHoraAhoraISO, redondearImporte } from '../utils/format';
import { db } from './appDb';

interface DatosLineaPresupuesto {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  pesoTotal: number;
  tipoCalculo: TipoCalculoLinea;
  largo?: number;
  ancho?: number;
  espesor?: number;
  masaNominal?: number;
}

function obtenerTipoCalculoLinea(linea: LineaPresupuesto): TipoCalculoLinea {
  return linea.tipoCalculo ?? 'peso';
}

function obtenerPesoTotalLinea(linea: LineaPresupuesto): number {
  return linea.pesoTotal ?? linea.acumulado ?? 0;
}

function calcularSubtotalDatos(datos: DatosLineaPresupuesto): number {
  if (datos.tipoCalculo === 'metro') {
    const largo = datos.largo ?? 0;
    return redondearImporte(datos.cantidad * largo * datos.precioUnitario);
  }

  return redondearImporte(datos.pesoTotal * datos.precioUnitario);
}

function calcularSubtotalLinea(linea: LineaPresupuesto): number {
  const tipoCalculo = obtenerTipoCalculoLinea(linea);

  if (tipoCalculo === 'metro') {
    const largo = linea.largo ?? 0;
    return redondearImporte(linea.cantidad * largo * linea.precioUnitario);
  }

  return redondearImporte(
    obtenerPesoTotalLinea(linea) * linea.precioUnitario,
  );
}

export async function listarLineasPorPresupuesto(
  presupuestoId: string,
): Promise<LineaPresupuesto[]> {
  const lineas = await db.lineasPresupuesto
    .where('presupuestoId')
    .equals(presupuestoId)
    .sortBy('orden');

  return lineas.map((linea) => {
    const pesoTotal = obtenerPesoTotalLinea(linea);
    const subtotal = calcularSubtotalLinea(linea);

    return {
      ...linea,
      tipoCalculo: obtenerTipoCalculoLinea(linea),
      pesoTotal,
      acumulado: pesoTotal,
      subtotal,
    };
  });
}

export async function agregarLineaPresupuesto(
  presupuestoId: string,
  datos: DatosLineaPresupuesto,
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

      const subtotal = calcularSubtotalDatos(datos);

      const nuevaLinea: LineaPresupuesto = {
        id: crypto.randomUUID(),
        presupuestoId,
        orden,
        descripcion: datos.descripcion,
        cantidad: datos.cantidad,
        unidad: datos.unidad,
        precioUnitario: datos.precioUnitario,
        tipoCalculo: datos.tipoCalculo,
        largo: datos.largo,
        ancho: datos.ancho,
        espesor: datos.espesor,
        masaNominal: datos.masaNominal,
        pesoTotal: datos.pesoTotal,
        acumulado: datos.pesoTotal,
        subtotal,
        creadoEn: ahora,
        actualizadoEn: ahora,
      };

      await db.lineasPresupuesto.put(nuevaLinea);
      await recalcularTotalPresupuestoDentroTransaccion(presupuestoId);
    },
  );
}

export async function actualizarLineaPresupuesto(
  presupuestoId: string,
  lineaId: string,
  datos: DatosLineaPresupuesto,
): Promise<void> {
  const ahora = fechaHoraAhoraISO();

  await db.transaction(
    'rw',
    db.lineasPresupuesto,
    db.presupuestos,
    async () => {
      const lineaExistente = await db.lineasPresupuesto.get(lineaId);

      if (!lineaExistente || lineaExistente.presupuestoId !== presupuestoId) {
        throw new Error('No se encontró el producto para editar.');
      }

      const subtotal = calcularSubtotalDatos(datos);

      await db.lineasPresupuesto.update(lineaId, {
        descripcion: datos.descripcion,
        cantidad: datos.cantidad,
        unidad: datos.unidad,
        precioUnitario: datos.precioUnitario,
        tipoCalculo: datos.tipoCalculo,
        largo: datos.largo,
        ancho: datos.ancho,
        espesor: datos.espesor,
        masaNominal: datos.masaNominal,
        pesoTotal: datos.pesoTotal,
        acumulado: datos.pesoTotal,
        subtotal,
        actualizadoEn: ahora,
      });

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

  const total = redondearImporte(
    lineas.reduce((acum, linea) => acum + calcularSubtotalLinea(linea), 0),
  );

  await db.presupuestos.update(presupuestoId, {
    subtotal: total,
    total,
    estadoDrive: 'pendiente',
    actualizadoEn: ahora,
  });
}
