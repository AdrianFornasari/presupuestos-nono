import {
  useMemo,
  useState,
  type ChangeEvent,
  type FocusEvent,
} from 'react';
import './MetalWeightCalculatorModal.css';

type FormaMetal =
  | 'hierro-redondo'
  | 'perfil-t'
  | 'perfil-doble-t'
  | 'perfil-u'
  | 'chapa';

type ModoCalculoPerfil = 'tabla' | 'manual';

interface MetalWeightCalculatorModalProps {
  abierto: boolean;
  cantidad: number;
  precioUnitario: number;
  onAceptar: (pesoCalculado: number) => void;
  onCerrar: () => void;
}

interface PerfilNormalizado {
  id: string;
  etiqueta: string;
  pesoKgPorMetro: number;
}

const DENSIDAD_ACERO_KG_M3 = 7850;

const PERFILES_NORMALIZADOS: Partial<Record<FormaMetal, PerfilNormalizado[]>> = {
  'perfil-t': [
    {
      id: 't-3-4-1-8',
      etiqueta: 'T 3/4" x 1/8" - 0,89 kg/m',
      pesoKgPorMetro: 0.89,
    },
    {
      id: 't-7-8-1-8',
      etiqueta: 'T 7/8" x 1/8" - 1,04 kg/m',
      pesoKgPorMetro: 1.04,
    },
    {
      id: 't-1-1-8',
      etiqueta: 'T 1" x 1/8" - 1,19 kg/m',
      pesoKgPorMetro: 1.19,
    },
    {
      id: 't-1-1-4-1-8',
      etiqueta: 'T 1 1/4" x 1/8" - 1,54 kg/m',
      pesoKgPorMetro: 1.54,
    },
    {
      id: 't-1-1-4-3-16',
      etiqueta: 'T 1 1/4" x 3/16" - 2,27 kg/m',
      pesoKgPorMetro: 2.27,
    },
    {
      id: 't-1-1-2-1-8',
      etiqueta: 'T 1 1/2" x 1/8" - 1,84 kg/m',
      pesoKgPorMetro: 1.84,
    },
    {
      id: 't-1-1-2-3-16',
      etiqueta: 'T 1 1/2" x 3/16" - 2,72 kg/m',
      pesoKgPorMetro: 2.72,
    },
    {
      id: 't-2-1-8',
      etiqueta: 'T 2" x 1/8" - 3,69 kg/m',
      pesoKgPorMetro: 3.69,
    },
    {
      id: 't-2-3-16',
      etiqueta: 'T 2" x 3/16" - 4,87 kg/m',
      pesoKgPorMetro: 4.87,
    },
  ],

  'perfil-doble-t': [
    { id: 'ipn-80', etiqueta: 'IPN 80 - 5,90 kg/m', pesoKgPorMetro: 5.9 },
    { id: 'ipn-100', etiqueta: 'IPN 100 - 8,30 kg/m', pesoKgPorMetro: 8.3 },
    { id: 'ipn-120', etiqueta: 'IPN 120 - 11,10 kg/m', pesoKgPorMetro: 11.1 },
    { id: 'ipn-140', etiqueta: 'IPN 140 - 14,30 kg/m', pesoKgPorMetro: 14.3 },
    { id: 'ipn-160', etiqueta: 'IPN 160 - 17,90 kg/m', pesoKgPorMetro: 17.9 },
    { id: 'ipn-180', etiqueta: 'IPN 180 - 21,90 kg/m', pesoKgPorMetro: 21.9 },
    { id: 'ipn-200', etiqueta: 'IPN 200 - 26,20 kg/m', pesoKgPorMetro: 26.2 },
    { id: 'ipn-220', etiqueta: 'IPN 220 - 30,90 kg/m', pesoKgPorMetro: 30.9 },
    { id: 'ipn-240', etiqueta: 'IPN 240 - 36,10 kg/m', pesoKgPorMetro: 36.1 },
    { id: 'ipn-260', etiqueta: 'IPN 260 - 41,80 kg/m', pesoKgPorMetro: 41.8 },
    { id: 'ipn-280', etiqueta: 'IPN 280 - 47,80 kg/m', pesoKgPorMetro: 47.8 },
    { id: 'ipn-300', etiqueta: 'IPN 300 - 54,10 kg/m', pesoKgPorMetro: 54.1 },
    { id: 'ipn-320', etiqueta: 'IPN 320 - 60,90 kg/m', pesoKgPorMetro: 60.9 },
    { id: 'ipn-340', etiqueta: 'IPN 340 - 67,90 kg/m', pesoKgPorMetro: 67.9 },
    { id: 'ipn-360', etiqueta: 'IPN 360 - 76,00 kg/m', pesoKgPorMetro: 76 },
    { id: 'ipn-380', etiqueta: 'IPN 380 - 83,80 kg/m', pesoKgPorMetro: 83.8 },
    { id: 'ipn-400', etiqueta: 'IPN 400 - 92,40 kg/m', pesoKgPorMetro: 92.4 },
    { id: 'ipn-425', etiqueta: 'IPN 425 - 103,40 kg/m', pesoKgPorMetro: 103.4 },
    { id: 'ipn-450', etiqueta: 'IPN 450 - 115,20 kg/m', pesoKgPorMetro: 115.2 },
    { id: 'ipn-475', etiqueta: 'IPN 475 - 127,70 kg/m', pesoKgPorMetro: 127.7 },
    { id: 'ipn-500', etiqueta: 'IPN 500 - 140,20 kg/m', pesoKgPorMetro: 140.2 },
    { id: 'ipn-550', etiqueta: 'IPN 550 - 166,10 kg/m', pesoKgPorMetro: 166.1 },
    { id: 'ipn-600', etiqueta: 'IPN 600 - 199,00 kg/m', pesoKgPorMetro: 199 },
  ],

  'perfil-u': [
    { id: 'upn-80', etiqueta: 'UPN 80 - 8,60 kg/m', pesoKgPorMetro: 8.6 },
    { id: 'upn-100', etiqueta: 'UPN 100 - 10,60 kg/m', pesoKgPorMetro: 10.6 },
    { id: 'upn-120', etiqueta: 'UPN 120 - 13,30 kg/m', pesoKgPorMetro: 13.3 },
    { id: 'upn-140', etiqueta: 'UPN 140 - 16,00 kg/m', pesoKgPorMetro: 16 },
    { id: 'upn-160', etiqueta: 'UPN 160 - 18,80 kg/m', pesoKgPorMetro: 18.8 },
    { id: 'upn-180', etiqueta: 'UPN 180 - 21,90 kg/m', pesoKgPorMetro: 21.9 },
    { id: 'upn-200', etiqueta: 'UPN 200 - 25,20 kg/m', pesoKgPorMetro: 25.2 },
    { id: 'upn-220', etiqueta: 'UPN 220 - 29,30 kg/m', pesoKgPorMetro: 29.3 },
    { id: 'upn-240', etiqueta: 'UPN 240 - 33,10 kg/m', pesoKgPorMetro: 33.1 },
    { id: 'upn-260', etiqueta: 'UPN 260 - 37,80 kg/m', pesoKgPorMetro: 37.8 },
    { id: 'upn-280', etiqueta: 'UPN 280 - 41,80 kg/m', pesoKgPorMetro: 41.8 },
    { id: 'upn-300', etiqueta: 'UPN 300 - 46,10 kg/m', pesoKgPorMetro: 46.1 },
    { id: 'upn-320', etiqueta: 'UPN 320 - 59,40 kg/m', pesoKgPorMetro: 59.4 },
    { id: 'upn-350', etiqueta: 'UPN 350 - 60,60 kg/m', pesoKgPorMetro: 60.6 },
    { id: 'upn-380', etiqueta: 'UPN 380 - 63,00 kg/m', pesoKgPorMetro: 63 },
    { id: 'upn-400', etiqueta: 'UPN 400 - 71,70 kg/m', pesoKgPorMetro: 71.7 },
  ],
};

