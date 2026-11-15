// Dinero del CRM: ofertas, cierres y comisiones en dólares o colones (nunca se suman entre sí) y la
// comisión estimada según la operación: en venta un porcentaje del precio, en alquiler un mes de renta.

export type Moneda = "USD" | "CRC";
export type Montos = Record<Moneda, number>;

export const monedaDe = (v: unknown): Moneda => (v === "CRC" ? "CRC" : "USD");
const SIMBOLO: Record<Moneda, string> = { USD: "$", CRC: "₡" };

/** Comisión estimada: en alquiler, un mes de renta; en venta, el porcentaje del corredor. */
export function comisionEstimada(precio: number, porcentaje: number | null | undefined, operacion?: string | null): number {
  if (operacion === "alquiler") return Math.round(precio);
  return Math.round((precio * (porcentaje ?? 5)) / 100);
}

/** Cómo se calcula, para mostrarlo al lado: "5%" o "un mes de renta". */
export const reglaComision = (porcentaje: number | null | undefined, operacion?: string | null) =>
  operacion === "alquiler" ? "un mes de renta" : `${porcentaje ?? 5}%`;

/** Suma por moneda. */
export function sumar(lista: { monto: number; moneda: Moneda }[]): Montos {
  const total: Montos = { USD: 0, CRC: 0 };
  for (const { monto, moneda } of lista) if (monto > 0) total[moneda] += monto;
  return total;
}

/** "1000" → "1.000" (miles con punto, como en Costa Rica). */
const conPuntos = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * "$1,2 millones", "₡850 mil": cifras redondas, fáciles de leer. El redondeo se hace antes de elegir
 * la unidad, para que 999.999 diga "$1 millón" y no "$1000 mil", y 999,6 diga "$1 mil".
 */
export function plata(n: number, moneda: Moneda = "USD"): string {
  const s = SIMBOLO[moneda];
  const signo = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (Math.round(a / 1000) >= 1000) {
    const m = Math.round(a / 100_000) / 10; // millones con un decimal
    const entero = Math.trunc(m);
    const decimal = Math.round((m - entero) * 10);
    return `${signo}${s}${conPuntos(entero)}${decimal ? `,${decimal}` : ""} ${m >= 2 ? "millones" : "millón"}`;
  }
  if (Math.round(a) >= 1000) return `${signo}${s}${Math.round(a / 1000)} mil`;
  return `${signo}${s}${Math.round(a)}`;
}

/** Monto más alto que se acepta escrito a mano (100 mil millones): más que eso es un error de dedo. */
export const MONTO_MAXIMO = 1e11;

/**
 * Lee una cifra escrita como en Costa Rica: "1.250.000", "1,250,000", "1.250.000,50", "1,250,000.50",
 * "1250000", "$ 1.250.000", "₡95.000.000", "USD 2,200" o "2,5". Vacío → null.
 * Devuelve "invalido" para negativos, texto, notación científica, Infinity y montos de más de
 * MONTO_MAXIMO. Las palabras ("12 millones", "1.2M", "50k") se rechazan a propósito: no hay forma
 * segura de saber si "1.250M" son 1,25 o 1.250 millones, y es mejor pedir el número que guardar otro.
 */
export function leerCifra(valor: string): number | null | "invalido" {
  const limpio = String(valor ?? "")
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/US\$|USD|CRC|[$₡¢]/gi, "");
  if (!limpio) return null;
  let cifra: string;
  if (/^\d+$/.test(limpio)) cifra = limpio;
  else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(limpio)) cifra = limpio.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(limpio)) cifra = limpio.replace(/,/g, "");
  else if (/^\d+[.,]\d+$/.test(limpio)) cifra = limpio.replace(",", ".");
  else return "invalido";
  const n = Number(cifra);
  return Number.isFinite(n) && n >= 0 && n <= MONTO_MAXIMO ? n : "invalido";
}

/** Por qué no se entendió un monto, para decírselo al corredor con un ejemplo. */
export const NO_ENTENDI_MONTO = "No entendí el monto. Escríbelo en números, así: 1250000 o 1.250.000.";

/** "$1,2 millones + ₡850 mil" (solo lo que no es cero). */
export function plataMontos(m: Montos): string {
  return (["USD", "CRC"] as const)
    .filter((k) => m[k] > 0)
    .map((k) => plata(m[k], k))
    .join(" + ");
}

export const hayMonto = (m: Montos) => m.USD > 0 || m.CRC > 0;

/** Monto exacto con su símbolo: "$1.250.000" o "₡450.000". */
export const montoExacto = (n: number, moneda: Moneda) => `${SIMBOLO[moneda]}${conPuntos(Math.round(n))}`;

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Oferta escrita en la ficha del cliente. Vacía → null (se quita la oferta, a propósito). Lo que no se entiende
 * o es cero devuelve el motivo y no se guarda nada: antes se guardaba vacía y borraba la oferta que había.
 */
export function validarOferta(valor: string): { ok: true; valor: number | null } | { ok: false; motivo: string } {
  const n = leerCifra(valor);
  if (n === null) return { ok: true, valor: null };
  if (n === "invalido") return { ok: false, motivo: `Revisa la oferta. ${NO_ENTENDI_MONTO}` };
  if (n === 0) return { ok: false, motivo: "La oferta tiene que ser mayor que cero. Para quitarla, deja el campo vacío." };
  return { ok: true, valor: centavos(n) };
}

/**
 * Precio y comisión de un cierre (ficha y tablero). El precio es obligatorio y mayor que cero; la comisión vacía se
 * estima después (null), "0" es cero de verdad, y nunca puede pasar del precio (en alquiler, un mes de renta es igual
 * al precio mensual, así que también cabe).
 */
export function validarCierre(
  precioTexto: string,
  comisionTexto: string,
  moneda: Moneda,
): { ok: true; precio: number; comision: number | null } | { ok: false; motivo: string } {
  const precio = leerCifra(precioTexto);
  if (precio === null) return { ok: false, motivo: "Escribe el precio final." };
  if (precio === "invalido") return { ok: false, motivo: `Revisa el precio. ${NO_ENTENDI_MONTO}` };
  if (precio <= 0) return { ok: false, motivo: "El precio final tiene que ser mayor que cero." };
  const comision = leerCifra(comisionTexto);
  if (comision === "invalido") return { ok: false, motivo: `Revisa la comisión. ${NO_ENTENDI_MONTO}` };
  if (comision !== null && comision > precio) {
    return { ok: false, motivo: `La comisión no puede ser mayor que el precio (${montoExacto(precio, moneda)}). Escribe el monto que ganaste, no el porcentaje ni el precio.` };
  }
  return { ok: true, precio: centavos(precio), comision: comision === null ? null : centavos(comision) };
}

/**
 * Porcentaje de comisión de Ajustes: vacío → 5 (el de siempre), "0" → 0 (antes `|| 5` lo volvía 5). La base acepta
 * de 0 a 20 (`comision_pct`): fuera de eso se avisa en vez de cortarlo sin decir nada.
 */
export function leerPorcentaje(valor: string, defecto = 5, max = 20): { ok: true; valor: number } | { ok: false; motivo: string } {
  const n = leerCifra(valor.replace("%", ""));
  if (n === null) return { ok: true, valor: defecto };
  if (n === "invalido" || n > max) return { ok: false, motivo: `Revisa tu comisión: escribe un porcentaje de 0 a ${max}, por ejemplo 5.` };
  return { ok: true, valor: centavos(n) };
}
