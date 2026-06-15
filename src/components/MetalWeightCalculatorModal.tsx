import { useMemo, useState, type ChangeEvent } from 'react';
import './MetalWeightCalculatorModal.css';

type FormaMetal =
  | 'chapa-planchuela'
  | 'barra-redonda'
  | 'barra-cuadrada'
  | 'tubo-cuadrado'
  | 'tubo-rectangular'
  | 'cano-redondo';

interface MetalWeightCalculatorModalProps {
  abierto: boolean;
  cantidad: number;
  precioUnitario: number;
  onAceptar: (pesoCalculado: number) => void;
  onCerrar: () => void;
}

const DENSIDAD_ACERO_KG_M3 = 7850;

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

function mm3AM3(valorMm3: number): number {
  return valorMm3 / 1_000_000_000;
}

function calcularPesoUnitarioKg(
  forma: FormaMetal,
  valores: Record<string, string>,
): number {
  const largoMm = parsearDecimal(valores.largoMm);

  if (!Number.isFinite(largoMm) || largoMm <= 0) return Number.NaN;

  if (forma === 'chapa-planchuela') {
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

    const volumenM3 = mm3AM3(anchoMm * espesorMm * largoMm);
    return volumenM3 * DENSIDAD_ACERO_KG_M3;
  }

  if (forma === 'barra-redonda') {
    const diametroMm = parsearDecimal(valores.diametroMm);

    if (!Number.isFinite(diametroMm) || diametroMm <= 0) {
      return Number.NaN;
    }

    const radioMm = diametroMm / 2;
    const areaMm2 = Math.PI * radioMm * radioMm;
    const volumenM3 = mm3AM3(areaMm2 * largoMm);

    return volumenM3 * DENSIDAD_ACERO_KG_M3;
  }

  if (forma === 'barra-cuadrada') {
    const ladoMm = parsearDecimal(valores.ladoMm);

    if (!Number.isFinite(ladoMm) || ladoMm <= 0) {
      return Number.NaN;
    }

    const volumenM3 = mm3AM3(ladoMm * ladoMm * largoMm);
    return volumenM3 * DENSIDAD_ACERO_KG_M3;
  }

  if (forma === 'tubo-cuadrado') {
    const ladoMm = parsearDecimal(valores.ladoMm);
    const espesorMm = parsearDecimal(valores.espesorMm);

    if (
      !Number.isFinite(ladoMm) ||
      !Number.isFinite(espesorMm) ||
      ladoMm <= 0 ||
      espesorMm <= 0 ||
      espesorMm * 2 >= ladoMm
    ) {
      return Number.NaN;
    }

    const ladoInteriorMm = ladoMm - espesorMm * 2;
    const areaMm2 = ladoMm * ladoMm - ladoInteriorMm * ladoInteriorMm;
    const volumenM3 = mm3AM3(areaMm2 * largoMm);

    return volumenM3 * DENSIDAD_ACERO_KG_M3;
  }

  if (forma === 'tubo-rectangular') {
    const anchoMm = parsearDecimal(valores.anchoMm);
    const altoMm = parsearDecimal(valores.altoMm);
    const espesorMm = parsearDecimal(valores.espesorMm);

    if (
      !Number.isFinite(anchoMm) ||
      !Number.isFinite(altoMm) ||
      !Number.isFinite(espesorMm) ||
      anchoMm <= 0 ||
      altoMm <= 0 ||
      espesorMm <= 0 ||
      espesorMm * 2 >= anchoMm ||
      espesorMm * 2 >= altoMm
    ) {
      return Number.NaN;
    }

    const anchoInteriorMm = anchoMm - espesorMm * 2;
    const altoInteriorMm = altoMm - espesorMm * 2;
    const areaMm2 = anchoMm * altoMm - anchoInteriorMm * altoInteriorMm;
    const volumenM3 = mm3AM3(areaMm2 * largoMm);

    return volumenM3 * DENSIDAD_ACERO_KG_M3;
  }

  if (forma === 'cano-redondo') {
    const diametroExteriorMm = parsearDecimal(valores.diametroExteriorMm);
    const espesorMm = parsearDecimal(valores.espesorMm);

    if (
      !Number.isFinite(diametroExteriorMm) ||
      !Number.isFinite(espesorMm) ||
      diametroExteriorMm <= 0 ||
      espesorMm <= 0 ||
      espesorMm * 2 >= diametroExteriorMm
    ) {
      return Number.NaN;
    }

    const diametroInteriorMm = diametroExteriorMm - espesorMm * 2;
    const areaMm2 =
      (Math.PI / 4) *
      (diametroExteriorMm * diametroExteriorMm -
        diametroInteriorMm * diametroInteriorMm);
    const volumenM3 = mm3AM3(areaMm2 * largoMm);

    return volumenM3 * DENSIDAD_ACERO_KG_M3;
  }

  return Number.NaN;
}

