// Borradores de los formularios del panel: lo que el corredor va escribiendo se guarda en sessionStorage (esta pestaña)
// para no perderlo si se cae la conexión, se cierra la sesión o la página muestra un error. Aquí las reglas puras (qué
// campos se guardan, la forma de lo guardado, cuándo vence); el componente está en app/panel/conservar-borrador.tsx.

import { esObjeto } from "./almacen";

/** Un borrador vale un día: después, lo escrito ya no es lo que el corredor tiene en la cabeza. */
export const VIDA_BORRADOR_MS = 24 * 60 * 60_000;
/** Ni un campo enorme ni un formulario gigante llenan el almacén. */
const MAX_VALOR = 20_000;
const MAX_CAMPOS = 80;

/** Valores por nombre de campo (varios valores: casillas marcadas, opciones elegidas o campos repetidos). */
export type Valores = Record<string, string[]>;
export type Borrador = { t: number; v: Valores };

export function claveBorrador(ruta: string, nombre: string): string {
  return `borrador:${ruta}:${nombre}`;
}

/**
 * ¿Se guarda este campo? Nunca contraseñas ni archivos (ni los ocultos, botones o los marcados con
 * `data-sin-borrador`), y solo los que tienen nombre.
 */
export function campoGuardable(campo: { name?: string; type?: string; disabled?: boolean; sinBorrador?: boolean }): boolean {
  if (!campo.name || campo.disabled || campo.sinBorrador) return false;
  const tipo = (campo.type ?? "text").toLowerCase();
  return !["password", "file", "hidden", "submit", "button", "reset", "image"].includes(tipo);
}

/** Lo guardado con la forma esperada y sin vencer; null si no sirve (y se borra). */
export function validarBorrador(valor: unknown, ahora = Date.now()): Borrador | null {
  if (!esObjeto(valor) || typeof valor.t !== "number" || !esObjeto(valor.v)) return null;
  if (ahora - valor.t > VIDA_BORRADOR_MS || valor.t > ahora + 60_000) return null;
  const v: Valores = {};
  const entradas = Object.entries(valor.v);
  if (entradas.length > MAX_CAMPOS) return null;
  for (const [nombre, lista] of entradas) {
    if (!Array.isArray(lista) || !lista.every((x) => typeof x === "string" && x.length <= MAX_VALOR)) return null;
    v[nombre] = lista as string[];
  }
  return { t: valor.t, v };
}

/** ¿Son los mismos valores? (si lo guardado es igual a lo que ya muestra la página, no hay nada que reponer). */
export function mismosValores(a: Valores, b: Valores): boolean {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of claves) {
    const x = a[k] ?? [];
    const y = b[k] ?? [];
    if (x.length !== y.length || x.some((valor, i) => valor !== y[i])) return false;
  }
  return true;
}

/** Recorta lo que no cabe (valores muy largos) antes de guardar. */
export function paraGuardar(v: Valores, ahora = Date.now()): Borrador {
  const recortado: Valores = {};
  for (const [k, lista] of Object.entries(v).slice(0, MAX_CAMPOS)) recortado[k] = lista.map((x) => x.slice(0, MAX_VALOR));
  return { t: ahora, v: recortado };
}

/** Un texto suelto (campos controlados con estado de React). */
export function validarTextoGuardado(valor: unknown, ahora = Date.now()): string | null {
  if (!esObjeto(valor) || typeof valor.t !== "number" || typeof valor.texto !== "string") return null;
  if (ahora - valor.t > VIDA_BORRADOR_MS || valor.t > ahora + 60_000 || valor.texto.length > MAX_VALOR) return null;
  return valor.texto;
}
