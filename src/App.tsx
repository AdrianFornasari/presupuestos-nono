import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  crearBackupJson,
  descargarBackup,
  restaurarBackupDesdeArchivo,
} from './db/backupService';
import {
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

function App() {
  const [pantalla, setPantalla] = useState<Pantalla>('inicio');
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [presupuestoActual, setPresupuestoActual] =
    useState<Presupuesto | null>(null);
  const [lineas, setLineas] = useState<LineaPresupuesto[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [estadoAlmacenamiento, setEstadoAlmacenamiento] =
    useState<EstadoAlmacenamientoPersistente | null>(null);

  const [driveConectado, setDriveConectado] = useState(false);
  const [driveTrabajando, setDriveTrabajando] = useState(false);

  const inputBackupRef = useRef<HTMLInputElement | null>(null);

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
    cargarPresupuestos();

    solicitarAlmacenamientoPersistente().then((estado) => {
      setEstadoAlmacenamiento(estado);
    });
  }, []);

  async function manejarNuevoPresupuesto() {
    const nuevo = await crearPresupuestoBorrador();
    setPresupuestoActual(nuevo);
    setLineas([]);
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
    setPantalla('editar');
    setMensaje('');
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

    setMensaje('Datos del cliente guardados.');
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

    if (!unidad) {
      setMensaje('Falta la unidad de medida.');
      return;
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setMensaje('La cantidad debe ser un número entero mayor que cero.');
      return;
    }

    if (!Number.isFinite(pesoTotal) || pesoTotal < 0) {
      setMensaje('El peso total debe ser un número válido con hasta 4 decimales.');
      return;
    }

    if (!Number.isFinite(precioUnitario) || precioUnitario <= 0) {
      setMensaje('El precio unitario debe ser mayor que cero.');
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

    await recargarPresupuestoActual(presupuestoActual.id);
    await cargarPresupuestos();
    setMensaje('Producto agregado.');
  }

  async function borrarLinea(lineaId: string) {
    if (!presupuestoActual) return;

    const confirmar = window.confirm('¿Eliminar esta línea del presupuesto?');

    if (!confirmar) return;

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
    setMensaje('');
    cargarPresupuestos();
  }

  if (pantalla === 'configuracion') {
    return (
      <main className="app-shell">
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
      <main className="app-shell">
        <section className="screen-card">
          <button type="button" className="back-button" onClick={volverInicio}>
            Volver
          </button>

          <div className="storage-status">
            <span className="status-dot" />
            <span>{textoEstadoDrive(presupuestoActual.estadoDrive)}</span>
          </div>

          <div className="app-header">
            <p className="eyebrow">Presupuesto</p>
            <h1>{presupuestoActual.numeroFormateado}</h1>
            <p className="subtitle">
              Fecha: {presupuestoActual.fechaEmision}
            </p>
          </div>

          {mensaje && <div className="message-box">{mensaje}</div>}

          <form
            key={`cliente-${presupuestoActual.id}-${presupuestoActual.actualizadoEn}`}
            className="form-card"
            onSubmit={guardarCliente}
          >
            <h2>Cliente y cotización</h2>

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
                />
              </label>
            </div>

            <button type="submit" className="primary-button">
              Guardar cliente
            </button>
          </form>

          <form className="form-card" onSubmit={agregarProducto}>
            <h2>Agregar producto</h2>

            <label className="field-label">
              Descripción del producto
              <textarea
                name="descripcion"
                className="text-area"
                rows={2}
                autoComplete="off"
              />
            </label>

            <div className="two-column-grid">
              <label className="field-label">
                Cantidad
                <input
                  name="cantidad"
                  className="text-input"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Entero"
                />
              </label>

              <label className="field-label">
                Unidad
                <input
                  name="unidad"
                  className="text-input"
                  autoComplete="off"
                  placeholder="kg, un, m..."
                />
              </label>
            </div>

            <div className="two-column-grid">
              <label className="field-label">
                Peso total
                <input
                  name="pesoTotal"
                  className="text-input"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,0000"
                />
              </label>

              <label className="field-label">
                Precio unitario u$s
                <input
                  name="precioUnitario"
                  className="text-input"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,0000"
                />
              </label>
            </div>

            <button type="submit" className="primary-button">
              Agregar producto
            </button>
          </form>

          <div className="form-card">
            <h2>Productos cargados</h2>

            {lineas.length === 0 ? (
              <p className="empty-text">Todavía no hay productos cargados.</p>
            ) : (
              <div className="line-list">
                {lineas.map((linea) => {
                  const pesoTotal = obtenerPesoTotalLinea(linea);

                  return (
                    <article key={linea.id} className="product-card">
                      <div className="product-card-title">
                        <strong>{linea.orden}</strong>
                        <span>-</span>
                        <strong>{linea.descripcion}</strong>
                      </div>

                      <div className="product-card-row">
                        <span>
                          Cantidad:{' '}
                          <strong>{formatearEntero(linea.cantidad)}</strong>
                        </span>

                        <span>
                          Unidad: <strong>{linea.unidad}</strong>
                        </span>
                      </div>

                      <div className="product-card-row">
                        <span>
                          Peso total:{' '}
                          <strong>{formatearDecimal4(pesoTotal)}</strong>
                        </span>

                        <span>
                          Precio unit.: u$s{' '}
                          <strong>{formatearDecimal4(linea.precioUnitario)}</strong>
                        </span>
                      </div>

                      <div className="product-card-subtotal">
                        Subtotal: u$s{' '}
                        <strong>{formatearImporteUSD(linea.subtotal)}</strong>
                      </div>

                      <button
                        type="button"
                        className="danger-button product-card-delete"
                        onClick={() => borrarLinea(linea.id)}
                      >
                        Eliminar
                      </button>
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
    <main className="app-shell">
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
                    <span>-</span>
                    <strong>u$s {formatearImporteUSD(presupuesto.total)}</strong>
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