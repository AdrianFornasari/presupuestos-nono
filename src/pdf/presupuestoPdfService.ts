import { jsPDF } from 'jspdf';
import { db } from '../db/appDb';
import { marcarPresupuestoEmitido } from '../db/presupuestosService';
import type {
  LineaPresupuesto,
  PdfPresupuesto,
  Presupuesto,
} from '../types/presupuesto';
import { fechaHoraAhoraISO, formatearImporteUSD } from '../utils/format';

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
  const cliente = limpiarNombreArchivo(presupuesto.clienteNombre || 'SIN_CLIENTE');

  return `${fecha}-${cliente}-${presupuesto.numeroFormateado}.pdf`;
}

function dibujarEncabezado(doc: jsPDF, presupuesto: Presupuesto): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('INDUSTRIAL ACEROS SRL', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('C.U.I.T.: 30-71696322-1', 14, 22);
  doc.text('I.Brutos: 30716963221', 14, 27);
  doc.text('Fec. Ini.Act.: 01-Aug-20', 14, 32);

  doc.text('341-6768783', 14, 39);
  doc.text('Suipacha 9999', 14, 44);
  doc.text('(2000) ROSARIO - Pcia. SANTA FE', 14, 49);
  doc.text('IVA RESPONSABLE INSCRIPTO', 14, 54);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('X Cotización', 150, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Fecha: ${presupuesto.fechaEmision}`, 150, 27);
  doc.text(`Original`, 150, 34);
  doc.text(`Pag.`, 150, 41);

  doc.setFont('helvetica', 'bold');
  doc.text(`CLIENTE:`, 14, 68);
  doc.text(`DIRECCIÓN:`, 14, 76);
  doc.text(`TELÉFONO:`, 14, 84);

  doc.setFont('helvetica', 'normal');
  doc.text(presupuesto.clienteNombre || '-', 42, 68);
  doc.text(presupuesto.clienteDireccion || '-', 42, 76);
  doc.text(presupuesto.clienteTelefono || '-', 42, 84);

  doc.setFont('helvetica', 'bold');
  doc.text(`MONEDA:`, 130, 68);
  doc.text(`VENDEDOR:`, 130, 76);

  doc.setFont('helvetica', 'normal');
  doc.text('USD', 154, 68);
  doc.text(presupuesto.vendedor || 'CARLOS CENTENO', 154, 76);
}

function dibujarCabeceraTabla(doc: jsPDF, y: number): void {
  doc.setFillColor(235, 235, 235);
  doc.rect(14, y, 182, 9, 'F');

  doc.setDrawColor(0, 0, 0);
  doc.rect(14, y, 182, 9);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  doc.text('Producto', 16, y + 6);
  doc.text('Cant.', 96, y + 6);
  doc.text('Unidad', 119, y + 6);
  doc.text('Precio unit.', 143, y + 6);
  doc.text('Subtotal', 173, y + 6);
}

function agregarPieLegal(
  doc: jsPDF,
  presupuesto: Presupuesto,
  yInicial: number,
): void {
  let y = yInicial;

  const altoPagina = doc.internal.pageSize.getHeight();

  if (y > altoPagina - 58) {
    doc.addPage();
    y = 20;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);

  const leyendas = [
    '- EL PESO COTIZADO CORRESPONDE AL TEÓRICO, LA FACTURACIÓN DEFINITIVA SE',
    '  REALIZARÁ CON EL PESAJE REAL DE LA BALANZA.',
    '- PRECIOS COTIZADOS EN DÓLARES, SE VALORIZAN SEGÚN TIPO DE CAMBIO',
    '  VENDEDOR DE BNA AL CIERRE DEL DÍA ANTERIOR DEL MOMENTO DE LA ENTREGA/',
    '  FACTURACIÓN.',
    '- ESTOS PRECIOS NO INCLUYEN EL ENVIO. CONSULTAR.',
    'VALIDEZ DE OFERTA: 24 HS',
    'LOS PRECIOS EXPRESADOS NO INCLUYEN IMPUESTOS.',
  ];

  leyendas.forEach((linea) => {
    doc.text(linea, 14, y);
    y += 5;
  });

  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Cotización USD al', 112, y);
  doc.setFont('helvetica', 'normal');
  doc.text(presupuesto.cotizacionUsdAl || '-', 145, y);

  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Subtotal', 132, y);
  doc.text(`u$s ${formatearImporteUSD(presupuesto.subtotal)}`, 170, y, {
    align: 'right',
  });

  y += 8;

  doc.setFontSize(12);
  doc.text('Total u$s', 132, y);
  doc.text(formatearImporteUSD(presupuesto.total), 170, y, {
    align: 'right',
  });
}

function agregarNumerosPagina(doc: jsPDF): void {
  const totalPaginas = doc.getNumberOfPages();

  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(`Pag. ${pagina}/${totalPaginas}`, 164, 41);
  }
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

  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();

  let y = 96;

  dibujarEncabezado(doc, presupuesto);
  dibujarCabeceraTabla(doc, y);
  y += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);

  lineas.forEach((linea) => {
    const descripcionLineas = doc.splitTextToSize(linea.descripcion, 76);
    const altoFila = Math.max(12, descripcionLineas.length * 5 + 5);

    if (y + altoFila > altoPagina - 70) {
      doc.addPage();
      dibujarEncabezado(doc, presupuesto);
      y = 96;
      dibujarCabeceraTabla(doc, y);
      y += 9;
    }

    doc.rect(14, y, 182, altoFila);

    doc.text(descripcionLineas, 16, y + 5);
    doc.text(formatearImporteUSD(linea.cantidad), 108, y + 5, {
      align: 'right',
    });
    doc.text(linea.unidad, 120, y + 5);
    doc.text(formatearImporteUSD(linea.precioUnitario), 166, y + 5, {
      align: 'right',
    });
    doc.text(formatearImporteUSD(linea.subtotal), 194, y + 5, {
      align: 'right',
    });

    doc.line(92, y, 92, y + altoFila);
    doc.line(114, y, 114, y + altoFila);
    doc.line(138, y, 138, y + altoFila);
    doc.line(168, y, 168, y + altoFila);

    y += altoFila;
  });

  if (lineas.length === 0) {
    doc.rect(14, y, 182, 14);
    doc.text('Sin productos cargados.', 16, y + 8);
    y += 14;
  }

  agregarPieLegal(doc, presupuesto, y + 12);
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