import { jsPDF } from 'jspdf';
import { db } from '../db/appDb';
import { marcarPresupuestoEmitido } from '../db/presupuestosService';
import type {
  LineaPresupuesto,
  PdfPresupuesto,
  Presupuesto,
} from '../types/presupuesto';
import { fechaHoraAhoraISO, formatearImporteUSD } from '../utils/format';

const ESCALA_TEXTO = 1.1;

const TABLA_X = 14;
const TABLA_ANCHO = 182;
const TABLA_DERECHA = TABLA_X + TABLA_ANCHO;

const COLUMNA_PRODUCTO_FIN = 91;
const COLUMNA_CANTIDAD_FIN = 119;
const COLUMNA_UNIDAD_FIN = 134;

const ALTO_CABECERA_TABLA = 9;
const ALTO_FILA_MINIMA = 11;
const ALTO_FILA_TOTAL = 12;

const CAJA_LEGAL_X = 14;
const CAJA_LEGAL_ANCHO = 182;
const CAJA_LEGAL_ALTO = 62;
const MARGEN_INFERIOR_CAJA_LEGAL = 12;

const Y_INICIO_TABLA = 96;
const MARGEN_INFERIOR_DETALLE = 18;

function setFontSizeEscalado(doc: jsPDF, tamanioBase: number): void {
  doc.setFontSize(tamanioBase * ESCALA_TEXTO);
}

function limpiarNombreArchivo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function crearNombrePdf(presupuesto: Presupuesto): string {
  const fecha = presupuesto.fechaEmision.replaceAll('-', '');
  const cliente = limpiarNombreArchivo(
    presupuesto.clienteNombre || 'SIN_CLIENTE',
  );

  return `${fecha}-${cliente}-${presupuesto.numeroFormateado}.pdf`;
}

function formatearFechaPdf(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split('-');

  if (!anio || !mes || !dia) {
    return fechaISO;
  }

  return `${dia}-${mes}-${anio}`;
}

function obtenerPesoTotalLinea(linea: LineaPresupuesto): number {
  return linea.pesoTotal ?? linea.acumulado ?? 0;
}

function formatearKilogramos(valor: number): string {
  return `${formatearImporteUSD(valor)} Kg`;
}

function obtenerCajaLegalY(doc: jsPDF): number {
  const altoPagina = doc.internal.pageSize.getHeight();

  return altoPagina - MARGEN_INFERIOR_CAJA_LEGAL - CAJA_LEGAL_ALTO;
}

function obtenerFinColumnaPrecio(doc: jsPDF): number {
  doc.setFont('helvetica', 'bold');
  setFontSizeEscalado(doc, 8.5);

  const anchoTitulo = doc.getTextWidth('Precio unit.');

  return COLUMNA_UNIDAD_FIN + anchoTitulo + 4;
}

function dibujarEncabezado(doc: jsPDF, presupuesto: Presupuesto): void {
  doc.setFont('helvetica', 'bold');
  setFontSizeEscalado(doc, 15);
  doc.text('INDUSTRIAL ACEROS SRL', 14, 16);

  doc.setFont('helvetica', 'normal');
  setFontSizeEscalado(doc, 9);
  doc.text('C.U.I.T.: 30-71696322-1', 14, 22);
  doc.text('I.Brutos: 30716963221', 14, 27);
  doc.text('Fec. Ini.Act.: 01-Aug-20', 14, 32);

  doc.text('341-6768783', 14, 39);
  doc.text('Suipacha 9999', 14, 44);
  doc.text('(2000) ROSARIO - Pcia. SANTA FE', 14, 49);
  doc.text('IVA RESPONSABLE INSCRIPTO', 14, 54);

  doc.setFont('helvetica', 'bold');
  setFontSizeEscalado(doc, 13);
  doc.text('X Cotización', 150, 18);

  doc.setFont('helvetica', 'normal');
  setFontSizeEscalado(doc, 10);
  doc.text(`Fecha: ${formatearFechaPdf(presupuesto.fechaEmision)}`, 150, 27);
  doc.text('Original', 150, 34);

  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE:', 14, 68);
  doc.text('DIRECCIÓN:', 14, 76);
  doc.text('TELÉFONO:', 14, 84);

  doc.setFont('helvetica', 'normal');
  doc.text(presupuesto.clienteNombre || '-', 42, 68);
  doc.text(presupuesto.clienteDireccion || '-', 42, 76);
  doc.text(presupuesto.clienteTelefono || '-', 42, 84);

  doc.setFont('helvetica', 'bold');
  doc.text('MONEDA:', 130, 68);
  doc.text('VENDEDOR:', 130, 76);

  doc.setFont('helvetica', 'normal');
  doc.text('USD', 154, 68);
  doc.text(presupuesto.vendedor || 'CARLOS CENTENO', 154, 76);
}

