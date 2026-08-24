export type EstadoPresupuesto = 'borrador' | 'emitido' | 'enviado' | 'anulado';
export type EstadoDrive = 'tablet' | 'pendiente' | 'realizada';
export type TipoCalculoLinea = 'peso' | 'metro' | 'plancha';

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
   * Define cómo se calcula el subtotal de la línea.
   * - peso: perfiles/barras y otros productos cotizados por kg.
   * - metro: chapas acanaladas/trapezoidales cotizadas por metro lineal.
   * - plancha: planchas calculadas por volumen y cotizadas por kg.
   *
   * Es opcional para mantener compatibilidad con líneas antiguas.
   * Si no existe, se interpreta como "peso".
   */
  tipoCalculo?: TipoCalculoLinea;

  /**
   * Largo del producto.
   * - peso y metro: metros.
   * - plancha: milímetros.
   */
  largo?: number;

  /** Ancho de una plancha, en milímetros. */
  ancho?: number;

  /** Espesor de una plancha, en milímetros. */
  espesor?: number;

  /** Masa nominal del producto de proveedor, en kg/m, cuando corresponda. */
  masaNominal?: number;

  /**
   * Peso total en kg para productos cotizados por peso y para planchas.
   * En productos cotizados por metro se conserva en 0.
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
