import { APP_CONFIG } from '../config/appConfig';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
}

interface GoogleDriveFile {
  id: string;
  name: string;
  webViewLink?: string;
}

interface DriveFolders {
  rootId: string;
  backupsId: string;
  pdfsId: string;
  configuracionId: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (
            config: GoogleTokenClientConfig,
          ) => GoogleTokenClient;
        };
      };
    };
  }
}

let cachedAccessToken: string | null = null;
let cachedFolders: DriveFolders | null = null;

function cargarGoogleIdentityServices(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const scriptExistente = document.querySelector<HTMLScriptElement>(
      'script[data-google-identity-services="true"]',
    );

    if (scriptExistente) {
      scriptExistente.addEventListener('load', () => resolve());
      scriptExistente.addEventListener('error', () =>
        reject(new Error('No se pudo cargar Google Identity Services.')),
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentityServices = 'true';

    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('No se pudo cargar Google Identity Services.'));

    document.head.appendChild(script);
  });
}

async function pedirAccessToken(prompt: 'consent' | '' = 'consent'): Promise<string> {
  await cargarGoogleIdentityServices();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services no está disponible.');
  }

  return new Promise((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: APP_CONFIG.googleClientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                'No se pudo obtener permiso de Google Drive.',
            ),
          );
          return;
        }

        if (!response.access_token) {
          reject(new Error('Google no devolvió un token de acceso.'));
          return;
        }

        cachedAccessToken = response.access_token;
        resolve(response.access_token);
      },
    });

    tokenClient.requestAccessToken({ prompt });
  });
}

function escaparTextoQueryDrive(texto: string): string {
  return texto.replace(/'/g, "\\'");
}

async function buscarCarpetaDrive(
  accessToken: string,
  nombre: string,
  parentId?: string,
): Promise<GoogleDriveFile | null> {
  const partesQuery = [
    `mimeType = '${FOLDER_MIME_TYPE}'`,
    `name = '${escaparTextoQueryDrive(nombre)}'`,
    'trashed = false',
  ];

  if (parentId) {
    partesQuery.push(`'${parentId}' in parents`);
  }

  const params = new URLSearchParams({
    q: partesQuery.join(' and '),
    fields: 'files(id,name,webViewLink)',
    spaces: 'drive',
  });

  const respuesta = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!respuesta.ok) {
    throw new Error(await respuesta.text());
  }

  const datos = (await respuesta.json()) as { files: GoogleDriveFile[] };

  return datos.files[0] || null;
}

async function crearCarpetaDrive(
  accessToken: string,
  nombre: string,
  parentId?: string,
): Promise<GoogleDriveFile> {
  const metadata: Record<string, unknown> = {
    name: nombre,
    mimeType: FOLDER_MIME_TYPE,
  };

  if (parentId) {
    metadata.parents = [parentId];
  }

  const respuesta = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    },
  );

  if (!respuesta.ok) {
    throw new Error(await respuesta.text());
  }

  return respuesta.json() as Promise<GoogleDriveFile>;
}

async function obtenerOCrearCarpetaDrive(
  accessToken: string,
  nombre: string,
  parentId?: string,
): Promise<GoogleDriveFile> {
  const existente = await buscarCarpetaDrive(accessToken, nombre, parentId);

  if (existente) {
    return existente;
  }

  return crearCarpetaDrive(accessToken, nombre, parentId);
}

async function asegurarCarpetasDrive(
  accessToken: string,
): Promise<DriveFolders> {
  if (cachedFolders) {
    return cachedFolders;
  }

  const root = await obtenerOCrearCarpetaDrive(
    accessToken,
    APP_CONFIG.driveRootFolderName,
  );

  const backups = await obtenerOCrearCarpetaDrive(
    accessToken,
    APP_CONFIG.driveSubfolders.backups,
    root.id,
  );

  const pdfs = await obtenerOCrearCarpetaDrive(
    accessToken,
    APP_CONFIG.driveSubfolders.pdfs,
    root.id,
  );

  const configuracion = await obtenerOCrearCarpetaDrive(
    accessToken,
    APP_CONFIG.driveSubfolders.configuracion,
    root.id,
  );

  cachedFolders = {
    rootId: root.id,
    backupsId: backups.id,
    pdfsId: pdfs.id,
    configuracionId: configuracion.id,
  };

  return cachedFolders;
}

async function subirArchivoMultipartDrive(params: {
  accessToken: string;
  folderId: string;
  nombreArchivo: string;
  mimeType: string;
  contenido: Blob;
}): Promise<GoogleDriveFile> {
  const boundary = `presupuestos_nono_${crypto.randomUUID()}`;

  const metadata = {
    name: params.nombreArchivo,
    mimeType: params.mimeType,
    parents: [params.folderId],
  };

  const body = new Blob(
    [
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n',
      `--${boundary}\r\n`,
      `Content-Type: ${params.mimeType}\r\n\r\n`,
      params.contenido,
      '\r\n',
      `--${boundary}--`,
    ],
    {
      type: `multipart/related; boundary=${boundary}`,
    },
  );

  const respuesta = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
      body,
    },
  );

  if (!respuesta.ok) {
    throw new Error(await respuesta.text());
  }

  return respuesta.json() as Promise<GoogleDriveFile>;
}

export async function conectarGoogleDrive(): Promise<void> {
  const accessToken = await pedirAccessToken('consent');
  await asegurarCarpetasDrive(accessToken);
}

export async function subirBackupJsonADrive(
  nombreArchivo: string,
  contenidoJson: string,
): Promise<GoogleDriveFile> {
  const accessToken = cachedAccessToken || (await pedirAccessToken('consent'));
  const carpetas = await asegurarCarpetasDrive(accessToken);

  const blob = new Blob([contenidoJson], {
    type: 'application/json;charset=utf-8',
  });

  return subirArchivoMultipartDrive({
    accessToken,
    folderId: carpetas.backupsId,
    nombreArchivo,
    mimeType: 'application/json',
    contenido: blob,
  });
}