function dibujarCabeceraTabla(doc: jsPDF, y: number): void {
  const columnaPrecioFin = obtenerFinColumnaPrecio(doc);

  doc.setFillColor(225, 225, 225);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);

  doc.rect(TABLA_X, y, TABLA_ANCHO, ALTO_CABECERA_TABLA, 'FD');

  doc.setFont('helvetica', 'bold');
  setFontSizeEscalado(doc, 8.5);
  doc.setTextColor(0, 0, 0);

  doc.text('Producto', 16, y + 6);

  doc.text(
    'Cantidad',
    (COLUMNA_PRODUCTO_FIN + COLUMNA_CANTIDAD_FIN) / 2,
    y + 6,
    {
      align: 'center',
    },
  );

  doc.text(
    'Unid.',
    (COLUMNA_CANTIDAD_FIN + COLUMNA_UNIDAD_FIN) / 2,
    y + 6,
    {
      align: 'center',
    },
  );

  doc.text(
    'Precio unit.',
    (COLUMNA_UNIDAD_FIN + columnaPrecioFin) / 2,
    y + 6,
    {
      align: 'center',
    },
  );

  doc.text(
    'Subtotal U$S',
    (columnaPrecioFin + TABLA_DERECHA) / 2,
    y + 6,
    {
      align: 'center',
    },
  );

  doc.setLineWidth(0.2);
  doc.line(
    COLUMNA_PRODUCTO_FIN,
    y,
    COLUMNA_PRODUCTO_FIN,
    y + ALTO_CABECERA_TABLA,
  );
  doc.line(
    COLUMNA_CANTIDAD_FIN,
    y,
    COLUMNA_CANTIDAD_FIN,
    y + ALTO_CABECERA_TABLA,
  );
  doc.line(
    COLUMNA_UNIDAD_FIN,
    y,
    COLUMNA_UNIDAD_FIN,
    y + ALTO_CABECERA_TABLA,
  );
  doc.line(
    columnaPrecioFin,
    y,
    columnaPrecioFin,
    y + ALTO_CABECERA_TABLA,
  );
}

function calcularAltoFila(
  doc: jsPDF,
  linea: LineaPresupuesto,
): { descripcionLineas: string[]; altoFila: number } {
  const descripcionLineas = doc.splitTextToSize(
    linea.descripcion,
    COLUMNA_PRODUCTO_FIN - TABLA_X - 5,
  ) as string[];

  const altoTexto = descripcionLineas.length * 4.6;
  const altoFila = Math.max(ALTO_FILA_MINIMA, altoTexto + 4);

  return {
    descripcionLineas,
    altoFila,
  };
}

function dibujarFilaDetalle(
  doc: jsPDF,
  linea: LineaPresupuesto,
  descripcionLineas: string[],
  y: number,
  altoFila: number,
): void {
  const columnaPrecioFin = obtenerFinColumnaPrecio(doc);
  const yTexto = y + 5.6;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(TABLA_X, y, TABLA_ANCHO, altoFila);

  doc.setFont('helvetica', 'normal');
  setFontSizeEscalado(doc, 8);
  doc.setTextColor(0, 0, 0);

  doc.text(descripcionLineas, 16, yTexto, {
    lineHeightFactor: 1.18,
  });

  doc.text(
    formatearKilogramos(obtenerPesoTotalLinea(linea)),
    COLUMNA_CANTIDAD_FIN - 2,
    yTexto,
    {
      align: 'right',
    },
  );

  doc.text(
    String(linea.cantidad),
    (COLUMNA_CANTIDAD_FIN + COLUMNA_UNIDAD_FIN) / 2,
    yTexto,
    {
      align: 'center',
    },
  );

  doc.text(
    formatearImporteUSD(linea.precioUnitario),
    columnaPrecioFin - 2,
    yTexto,
    {
      align: 'right',
    },
  );

  doc.text(
    formatearImporteUSD(linea.subtotal),
    TABLA_DERECHA - 2,
    yTexto,
    {
      align: 'right',
    },
  );

  doc.line(COLUMNA_PRODUCTO_FIN, y, COLUMNA_PRODUCTO_FIN, y + altoFila);
  doc.line(COLUMNA_CANTIDAD_FIN, y, COLUMNA_CANTIDAD_FIN, y + altoFila);
  doc.line(COLUMNA_UNIDAD_FIN, y, COLUMNA_UNIDAD_FIN, y + altoFila);
  doc.line(columnaPrecioFin, y, columnaPrecioFin, y + altoFila);
}

