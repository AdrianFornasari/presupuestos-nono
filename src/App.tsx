import {
  useEffect,
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
import type { LineaPresupuesto, Presupuesto } from './types/presupuesto';
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

type Pantalla = 'inicio' | 'editar' | 'configuracion';

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

  const [calculadoraAbierta, setCalculadoraAbierta] = useState(false);
  const [cantidadParaCalculadora, setCantidadParaCalculadora] = useState(0);
  const [precioUnitarioParaCalculadora, setPrecioUnitarioParaCalculadora] =
    useState(0);

  const [clienteEditando, setClienteEditando] = useState(false);
  const [clienteDatosModificados, setClienteDatosModificados] = useState(false);

  const [lineaEnEdicion, setLineaEnEdicion] =
    useState<LineaPresupuesto | null>(null);
  const [productoFormVersion, setProductoFormVersion] = useState(0);

  const inputBackupRef = useRef<HTMLInputElement | null>(null);
  const cantidadInputRef = useRef<HTMLInputElement | null>(null);
  const pesoTotalInputRef = useRef<HTMLInputElement | null>(null);
  const precioUnitarioInputRef = useRef<HTMLInputElement | null>(null);
  const productoFormRef = useRef<HTMLFormElement | null>(null);

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
    setPantalla('editar');
    setMensaje('');
  }

  function normalizarEntradaEntera(event: ChangeEvent<HTMLInputElement>) {
    event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '');
  }

  function normalizarEntradaDecimal4(event: ChangeEvent<HTMLInputElement>) {
    event.currentTarget.value = normalizarTextoDecimal(
      event.currentTarget.value,
      4,
    );
  }

  function normalizarEntradaDecimal2(event: ChangeEvent<HTMLInputElement>) {
    event.currentTarget.value = normalizarTextoDecimal(
      event.currentTarget.value,
      2,
    );
  }

  function completarCampoDecimal4(event: FocusEvent<HTMLInputElement>) {
    const texto = event.currentTarget.value.trim();

    if (!texto) return;

    const numero = parsearNumeroDecimal(texto);

    if (Number.isFinite(numero)) {
      event.currentTarget.value = formatearDecimal4SinMiles(numero);
    }
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

  function intentarAbrirCalculadoraPeso() {
    const pesoActualTexto = pesoTotalInputRef.current?.value.trim() ?? '';
    const pesoActual = pesoActualTexto
      ? parsearNumeroDecimal(pesoActualTexto)
      : 0;

    if (Number.isFinite(pesoActual) && pesoActual > 0) {
      return;
    }

    const cantidad = parsearEntero(cantidadInputRef.current?.value ?? '');

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setMensaje(
        'Antes de calcular el peso total, cargá una cantidad entera mayor que cero.',
      );
      cantidadInputRef.current?.focus();
      return;
    }

    const precioUnitario = parsearNumeroDecimal(
      precioUnitarioInputRef.current?.value ?? '',
    );

    setCantidadParaCalculadora(cantidad);
    setPrecioUnitarioParaCalculadora(
      Number.isFinite(precioUnitario) && precioUnitario > 0
        ? precioUnitario
        : 0,
    );
    setCalculadoraAbierta(true);
    setMensaje('');
  }

  function aceptarPesoCalculado(pesoCalculado: number) {
    if (pesoTotalInputRef.current) {
      pesoTotalInputRef.current.value = formatearDecimal4SinMiles(pesoCalculado);
    }

    setCalculadoraAbierta(false);
    setAvisoModal('Peso total calculado.');
  }

  function cargarLineaParaEditar(linea: LineaPresupuesto) {
    setLineaEnEdicion(linea);
    setProductoFormVersion((version) => version + 1);
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
    setProductoFormVersion((version) => version + 1);
    setMensaje('');
  }

  async function agregarProducto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!presupuestoActual) return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    const descripcion = String(formData.get('descripcion') || '').trim();
    const unidad = String(formData.get('unidad') || '').trim();
    const cantidad = parsearEntero(formData.get('cantidad'));
    const pesoTotal = parsearNumeroDecimal(formData.get('pesoTotal'));
    const precioUnitario = parsearNumeroDecimal(formData.get('precioUnitario'));

    if (!descripcion) {
      setMensaje('Falta la descripción del producto.');
      return;
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setMensaje('La cantidad debe ser un número entero mayor que cero.');
      return;
    }

    if (!Number.isFinite(precioUnitario) || precioUnitario <= 0) {
      setMensaje('El precio unitario debe ser mayor que cero.');
      return;
    }

    if (!Number.isFinite(pesoTotal) || pesoTotal <= 0) {
      setMensaje('El peso total debe ser mayor que cero.');
      return;
    }

    if (!unidad) {
      setMensaje('Falta la unidad de medida.');
      return;
    }

    if (lineaEnEdicion) {
      await actualizarLineaPresupuesto(
        presupuestoActual.id,
        lineaEnEdicion.id,
        {
          descripcion,
          cantidad,
          unidad,
          precioUnitario,
          pesoTotal,
        },
      );

      setLineaEnEdicion(null);
      setProductoFormVersion((version) => version + 1);

      await recargarPresupuestoActual(presupuestoActual.id);
      await cargarPresupuestos();

      setMensaje('');
      setAvisoModal('Producto actualizado.');
      return;
    }

    await agregarLineaPresupuesto(presupuestoActual.id, {
      descripcion,
      cantidad,
      unidad,
      precioUnitario,
      pesoTotal,
    });

    form.reset();
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

  if (pantalla === 'configuracion') {
    return (
      <main className="app-shell" translate="no">
        {avisoModalElemento}

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
    const pesoTotalEdicion = lineaEnEdicion
      ? obtenerPesoTotalLinea(lineaEnEdicion)
      : 0;

    return (
      <main className="app-shell" translate="no">
        {avisoModalElemento}

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
                name="descripcion"
                className="text-area product-text-area"
                rows={2}
                autoComplete="off"
                defaultValue={lineaEnEdicion?.descripcion ?? ''}
              />
            </label>

            <div className="product-two-column-grid">
              <label className="field-label">
                Cantidad
                <input
                  ref={cantidadInputRef}
                  name="cantidad"
                  className="text-input product-number-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="Entero"
                  onChange={normalizarEntradaEntera}
                  defaultValue={
                    lineaEnEdicion ? String(lineaEnEdicion.cantidad) : ''
                  }
                />
              </label>

              <label className="field-label">
                Precio unitario USD
                <input
                  ref={precioUnitarioInputRef}
                  name="precioUnitario"
                  className="text-input product-number-input"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,0000"
                  onChange={normalizarEntradaDecimal4}
                  onBlur={completarCampoDecimal4}
                  defaultValue={
                    lineaEnEdicion
                      ? formatearDecimal4SinMiles(lineaEnEdicion.precioUnitario)
                      : ''
                  }
                />
              </label>
            </div>

            <div className="product-two-column-grid">
              <label className="field-label">
                Unidad
                <input
                  name="unidad"
                  className="text-input product-number-input"
                  autoComplete="off"
                  placeholder="kg, un, m..."
                  defaultValue={lineaEnEdicion?.unidad ?? ''}
                />
              </label>

              <label className="field-label">
                Peso total
                <input
                  ref={pesoTotalInputRef}
                  name="pesoTotal"
                  className="text-input product-number-input"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,0000"
                  onFocus={intentarAbrirCalculadoraPeso}
                  onChange={normalizarEntradaDecimal4}
                  onBlur={completarCampoDecimal4}
                  defaultValue={
                    lineaEnEdicion
                      ? formatearDecimal4SinMiles(pesoTotalEdicion)
                      : ''
                  }
                />
              </label>
            </div>

            <div className="product-form-actions">
              <button type="submit" className="primary-button">
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
            cantidad={cantidadParaCalculadora}
            precioUnitario={precioUnitarioParaCalculadora}
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

                        <span>
                          Unidad: <strong>{linea.unidad}</strong>
                        </span>
                      </div>

                      <div className="product-card-right-values">
                        <span>
                          Peso total:{' '}
                          <strong>{formatearDecimal4(pesoTotal)}</strong>
                        </span>

                        <span>
                          Precio unit.: USD{' '}
                          <strong>
                            {formatearDecimal4(linea.precioUnitario)}
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