import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import MetalWeightCalculatorModal from './components/MetalWeightCalculatorModal';
import {
  crearBackupJson,
  descargarBackup,
  restaurarBackupDesdeArchivo,
} from './db/backupService';
import {
  actualizarLineaPresupuesto,
  agregarLineaPresupuesto,
  eliminarLineaPresupuesto,
  listarLineasPorPresupuesto,
} from './db/lineasPresupuestoService';
import {
  actualizarDatosCliente,
  crearPresupuestoBorrador,
  listarPresupuestos,
  obtenerPresupuestoPorId,
} from './db/presupuestosService';
import {
  conectarGoogleDrive,
  subirBackupJsonADrive,
} from './drive/googleDriveService';
import {
  compartirPdf,
  descargarPdf,
  generarYGuardarPdfPresupuesto,
} from './pdf/presupuestoPdfService';
import type {
  LineaPresupuesto,
  Presupuesto,
  TipoCalculoLinea,
} from './types/presupuesto';
import { PRODUCTOS_PROVEEDOR } from './data/productosProveedor';
import {
  formatearDecimal2SinMiles,
  formatearDecimal4,
  formatearEntero,
  formatearImporteUSD,
  parsearEntero,
  parsearNumeroDecimal,
} from './utils/format';
import {
  solicitarAlmacenamientoPersistente,
  textoEstadoAlmacenamiento,
  type EstadoAlmacenamientoPersistente,
} from './utils/persistentStorage';

// BUILD: PRODUCTOS-PROVEEDOR-V9-20260829 - tubos integrados con calculadora
type Pantalla = 'inicio' | 'editar' | 'configuracion';
type MetodoIngresoProducto = 'proveedor' | 'calculadora';

const TIPOS_SOLO_CALCULADORA = [
  'Tubo redondo',
  'Tubo cuadrado',
  'Tubo rectangular',
] as const;

function esTipoSoloCalculadora(tipo: string): boolean {
  return (TIPOS_SOLO_CALCULADORA as readonly string[]).includes(tipo);
}

function textoEstadoDrive(estado: Presupuesto['estadoDrive']): string {
  if (estado === 'tablet') return 'Guardado en tablet';
  if (estado === 'pendiente') return 'Copia en Drive pendiente';
  return 'Copia en Drive realizada';
}

function formatearFechaLista(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split('-');

  if (!anio || !mes || !dia) {
    return fechaISO;
  }

  return `${dia}/${mes}/${anio}`;
}

function obtenerPesoTotalLinea(linea: LineaPresupuesto): number {
  return linea.pesoTotal ?? linea.acumulado ?? 0;
}

function formatearDecimal4SinMiles(valor: number): string {
  return valor.toFixed(4).replace('.', ',');
}

function normalizarTextoDecimal(valor: string, decimales: number): string {
  const conComa = valor.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const partes = conComa.split(',');
  const parteEntera = partes[0] ?? '';
  const huboSeparador = partes.length > 1;
  const parteDecimal = partes.slice(1).join('').slice(0, decimales);

  if (!huboSeparador) {
    return parteEntera;
  }

  return `${parteEntera},${parteDecimal}`;
}

