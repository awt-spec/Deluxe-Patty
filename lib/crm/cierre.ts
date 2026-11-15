// Lo que el corredor escribe al anotar o corregir un cierre (ficha y tablero): el precio final, que tiene que ser
// creíble, y la comisión, que se puede escribir como porcentaje ("5", "5 %", "4,5%") o como monto. Sin React ni base:
// lo usan las acciones del servidor y, para la vista previa, los formularios del navegador.
// Dólares y colones nunca se mezclan: el precio de lista solo se compara si está en la misma moneda.

import { montoContable, porcentaje, redondear } from "./contable";
import { cifraAmbigua, comisionEstimada, leerCifra, monedaDe, NO_ENTENDI_MONTO, traeMiles, traeMoneda, type Moneda } from "./dinero";

/** Precio de venta más bajo que se cree (más bajo es un error de dedo: "1,5" → $1,50). */
export const MINIMO_VENTA: Record<Moneda, number> = { USD: 1_000, CRC: 500_000 };
/** Renta mensual más baja que se cree. */
export const MINIMO_RENTA: Record<Moneda, number> = { USD: 50, CRC: 25_000 };
/** El precio final no puede ser menos de esta parte del de lista (misma moneda). */
export const PARTE_MINIMA_LISTA = 0.2;
/** Un número sin "%", sin símbolo de moneda y sin miles hasta este valor es un porcentaje: "5" = 5 %. */
export const PORCENTAJE_IMPLICITO_MAX = 20;
/** Una comisión escrita como monto que sea menos de esta parte del precio se cree un error ("5" leído como $5). */
export const PARTE_MINIMA_COMISION = 0.005;

export interface ContextoCierre {
  /** "venta" o "alquiler" (de la casa o de lo que buscaba el cliente). */
  operacion?: string | null;
  /** Precio anotado en la casa. */
  lista?: { precio: number | null; moneda: string | null } | null;
}

/** El precio de lista que sirve para comparar: solo en la misma moneda (dólares y colones no se comparan). */
function listaComparable(moneda: Moneda, lista: ContextoCierre["lista"]): number | null {
  if (!lista?.precio || !(lista.precio > 0) || lista.moneda === null || monedaDe(lista.moneda) !== moneda) return null;
  return Number(lista.precio);
}

function creible(precio: number, moneda: Moneda, c: ContextoCierre): boolean {
  const lista = listaComparable(moneda, c.lista);
  if (lista !== null && precio < lista * PARTE_MINIMA_LISTA) return false;
  const minimo = c.operacion === "alquiler" ? MINIMO_RENTA[moneda] : MINIMO_VENTA[moneda];
  return precio >= minimo;
}

/**
 * Un precio final que no se cree: menos del 20 % del de lista (misma moneda) o, en venta, menos de $1.000 / ₡500.000
 * (en alquiler, menos de $50 / ₡25.000). Devuelve el aviso con lo que se entendió y, si se puede adivinar, lo que
 * seguramente quiso escribir ("Entendí $1,50. ¿Era $1.500.000? Escríbelo completo"); null si se cree.
 */
export function precioIncreible(precio: number, moneda: Moneda, c: ContextoCierre = {}): string | null {
  if (creible(precio, moneda, c)) return null;
  const lista = listaComparable(moneda, c.lista);
  const minimo = c.operacion === "alquiler" ? MINIMO_RENTA[moneda] : MINIMO_VENTA[moneda];
  // La sugerencia: el mismo número en miles o en millones, el primero que quede cerca de la lista (o, sin lista,
  // por encima de diez veces el mínimo, porque una casa de $1.500 tampoco se cree).
  const sugerido = [1_000, 1_000_000]
    .map((f) => redondear(precio * f))
    .find((s) => (lista !== null ? s >= lista * PARTE_MINIMA_LISTA && s <= lista * 5 : s >= minimo * 10));
  const entendi = `Entendí ${montoContable(precio, moneda)}`;
  const contra = lista !== null ? ` y la casa está en ${montoContable(lista, moneda)}` : "";
  return sugerido !== undefined
    ? `${entendi}${contra}. ¿Era ${montoContable(sugerido, moneda)}? Escríbelo completo, por ejemplo ${Math.round(sugerido)}.`
    : `${entendi}${contra}: no parece el precio final. Escríbelo completo, sin abreviar.`;
}

