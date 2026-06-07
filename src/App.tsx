function App() {
  return (
    <main className="app-shell">
      <section className="home-card">
        <div className="app-header">
          <p className="eyebrow">Industrial Aceros</p>
          <h1>Presupuestos</h1>
          <p className="subtitle">Cotizaciones comerciales</p>
        </div>

        <div className="main-actions">
          <button type="button" className="primary-button">
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
      </section>
    </main>
  );
}

export default App;