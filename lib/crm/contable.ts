// Cifras al estilo contable para el cierre y el dinero en juego: dos decimales, miles con punto y decimales con coma
// (como montoExacto y plata en dinero.ts) y el signo a la vista: "+ $60.000,00", "− $50.000,00", "$0,00".
// Sin React ni base: las piezas del panel solo dibujan las filas. Dólares y colones nunca se suman ni se restan entre
// sí: una cifra en otra moneda no entra en la cuenta (se omite la fila), nunca se convierte.

import { comisionEstimada, monedaDe, type Moneda } from "./dinero";

const SIMBOLO: Record<Moneda, string> = { USD: "$", CRC: "₡" };
/** Signo menos de verdad (U+2212), no el guion. */
export const MENOS = "\u2212";
/** Entre el signo y la cifra va un espacio que no se parte: la cifra nunca queda sola en otra línea. */
const ESPACIO = "\u00a0";
/** IVA de Costa Rica sobre servicios (la comisión del corredor). Se muestra como estimado. */
export const IVA_SERVICIOS = 0.13;

const conPuntos = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const aCentavos = (n: number) => Math.round(Math.abs(n) * 100);
/** Redondeo a centavos, sin el -0. */
export const redondear = (n: number) => Math.round(n * 100) / 100 || 0;

/**
 * "$1.250.000,00". Con `signo`, los positivos llevan "+ " y los negativos "− "; sin él, solo los negativos llevan
 * signo (una cifra negativa nunca se esconde). Cero es siempre "$0,00", sin signo.
 */
export function montoContable(n: number, moneda: Moneda, opciones: { signo?: boolean } = {}): string {
  const valor = Number.isFinite(n) ? n : 0;
  const c = aCentavos(valor);
  const cifra = `${SIMBOLO[moneda]}${conPuntos(String(Math.floor(c / 100)))},${String(c % 100).padStart(2, "0")}`;
  if (c === 0) return cifra;
  if (valor < 0) return `${MENOS}${ESPACIO}${cifra}`;
  return opciones.signo ? `+${ESPACIO}${cifra}` : cifra;
}

/** "5 %", "4,17 %": porcentaje con hasta dos decimales, coma decimal. */
export function porcentaje(n: number): string {
  const r = Math.round(n * 100) / 100 || 0;
  return `${String(r).replace(".", ",")}\u00a0%`;
}

export type TipoFila = "base" | "suma" | "resta" | "total" | "info";
export type Signo = "+" | "−" | "";

export interface FilaContable {
  concepto: string;
  detalle?: string;
  /** Con su signo: las restas van negativas. */
  monto: number;
  signo: Signo;
  tipo: TipoFila;
  /** "operacion": el precio; "comision": lo que gana el corredor. Sirve para separar la tabla en dos bloques. */
  grupo: "operacion" | "comision";
}

/** El texto de la cifra de una fila: las sumas y restas con signo; las bases y los totales, sin el "+". */
export const textoFila = (f: FilaContable, moneda: Moneda) => montoContable(f.monto, moneda, { signo: f.tipo === "suma" || f.tipo === "resta" });

const signoDe = (n: number): Signo => (redondear(n) > 0 ? "+" : redondear(n) < 0 ? "−" : "");

export interface EntradaCierre {
  precioFinal: number;
  moneda: Moneda;
  /** La comisión guardada; null = no se anotó (se estima como lo hace registrarCierre al guardar). */
  comision: number | null;
  comisionPct: number;
  operacion: string | null;
  /** Precio de la casa (el que tiene anotado), en su moneda. */
  lista?: { precio: number | null; moneda: string | null } | null;
}

export interface Liquidacion {
  filas: FilaContable[];
  comision: number;
  /** La comisión no estaba guardada y se calculó con la regla del corredor. */
  comisionEstimada: boolean;
  alquiler: boolean;
}

const comoMeses = (n: number) => (Math.abs(n - 1) < 0.005 ? "un mes de renta" : `${String(Math.round(n * 100) / 100).replace(".", ",")} meses de renta`);

/**
 * La liquidación del cierre, fila por fila: precio de lista y descuento (solo si la casa está en la misma moneda),
 * precio final, comisión con su porcentaje (en alquiler, en meses de renta), IVA estimado y total a facturar.
 */
