import type { ConfiguracionApp, Presupuesto } from '../types/presupuesto';
import {
  fechaHoraAhoraISO,
  fechaHoyISO,
  formatearNumeroPresupuesto,
} from '../utils/format';
import { db } from './appDb';

interface DatosClientePresupuesto {
  clienteNombre: string;
  clienteDireccion: string;
  clienteTelefono: string;
  cotizacionUsdAl: string;
}

export async function obtenerOInicializarConfiguracion(): Promise<ConfiguracionApp> {
  const configuracionExistente = await db.configuracion.get('principal');

  if (configuracionExistente) {
    return configuracionExistente;
  }

  const ahora = fechaHoraAhoraISO();

  const configuracionInicial: ConfiguracionApp = {
    id: 'principal',
    proximoNumero: 1,
    vendedor: 'CARLOS CENTENO',
    moneda: 'USD',
    tamanoTexto: 'muy-grande',
    creadoEn: ahora,
    actualizadoEn: ahora,
  };

  await db.configuracion.put(configuracionInicial);

  return configuracionInicial;
}

export async function listarPresupuestos(): Promise<Presupuesto[]> {
  const presupuestos = await db.presupuestos
    .orderBy('actualizadoEn')
    .reverse()
    .toArray();

  return presupuestos;
}

export async function obtenerPresupuestoPorId(
  id: string,
): Promise<Presupuesto | undefined> {
  return db.presupuestos.get(id);
}

export async function crearPresupuestoBorrador(): Promise<Presupuesto> {
  const ahora = fechaHoraAhoraISO();

  return db.transaction(
    'rw',
    db.presupuestos,
    db.configuracion,
    async () => {
      const configuracion = await obtenerOInicializarConfiguracion();

      const numero = configuracion.proximoNumero;
      const numeroFormateado = formatearNumeroPresupuesto(numero);

      const nuevoPresupuesto: Presupuesto = {
        id: crypto.randomUUID(),
        numero,
        numeroFormateado,
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

      await db.presupuestos.put(nuevoPresupuesto);

      await db.configuracion.update('principal', {
        proximoNumero: numero + 1,
        actualizadoEn: ahora,
      });

      return nuevoPresupuesto;
    },
  );
}

export async function actualizarDatosCliente(
  presupuestoId: string,
  datos: DatosClientePresupuesto,
): Promise<void> {
  await db.presupuestos.update(presupuestoId, {
    clienteNombre: datos.clienteNombre,
    clienteDireccion: datos.clienteDireccion,
    clienteTelefono: datos.clienteTelefono,
    cotizacionUsdAl: datos.cotizacionUsdAl,
    estadoDrive: 'pendiente',
    actualizadoEn: fechaHoraAhoraISO(),
  });
}

export async function marcarPresupuestoEmitido(
  presupuestoId: string,
): Promise<void> {
  await db.presupuestos.update(presupuestoId, {
    estado: 'emitido',
    estadoDrive: 'pendiente',
    actualizadoEn: fechaHoraAhoraISO(),
  });
}