function dibujarFilaTotales(
  doc: jsPDF,
  y: number,
  totalKg: number,
  totalUsd: number,
): void {
  const divisionX = 105;

  doc.setFillColor(205, 205, 205);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);

  doc.rect(TABLA_X, y, TABLA_ANCHO, ALTO_FILA_TOTAL, 'FD');
  doc.line(divisionX, y, divisionX, y + ALTO_FILA_TOTAL);

  doc.setFont('helvetica', 'bold');
  setFontSizeEscalado(doc, 10);
  doc.setTextColor(0, 0, 0);

  doc.text(
    `Total de kg: ${formatearImporteUSD(totalKg)} Kg`,
    18,
    y + 8,
  );

  doc.text(
    `Total U$S: ${formatearImporteUSD(totalUsd)}`,
    TABLA_DERECHA - 4,
    y + 8,
    {
      align: 'right',
    },
  );

  doc.setLineWidth(0.2);
}

function agregarPieLegal(doc: jsPDF, presupuesto: Presupuesto): void {
  const cajaY = obtenerCajaLegalY(doc);
  const separadorY = cajaY + CAJA_LEGAL_ALTO - 12;
  const anchoTexto = CAJA_LEGAL_ANCHO - 8;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.roundedRect(
    CAJA_LEGAL_X,
    cajaY,
    CAJA_LEGAL_ANCHO,
    CAJA_LEGAL_ALTO,
    3.5,
    3.5,
    'S',
  );

  doc.setFont('helvetica', 'normal');
  setFontSizeEscalado(doc, 7.7);
  doc.setTextColor(0, 0, 0);

  const leyendas = [
    'COTIZADO CORRESPONDE AL TEÓRICO, LA FACTURACIÓN DEFINITIVA SE REALIZARÁ CON EL PESAJE REAL DE LA BALANZA.',
    '- PRECIOS COTIZADOS EN DÓLARES, SE VALORIZAN SEGÚN TIPO DE CAMBIO VENDEDOR DE BNA AL CIERRE DEL DÍA ANTERIOR DEL MOMENTO DE LA ENTREGA/FACTURACIÓN.',
    '- ESTOS PRECIOS NO INCLUYEN EL ENVIO. CONSULTAR.',
    '- VALIDEZ DE OFERTA: 24 HS',
    '- LOS PRECIOS EXPRESADOS NO INCLUYEN IMPUESTOS.',
  ];

  let y = cajaY + 7;

  leyendas.forEach((leyenda, indice) => {
    const lineas = doc.splitTextToSize(leyenda, anchoTexto) as string[];

    doc.text(lineas, CAJA_LEGAL_X + 4, y, {
      lineHeightFactor: 1.12,
    });

    y += lineas.length * 4.15;

    if (indice < leyendas.length - 1) {
      y += 0.8;
    }
  });

  doc.setLineWidth(0.3);
  doc.line(
    CAJA_LEGAL_X + 3,
    separadorY,
    CAJA_LEGAL_X + CAJA_LEGAL_ANCHO - 3,
    separadorY,
  );

  doc.setFont('helvetica', 'bold');
  setFontSizeEscalado(doc, 8);
  doc.text('Cotización USD al', 125, cajaY + CAJA_LEGAL_ALTO - 5);

  doc.setFont('helvetica', 'normal');
  doc.text(
    presupuesto.cotizacionUsdAl || '-',
    CAJA_LEGAL_X + CAJA_LEGAL_ANCHO - 4,
    cajaY + CAJA_LEGAL_ALTO - 5,
    {
      align: 'right',
    },
  );

  doc.setLineWidth(0.2);
}

