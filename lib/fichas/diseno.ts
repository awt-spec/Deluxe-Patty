// Reglas puras del diseño de los PDF (ficha de propiedad y documento de Patty): qué cifras se destacan, cuánto
// ancho lleva cada columna de una tabla y cómo se reparten las fotos en la galería. Sin React ni archivos, para
// probarlas sola. Nunca calculan ni inventan una cifra: solo deciden cómo mostrar lo que ya viene escrito.

import type { Bloque } from "../panel/markdown";

// --- Cifras clave del documento de Patty ---------------------------------------------------------------------

export interface CifraClave {
  etiqueta: string;
  valor: string;
}

const sinMarcas = (s: string) => s.replace(/\*\*|`/g, "").trim();

/**
 * Un valor que es una cifra corta tal cual está escrita: "$450.000", "3", "12 %", "320 m²", "₡1,2 M", "45 min".
 * Nada de frases: si trae palabras sueltas además de la unidad, no es una cifra para tarjeta.
 */
export function esCifra(valor: string): boolean {
  const v = sinMarcas(valor);
  if (v.length === 0 || v.length > 18) return false;
  return /^[~≈+-]?\s?(US\$|\$|₡|€|CRC|USD)?\s?\d[\d.,\s]*\s?(%|m²|m2|ha|km|k|M|USD|CRC|colones|dólares|h|horas|min|días|meses|años)?$/i.test(v);
}

/** "Etiqueta: cifra" → la pareja, o null si no tiene esa forma exacta. */
function pareja(item: string): CifraClave | null {
  const m = /^([^:]{2,40}):\s*(.+)$/.exec(sinMarcas(item));
  if (!m) return null;
  const etiqueta = m[1].trim();
  const valor = m[2].trim();
  return /\d/.test(etiqueta) || !esCifra(valor) ? null : { etiqueta, valor };
}

/**
 * Cifras clave al comienzo del documento: una lista corta (2 a 4 puntos, sin numerar) de "Etiqueta: cifra", o una
 * tabla de 2 columnas y hasta 4 filas cuya segunda columna son cifras. Solo se mira el primer bloque o el que va
 * justo después del primer párrafo (el resumen). Conservadora: si un solo punto no encaja, no hay tarjetas.
 * Devuelve la posición del bloque para mostrarlo como tarjetas en su lugar.
 */
export function cifrasClave(lista: Bloque[]): { indice: number; cifras: CifraClave[] } | null {
  const candidatos = lista[0]?.tipo === "parrafo" ? [1] : [0];
  for (const indice of candidatos) {
    const b = lista[indice];
    if (!b) continue;
    let cifras: (CifraClave | null)[] = [];
    if (b.tipo === "lista" && !b.ordenada && b.items.length >= 2 && b.items.length <= 4) cifras = b.items.map(pareja);
    else if (b.tipo === "tabla" && b.cabecera.length === 2 && b.filas.length >= 2 && b.filas.length <= 4) {
      cifras = b.filas.map(([e, v]) => {
        const etiqueta = sinMarcas(e ?? "");
        return etiqueta.length >= 2 && etiqueta.length <= 40 && esCifra(v ?? "") ? { etiqueta, valor: sinMarcas(v) } : null;
      });
    }
    if (cifras.length && cifras.every((c) => c !== null)) return { indice, cifras: cifras as CifraClave[] };
  }
  return null;
}

// --- Tablas ----------------------------------------------------------------------------------------------------

/** Una celda numérica: cifras, moneda, porcentaje o medida (se alinea a la derecha). */
export const esCeldaNumerica = (celda: string) => esCifra(celda) || /^\s*[-–—]\s*$/.test(celda);

/** Columnas que se alinean a la derecha: todas sus celdas con texto son cifras (y hay al menos una). */
export function columnasNumericas(filas: string[][], columnas: number): boolean[] {
  return Array.from({ length: columnas }, (_, j) => {
    const llenas = filas.map((f) => sinMarcas(f[j] ?? "")).filter(Boolean);
    return llenas.length > 0 && llenas.every(esCeldaNumerica);
  });
}

/**
 * Ancho de cada columna en porcentaje (suman 100), según lo que trae: el texto más largo pesa, pero con tope para
 * que una celda larga no aplaste a las demás, y con piso para que ninguna quede ilegible.
 */
export function anchosColumnas(cabecera: string[], filas: string[][]): number[] {
  const n = cabecera.length;
  if (n === 0) return [];
  const pesos = cabecera.map((h, j) => {
    const celdas = filas.map((f) => sinMarcas(f[j] ?? ""));
    const textos = [sinMarcas(h), ...celdas];
    const largo = Math.max(...celdas.map((t) => t.length), 0);
    const promedio = celdas.length ? celdas.reduce((s, t) => s + t.length, 0) / celdas.length : 0;
    const palabra = Math.max(...textos.flatMap((t) => t.split(/\s+/)).map((p) => p.length));
    // La cabecera corta cabe en una línea; la larga puede partirse en palabras.
    const cabeceraEntera = sinMarcas(h).length <= 14 ? sinMarcas(h).length : 0;
    // + 4: el relleno de la celda es fijo, no depende del texto.
    return 4 + Math.max(3, palabra, cabeceraEntera, Math.min(30, (largo + promedio) / 2));
  });
  const total = pesos.reduce((s, p) => s + p, 0);
  const piso = Math.min(10, 100 / n);
  let anchos = pesos.map((p) => Math.max(piso, (p / total) * 100));
  const suma = anchos.reduce((s, a) => s + a, 0);
  anchos = anchos.map((a) => (a / suma) * 100);
  // Redondeo a una décima con el resto en la columna más ancha, para que sumen exactamente 100.
  const redondos = anchos.map((a) => Math.round(a * 10) / 10);
  const mayor = redondos.indexOf(Math.max(...redondos));
  redondos[mayor] = Math.round((redondos[mayor] + 100 - redondos.reduce((s, a) => s + a, 0)) * 10) / 10;
  return redondos;
}

// --- Galería de la ficha ---------------------------------------------------------------------------------------

/** Fotos que entran en la galería (además de la portada): el PDF baja a lo sumo 7 fotos en total. */
export const MAX_FOTOS_GALERIA = 6;

export interface FilaGaleria {
  /** Cuántas fotos van lado a lado. */
  columnas: number;
  /** Alto de la fila como fracción del alto disponible. */
  alto: number;
}

/**
 * Retícula editorial para n fotos de galería: 1 grande; 2 grandes; 1 grande + 2; 2×2; 1 grande + 2×2; mosaico 2×3.
 * Las filas suman exactamente n fotos y su alto suma 1.
 */
export function reticulaGaleria(n: number): FilaGaleria[] {
  const fotos = Math.max(0, Math.min(MAX_FOTOS_GALERIA, Math.floor(n)));
  switch (fotos) {
    case 0:
      return [];
    case 1:
      return [{ columnas: 1, alto: 1 }];
    case 2:
      return [
        { columnas: 1, alto: 0.5 },
        { columnas: 1, alto: 0.5 },
      ];
    case 3:
      return [
        { columnas: 1, alto: 0.58 },
        { columnas: 2, alto: 0.42 },
      ];
    case 4:
      return [
        { columnas: 2, alto: 0.5 },
        { columnas: 2, alto: 0.5 },
      ];
    case 5:
      return [
        { columnas: 1, alto: 0.44 },
        { columnas: 2, alto: 0.28 },
        { columnas: 2, alto: 0.28 },
      ];
    default:
      return [
        { columnas: 2, alto: 1 / 3 },
        { columnas: 2, alto: 1 / 3 },
        { columnas: 2, alto: 1 / 3 },
      ];
  }
}

// --- Varios ------------------------------------------------------------------------------------------------------

/** Tamaño del título de la portada según su largo, para que uno larguísimo no tape la foto. */
export function tamanoTitulo(titulo: string): number {
  const n = titulo.length;
  if (n <= 40) return 34;
  if (n <= 70) return 28;
  if (n <= 110) return 23;
  return 19;
}

/** Páginas de un PDF ya armado (cuenta los objetos /Type /Page, no /Pages). */
export function contarPaginas(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}
