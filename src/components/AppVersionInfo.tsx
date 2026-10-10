import { useEffect, useState } from 'react';
import { APP_VERSION } from '../config/appVersion';

export default function AppVersionInfo() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <>
      <p className="app-version">Presupuestos Nono — v{APP_VERSION}</p>
      <details className="app-screen-info">
        <summary>Datos de pantalla</summary>
        <p>Ancho visible: {width} px.</p>
      </details>
    </>
  );
}