function valoresIniciales(): Record<string, string> {
  return {
    largoMm: '',
    anchoMm: '',
    altoMm: '',
    espesorMm: '',
    diametroMm: '',
    ladoMm: '',
    diametroExteriorMm: '',
  };
}

function MetalWeightCalculatorModal({
  abierto,
  cantidad,
  precioUnitario,
  onAceptar,
  onCerrar,
}: MetalWeightCalculatorModalProps) {
  const [forma, setForma] = useState<FormaMetal>('chapa-planchuela');
  const [valores, setValores] = useState<Record<string, string>>(
    valoresIniciales(),
  );

  const pesoUnitarioKg = useMemo(
    () => calcularPesoUnitarioKg(forma, valores),
    [forma, valores],
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
    setValores((actual) => ({
      ...actual,
      [event.target.name]: event.target.value,
    }));
  }

  function cambiarForma(event: ChangeEvent<HTMLSelectElement>) {
    setForma(event.target.value as FormaMetal);
    setValores(valoresIniciales());
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
          Forma
          <select value={forma} onChange={cambiarForma}>
            <option value="chapa-planchuela">Chapa / planchuela</option>
            <option value="barra-redonda">Barra redonda</option>
            <option value="barra-cuadrada">Barra cuadrada</option>
            <option value="tubo-cuadrado">Tubo cuadrado</option>
            <option value="tubo-rectangular">Tubo rectangular</option>
            <option value="cano-redondo">Caño redondo</option>
          </select>
        </label>

        <div className="metal-fields-grid">
          {(forma === 'chapa-planchuela' ||
            forma === 'tubo-rectangular') && (
            <label className="metal-field">
              Ancho mm
              <input
                name="anchoMm"
                value={valores.anchoMm}
                onChange={actualizarValor}
                inputMode="decimal"
                placeholder="0,0000"
              />
            </label>
          )}

          {forma === 'tubo-rectangular' && (
            <label className="metal-field">
              Alto mm
              <input
                name="altoMm"
                value={valores.altoMm}
                onChange={actualizarValor}
                inputMode="decimal"
                placeholder="0,0000"
              />
            </label>
          )}

          {(forma === 'chapa-planchuela' ||
            forma === 'tubo-cuadrado' ||
            forma === 'tubo-rectangular' ||
            forma === 'cano-redondo') && (
            <label className="metal-field">
              Espesor mm
              <input
                name="espesorMm"
                value={valores.espesorMm}
                onChange={actualizarValor}
                inputMode="decimal"
                placeholder="0,0000"
              />
            </label>
          )}

          {forma === 'barra-redonda' && (
            <label className="metal-field">
              Diámetro mm
              <input
                name="diametroMm"
                value={valores.diametroMm}
                onChange={actualizarValor}
                inputMode="decimal"
                placeholder="0,0000"
              />
            </label>
          )}

          {(forma === 'barra-cuadrada' || forma === 'tubo-cuadrado') && (
            <label className="metal-field">
              Lado mm
              <input
                name="ladoMm"
                value={valores.ladoMm}
                onChange={actualizarValor}
                inputMode="decimal"
                placeholder="0,0000"
              />
            </label>
          )}

          {forma === 'cano-redondo' && (
            <label className="metal-field">
              Diámetro exterior mm
              <input
                name="diametroExteriorMm"
                value={valores.diametroExteriorMm}
                onChange={actualizarValor}
                inputMode="decimal"
                placeholder="0,0000"
              />
            </label>
          )}

          <label className="metal-field">
            Largo mm
            <input
              name="largoMm"
              value={valores.largoMm}
              onChange={actualizarValor}
              inputMode="decimal"
              placeholder="0,0000"
            />
          </label>
        </div>

        <div className="metal-result">
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