export type ComisionLeida =
  | { ok: true; comision: number | null; porcentaje: number | null }
  | { ok: false; motivo: string };

/** "«1,180» puede ser 1,18 o 1.180. Escribe … sin la coma: 1180, o con punto de miles: 1.180." */
const ambigua = (texto: string, que: string) => {
  const [a, b] = texto.replace(/[^\d,]/g, "").split(",");
  const decimal = b.replace(/0+$/, "");
  return `«${texto.trim()}» puede ser ${decimal ? `${a},${decimal}` : a} o ${a}.${b}. Escribe ${que} sin la coma: ${a}${b}, o con punto de miles: ${a}.${b}.`;
};

/**
 * La comisión escrita: vacía → null (se estima después); "5", "5%", "5 %", "4,5%" → porcentaje del precio (un número
 * sin "%" cuenta como porcentaje si es de 20 o menos y no trae símbolo de moneda ni miles); lo demás es un monto.
 * Un monto que no llega al 0,5 % del precio se rechaza (casi siempre es un porcentaje mal escrito), y nunca puede pasar
 * del precio (en alquiler, un mes de renta es igual al precio, así que cabe). "0" es cero de verdad.
 */
export function leerComision(texto: string, precio: number, moneda: Moneda): ComisionLeida {
  const crudo = String(texto ?? "").trim();
  if (!crudo) return { ok: true, comision: null, porcentaje: null };
  const conPct = crudo.includes("%");
  const sinPct = crudo.replace(/%/g, "").trim();
  const conMoneda = traeMoneda(sinPct);
  if (conPct && conMoneda) return { ok: false, motivo: "Revisa la comisión: escribe un porcentaje (5 %) o un monto ($15.000), no las dos cosas." };
  if (cifraAmbigua(sinPct) && !(conPct || conMoneda)) return { ok: false, motivo: `Revisa la comisión: ${ambigua(sinPct, "el monto")} Si es un porcentaje, agrégale %: 4,5 %.` };
  const n = leerCifra(sinPct);
  if (n === null || n === "invalido") return { ok: false, motivo: `Revisa la comisión. ${NO_ENTENDI_MONTO} O un porcentaje: 5 %.` };
  const esPorcentaje = conPct || (!conMoneda && !traeMiles(sinPct) && n <= PORCENTAJE_IMPLICITO_MAX);
  if (esPorcentaje) {
    if (n > 100) return { ok: false, motivo: "Revisa la comisión: el porcentaje va de 0 a 100, por ejemplo 5 %." };
    return { ok: true, comision: redondear((precio * n) / 100), porcentaje: redondear(n) };
  }
  if (n > precio) {
    return { ok: false, motivo: `La comisión no puede ser mayor que el precio (${montoContable(precio, moneda)}). Escribe el monto que ganaste o el porcentaje (5 %).` };
  }
  if (n > 0 && n < precio * PARTE_MINIMA_COMISION) {
    return {
      ok: false,
      motivo: `Entendí una comisión de ${montoContable(n, moneda)}, que es ${porcentaje((n / precio) * 100)} del precio. Escribe el monto completo o el porcentaje con %, por ejemplo 5 %.`,
    };
  }
  return { ok: true, comision: redondear(n), porcentaje: null };
}

/**
 * Precio y comisión de un cierre (ficha y tablero). El precio es obligatorio, mayor que cero, sin la coma ambigua
 * ("1,180") y creíble (precioIncreible); la comisión, como la lee leerComision.
 */