function agregarNumerosPagina(doc: jsPDF): void {
  const totalPaginas = doc.getNumberOfPages();

  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setFont('helvetica', 'normal');
    setFontSizeEscalado(doc, 9);
    doc.setTextColor(0, 0, 0);
    doc.text(`Pag. ${pagina}/${totalPaginas}`, 150, 41);
  }
}

function iniciarPaginaDeDetalle(
  doc: jsPDF,
  presupuesto: Presupuesto,
): number {
  dibujarEncabezado(doc, presupuesto);
  dibujarCabeceraTabla(doc, Y_INICIO_TABLA);

  return Y_INICIO_TABLA + ALTO_CABECERA_TABLA;
}

export async function generarYGuardarPdfPresupuesto(
  presupuesto: Presupuesto,
  lineas: LineaPresupuesto[],
): Promise<PdfPresupuesto> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const altoPagina = doc.internal.pageSize.getHeight();
  const limiteDetallePagina = altoPagina - MARGEN_INFERIOR_DETALLE;
  const cajaLegalY = obtenerCajaLegalY(doc);

  const totalKg = lineas.reduce(
    (acumulado, linea) => acumulado + obtenerPesoTotalLinea(linea),
    0,
  );

  const totalUsd = lineas.reduce(
    (acumulado, linea) => acumulado + linea.subtotal,
    0,
  );

  let y = iniciarPaginaDeDetalle(doc, presupuesto);

  lineas.forEach((linea, indice) => {
    doc.setFont('helvetica', 'normal');
    setFontSizeEscalado(doc, 8);

    const { descripcionLineas, altoFila } = calcularAltoFila(doc, linea);
    const esUltimaLinea = indice === lineas.length - 1;

    const necesitaEspacioParaTotalesYPie =
      esUltimaLinea &&
      y + altoFila + ALTO_FILA_TOTAL + 5 > cajaLegalY;

    const noEntraEnPagina =
      y + altoFila > limiteDetallePagina;

    if (noEntraEnPagina || necesitaEspacioParaTotalesYPie) {
      doc.addPage();
      y = iniciarPaginaDeDetalle(doc, presupuesto);
    }

    dibujarFilaDetalle(
      doc,
      linea,
      descripcionLineas,
      y,
      altoFila,
    );

    y += altoFila;
  });

  if (lineas.length === 0) {
    doc.setFont('helvetica', 'normal');
    setFontSizeEscalado(doc, 8);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(TABLA_X, y, TABLA_ANCHO, 14);
    doc.text('Sin productos cargados.', 16, y + 8);
    y += 14;
  }

  if (y + ALTO_FILA_TOTAL + 5 > cajaLegalY) {
    doc.addPage();
    y = iniciarPaginaDeDetalle(doc, presupuesto);
  }

  dibujarFilaTotales(doc, y, totalKg, totalUsd);
  agregarPieLegal(doc, presupuesto);
  agregarNumerosPagina(doc);

  const blob = doc.output('blob');
  const nombreArchivo = crearNombrePdf(presupuesto);

  const pdfsExistentes = await db.pdfsPresupuesto
    .where('presupuestoId')
    .equals(presupuesto.id)
    .toArray();

  const version =
    pdfsExistentes.length === 0
      ? 1
      : Math.max(...pdfsExistentes.map((pdf) => pdf.version)) + 1;

  const pdf: PdfPresupuesto = {
    id: crypto.randomUUID(),
    presupuestoId: presupuesto.id,
    version,
    nombreArchivo,
    archivo: blob,
    creadoEn: fechaHoraAhoraISO(),
  };

  await db.pdfsPresupuesto.put(pdf);
  await marcarPresupuestoEmitido(presupuesto.id);

  return pdf;
}

export function descargarPdf(pdf: PdfPresupuesto): void {
  const url = URL.createObjectURL(pdf.archivo);
  const link = document.createElement('a');

  link.href = url;
  link.download = pdf.nombreArchivo;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export async function compartirPdf(pdf: PdfPresupuesto): Promise<boolean> {
  const archivo = new File([pdf.archivo], pdf.nombreArchivo, {
    type: 'application/pdf',
  });

  const datosCompartir = {
    title: pdf.nombreArchivo,
    text: 'Te envío la cotización solicitada.',
    files: [archivo],
  };

  if (
    typeof navigator.canShare === 'function' &&
    navigator.canShare(datosCompartir)
  ) {
    await navigator.share(datosCompartir);
    return true;
  }

  return false;
}