function App() {
  const [pantalla, setPantalla] = useState<Pantalla>('inicio');
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [presupuestoActual, setPresupuestoActual] =
    useState<Presupuesto | null>(null);
  const [lineas, setLineas] = useState<LineaPresupuesto[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [avisoModal, setAvisoModal] = useState('');
  const [estadoAlmacenamiento, setEstadoAlmacenamiento] =
    useState<EstadoAlmacenamientoPersistente | null>(null);

  const [driveConectado, setDriveConectado] = useState(false);
  const [driveTrabajando, setDriveTrabajando] = useState(false);

  const [tipoProductoSeleccionado, setTipoProductoSeleccionado] = useState('');
  const [productoProveedorId, setProductoProveedorId] = useState('');
  const [tipoCalculoProducto, setTipoCalculoProducto] =
    useState<TipoCalculoLinea>('peso');
  const [descripcionProducto, setDescripcionProducto] = useState('');
  const [cantidadProducto, setCantidadProducto] = useState('');
  const [largoProducto, setLargoProducto] = useState('12,00');
  const [anchoProducto, setAnchoProducto] = useState('');
  const [espesorProducto, setEspesorProducto] = useState('');
  const [masaNominalProducto, setMasaNominalProducto] = useState<number | null>(
    null,
  );
  const [pesoTotalProducto, setPesoTotalProducto] = useState('');
  const [precioUnitarioProducto, setPrecioUnitarioProducto] = useState('');
  const [selectorProductoAbierto, setSelectorProductoAbierto] = useState(false);
  const [metodoIngresoProducto, setMetodoIngresoProducto] =
    useState<MetodoIngresoProducto>('proveedor');
  const [calculadoraAbierta, setCalculadoraAbierta] = useState(false);

  const [clienteEditando, setClienteEditando] = useState(false);
  const [clienteDatosModificados, setClienteDatosModificados] = useState(false);

  const [lineaEnEdicion, setLineaEnEdicion] =
    useState<LineaPresupuesto | null>(null);
  const [productoFormVersion, setProductoFormVersion] = useState(0);

  const inputBackupRef = useRef<HTMLInputElement | null>(null);
  const productoFormRef = useRef<HTMLFormElement | null>(null);
  const descripcionProductoRef = useRef<HTMLTextAreaElement | null>(null);

  const tiposProducto = useMemo(
    () =>
      Array.from(
        new Set([
          ...PRODUCTOS_PROVEEDOR.map((producto) => producto.tipo),
          ...TIPOS_SOLO_CALCULADORA,
        ]),
      ),
    [],
  );

  const productosFiltrados = useMemo(
    () =>
      PRODUCTOS_PROVEEDOR.filter(
        (producto) => producto.tipo === tipoProductoSeleccionado,
      ),
    [tipoProductoSeleccionado],
  );

  async function cargarPresupuestos() {
    const datos = await listarPresupuestos();
    setPresupuestos(datos);
  }

  async function recargarPresupuestoActual(id: string) {
    const presupuesto = await obtenerPresupuestoPorId(id);

    if (!presupuesto) {
      setMensaje('No se encontró el presupuesto.');
      return;
    }

    const lineasPresupuesto = await listarLineasPorPresupuesto(id);

    setPresupuestoActual(presupuesto);
    setLineas(lineasPresupuesto);
  }

  function calcularPesoTotalProveedor(
    cantidadTexto: string,
    largoTexto: string,
    masaNominal: number | null,
  ): string {
    const cantidad = parsearEntero(cantidadTexto);
    const largo = parsearNumeroDecimal(largoTexto);

    if (
      !Number.isInteger(cantidad) ||
      cantidad <= 0 ||
      !Number.isFinite(largo) ||
      largo <= 0 ||
      masaNominal === null ||
      !Number.isFinite(masaNominal) ||
      masaNominal <= 0
    ) {
      return '';
    }

    return formatearDecimal4SinMiles(cantidad * largo * masaNominal);
  }

  function calcularPesoTotalPlancha(
    cantidadTexto: string,
    largoTexto: string,
    anchoTexto: string,
    espesorTexto: string,
  ): string {
    const cantidad = parsearEntero(cantidadTexto);
    const largoMm = parsearNumeroDecimal(largoTexto);
    const anchoMm = parsearNumeroDecimal(anchoTexto);
    const espesorMm = parsearNumeroDecimal(espesorTexto);

    if (
      !Number.isInteger(cantidad) ||
      cantidad <= 0 ||
      !Number.isFinite(largoMm) ||
      largoMm <= 0 ||
      !Number.isFinite(anchoMm) ||
      anchoMm <= 0 ||
      !Number.isFinite(espesorMm) ||
      espesorMm <= 0
    ) {
      return '';
    }

    const pesoKg = cantidad * largoMm * anchoMm * espesorMm * 0.00000785;
    return formatearDecimal4SinMiles(pesoKg);
  }

  function calcularMetrosTotales(): number {
    const cantidad = parsearEntero(cantidadProducto);
    const largo = parsearNumeroDecimal(largoProducto);

    if (
      !Number.isInteger(cantidad) ||
      cantidad <= 0 ||
      !Number.isFinite(largo) ||
      largo <= 0
    ) {
      return 0;
    }

    return cantidad * largo;
  }

  function recalcularPesoSegunTipo(
    cantidadTexto: string,
    largoTexto: string,
    anchoTexto: string,
    espesorTexto: string,
    masaNominal: number | null,
    tipoCalculo: TipoCalculoLinea,
  ): string {
    if (tipoCalculo === 'plancha') {
      return calcularPesoTotalPlancha(
        cantidadTexto,
        largoTexto,
        anchoTexto,
        espesorTexto,
      );
    }

    if (tipoCalculo === 'metro') {
      return '';
    }

    return calcularPesoTotalProveedor(
      cantidadTexto,
      largoTexto,
      masaNominal,
    );
  }

  function reiniciarFormularioProducto() {
    setTipoProductoSeleccionado('');
    setProductoProveedorId('');
    setMetodoIngresoProducto('proveedor');
    setTipoCalculoProducto('peso');
    setDescripcionProducto('');
    setCantidadProducto('');
    setLargoProducto('12,00');
    setAnchoProducto('');
    setEspesorProducto('');
    setMasaNominalProducto(null);
    setPesoTotalProducto('');
    setPrecioUnitarioProducto('');
    setSelectorProductoAbierto(false);
    setCalculadoraAbierta(false);
  }

  function manejarCambioTipoProducto(event: ChangeEvent<HTMLSelectElement>) {
    const tipo = event.currentTarget.value;

    setTipoProductoSeleccionado(tipo);
    setProductoProveedorId('');
    setTipoCalculoProducto('peso');
    setCantidadProducto('');
    setLargoProducto('');
    setAnchoProducto('');
    setEspesorProducto('');
    setMasaNominalProducto(null);
    setPesoTotalProducto('');
    setPrecioUnitarioProducto('');
    setMensaje('');

    if (esTipoSoloCalculadora(tipo)) {
      setMetodoIngresoProducto('calculadora');
      setDescripcionProducto(tipo);
      return;
    }

    setMetodoIngresoProducto('proveedor');
    setDescripcionProducto('');
    setLargoProducto('12,00');
  }

  function manejarCambioProducto(event: ChangeEvent<HTMLSelectElement>) {
    const productoId = event.currentTarget.value;
    const producto = PRODUCTOS_PROVEEDOR.find(
      (item) => item.id === productoId,
    );

    setMetodoIngresoProducto('proveedor');
    setProductoProveedorId(productoId);

    if (!producto) {
      setTipoCalculoProducto('peso');
      setDescripcionProducto('');
      setLargoProducto('12,00');
      setAnchoProducto('');
      setEspesorProducto('');
      setMasaNominalProducto(null);
      setPesoTotalProducto('');
      return;
    }

    const tipoCalculo = producto.tipoCalculo ?? 'peso';

    setTipoCalculoProducto(tipoCalculo);
    setDescripcionProducto(producto.descripcion);
    setAnchoProducto('');
    setEspesorProducto('');

    if (tipoCalculo === 'peso') {
      setLargoProducto('12,00');
      setMasaNominalProducto(producto.masaNominal);
      setPesoTotalProducto(
        calcularPesoTotalProveedor(
          cantidadProducto,
          '12,00',
          producto.masaNominal,
        ),
      );
    } else {
      setLargoProducto('');
      setMasaNominalProducto(null);
      setPesoTotalProducto('');
    }

    setMensaje('');
  }

  function abrirSelectorProducto() {
    setCalculadoraAbierta(false);
    setSelectorProductoAbierto(true);
    setMensaje('');
  }

  function cerrarSelectorProducto() {
    setSelectorProductoAbierto(false);
  }

  function prepararIngresoPorCalculadora() {
    const descripcionCalculadora = esTipoSoloCalculadora(
      tipoProductoSeleccionado,
    )
      ? tipoProductoSeleccionado
      : descripcionProducto;

    setMetodoIngresoProducto('calculadora');
    setProductoProveedorId('');
    setTipoCalculoProducto('peso');
    setDescripcionProducto(descripcionCalculadora);
    setLargoProducto('');
    setAnchoProducto('');
    setEspesorProducto('');
    setMasaNominalProducto(null);
    setPesoTotalProducto('');
    setSelectorProductoAbierto(false);
    setMensaje(
      esTipoSoloCalculadora(tipoProductoSeleccionado)
        ? `${tipoProductoSeleccionado} se cotiza con la calculadora de metales. Cargá cantidad y precio unitario antes de abrirla.`
        : 'Modo calculadora seleccionado. Cargá cantidad y precio unitario antes de abrirla.',
    );
  }

  function abrirCalculadoraMetales() {
    const cantidad = parsearEntero(cantidadProducto);
    const precioUnitario = parsearNumeroDecimal(precioUnitarioProducto);

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setMensaje(
        'Antes de abrir la calculadora de metales, cargá una cantidad entera mayor que cero.',
      );
      return;
    }

    if (!Number.isFinite(precioUnitario) || precioUnitario <= 0) {
      setMensaje(
        'Antes de abrir la calculadora de metales, cargá el precio unitario USD/kg.',
      );
      return;
    }

    setMetodoIngresoProducto('calculadora');
    setTipoCalculoProducto('peso');
    setSelectorProductoAbierto(false);
    setCalculadoraAbierta(true);
    setMensaje('');
  }

  function aceptarPesoCalculado(pesoCalculado: number) {
    if (!Number.isFinite(pesoCalculado) || pesoCalculado <= 0) {
      setMensaje('La calculadora no devolvió un peso válido.');
      return;
    }

    setMetodoIngresoProducto('calculadora');
    setTipoCalculoProducto('peso');
    setPesoTotalProducto(formatearDecimal4SinMiles(pesoCalculado));
    setCalculadoraAbierta(false);
    setMensaje('');
    setAvisoModal('Peso total calculado.');

    window.setTimeout(() => {
      descripcionProductoRef.current?.focus();
    }, 0);
  }

  function confirmarSeleccionProducto() {
    if (!tipoProductoSeleccionado) {
      setMensaje('Seleccioná un tipo de producto.');
      return;
    }

    if (esTipoSoloCalculadora(tipoProductoSeleccionado)) {
      prepararIngresoPorCalculadora();
      return;
    }

    if (!productoProveedorId) {
      setMensaje('Seleccioná un producto de la tabla de proveedor.');
      return;
    }

    if (
      tipoCalculoProducto === 'peso' &&
      (!masaNominalProducto || masaNominalProducto <= 0)
    ) {
      setMensaje('El producto seleccionado no tiene masa nominal válida.');
      return;
    }

    setMetodoIngresoProducto('proveedor');
    setSelectorProductoAbierto(false);
    setMensaje('');

    window.setTimeout(() => {
      descripcionProductoRef.current?.focus();
      const textarea = descripcionProductoRef.current;

      if (textarea) {
        const posicionFinal = textarea.value.length;
        textarea.setSelectionRange(posicionFinal, posicionFinal);
      }
    }, 0);
  }

  function manejarCambioCantidadProducto(event: ChangeEvent<HTMLInputElement>) {
    const cantidad = event.currentTarget.value.replace(/\D/g, '');

    setCantidadProducto(cantidad);
    setPesoTotalProducto(
      recalcularPesoSegunTipo(
        cantidad,
        largoProducto,
        anchoProducto,
        espesorProducto,
        masaNominalProducto,
        tipoCalculoProducto,
      ),
    );
  }

  function manejarCambioLargoProducto(event: ChangeEvent<HTMLInputElement>) {
    const largo = normalizarTextoDecimal(event.currentTarget.value, 2);

    setLargoProducto(largo);
    setPesoTotalProducto(
      recalcularPesoSegunTipo(
        cantidadProducto,
        largo,
        anchoProducto,
        espesorProducto,
        masaNominalProducto,
        tipoCalculoProducto,
      ),
    );
  }

  function completarLargoProducto() {
    const largo = parsearNumeroDecimal(largoProducto);

    if (!Number.isFinite(largo) || largo <= 0) return;

    const largoFormateado = formatearDecimal2SinMiles(largo);
    setLargoProducto(largoFormateado);
    setPesoTotalProducto(
      recalcularPesoSegunTipo(
        cantidadProducto,
        largoFormateado,
        anchoProducto,
        espesorProducto,
        masaNominalProducto,
        tipoCalculoProducto,
      ),
    );
  }

  function manejarCambioAnchoProducto(event: ChangeEvent<HTMLInputElement>) {
    const ancho = normalizarTextoDecimal(event.currentTarget.value, 2);
    setAnchoProducto(ancho);
    setPesoTotalProducto(
      calcularPesoTotalPlancha(
        cantidadProducto,
        largoProducto,
        ancho,
        espesorProducto,
      ),
    );
  }

  function completarAnchoProducto() {
    const ancho = parsearNumeroDecimal(anchoProducto);
    if (!Number.isFinite(ancho) || ancho <= 0) return;

    const anchoFormateado = formatearDecimal2SinMiles(ancho);
    setAnchoProducto(anchoFormateado);
    setPesoTotalProducto(
      calcularPesoTotalPlancha(
        cantidadProducto,
        largoProducto,
        anchoFormateado,
        espesorProducto,
      ),
    );
  }

  function manejarCambioEspesorProducto(event: ChangeEvent<HTMLInputElement>) {
    const espesor = normalizarTextoDecimal(event.currentTarget.value, 2);
    setEspesorProducto(espesor);
    setPesoTotalProducto(
      calcularPesoTotalPlancha(
        cantidadProducto,
        largoProducto,
        anchoProducto,
        espesor,
      ),
    );
  }

  function completarEspesorProducto() {
    const espesor = parsearNumeroDecimal(espesorProducto);
    if (!Number.isFinite(espesor) || espesor <= 0) return;

    const espesorFormateado = formatearDecimal2SinMiles(espesor);
    setEspesorProducto(espesorFormateado);
    setPesoTotalProducto(
      calcularPesoTotalPlancha(
        cantidadProducto,
        largoProducto,
        anchoProducto,
        espesorFormateado,
      ),
    );
  }

  function manejarCambioPesoTotal(event: ChangeEvent<HTMLInputElement>) {
    setPesoTotalProducto(
      normalizarTextoDecimal(event.currentTarget.value, 4),
    );
  }

  function completarPesoTotalProducto() {
    const peso = parsearNumeroDecimal(pesoTotalProducto);

    if (!Number.isFinite(peso) || peso <= 0) return;

    setPesoTotalProducto(formatearDecimal4SinMiles(peso));
  }

  function manejarCambioPrecioUnitario(event: ChangeEvent<HTMLInputElement>) {
    setPrecioUnitarioProducto(
      normalizarTextoDecimal(event.currentTarget.value, 4),
    );
  }

  function completarPrecioUnitario() {
    const precio = parsearNumeroDecimal(precioUnitarioProducto);

    if (!Number.isFinite(precio) || precio <= 0) return;

    setPrecioUnitarioProducto(formatearDecimal4SinMiles(precio));
  }

  useEffect(() => {
    let cancelado = false;

    void listarPresupuestos().then((datos) => {
      if (!cancelado) {
        setPresupuestos(datos);
      }
    });

    void solicitarAlmacenamientoPersistente().then((estado) => {
      if (!cancelado) {
        setEstadoAlmacenamiento(estado);
      }
    });

    return () => {
      cancelado = true;
    };
  }, []);

  async function manejarNuevoPresupuesto() {
    const nuevo = await crearPresupuestoBorrador();
    setPresupuestoActual(nuevo);
    setLineas([]);
    setClienteEditando(false);
    setClienteDatosModificados(false);
    setLineaEnEdicion(null);
    reiniciarFormularioProducto();
    setPantalla('editar');
    setMensaje(`Presupuesto ${nuevo.numeroFormateado} creado.`);
    await cargarPresupuestos();
  }

  async function abrirPresupuesto(id: string) {
    const presupuesto = await obtenerPresupuestoPorId(id);

    if (!presupuesto) {
      setMensaje('No se encontró el presupuesto.');
      return;
    }

    const lineasPresupuesto = await listarLineasPorPresupuesto(id);

    setPresupuestoActual(presupuesto);
    setLineas(lineasPresupuesto);
    setClienteEditando(false);
    setClienteDatosModificados(false);
    setLineaEnEdicion(null);
    reiniciarFormularioProducto();
    setPantalla('editar');
    setMensaje('');
  }

  function normalizarEntradaDecimal2(event: ChangeEvent<HTMLInputElement>) {
    event.currentTarget.value = normalizarTextoDecimal(
      event.currentTarget.value,
      2,
    );
  }

  function completarCampoDecimal2(event: FocusEvent<HTMLInputElement>) {
    const texto = event.currentTarget.value.trim();

    if (!texto) return;

    const numero = parsearNumeroDecimal(texto);

    if (Number.isFinite(numero)) {
      event.currentTarget.value = formatearDecimal2SinMiles(numero);
    }
  }

  function marcarClienteModificado() {
    setClienteDatosModificados(true);
  }

  async function guardarCliente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!presupuestoActual) return;

    const formData = new FormData(event.currentTarget);

    const clienteNombre = String(formData.get('clienteNombre') || '').trim();
    const clienteDireccion = String(
      formData.get('clienteDireccion') || '',
    ).trim();
    const clienteTelefono = String(formData.get('clienteTelefono') || '').trim();
    const cotizacionUsdAlTexto = String(
      formData.get('cotizacionUsdAl') || '',
    ).trim();

    let cotizacionUsdAl = '';

    if (cotizacionUsdAlTexto) {
      const cotizacionNumero = parsearNumeroDecimal(cotizacionUsdAlTexto);

      if (!Number.isFinite(cotizacionNumero) || cotizacionNumero <= 0) {
        setMensaje('La cotización USD debe ser un número válido mayor que cero.');
        return;
      }

      cotizacionUsdAl = formatearDecimal2SinMiles(cotizacionNumero);
    }

    await actualizarDatosCliente(presupuestoActual.id, {
      clienteNombre,
      clienteDireccion,
      clienteTelefono,
      cotizacionUsdAl,
    });

    await recargarPresupuestoActual(presupuestoActual.id);
    await cargarPresupuestos();

    setClienteDatosModificados(false);
    setClienteEditando(false);
    setMensaje('Datos del cliente guardados.');
  }

  function cargarLineaParaEditar(linea: LineaPresupuesto) {
    const coincidencia = PRODUCTOS_PROVEEDOR.filter((producto) =>
      linea.descripcion.startsWith(producto.descripcion),
    ).sort((a, b) => b.descripcion.length - a.descripcion.length)[0];

    const tipoCalculo = linea.tipoCalculo ?? coincidencia?.tipoCalculo ?? 'peso';
    const metodoIngreso: MetodoIngresoProducto =
      coincidencia || tipoCalculo !== 'peso' ? 'proveedor' : 'calculadora';

    setMetodoIngresoProducto(metodoIngreso);
    setLineaEnEdicion(linea);
    setProductoFormVersion((version) => version + 1);
    setTipoCalculoProducto(tipoCalculo);
    setDescripcionProducto(linea.descripcion);
    setCantidadProducto(String(linea.cantidad));
    setPrecioUnitarioProducto(
      formatearDecimal4SinMiles(linea.precioUnitario),
    );
    setAnchoProducto(
      linea.ancho && linea.ancho > 0
        ? formatearDecimal2SinMiles(linea.ancho)
        : '',
    );
    setEspesorProducto(
      linea.espesor && linea.espesor > 0
        ? formatearDecimal2SinMiles(linea.espesor)
        : '',
    );

    if (coincidencia) {
      setTipoProductoSeleccionado(coincidencia.tipo);
      setProductoProveedorId(coincidencia.id);
    } else {
      setTipoProductoSeleccionado('');
      setProductoProveedorId('');
    }

    if (tipoCalculo === 'metro') {
      setMasaNominalProducto(null);
      setLargoProducto(
        linea.largo && linea.largo > 0
          ? formatearDecimal2SinMiles(linea.largo)
          : '',
      );
      setPesoTotalProducto('');
    } else if (tipoCalculo === 'plancha') {
      setMasaNominalProducto(null);
      setLargoProducto(
        linea.largo && linea.largo > 0
          ? formatearDecimal2SinMiles(linea.largo)
          : '',
      );
      setPesoTotalProducto(
        formatearDecimal4SinMiles(obtenerPesoTotalLinea(linea)),
      );
    } else {
      const masaNominal =
        linea.masaNominal ?? coincidencia?.masaNominal ?? null;

      setMasaNominalProducto(masaNominal);
      setPesoTotalProducto(
        formatearDecimal4SinMiles(obtenerPesoTotalLinea(linea)),
      );

      if (metodoIngreso === 'calculadora') {
        setLargoProducto('');
      } else if (linea.largo && linea.largo > 0) {
        setLargoProducto(formatearDecimal2SinMiles(linea.largo));
      } else {
        const pesoTotal = obtenerPesoTotalLinea(linea);
        const largoCalculado =
          linea.cantidad > 0 && masaNominal && masaNominal > 0
            ? pesoTotal / (linea.cantidad * masaNominal)
            : 12;

        setLargoProducto(
          Number.isFinite(largoCalculado) && largoCalculado > 0
            ? formatearDecimal2SinMiles(largoCalculado)
            : '12,00',
        );
      }
    }

    setMensaje('');

    window.setTimeout(() => {
      productoFormRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 50);
  }

  function cancelarEdicionProducto() {
    setLineaEnEdicion(null);
    reiniciarFormularioProducto();
    setProductoFormVersion((version) => version + 1);
    setMensaje('');
  }

  async function agregarProducto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!presupuestoActual) return;

    const form = event.currentTarget;
    const descripcion = descripcionProducto.trim();
    const cantidad = parsearEntero(cantidadProducto);
    const largo = parsearNumeroDecimal(largoProducto);
    const ancho = parsearNumeroDecimal(anchoProducto);
    const espesor = parsearNumeroDecimal(espesorProducto);
    const precioUnitario = parsearNumeroDecimal(precioUnitarioProducto);
    let pesoTotal = parsearNumeroDecimal(pesoTotalProducto);

    if (metodoIngresoProducto === 'proveedor' && !tipoProductoSeleccionado) {
      setMensaje('Seleccioná un tipo de producto.');
      return;
    }

    if (metodoIngresoProducto === 'proveedor' && !productoProveedorId) {
      setMensaje('Seleccioná un producto de la tabla de proveedor.');
      return;
    }

    if (!descripcion) {
      setMensaje('Falta la descripción del producto.');
      return;
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setMensaje('La cantidad debe ser un número entero mayor que cero.');
      return;
    }

    if (!Number.isFinite(precioUnitario) || precioUnitario <= 0) {
      setMensaje('Cargá el precio unitario antes de agregar el producto.');
      return;
    }

    if (metodoIngresoProducto === 'calculadora') {
      if (!Number.isFinite(pesoTotal) || pesoTotal <= 0) {
        setMensaje(
          'Calculá el peso total con la calculadora de metales antes de agregar el producto.',
        );
        return;
      }
    } else {
      if (!Number.isFinite(largo) || largo <= 0) {
        setMensaje(
          tipoCalculoProducto === 'plancha'
            ? 'El largo en mm debe ser mayor que cero.'
            : 'El largo en metros debe ser mayor que cero.',
        );
        return;
      }

      if (tipoCalculoProducto === 'peso') {
        if (!masaNominalProducto || masaNominalProducto <= 0) {
          setMensaje('El producto seleccionado no tiene masa nominal válida.');
          return;
        }

        if (!Number.isFinite(pesoTotal) || pesoTotal <= 0) {
          setMensaje('El peso total debe ser mayor que cero.');
          return;
        }
      }
    }

    if (
      metodoIngresoProducto === 'proveedor' &&
      tipoCalculoProducto === 'plancha'
    ) {
      if (!Number.isFinite(ancho) || ancho <= 0) {
        setMensaje('El ancho en mm debe ser mayor que cero.');
        return;
      }

      if (!Number.isFinite(espesor) || espesor <= 0) {
        setMensaje('El espesor en mm debe ser mayor que cero.');
        return;
      }

      pesoTotal = cantidad * largo * ancho * espesor * 0.00000785;

      if (!Number.isFinite(pesoTotal) || pesoTotal <= 0) {
        setMensaje('No se pudo calcular el peso total de la plancha.');
        return;
      }
    }

    if (
      metodoIngresoProducto === 'proveedor' &&
      tipoCalculoProducto === 'metro'
    ) {
      pesoTotal = 0;
    }

    const tipoCalculoLinea: TipoCalculoLinea =
      metodoIngresoProducto === 'calculadora' ? 'peso' : tipoCalculoProducto;

    const datosLinea = {
      descripcion,
      cantidad,
      unidad: tipoCalculoLinea === 'metro' ? 'm' : 'kg',
      precioUnitario,
      pesoTotal,
      tipoCalculo: tipoCalculoLinea,
      largo:
        metodoIngresoProducto === 'calculadora' ? undefined : largo,
      ancho:
        metodoIngresoProducto === 'proveedor' &&
        tipoCalculoProducto === 'plancha'
          ? ancho
          : undefined,
      espesor:
        metodoIngresoProducto === 'proveedor' &&
        tipoCalculoProducto === 'plancha'
          ? espesor
          : undefined,
      masaNominal:
        metodoIngresoProducto === 'proveedor' &&
        tipoCalculoProducto === 'peso'
          ? masaNominalProducto ?? undefined
          : undefined,
    };

    if (lineaEnEdicion) {
      await actualizarLineaPresupuesto(
        presupuestoActual.id,
        lineaEnEdicion.id,
        datosLinea,
      );

      setLineaEnEdicion(null);
      reiniciarFormularioProducto();
      setProductoFormVersion((version) => version + 1);

      await recargarPresupuestoActual(presupuestoActual.id);
      await cargarPresupuestos();

      setMensaje('');
      setAvisoModal('Producto actualizado.');
      return;
    }

    await agregarLineaPresupuesto(presupuestoActual.id, datosLinea);

    form.reset();
    reiniciarFormularioProducto();
    setProductoFormVersion((version) => version + 1);

    await recargarPresupuestoActual(presupuestoActual.id);
    await cargarPresupuestos();

    setMensaje('');
    setAvisoModal('Producto agregado.');
  }

  async function borrarLinea(lineaId: string) {
    if (!presupuestoActual) return;

    const confirmar = window.confirm('¿Eliminar esta línea del presupuesto?');

    if (!confirmar) return;

    if (lineaEnEdicion?.id === lineaId) {
      setLineaEnEdicion(null);
      reiniciarFormularioProducto();
      setProductoFormVersion((version) => version + 1);
    }

    await eliminarLineaPresupuesto(presupuestoActual.id, lineaId);
    await recargarPresupuestoActual(presupuestoActual.id);
    await cargarPresupuestos();
    setMensaje('Producto eliminado.');
  }

  async function generarPdfDescarga() {
    if (!presupuestoActual) return;

    if (!presupuestoActual.clienteNombre.trim()) {
      setMensaje('Antes de generar PDF, cargá el nombre del cliente.');
      return;
    }

    if (lineas.length === 0) {
      setMensaje('Antes de generar PDF, cargá al menos un producto.');
      return;
    }

    const pdf = await generarYGuardarPdfPresupuesto(presupuestoActual, lineas);
    descargarPdf(pdf);

    await recargarPresupuestoActual(presupuestoActual.id);
    await cargarPresupuestos();

    setMensaje(`PDF generado: ${pdf.nombreArchivo}`);
  }

  async function generarPdfCompartir() {
    if (!presupuestoActual) return;

    if (!presupuestoActual.clienteNombre.trim()) {
      setMensaje('Antes de compartir PDF, cargá el nombre del cliente.');
      return;
    }

    if (lineas.length === 0) {
      setMensaje('Antes de compartir PDF, cargá al menos un producto.');
      return;
    }

    const pdf = await generarYGuardarPdfPresupuesto(presupuestoActual, lineas);
    const pudoCompartir = await compartirPdf(pdf);

    if (!pudoCompartir) {
      descargarPdf(pdf);
      setMensaje(
        'El dispositivo no permitió compartir directo. Se descargó el PDF.',
      );
    } else {
      setMensaje(`PDF compartido: ${pdf.nombreArchivo}`);
    }

    await recargarPresupuestoActual(presupuestoActual.id);
    await cargarPresupuestos();
  }

  async function hacerBackupLocal() {
    try {
      const nombreArchivo = await descargarBackup();
      setMensaje(`Copia de seguridad creada: ${nombreArchivo}`);
    } catch {
      setMensaje('No se pudo crear la copia de seguridad.');
    }
  }

  async function conectarDrive() {
    try {
      setDriveTrabajando(true);
      setMensaje('Conectando Google Drive...');

      await conectarGoogleDrive();

      setDriveConectado(true);
      setMensaje('Google Drive conectado. Carpeta de desarrollo lista.');
    } catch (error) {
      const detalle =
        error instanceof Error ? error.message : 'Error desconocido.';

      setMensaje(`No se pudo conectar Google Drive. ${detalle}`);
    } finally {
      setDriveTrabajando(false);
    }
  }

  async function hacerBackupEnDrive() {
    try {
      setDriveTrabajando(true);
      setMensaje('Creando copia en Google Drive...');

      const backup = await crearBackupJson();

      const archivoDrive = await subirBackupJsonADrive(
        backup.nombreArchivo,
        backup.contenido,
      );

      setDriveConectado(true);
      setMensaje(`Copia subida a Drive: ${archivoDrive.name}`);
    } catch (error) {
      const detalle =
        error instanceof Error ? error.message : 'Error desconocido.';

      setMensaje(`No se pudo subir la copia a Drive. ${detalle}`);
    } finally {
      setDriveTrabajando(false);
    }
  }

  function seleccionarBackupParaRestaurar() {
    inputBackupRef.current?.click();
  }

  async function restaurarBackup(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];

    if (!archivo) return;

    const confirmar = window.confirm(
      'Esto reemplazará los datos actuales de la tablet por los del backup. ¿Continuar?',
    );

    if (!confirmar) {
      event.target.value = '';
      return;
    }

    try {
      await restaurarBackupDesdeArchivo(archivo);
      await cargarPresupuestos();

      setPresupuestoActual(null);
      setLineas([]);
      setPantalla('inicio');
      setMensaje('Copia de seguridad restaurada.');
    } catch (error) {
      const detalle =
        error instanceof Error ? error.message : 'Error desconocido.';
      setMensaje(`No se pudo restaurar el backup. ${detalle}`);
    } finally {
      event.target.value = '';
    }
  }

  function volverInicio() {
    setPantalla('inicio');
    setPresupuestoActual(null);
    setLineas([]);
    setClienteEditando(false);
    setClienteDatosModificados(false);
    setLineaEnEdicion(null);
    reiniciarFormularioProducto();
    setMensaje('');
    setAvisoModal('');
    cargarPresupuestos();
  }

  function cerrarAvisoModal() {
    setAvisoModal('');
  }

  function cerrarAvisoModalConTeclado(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      setAvisoModal('');
    }
  }

  const avisoModalElemento = avisoModal ? (
    <div
      className="app-notice-backdrop"
      role="button"
      tabIndex={0}
      onClick={cerrarAvisoModal}
      onKeyDown={cerrarAvisoModalConTeclado}
    >
      <div className="app-notice-modal">
        <strong>{avisoModal}</strong>
        <span>Toque para cerrar</span>
      </div>
    </div>
  ) : null;

  const estilosGlobalesElemento = (
    <style>{`
      button:disabled {
        color: #808080 !important;
        opacity: 1 !important;
      }
    `}</style>
  );

  const selectorProductoModalElemento = selectorProductoAbierto ? (
    <div
      className="app-notice-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          cerrarSelectorProducto();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="selector-producto-titulo"
        style={{
          width: 'min(92vw, 720px)',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#000000',
          color: '#ffffff',
          borderRadius: '18px',
          padding: '20px',
          boxShadow: '0 18px 60px rgba(0, 0, 0, 0.55)',
        }}
      >
        <h2 id="selector-producto-titulo" style={{ marginTop: 0 }}>
          Seleccionar producto
        </h2>

        <label
          className="field-label product-full-field"
          style={{ color: '#ffffff' }}
        >
          Tipo de producto
          <select
            className="text-input"
            value={tipoProductoSeleccionado}
            onChange={manejarCambioTipoProducto}
            autoFocus
            style={{
              background: '#111111',
              color: '#ffffff',
              borderColor: '#555555',
            }}
          >
            <option value="">Seleccionar tipo...</option>
            {tiposProducto.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
        </label>

        {esTipoSoloCalculadora(tipoProductoSeleccionado) ? (
          <div
            className="product-full-field"
            style={{
              color: '#ffffff',
              border: '1px solid #555555',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '12px',
            }}
          >
            <strong>{tipoProductoSeleccionado}</strong>
            <p style={{ margin: '8px 0 0', color: '#ffffff' }}>
              Este producto no tiene subproductos en la tabla. Se cotiza
              mediante la calculadora de metales.
            </p>
          </div>
        ) : (
          <label
            className="field-label product-full-field"
            style={{ color: '#ffffff' }}
          >
            Producto
            <select
              className="text-input"
              value={productoProveedorId}
              onChange={manejarCambioProducto}
              disabled={!tipoProductoSeleccionado}
              style={{
                background: '#111111',
                color: tipoProductoSeleccionado ? '#ffffff' : '#808080',
                WebkitTextFillColor: tipoProductoSeleccionado
                  ? '#ffffff'
                  : '#808080',
                borderColor: '#555555',
                opacity: 1,
              }}
            >
              <option value="">
                {tipoProductoSeleccionado
                  ? 'Seleccionar producto...'
                  : 'Primero seleccioná un tipo'}
              </option>
              {productosFiltrados.map((producto) => (
                <option key={producto.id} value={producto.id}>
                  {producto.descripcion}
                </option>
              ))}
            </select>
          </label>
        )}

        {tipoCalculoProducto === 'peso' &&
          masaNominalProducto !== null &&
          productoProveedorId && (
            <p style={{ color: '#ffffff' }}>
              Masa nominal:{' '}
              <strong>
                {formatearDecimal4SinMiles(masaNominalProducto)} kg/m
              </strong>
            </p>
          )}

        {tipoCalculoProducto === 'metro' && productoProveedorId && (
          <p style={{ color: '#ffffff' }}>
            Este producto se cotiza por metro lineal.
          </p>
        )}

        {tipoCalculoProducto === 'plancha' && productoProveedorId && (
          <p style={{ color: '#ffffff' }}>
            El peso se calcula con largo, ancho y espesor en mm.
          </p>
        )}

        <div className="product-form-actions">
          <button
            type="button"
            className="primary-button"
            onClick={confirmarSeleccionProducto}
            disabled={
              !tipoProductoSeleccionado ||
              (!esTipoSoloCalculadora(tipoProductoSeleccionado) &&
                !productoProveedorId)
            }
            style={{
              color:
                tipoProductoSeleccionado &&
                (esTipoSoloCalculadora(tipoProductoSeleccionado) ||
                  productoProveedorId)
                  ? undefined
                  : '#808080',
              opacity: 1,
            }}
          >
            {esTipoSoloCalculadora(tipoProductoSeleccionado)
              ? 'Continuar con calculadora'
              : 'Usar producto de tabla'}
          </button>

          {!esTipoSoloCalculadora(tipoProductoSeleccionado) && (
            <button
              type="button"
              className="secondary-button"
              onClick={prepararIngresoPorCalculadora}
            >
              Usar calculadora de metales
            </button>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={cerrarSelectorProducto}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (pantalla === 'configuracion') {
    return (
      <main className="app-shell" translate="no">
        {avisoModalElemento}
        {estilosGlobalesElemento}

        <section className="screen-card">
          <button type="button" className="back-button" onClick={volverInicio}>
            Volver
          </button>

          <div className="app-header">
            <h1 className="single-line-title">Seguridad de datos</h1>
          </div>

          {mensaje && <div className="message-box">{mensaje}</div>}

          <div className="form-card">
            <h2>Almacenamiento en tablet</h2>
            <p className="empty-text">
              {estadoAlmacenamiento
                ? textoEstadoAlmacenamiento(estadoAlmacenamiento)
                : 'Verificando almacenamiento...'}
            </p>
          </div>

          <div className="form-card">
            <h2>Copia de seguridad local</h2>

            <p className="empty-text">
              La copia guarda presupuestos, líneas y configuración. Los PDF se
              pueden volver a generar desde cada presupuesto.
            </p>

            <div className="main-actions backup-actions">
              <button
                type="button"
                className="primary-button"
                onClick={hacerBackupLocal}
              >
                Hacer copia de seguridad
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={seleccionarBackupParaRestaurar}
              >
                Restaurar copia
              </button>
            </div>

            <input
              ref={inputBackupRef}
              type="file"
              accept="application/json,.json"
              className="hidden-input"
              onChange={restaurarBackup}
            />
          </div>

          <div className="form-card">
            <h2>Google Drive</h2>

            <p className="empty-text">
              Carpeta de desarrollo: Presupuestos Nono - DEV
            </p>

            <p className="empty-text">
              Estado: {driveConectado ? 'Drive conectado' : 'Drive no conectado'}
            </p>

            <div className="main-actions backup-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={conectarDrive}
                disabled={driveTrabajando}
              >
                Conectar Google Drive
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={hacerBackupEnDrive}
                disabled={driveTrabajando}
              >
                Hacer copia en Drive
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (pantalla === 'editar' && presupuestoActual) {
    return (
      <main className="app-shell" translate="no">
        {avisoModalElemento}
        {estilosGlobalesElemento}
        {selectorProductoModalElemento}

        <section className="screen-card">
          <div className="top-actions-row">
            <button type="button" className="back-button" onClick={volverInicio}>
              Volver
            </button>

            <div className="storage-status storage-status-inline">
              <span className="status-dot" />
              <span>{textoEstadoDrive(presupuestoActual.estadoDrive)}</span>
            </div>
          </div>

          <div className="app-header app-header-compact">
            <p className="eyebrow">Presupuesto</p>
            <h1>{presupuestoActual.numeroFormateado}</h1>
            <p className="subtitle">
              Fecha: {presupuestoActual.fechaEmision}
            </p>
          </div>

          {mensaje && <div className="message-box">{mensaje}</div>}

          <div className="form-card client-compact-card">
            <div className="client-summary-row">
              <div className="client-summary-name">
                <span>Cliente</span>
                <strong>
                  {presupuestoActual.clienteNombre.trim() || 'Sin cliente'}
                </strong>
              </div>

              <button
                type="button"
                className="secondary-button compact-edit-button"
                onClick={() => {
                  setClienteEditando((actual) => !actual);
                  setClienteDatosModificados(false);
                  setMensaje('');
                }}
              >
                Editar datos
              </button>
            </div>

            {clienteEditando && (
              <form
                key={`cliente-${presupuestoActual.id}-${presupuestoActual.actualizadoEn}`}
                className="client-edit-form"
                onSubmit={guardarCliente}
                onChange={marcarClienteModificado}
              >
                <label className="field-label">
                  Nombre del cliente
                  <input
                    name="clienteNombre"
                    defaultValue={presupuestoActual.clienteNombre}
                    className="text-input"
                    autoComplete="off"
                  />
                </label>

                <label className="field-label">
                  Dirección
                  <input
                    name="clienteDireccion"
                    defaultValue={presupuestoActual.clienteDireccion}
                    className="text-input"
                    autoComplete="off"
                  />
                </label>

                <div className="client-two-column-grid">
                  <label className="field-label">
                    Teléfono
                    <input
                      name="clienteTelefono"
                      defaultValue={presupuestoActual.clienteTelefono}
                      className="text-input"
                      autoComplete="off"
                    />
                  </label>

                  <label className="field-label">
                    Cotización USD
                    <input
                      name="cotizacionUsdAl"
                      defaultValue={presupuestoActual.cotizacionUsdAl}
                      className="text-input"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,00"
                      onChange={normalizarEntradaDecimal2}
                      onBlur={completarCampoDecimal2}
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={!clienteDatosModificados}
                >
                  Guardar datos
                </button>
              </form>
            )}
          </div>

          <form
            key={`producto-${lineaEnEdicion?.id ?? 'nuevo'}-${productoFormVersion}`}
            ref={productoFormRef}
            className="form-card product-form-card"
            onSubmit={agregarProducto}
          >
            <h2>{lineaEnEdicion ? 'Editar producto' : 'Agregar producto'}</h2>

            <label className="field-label product-full-field">
              Descripción del producto
              <textarea
                ref={descripcionProductoRef}
                name="descripcion"
                className="text-area product-text-area"
                rows={2}
                autoComplete="off"
                value={descripcionProducto}
                onFocus={() => {
                  if (!descripcionProducto.trim()) {
                    abrirSelectorProducto();
                  }
                }}
                onChange={(event) => setDescripcionProducto(event.currentTarget.value)}
                placeholder="Toque aquí para seleccionar un producto o usar la calculadora"
              />
            </label>

            <div className="product-form-actions" style={{ marginTop: '-4px' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={abrirSelectorProducto}
              >
                {metodoIngresoProducto === 'calculadora'
                  ? 'Cambiar método de ingreso'
                  : productoProveedorId
                    ? 'Cambiar producto'
                    : 'Seleccionar producto'}
              </button>
            </div>

            {metodoIngresoProducto === 'calculadora' && (
              <>
                <div className="product-two-column-grid">
                  <label className="field-label">
                    Cantidad
                    <input
                      name="cantidad"
                      className="text-input product-number-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="Entero"
                      value={cantidadProducto}
                      onChange={(event) =>
                        setCantidadProducto(
                          event.currentTarget.value.replace(/\D/g, ''),
                        )
                      }
                    />
                  </label>

                  <label className="field-label">
                    Precio unitario USD/kg
                    <input
                      name="precioUnitario"
                      className="text-input product-number-input"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,0000"
                      value={precioUnitarioProducto}
                      onChange={manejarCambioPrecioUnitario}
                      onBlur={completarPrecioUnitario}
                    />
                  </label>
                </div>

                <div className="product-form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={abrirCalculadoraMetales}
                    disabled={
                      !Number.isInteger(parsearEntero(cantidadProducto)) ||
                      parsearEntero(cantidadProducto) <= 0 ||
                      !Number.isFinite(
                        parsearNumeroDecimal(precioUnitarioProducto),
                      ) ||
                      parsearNumeroDecimal(precioUnitarioProducto) <= 0
                    }
                  >
                    Abrir calculadora de metales
                  </button>
                </div>

                <label className="field-label product-full-field">
                  Peso total (kg)
                  <input
                    name="pesoTotal"
                    className="text-input product-number-input"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Se completa desde la calculadora"
                    value={pesoTotalProducto}
                    onChange={manejarCambioPesoTotal}
                    onBlur={completarPesoTotalProducto}
                  />
                </label>
              </>
            )}

            {metodoIngresoProducto === 'proveedor' &&
              tipoCalculoProducto === 'peso' && (
              <>
                <div className="product-two-column-grid">
                  <label className="field-label">
                    Cantidad
                    <input
                      name="cantidad"
                      className="text-input product-number-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="Entero"
                      value={cantidadProducto}
                      onChange={manejarCambioCantidadProducto}
                    />
                  </label>

                  <label className="field-label">
                    Masa nominal (kg/m)
                    <input
                      className="text-input product-number-input"
                      value={
                        masaNominalProducto
                          ? formatearDecimal4SinMiles(masaNominalProducto)
                          : ''
                      }
                      placeholder="Se completa desde la tabla"
                      readOnly
                    />
                  </label>
                </div>

                <div className="product-two-column-grid">
                  <label className="field-label">
                    Largo (m)
                    <input
                      name="largo"
                      className="text-input product-number-input"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="12,00"
                      value={largoProducto}
                      onChange={manejarCambioLargoProducto}
                      onBlur={completarLargoProducto}
                    />
                  </label>

                  <label className="field-label">
                    Precio unitario USD/kg
                    <input
                      name="precioUnitario"
                      className="text-input product-number-input"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,0000"
                      value={precioUnitarioProducto}
                      onChange={manejarCambioPrecioUnitario}
                      onBlur={completarPrecioUnitario}
                    />
                  </label>
                </div>

                <label className="field-label product-full-field">
                  Peso total (kg)
                  <input
                    name="pesoTotal"
                    className="text-input product-number-input"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,0000"
                    value={pesoTotalProducto}
                    onChange={manejarCambioPesoTotal}
                    onBlur={completarPesoTotalProducto}
                  />
                </label>
              </>
            )}

            {metodoIngresoProducto === 'proveedor' &&
              tipoCalculoProducto === 'metro' && (
              <>
                <div className="product-two-column-grid">
                  <label className="field-label">
                    Cantidad
                    <input
                      name="cantidad"
                      className="text-input product-number-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="Entero"
                      value={cantidadProducto}
                      onChange={manejarCambioCantidadProducto}
                    />
                  </label>

                  <label className="field-label">
                    Largo por unidad (m)
                    <input
                      name="largo"
                      className="text-input product-number-input"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,00"
                      value={largoProducto}
                      onChange={manejarCambioLargoProducto}
                      onBlur={completarLargoProducto}
                    />
                  </label>
                </div>

                <div className="product-two-column-grid">
                  <label className="field-label">
                    Metros totales
                    <input
                      className="text-input product-number-input"
                      value={
                        calcularMetrosTotales() > 0
                          ? formatearDecimal2SinMiles(calcularMetrosTotales())
                          : ''
                      }
                      placeholder="Cantidad × largo"
                      readOnly
                    />
                  </label>

                  <label className="field-label">
                    Precio unitario USD/m
                    <input
                      name="precioUnitario"
                      className="text-input product-number-input"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,0000"
                      value={precioUnitarioProducto}
                      onChange={manejarCambioPrecioUnitario}
                      onBlur={completarPrecioUnitario}
                    />
                  </label>
                </div>
              </>
            )}

            {metodoIngresoProducto === 'proveedor' &&
              tipoCalculoProducto === 'plancha' && (
              <>
                <div className="product-two-column-grid">
                  <label className="field-label">
                    Cantidad
                    <input
                      name="cantidad"
                      className="text-input product-number-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="Entero"
                      value={cantidadProducto}
                      onChange={manejarCambioCantidadProducto}
                    />
                  </label>

                  <label className="field-label">
                    Precio unitario USD/kg
                    <input
                      name="precioUnitario"
                      className="text-input product-number-input"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,0000"
                      value={precioUnitarioProducto}
                      onChange={manejarCambioPrecioUnitario}
                      onBlur={completarPrecioUnitario}
                    />
                  </label>
                </div>

                <div className="product-two-column-grid">
                  <label className="field-label">
                    Largo (mm)
                    <input
                      name="largo"
                      className="text-input product-number-input"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,00"
                      value={largoProducto}
                      onChange={manejarCambioLargoProducto}
                      onBlur={completarLargoProducto}
                    />
                  </label>

                  <label className="field-label">
                    Ancho (mm)
                    <input
                      name="ancho"
                      className="text-input product-number-input"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,00"
                      value={anchoProducto}
                      onChange={manejarCambioAnchoProducto}
                      onBlur={completarAnchoProducto}
                    />
                  </label>
                </div>

                <div className="product-two-column-grid">
                  <label className="field-label">
                    Espesor (mm)
                    <input
                      name="espesor"
                      className="text-input product-number-input"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,00"
                      value={espesorProducto}
                      onChange={manejarCambioEspesorProducto}
                      onBlur={completarEspesorProducto}
                    />
                  </label>

                  <label className="field-label">
                    Peso total (kg)
                    <input
                      className="text-input product-number-input"
                      value={pesoTotalProducto}
                      placeholder="Se calcula automáticamente"
                      readOnly
                    />
                  </label>
                </div>
              </>
            )}

            <div className="product-form-actions">
              <button
                type="submit"
                className="primary-button"
                disabled={
                  !Number.isFinite(parsearNumeroDecimal(precioUnitarioProducto)) ||
                  parsearNumeroDecimal(precioUnitarioProducto) <= 0
                }
              >
                {lineaEnEdicion ? 'Guardar cambios' : 'Agregar producto'}
              </button>

              {lineaEnEdicion && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={cancelarEdicionProducto}
                >
                  Cancelar edición
                </button>
              )}
            </div>
          </form>

          <MetalWeightCalculatorModal
            abierto={calculadoraAbierta}
            cantidad={
              Number.isInteger(parsearEntero(cantidadProducto))
                ? parsearEntero(cantidadProducto)
                : 0
            }
            precioUnitario={
              Number.isFinite(parsearNumeroDecimal(precioUnitarioProducto))
                ? parsearNumeroDecimal(precioUnitarioProducto)
                : 0
            }
            formaInicial={
              tipoProductoSeleccionado === 'Tubo redondo'
                ? 'tubo-redondo'
                : tipoProductoSeleccionado === 'Tubo cuadrado'
                  ? 'tubo-cuadrado'
                  : tipoProductoSeleccionado === 'Tubo rectangular'
                    ? 'tubo-rectangular'
                    : undefined
            }
            onAceptar={aceptarPesoCalculado}
            onCerrar={() => setCalculadoraAbierta(false)}
          />

          <div className="form-card">
            <h2>Productos cargados</h2>

            {lineas.length === 0 ? (
              <p className="empty-text">Todavía no hay productos cargados.</p>
            ) : (
              <div className="line-list">
                {lineas.map((linea) => {
                  const pesoTotal = obtenerPesoTotalLinea(linea);
                  const tituloProducto = `${linea.orden} - ${linea.descripcion}`;

                  return (
                    <article key={linea.id} className="product-card">
                      <div
                        className="product-card-title"
                        title={tituloProducto}
                      >
                        <span className="product-card-title-text">
                          <strong>{linea.orden}</strong>
                          <span> - </span>
                          <span>{linea.descripcion}</span>
                        </span>
                      </div>

                      <div className="product-card-left-values">
                        <span>
                          Cantidad:{' '}
                          <strong>{formatearEntero(linea.cantidad)}</strong>
                        </span>

                        {(linea.tipoCalculo ?? 'peso') === 'metro' ? (
                          <span>
                            Largo:{' '}
                            <strong>
                              {formatearDecimal4(linea.largo ?? 0)} m
                            </strong>
                          </span>
                        ) : (linea.tipoCalculo ?? 'peso') === 'plancha' ? (
                          <span>
                            Medidas:{' '}
                            <strong>
                              {formatearDecimal4(linea.largo ?? 0)} ×{' '}
                              {formatearDecimal4(linea.ancho ?? 0)} ×{' '}
                              {formatearDecimal4(linea.espesor ?? 0)} mm
                            </strong>
                          </span>
                        ) : (
                          <span>
                            Largo:{' '}
                            <strong>
                              {formatearDecimal4(linea.largo ?? 0)} m
                            </strong>
                          </span>
                        )}
                      </div>

                      <div className="product-card-right-values">
                        {(linea.tipoCalculo ?? 'peso') === 'metro' ? (
                          <span>
                            Metros totales:{' '}
                            <strong>
                              {formatearDecimal4(
                                linea.cantidad * (linea.largo ?? 0),
                              )}
                            </strong>
                          </span>
                        ) : (
                          <span>
                            Peso total:{' '}
                            <strong>{formatearDecimal4(pesoTotal)} kg</strong>
                          </span>
                        )}

                        <span>
                          Precio unit.: USD{' '}
                          <strong>
                            {formatearDecimal4(linea.precioUnitario)}/
                            {(linea.tipoCalculo ?? 'peso') === 'metro'
                              ? 'm'
                              : 'kg'}
                          </strong>
                        </span>
                      </div>

                      <div className="product-card-subtotal">
                        Subtotal: USD{' '}
                        <strong>{formatearImporteUSD(linea.subtotal)}</strong>
                      </div>

                      <div className="product-card-actions">
                        <button
                          type="button"
                          className="secondary-button product-card-edit-button"
                          onClick={() => cargarLineaParaEditar(linea)}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          className="danger-button product-card-delete"
                          onClick={() => borrarLinea(linea.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="form-card">
            <h2>PDF</h2>

            <div className="main-actions">
              <button
                type="button"
                className="primary-button"
                onClick={generarPdfCompartir}
              >
                Generar y compartir PDF
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={generarPdfDescarga}
              >
                Generar y descargar PDF
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" translate="no">
      {avisoModalElemento}
      {estilosGlobalesElemento}

      <section className="home-card">
        <div className="storage-status">
          <span className="status-dot" />
          <span>Guardado en tablet</span>
        </div>

        <div className="app-header">
          <h1>Presupuestos</h1>
        </div>

        {mensaje && <div className="message-box">{mensaje}</div>}

        <div className="main-actions">
          <button
            type="button"
            className="primary-button"
            onClick={manejarNuevoPresupuesto}
          >
            Nuevo presupuesto
          </button>

          <button type="button" className="secondary-button">
            Buscar presupuesto
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setPantalla('configuracion');
              setMensaje('');
            }}
          >
            Configuración
          </button>
        </div>

        <div className="list-card">
          <h2>Últimos presupuestos</h2>

          {presupuestos.length === 0 ? (
            <p className="empty-text">Todavía no hay presupuestos cargados.</p>
          ) : (
            <div className="budget-list">
              {presupuestos.map((presupuesto) => (
                <button
                  key={presupuesto.id}
                  type="button"
                  className="budget-item"
                  onClick={() => abrirPresupuesto(presupuesto.id)}
                >
                  <span className="budget-line">
                    <strong>{presupuesto.numeroFormateado}</strong>
                    <span>-</span>
                    <span>{formatearFechaLista(presupuesto.fechaEmision)}</span>
                    <span>-</span>
                    <span>{presupuesto.clienteNombre || 'Sin cliente'}</span>
                    <strong>USD {formatearImporteUSD(presupuesto.total)}</strong>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;