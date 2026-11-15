// Texto libre que escribe el corredor (o un visitante del sitio): se limpia y se topa en el servidor antes de guardarlo.
// Sin dependencias: lo usan los formularios del panel y la API pública del sitio.

/**
 * Caracteres que no se ven pero cambian cómo se muestra el texto: de control (salvo salto de línea y tabulador),
 * de dirección (U+202A–U+202E, U+2066–U+2069, U+061C), los de ancho cero U+200B, U+200C, U+200E y U+200F, la marca
 * U+FEFF y los separadores U+2028/U+2029. Se conserva U+200D (une los emojis compuestos, como las familias o banderas).
 */
// eslint-disable-next-line no-control-regex -- justamente se buscan los caracteres de control para quitarlos.
const INVISIBLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B\u200C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Quita los caracteres invisibles o de dirección y unifica los saltos de línea. No recorta espacios. */
export function limpiarTexto(valor: unknown): string {
  return String(valor ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLES, "");
}

/** Topes de longitud del texto libre (en caracteres). */
export const LIMITES = {
  nombre: 120,
  notas: 4000,
  nota: 500,
  descripcion: 6000,
  titulo: 160,
  tono: 1500,
  regla: 200,
  reglas: 30,
  motivo: 300,
} as const;

const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * Texto libre limpio y sin espacios a los lados; vacío → null. Si pasa del tope, devuelve el motivo para decírselo
 * al corredor (no se corta a escondidas: lo que guardó sería distinto de lo que escribió).
 */
export function textoLibre(
  valor: unknown,
  max: number,
  nombre: string,
): { ok: true; valor: string | null } | { ok: false; motivo: string } {
  const limpio = limpiarTexto(valor).trim();
  if (limpio.length > max) {
    return { ok: false, motivo: `${nombre} es muy largo: hasta ${miles(max)} letras (tiene ${miles(limpio.length)}).` };
  }
  return { ok: true, valor: limpio || null };
}
