import type {
  ConfiguracionApp,
  LineaPresupuesto,
  Presupuesto,
} from '../types/presupuesto';
import { fechaHoraAhoraISO } from '../utils/format';
import { db } from './appDb';

interface BackupPresupuestosNono {
  tipo: 'presupuestos-nono-backup';
  version: 1;
  creadoEn: string;
  datos: {
    presupuestos: Presupuesto[];
    lineasPresupuesto: LineaPresupuesto[];
    configuracion: ConfiguracionApp[];
  };
}

function crearNombreBackup(): string {
  const ahora = new Date();

  const yyyy = ahora.getFullYear();
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  const dd = String(ahora.getDate()).padStart(2, '0');
  const hh = String(ahora.getHours()).padStart(2, '0');
  const min = String(ahora.getMinutes()).padStart(2, '0');

  return `backup-presupuestos-nono-${yyyy}${mm}${dd}-${hh}${min}.json`;
}

export async function crearBackupJson(): Promise<{
  nombreArchivo: string;
  contenido: string;
}> {
  const presupuestos = await db.presupuestos.toArray();
  const lineasPresupuesto = await db.lineasPresupuesto.toArray();
  const configuracion = await db.configuracion.toArray();

  const backup: BackupPresupuestosNono = {
    tipo: 'presupuestos-nono-backup',
    version: 1,
    creadoEn: fechaHoraAhoraISO(),
    datos: {
      presupuestos,
      lineasPresupuesto,
      configuracion,
    },
  };

  return {
    nombreArchivo: crearNombreBackup(),
    contenido: JSON.stringify(backup, null, 2),
  };
}

export async function descargarBackup(): Promise<string> {
  const backup = await crearBackupJson();

  const blob = new Blob([backup.contenido], {
    type: 'application/json;charset=utf-8',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = backup.nombreArchivo;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  return backup.nombreArchivo;
}

export async function restaurarBackupDesdeArchivo(
  archivo: File,
): Promise<void> {
  const texto = await archivo.text();
  const backup = JSON.parse(texto) as BackupPresupuestosNono;

  if (backup.tipo !== 'presupuestos-nono-backup') {
    throw new Error('El archivo no parece ser una copia de seguridad válida.');
  }

  if (backup.version !== 1) {
    throw new Error('La versión del backup no es compatible.');
  }

  if (!backup.datos?.presupuestos || !backup.datos?.lineasPresupuesto) {
    throw new Error('El backup está incompleto.');
  }

  await db.transaction(
    'rw',
    db.presupuestos,
    db.lineasPresupuesto,
    db.configuracion,
    async () => {
      await db.presupuestos.clear();
      await db.lineasPresupuesto.clear();
      await db.configuracion.clear();

      await db.presupuestos.bulkPut(backup.datos.presupuestos);
      await db.lineasPresupuesto.bulkPut(backup.datos.lineasPresupuesto);

      if (backup.datos.configuracion.length > 0) {
        await db.configuracion.bulkPut(backup.datos.configuracion);
      }
    },
  );
}