export function validarCierre(
  precioTexto: string,
  comisionTexto: string,
  moneda: Moneda,
  contexto: ContextoCierre = {},
): { ok: true; precio: number; comision: number | null; porcentaje: number | null } | { ok: false; motivo: string } {
  if (cifraAmbigua(precioTexto)) return { ok: false, motivo: `Revisa el precio: ${ambigua(precioTexto, "el precio")}` };
  const precio = leerCifra(precioTexto);
  if (precio === null) return { ok: false, motivo: "Escribe el precio final." };
  if (precio === "invalido") return { ok: false, motivo: `Revisa el precio. ${NO_ENTENDI_MONTO}` };
  if (precio <= 0) return { ok: false, motivo: "El precio final tiene que ser mayor que cero." };
  const final = redondear(precio);
  const increible = precioIncreible(final, moneda, contexto);
  if (increible) return { ok: false, motivo: increible };
  const comision = leerComision(comisionTexto, final, moneda);
  if (!comision.ok) return comision;
  return { ok: true, precio: final, comision: comision.comision, porcentaje: comision.porcentaje };
}

/**
 * La comisión que queda al corregir un cierre con el campo vacío: la de antes si no cambiaron el precio, la moneda ni
 * la operación (venta o alquiler); si cambió algo, null (se recalcula con la regla del corredor).
 */
export function comisionAlCorregir(
  antes: { precio: number | null; moneda: string | null; comision: number | null; operacion: string | null },
  ahora: { precio: number; moneda: Moneda; operacion: string | null },
): number | null {
  if (antes.comision === null || antes.comision === undefined || antes.precio === null || antes.precio === undefined) return null;
  const igual =
    redondear(Number(antes.precio)) === redondear(ahora.precio) && monedaDe(antes.moneda) === ahora.moneda && (antes.operacion ?? null) === (ahora.operacion ?? null);
  return igual ? redondear(Number(antes.comision)) : null;
}

/**
 * Vista previa, debajo del campo de la comisión, de lo que se va a guardar: "= $59.000,00 (5 % del precio)" o, vacía,
 * "Se calcula: $59.000,00 (5 %)". Con el aviso si no se entiende. null mientras no haya un precio.
 */
export function previaComision(e: {
  precio: string;
  comision: string;
  moneda: Moneda;
  comisionPct: number;
  operacion: string | null;
  /** Al corregir: la comisión de ahora, que se queda si no cambia nada. */
  actual?: { precio: number | null; moneda: string | null; comision: number | null; operacion: string | null } | null;
}): { texto: string; error: boolean } | null {
  if (cifraAmbigua(e.precio)) return null;
  const precio = leerCifra(e.precio);
  if (typeof precio !== "number" || precio <= 0) return null;
  const leida = leerComision(e.comision, precio, e.moneda);
  if (!leida.ok) return { texto: leida.motivo, error: true };
  if (leida.comision === null) {
    const queda = e.actual ? comisionAlCorregir(e.actual, { precio, moneda: e.moneda, operacion: e.operacion }) : null;
    if (queda !== null) return { texto: `Se queda en ${montoContable(queda, e.moneda)}`, error: false };
    const estimada = comisionEstimada(precio, e.comisionPct, e.operacion);
    const regla = e.operacion === "alquiler" ? "un mes de renta" : porcentaje(e.comisionPct);
    return { texto: `Se calcula: ${montoContable(estimada, e.moneda)} (${regla})`, error: false };
  }
  const pct = leida.porcentaje ?? (leida.comision / precio) * 100;
  return { texto: `= ${montoContable(leida.comision, e.moneda)} (${porcentaje(pct)} del precio)`, error: false };
}

/** La etiqueta del campo: "Tu comisión: % o monto. Vacía: 5 %" (en alquiler, "un mes de renta"). */
export const etiquetaComision = (comisionPct: number, operacion: string | null) =>
  `Tu comisión: % o monto. Vacía: ${operacion === "alquiler" ? "un mes de renta" : porcentaje(comisionPct)}`;
