import { useEffect, useState } from 'react';
import {
  actualizarDatosCliente,
  crearPresupuestoBorrador,
  listarPresupuestos,
  obtenerPresupuestoPorId,
} from './db/presupuestosService';
import type { Presupuesto } from './types/presupuesto';

type Pantalla = 'inicio' | 'editar';

function textoEstadoDrive(estado: Presupuesto['estadoDrive']): string {
  if (estado === 'tablet') return 'Guardado en tablet';
  if (estado === 'pendiente') return 'Copia en Drive pendiente';
  return 'Copia en Drive realizada';
}

function App() {
  const [pantalla, setPantalla] = useState<Pantalla>('inicio');
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [presupuestoActual, setPresupuestoActual] =
    useState<Presupuesto | null>(null);
  const [mensaje, setMensaje] = useState('');

  async function cargarPresupuestos() {
    const datos = await listarPresupuestos();
    setPresupuestos(datos);
  }

  useEffect(() => {
    cargarPresupuestos();
  }, []);

  async function manejarNuevoPresupuesto() {
    const nuevo = await crearPresupuestoBorrador();
    setPresupuestoActual(nuevo);
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

    setPresupuestoActual(presupuesto);
    setPantalla('editar');
    setMensaje('');
  }

  async function guardarCliente(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!presupuestoActual) return;

    const formData = new FormData(event.currentTarget);

    const clienteNombre = String(formData.get('clienteNombre') || '').trim();
    const clienteDireccion = String(
      formData.get('clienteDireccion') || '',
    ).trim();
    const clienteTelefono = String(formData.get('clienteTelefono') || '').trim();

    await actualizarDatosCliente(presupuestoActual.id, {
      clienteNombre,
      clienteDireccion,
      clienteTelefono,
    });

    const actualizado = await obtenerPresupuestoPorId(presupuestoActual.id);

    if (actualizado) {
      setPresupuestoActual(actualizado);
    }

    await cargarPresupuestos();
    setMensaje('Datos del cliente guardados.');
  }

  function volverInicio() {
    setPantalla('inicio');
    setPresupuestoActual(null);
    setMensaje('');
    cargarPresupuestos();
  }

  if (pantalla === 'editar' && presupuestoActual) {
    return (
      <main className="app-shell">
        <section className="screen-card">
          <button type="button" className="back-button" onClick={volverInicio}>
            Volver
          </button>

          <div className="app-header">
            <p className="eyebrow">Presupuesto</p>
            <h1>{presupuestoActual.numeroFormateado}</h1>
            <p className="subtitle">
              Fecha: {presupuestoActual.fechaEmision}
            </p>
          </div>

          {mensaje && <div className="message-box">{mensaje}</div>}

          <div className="storage-status">
            <span className="status-dot" />
            <span>{textoEstadoDrive(presupuestoActual.estadoDrive)}</span>
          </div>

          <form className="form-card" onSubmit={guardarCliente}>
            <h2>Cliente</h2>

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

            <label className="field-label">
              Teléfono
              <input
                name="clienteTelefono"
                defaultValue={presupuestoActual.clienteTelefono}
                className="text-input"
                autoComplete="off"
              />
            </label>

            <button type="submit" className="primary-button">
              Guardar cliente
            </button>
          </form>

          <div className="form-card">
            <h2>Productos</h2>
            <p className="empty-text">
              En el próximo paso vamos a agregar líneas de detalle.
            </p>
          </div>

          <div className="total-card">
            <span>Total</span>
            <strong>u$s {presupuestoActual.total.toFixed(2)}</strong>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="home-card">
        <div className="app-header">
          <p className="eyebrow">Industrial Aceros</p>
          <h1>Presupuestos</h1>
          <p className="subtitle">Cotizaciones comerciales</p>
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

          <button type="button" className="secondary-button">
            Configuración
          </button>
        </div>

        <div className="storage-status">
          <span className="status-dot" />
          <span>Guardado en tablet</span>
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
                  <span className="budget-number">
                    {presupuesto.numeroFormateado}
                  </span>
                  <span className="budget-client">
                    {presupuesto.clienteNombre || 'Sin cliente'}
                  </span>
                  <span className="budget-total">
                    u$s {presupuesto.total.toFixed(2)}
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