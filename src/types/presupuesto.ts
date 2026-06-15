export type EstadoPresupuesto = 'borrador' | 'emitido' | 'enviado' | 'anulado';
export type EstadoDrive = 'tablet' | 'pendiente' | 'realizada';

export interface Presupuesto {
  id: string;
  numero: number;
  numeroFormateado: string;
  fechaEmision: string;

  clienteNombre: string;
  clienteDireccion: string;
  clienteTelefono: string;

  moneda: 'USD';
  vendedor: string;
  cotizacionUsdAl: string;

  subtotal: number;
  total: number;

  estado: EstadoPresupuesto;
  estadoDrive: EstadoDrive;

  creadoEn: string;
  actualizadoEn: string;
}

export interface LineaPresupuesto {
  id: string;
  presupuestoId: string;
  orden: number;

  descripcion: string;
  cantidad: number;
  unidad: string;

  precioUnitario: number;

  /**
   * Campo vigente.
   * En pantalla se muestra como "Peso total".
   */
  pesoTotal: number;

  /**
   * Campo viejo, conservado sólo por compatibilidad con datos ya guardados.
   * No debe mostrarse como etiqueta en la interfaz.
   */
  acumulado?: number;

  subtotal: number;

  creadoEn: string;
  actualizadoEn: string;
}

export interface PdfPresupuesto {
  id: string;
  presupuestoId: string;
  version: number;
  nombreArchivo: string;
  archivo: Blob;
  creadoEn: string;
}

export interface ConfiguracionApp {
  id: 'principal';
  proximoNumero: number;
  vendedor: string;
  moneda: 'USD';
  tamanoTexto: 'grande' | 'muy-grande' | 'extra-grande';
  creadoEn: string;
  actualizadoEn: string;
}