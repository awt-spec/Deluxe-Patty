import { fechaIso, fechaLocal } from "../agenda/tiempo";
import { monedaDe, sumar, type Montos } from "./dinero";

// Lo ganado por mes y por año, contado en la zona del corredor: un cierre del 31 de octubre a las 18:30 en Costa Rica
// (2026-11-01T00:30Z) es de octubre, no de noviembre. Lo usan "Cómo va el negocio" y la lista de Clientes.

export interface Cierre {
  cierre_at: string | null;
  cierre_comision: number | string | null;
  cierre_moneda: string | null;
}

/** "2026-10": el mes local de un instante guardado en UTC; null si no hay fecha o no se entiende. */
export function mesLocal(iso: string | null | undefined, zona: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? fechaIso(fechaLocal(new Date(t), zona)).slice(0, 7) : null;
}

/** Los que caen en ese mes local ("2026-10"), según la fecha que se elija de cada uno. */
export function delMes<T>(lista: T[], clave: string, zona: string, fecha: (x: T) => string | null | undefined): T[] {
  return lista.filter((x) => mesLocal(fecha(x), zona) === clave);
}

/** Los que caen en ese año local. */
export function delAnio<T>(lista: T[], anio: number, zona: string, fecha: (x: T) => string | null | undefined): T[] {
  return lista.filter((x) => mesLocal(fecha(x), zona)?.slice(0, 4) === String(anio));
}

/** Comisiones sumadas por moneda (dólares y colones nunca se mezclan). */
export const comisiones = (lista: Cierre[]): Montos =>
  sumar(lista.map((c) => ({ monto: Number(c.cierre_comision ?? 0), moneda: monedaDe(c.cierre_moneda) })));

/** Claves de los últimos `n` meses hasta el mes local de `ahora`, del más viejo al actual. */
export function ultimosMeses(ahora: Date, zona: string, n = 6): string[] {
  const hoy = fechaLocal(ahora, zona);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(hoy.anio, hoy.mes - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