function normalizarTextoDecimal(valor: string): string {
  const conComa = valor.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const partes = conComa.split(',');
  const parteEntera = partes[0] ?? '';
  const huboSeparador = partes.length > 1;
  const parteDecimal = partes.slice(1).join('').slice(0, 4);

  if (!huboSeparador) {
    return parteEntera;
  }

  return `${parteEntera},${parteDecimal}`;
}

function completarTextoDecimal4(valor: string): string {
  const numero = parsearDecimal(valor);

  if (!Number.isFinite(numero)) {
    return valor;
  }

  return numero.toFixed(4).replace('.', ',');
}

function parsearDecimal(valor: string): number {
  const texto = valor.trim().replace(',', '.');

  if (!texto) return Number.NaN;

  const puntos = (texto.match(/\./g) || []).length;

  if (puntos > 1) return Number.NaN;

  if (!/^\d+(\.\d+)?$/.test(texto)) return Number.NaN;

  const numero = Number(texto);

  return Number.isFinite(numero) ? numero : Number.NaN;
}

function formatearDecimal4(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(valor);
}

function formatearImporte(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

function formatearKgPorMetro(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

function mm3AM3(valorMm3: number): number {
  return valorMm3 / 1_000_000_000;
}

function obtenerPerfilesNormalizados(forma: FormaMetal): PerfilNormalizado[] {
  return PERFILES_NORMALIZADOS[forma] ?? [];
}

function obtenerPerfilNormalizado(
  forma: FormaMetal,
  perfilId: string,
): PerfilNormalizado | null {
  const perfiles = obtenerPerfilesNormalizados(forma);

  if (perfiles.length === 0) return null;

  return perfiles.find((perfil) => perfil.id === perfilId) ?? perfiles[0];
}

function obtenerPrimerPerfilId(forma: FormaMetal): string {
  return obtenerPerfilesNormalizados(forma)[0]?.id ?? '';
}

function areaHierroRedondoMm2(diametroMm: number): number {
  const radioMm = diametroMm / 2;
  return Math.PI * radioMm * radioMm;
}

function areaPerfilTMm2(
  altoTotalMm: number,
  anchoAlaMm: number,
  espesorAlaMm: number,
  espesorAlmaMm: number,
): number {
  return (
    anchoAlaMm * espesorAlaMm +
    (altoTotalMm - espesorAlaMm) * espesorAlmaMm
  );
}

function areaPerfilDobleTMm2(
  altoTotalMm: number,
  anchoAlaMm: number,
  espesorAlaMm: number,
  espesorAlmaMm: number,
): number {
  return (
    2 * anchoAlaMm * espesorAlaMm +
    (altoTotalMm - 2 * espesorAlaMm) * espesorAlmaMm
  );
}

function areaPerfilUMm2(
  altoTotalMm: number,
  anchoAlaMm: number,
  espesorAlaMm: number,
  espesorAlmaMm: number,
): number {
  return (
    altoTotalMm * espesorAlmaMm +
    2 * (anchoAlaMm - espesorAlmaMm) * espesorAlaMm
  );
}

function calcularPesoUnitarioKg(
  forma: FormaMetal,
  modoCalculoPerfil: ModoCalculoPerfil,
  perfilNormalizadoId: string,
  valores: Record<string, string>,
): number {
  const largoMm = parsearDecimal(valores.largoMm);

  if (!Number.isFinite(largoMm) || largoMm <= 0) return Number.NaN;

  const perfilesNormalizados = obtenerPerfilesNormalizados(forma);
  const permiteTabla = perfilesNormalizados.length > 0;

  if (permiteTabla && modoCalculoPerfil === 'tabla') {
    const perfil = obtenerPerfilNormalizado(forma, perfilNormalizadoId);

    if (!perfil) return Number.NaN;

    return perfil.pesoKgPorMetro * (largoMm / 1000);
  }

  if (forma === 'chapa') {
    const anchoMm = parsearDecimal(valores.anchoMm);
    const espesorMm = parsearDecimal(valores.espesorMm);

    if (
      !Number.isFinite(anchoMm) ||
      !Number.isFinite(espesorMm) ||
      anchoMm <= 0 ||
      espesorMm <= 0
    ) {
      return Number.NaN;
    }

    const volumenM3 = mm3AM3(anchoMm * largoMm * espesorMm);
    return volumenM3 * DENSIDAD_ACERO_KG_M3;
  }

  if (forma === 'hierro-redondo') {
    const diametroMm = parsearDecimal(valores.diametroMm);

    if (!Number.isFinite(diametroMm) || diametroMm <= 0) {
      return Number.NaN;
    }

    const areaMm2 = areaHierroRedondoMm2(diametroMm);
    const volumenM3 = mm3AM3(areaMm2 * largoMm);

    return volumenM3 * DENSIDAD_ACERO_KG_M3;
  }

  if (forma === 'perfil-t') {
    const altoTotalMm = parsearDecimal(valores.altoTotalMm);
    const anchoAlaMm = parsearDecimal(valores.anchoAlaMm);
    const espesorAlaMm = parsearDecimal(valores.espesorAlaMm);
    const espesorAlmaMm = parsearDecimal(valores.espesorAlmaMm);

    if (
      !Number.isFinite(altoTotalMm) ||
      !Number.isFinite(anchoAlaMm) ||
      !Number.isFinite(espesorAlaMm) ||
      !Number.isFinite(espesorAlmaMm) ||
      altoTotalMm <= 0 ||
      anchoAlaMm <= 0 ||
      espesorAlaMm <= 0 ||
      espesorAlmaMm <= 0 ||
      espesorAlaMm >= altoTotalMm ||
      espesorAlmaMm > anchoAlaMm
    ) {
      return Number.NaN;
    }

    const areaMm2 = areaPerfilTMm2(
      altoTotalMm,
      anchoAlaMm,
      espesorAlaMm,
      espesorAlmaMm,
    );

    const volumenM3 = mm3AM3(areaMm2 * largoMm);

    return volumenM3 * DENSIDAD_ACERO_KG_M3;
  }

  if (forma === 'perfil-doble-t') {
    const altoTotalMm = parsearDecimal(valores.altoTotalMm);
    const anchoAlaMm = parsearDecimal(valores.anchoAlaMm);
    const espesorAlaMm = parsearDecimal(valores.espesorAlaMm);
    const espesorAlmaMm = parsearDecimal(valores.espesorAlmaMm);

    if (
      !Number.isFinite(altoTotalMm) ||
      !Number.isFinite(anchoAlaMm) ||
      !Number.isFinite(espesorAlaMm) ||
      !Number.isFinite(espesorAlmaMm) ||
      altoTotalMm <= 0 ||
      anchoAlaMm <= 0 ||
      espesorAlaMm <= 0 ||
      espesorAlmaMm <= 0 ||
      espesorAlaMm * 2 >= altoTotalMm ||
      espesorAlmaMm > anchoAlaMm
    ) {
      return Number.NaN;
    }

    const areaMm2 = areaPerfilDobleTMm2(
      altoTotalMm,
      anchoAlaMm,
      espesorAlaMm,
      espesorAlmaMm,
    );

    const volumenM3 = mm3AM3(areaMm2 * largoMm);

    return volumenM3 * DENSIDAD_ACERO_KG_M3;
  }

  if (forma === 'perfil-u') {
    const altoTotalMm = parsearDecimal(valores.altoTotalMm);
    const anchoAlaMm = parsearDecimal(valores.anchoAlaMm);
    const espesorAlaMm = parsearDecimal(valores.espesorAlaMm);
    const espesorAlmaMm = parsearDecimal(valores.espesorAlmaMm);

    if (
      !Number.isFinite(altoTotalMm) ||
      !Number.isFinite(anchoAlaMm) ||
      !Number.isFinite(espesorAlaMm) ||
      !Number.isFinite(espesorAlmaMm) ||
      altoTotalMm <= 0 ||
      anchoAlaMm <= 0 ||
      espesorAlaMm <= 0 ||
      espesorAlmaMm <= 0 ||
      espesorAlmaMm >= anchoAlaMm ||
      espesorAlaMm * 2 >= altoTotalMm
    ) {
      return Number.NaN;
    }

    const areaMm2 = areaPerfilUMm2(
      altoTotalMm,
      anchoAlaMm,
      espesorAlaMm,
      espesorAlmaMm,
    );

    const volumenM3 = mm3AM3(areaMm2 * largoMm);

    return volumenM3 * DENSIDAD_ACERO_KG_M3;
  }

  return Number.NaN;
}

function valoresIniciales(): Record<string, string> {
  return {
    largoMm: '',
    anchoMm: '',
    espesorMm: '',
    diametroMm: '',
    altoTotalMm: '',
    anchoAlaMm: '',
    espesorAlaMm: '',
    espesorAlmaMm: '',
  };
}

function MetalWeightCalculatorModal({
  abierto,
  cantidad,
  precioUnitario,
  onAceptar,
  onCerrar,
}: MetalWeightCalculatorModalProps) {
  const [forma, setForma] = useState<FormaMetal>('hierro-redondo');
  const [modoCalculoPerfil, setModoCalculoPerfil] =
    useState<ModoCalculoPerfil>('tabla');
  const [perfilNormalizadoId, setPerfilNormalizadoId] = useState('');
  const [valores, setValores] = useState<Record<string, string>>(
    valoresIniciales(),
  );

  const perfilesNormalizados = obtenerPerfilesNormalizados(forma);
  const permiteTabla = perfilesNormalizados.length > 0;
  const perfilSeleccionado = obtenerPerfilNormalizado(
    forma,
    perfilNormalizadoId,
  );

  const pesoUnitarioKg = useMemo(
    () =>
      calcularPesoUnitarioKg(
        forma,
        modoCalculoPerfil,
        perfilNormalizadoId,
        valores,
      ),
    [forma, modoCalculoPerfil, perfilNormalizadoId, valores],
  );

  const pesoTotalKg =
    Number.isFinite(pesoUnitarioKg) && cantidad > 0
      ? pesoUnitarioKg * cantidad
      : Number.NaN;

  const subtotal =
    Number.isFinite(pesoTotalKg) && precioUnitario > 0
      ? pesoTotalKg * precioUnitario
      : Number.NaN;

  function actualizarValor(event: ChangeEvent<HTMLInputElement>) {
    const valorNormalizado = normalizarTextoDecimal(event.target.value);

    setValores((actual) => ({
      ...actual,
      [event.target.name]: valorNormalizado,
    }));
  }

  function completarValor(event: FocusEvent<HTMLInputElement>) {
    setValores((actual) => ({
      ...actual,
      [event.target.name]: completarTextoDecimal4(event.target.value),
    }));
  }

  function cambiarForma(event: ChangeEvent<HTMLSelectElement>) {
    const nuevaForma = event.target.value as FormaMetal;

    setForma(nuevaForma);
    setValores(valoresIniciales());

    const primerPerfilId = obtenerPrimerPerfilId(nuevaForma);

    if (primerPerfilId) {
      setModoCalculoPerfil('tabla');
      setPerfilNormalizadoId(primerPerfilId);
    } else {
      setModoCalculoPerfil('manual');
      setPerfilNormalizadoId('');
    }
  }

  function cambiarModoCalculo(event: ChangeEvent<HTMLSelectElement>) {
    const nuevoModo = event.target.value as ModoCalculoPerfil;

    setModoCalculoPerfil(nuevoModo);

    if (nuevoModo === 'tabla' && !perfilNormalizadoId) {
      setPerfilNormalizadoId(obtenerPrimerPerfilId(forma));
    }
  }

  function aceptar() {
    if (!Number.isFinite(pesoTotalKg) || pesoTotalKg <= 0) {
      return;
    }

    onAceptar(pesoTotalKg);
  }

  if (!abierto) return null;

  return (
    <div className="metal-modal-backdrop" role="presentation">
      <div
        className="metal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metal-modal-title"
      >
        <h2 id="metal-modal-title">Calculadora de metales</h2>

        <div className="metal-modal-info">
          <span>Cantidad: {cantidad}</span>
          <span>Densidad acero: 7850 kg/m³</span>
          <span>
            Precio unit.:{' '}
            {precioUnitario > 0
              ? `u$s ${formatearDecimal4(precioUnitario)}`
              : 'sin cargar'}
          </span>
        </div>

        <label className="metal-field">
          Producto
          <select value={forma} onChange={cambiarForma}>
            <option value="hierro-redondo">Hierro redondo</option>
            <option value="perfil-t">Perfil T</option>
            <option value="perfil-doble-t">Perfil doble T / IPN</option>
            <option value="perfil-u">Perfil U / UPN</option>
            <option value="chapa">Chapa</option>
          </select>
        </label>

        {permiteTabla && (
          <label className="metal-field">
            Modo de cálculo
            <select value={modoCalculoPerfil} onChange={cambiarModoCalculo}>
              <option value="tabla">Usar tabla normalizada</option>
              <option value="manual">Ingresar medidas manualmente</option>
            </select>
          </label>
        )}

        <div className="metal-fields-grid">
          {permiteTabla && modoCalculoPerfil === 'tabla' && (
            <>
              <label className="metal-field">
                Perfil normalizado
                <select
                  value={perfilSeleccionado?.id ?? ''}
                  onChange={(event) =>
                    setPerfilNormalizadoId(event.target.value)
                  }
                >
                  {perfilesNormalizados.map((perfil) => (
                    <option key={perfil.id} value={perfil.id}>
                      {perfil.etiqueta}
                    </option>
                  ))}
                </select>
              </label>

              <label className="metal-field">
                Largo mm
                <input
                  name="largoMm"
                  value={valores.largoMm}
                  onChange={actualizarValor}
                  onBlur={completarValor}
                  inputMode="decimal"
                  placeholder="0,0000"
                />
              </label>
            </>
          )}

          {forma === 'chapa' && (
            <>
              <label className="metal-field">
                Ancho mm
                <input
                  name="anchoMm"
                  value={valores.anchoMm}
                  onChange={actualizarValor}
                  onBlur={completarValor}
                  inputMode="decimal"
                  placeholder="0,0000"
                />
              </label>

              <label className="metal-field">
                Largo mm
                <input
                  name="largoMm"
                  value={valores.largoMm}
                  onChange={actualizarValor}
                  onBlur={completarValor}
                  inputMode="decimal"
                  placeholder="0,0000"
                />
              </label>

              <label className="metal-field">
                Espesor mm
                <input
                  name="espesorMm"
                  value={valores.espesorMm}
                  onChange={actualizarValor}
                  onBlur={completarValor}
                  inputMode="decimal"
                  placeholder="0,0000"
                />
              </label>
            </>
          )}

          {forma === 'hierro-redondo' && (
            <>
              <label className="metal-field">
                Diámetro mm
                <input
                  name="diametroMm"
                  value={valores.diametroMm}
                  onChange={actualizarValor}
                  onBlur={completarValor}
                  inputMode="decimal"
                  placeholder="0,0000"
                />
              </label>

              <label className="metal-field">
                Largo mm
                <input
                  name="largoMm"
                  value={valores.largoMm}
                  onChange={actualizarValor}
                  onBlur={completarValor}
                  inputMode="decimal"
                  placeholder="0,0000"
                />
              </label>
            </>
          )}

          {permiteTabla &&
            modoCalculoPerfil === 'manual' &&
            (forma === 'perfil-t' ||
              forma === 'perfil-doble-t' ||
              forma === 'perfil-u') && (
              <>
                <label className="metal-field">
                  Alto total mm
                  <input
                    name="altoTotalMm"
                    value={valores.altoTotalMm}
                    onChange={actualizarValor}
                    onBlur={completarValor}
                    inputMode="decimal"
                    placeholder="0,0000"
                  />
                </label>

                <label className="metal-field">
                  Ancho ala mm
                  <input
                    name="anchoAlaMm"
                    value={valores.anchoAlaMm}
                    onChange={actualizarValor}
                    onBlur={completarValor}
                    inputMode="decimal"
                    placeholder="0,0000"
                  />
                </label>

                <label className="metal-field">
                  Espesor ala mm
                  <input
                    name="espesorAlaMm"
                    value={valores.espesorAlaMm}
                    onChange={actualizarValor}
                    onBlur={completarValor}
                    inputMode="decimal"
                    placeholder="0,0000"
                  />
                </label>

                <label className="metal-field">
                  Espesor alma mm
                  <input
                    name="espesorAlmaMm"
                    value={valores.espesorAlmaMm}
                    onChange={actualizarValor}
                    onBlur={completarValor}
                    inputMode="decimal"
                    placeholder="0,0000"
                  />
                </label>

                <label className="metal-field">
                  Largo mm
                  <input
                    name="largoMm"
                    value={valores.largoMm}
                    onChange={actualizarValor}
                    onBlur={completarValor}
                    inputMode="decimal"
                    placeholder="0,0000"
                  />
                </label>
              </>
            )}
        </div>

        <div className="metal-result">
          {permiteTabla &&
            modoCalculoPerfil === 'tabla' &&
            perfilSeleccionado && (
              <div>
                Peso tabla:{' '}
                <strong>
                  {formatearKgPorMetro(perfilSeleccionado.pesoKgPorMetro)} kg/m
                </strong>
              </div>
            )}

          <div>
            Peso total:{' '}
            <strong>
              {Number.isFinite(pesoTotalKg)
                ? `${formatearDecimal4(pesoTotalKg)} kg`
                : '-'}
            </strong>
          </div>

          <div>
            Subtotal:{' '}
            <strong>
              {Number.isFinite(subtotal)
                ? `u$s ${formatearImporte(subtotal)}`
                : '-'}
            </strong>
          </div>
        </div>

        <div className="metal-modal-actions">
          <button
            type="button"
            className="metal-secondary-button"
            onClick={onCerrar}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="metal-primary-button"
            onClick={aceptar}
            disabled={!Number.isFinite(pesoTotalKg) || pesoTotalKg <= 0}
          >
            Aceptar peso
          </button>
        </div>
      </div>
    </div>
  );
}

export default MetalWeightCalculatorModal;