export function liquidacionCierre(e: EntradaCierre): Liquidacion {
  const alquiler = e.operacion === "alquiler";
  const final = redondear(e.precioFinal);
  const filas: FilaContable[] = [];
  const lista = e.lista?.precio && e.lista.precio > 0 && monedaDe(e.lista.moneda) === e.moneda && e.lista.moneda !== null ? redondear(e.lista.precio) : null;
  const sufijo = alquiler ? " (al mes)" : "";

  if (lista !== null) {
    filas.push({
      concepto: alquiler ? "Renta de lista" : "Precio de lista",
      detalle: "el anotado en la casa",
      monto: lista,
      signo: "",
      tipo: "base",
      grupo: "operacion",
    });
    const diferencia = redondear(final - lista);
    if (diferencia < 0) {
      filas.push({
        concepto: "Descuento negociado",
        detalle: `${porcentaje((-diferencia / lista) * 100)} de la lista`,
        monto: diferencia,
        signo: "−",
        tipo: "resta",
        grupo: "operacion",
      });
    } else if (diferencia > 0) {
      filas.push({
        concepto: "Sobre la lista",
        detalle: `${porcentaje((diferencia / lista) * 100)} más`,
        monto: diferencia,
        signo: "+",
        tipo: "suma",
        grupo: "operacion",
      });
    }
  }
  filas.push({
    concepto: `${alquiler ? "Renta final" : "Precio final"}${sufijo}`,
    monto: final,
    signo: "",
    tipo: lista !== null ? "total" : "base",
    grupo: "operacion",
  });

  const estimada = e.comision === null || e.comision === undefined || !Number.isFinite(Number(e.comision));
  const comision = redondear(estimada ? comisionEstimada(final, e.comisionPct, e.operacion) : Number(e.comision));
  const regla = alquiler ? comoMeses(final > 0 ? comision / final : 0) : `${porcentaje(final > 0 ? (comision / final) * 100 : 0)} del precio final`;
  filas.push({
    concepto: "Tu comisión",
    detalle: estimada ? `estimada: ${regla}` : regla,
    monto: comision,
    signo: signoDe(comision),
    tipo: "suma",
    grupo: "comision",
  });
  if (comision > 0) {
    const iva = redondear(comision * IVA_SERVICIOS);
    filas.push({ concepto: "IVA 13 %", detalle: "estimado, si la facturas con IVA aparte", monto: iva, signo: "+", tipo: "suma", grupo: "comision" });
    filas.push({ concepto: "Total a facturar", detalle: "comisión + IVA", monto: redondear(comision + iva), signo: "", tipo: "total", grupo: "comision" });
  }
  return { filas, comision, comisionEstimada: estimada, alquiler };
}

export interface DatoNegocio {
  k: string;
  v: string;
  tono?: "suma" | "resta";
}

/**
 * Datos del negocio con lo que ya se sabe: días desde que llegó hasta el cierre, visitas hechas y su oferta anotada
 * frente al precio final (solo en la misma moneda).
 */
export function datosDelNegocio(e: {
  llegoAt: string | null;
  cierreAt: string | null;
  visitasHechas: number;
  oferta: { monto: number | null; moneda: string | null } | null;
  precioFinal: number;
  moneda: Moneda;
}): DatoNegocio[] {
  const datos: DatoNegocio[] = [];
  const llego = e.llegoAt ? Date.parse(e.llegoAt) : NaN;
  const cerro = e.cierreAt ? Date.parse(e.cierreAt) : NaN;
  if (Number.isFinite(llego) && Number.isFinite(cerro)) {
    const dias = Math.max(0, Math.round((cerro - llego) / 86_400_000));
    datos.push({ k: "Desde que llegó hasta cerrar", v: dias === 0 ? "el mismo día" : `${dias} ${dias === 1 ? "día" : "días"}` });
  }
  datos.push({ k: "Visitas hechas", v: String(Math.max(0, e.visitasHechas)) });
  const oferta = Number(e.oferta?.monto ?? 0);
  if (oferta > 0 && monedaDe(e.oferta?.moneda) === e.moneda) {
    datos.push({ k: "Su oferta anotada", v: montoContable(oferta, e.moneda) });
    const dif = redondear(e.precioFinal - oferta);
    if (dif !== 0) {
      datos.push({
        k: dif > 0 ? "Subió desde su oferta" : "Bajó desde su oferta",
        v: `${montoContable(dif, e.moneda, { signo: true })} (${porcentaje((Math.abs(dif) / oferta) * 100)})`,
        tono: dif > 0 ? "suma" : "resta",
      });
    }
  }
  return datos;
}

/**
 * "Lo que está en juego" como cuenta corta: precio de la casa y diferencia con la oferta (misma moneda), lo que vale
 * el negocio y la comisión estimada.
 */
export function cuentaEnJuego(e: {
  valor: number;
  moneda: Moneda;
  hayOferta: boolean;
  alquiler: boolean;
  comision: number;
  regla: string;
  casa?: { precio: number | null; moneda: string | null } | null;
}): FilaContable[] {
  const filas: FilaContable[] = [];
  const al = e.alquiler ? " (al mes)" : "";
  const precioCasa =
    e.hayOferta && e.casa?.precio && e.casa.precio > 0 && e.casa.moneda !== null && monedaDe(e.casa.moneda) === e.moneda ? redondear(e.casa.precio) : null;
  if (precioCasa !== null) {
    filas.push({ concepto: `Precio de la casa${al}`, monto: precioCasa, signo: "", tipo: "base", grupo: "operacion" });
    const dif = redondear(e.valor - precioCasa);
    if (dif !== 0) {
      filas.push({
        concepto: dif < 0 ? "Pide de descuento" : "Ofrece de más",
        detalle: porcentaje((Math.abs(dif) / precioCasa) * 100),
        monto: dif,
        signo: signoDe(dif),
        tipo: dif < 0 ? "resta" : "suma",
        grupo: "operacion",
      });
    }
  }
  filas.push({
    concepto: `${e.hayOferta ? "Ofreció" : "Vale"}${al}`,
    monto: redondear(e.valor),
    signo: "",
    tipo: precioCasa !== null ? "total" : "base",
    grupo: "operacion",
  });
  filas.push({ concepto: "Tu comisión estimada", detalle: e.regla, monto: redondear(e.comision), signo: signoDe(e.comision), tipo: "suma", grupo: "comision" });
  return filas;
}
