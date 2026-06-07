import type { ConfiguracionApp, Presupuesto } from '../types/presupuesto';
import {
  fechaHoraAhoraISO,
  fechaHoyISO,
  formatearNumeroPresupuesto,
} from '../utils/format';
import { db } from './appDb';

const CONFIG_ID = 'principal' as const;

async function obtenerOInicializarConfiguracion(): Promise<ConfiguracionApp> {
  const existente = await db.configuracion.get(CONFIG_ID);

  if (existente) {
    return existente;
  }

  const ahora = fechaHoraAhoraISO();

  const nuevaConfiguracion: ConfiguracionApp = {
    id: CONFIG_ID,
    proximoNumero: 1,
    vendedor: 'CARLOS CENTENO',
    moneda: 'USD',
    tamanoTexto: 'muy-grande',
    creadoEn: ahora,
    actualizadoEn: ahora,
  };

  await db.configuracion.put(nuevaConfiguracion);

  return nuevaConfiguracion;
}

export async function listarPresupuestos(): Promise<Presupuesto[]> {
  return db.presupuestos.orderBy('actualizadoEn').reverse().toArray();
}

export async function obtenerPresupuestoPorId(
  id: string,
): Promise<Presupuesto | undefined> {
  return db.presupuestos.get(id);
}

export async function crearPresupuestoBorrador(): Promise<Presupuesto> {
  const configuracion = await obtenerOInicializarConfiguracion();
  const ahora = fechaHoraAhoraISO();
  const numero = configuracion.proximoNumero;

  const presupuesto: Presupuesto = {
    id: crypto.randomUUID(),
    numero,
    numeroFormateado: formatearNumeroPresupuesto(numero),
    fechaEmision: fechaHoyISO(),

    clienteNombre: '',
    clienteDireccion: '',
    clienteTelefono: '',

    moneda: configuracion.moneda,
    vendedor: configuracion.vendedor,
    cotizacionUsdAl: '',

    subtotal: 0,
    total: 0,

    estado: 'borrador',
    estadoDrive: 'tablet',

    creadoEn: ahora,
    actualizadoEn: ahora,
  };

  await db.transaction('rw', db.presupuestos, db.configuracion, async () => {
    await db.presupuestos.put(presupuesto);

    await db.configuracion.update(CONFIG_ID, {
      proximoNumero: numero + 1,
      actualizadoEn: ahora,
    });
  });

  return presupuesto;
}

export async function actualizarDatosCliente(
  id: string,
  datos: {
    clienteNombre: string;
    clienteDireccion: string;
    clienteTelefono: string;
  },
): Promise<void> {
  await db.presupuestos.update(id, {
    ...datos,
    estadoDrive: 'pendiente',
    actualizadoEn: fechaHoraAhoraISO(),
  });
}