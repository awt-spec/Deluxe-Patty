// Cifras de un texto, para comprobar que lo que escribió la IA no trae números que no están en la ficha de
// la casa (ni en el texto que le pasó el corredor). Se comparan sin separadores: "$1.250.000", "1,250,000"
// y "1250000" son la misma cifra; "+506 8888 7777" es el teléfono 50688887777.

const CIFRA = /\d+(?:[.,]\d+|\s\d{3,4}(?!\d))*/g;

/** "1.250.000" → "1250000"; "03" → "3". */
export function normalizarCifra(c: string): string {
  return c.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

/** Cada cifra del texto, tal como aparece, con sus partes si estaba separada por espacios. */
function encontradas(texto: string): { entera: string; partes: string[] }[] {
  return (texto.match(CIFRA) ?? []).map((c) => ({ entera: normalizarCifra(c), partes: c.split(/\s/).map(normalizarCifra) }));
}

/** Todas las cifras que se pueden usar: las de cada texto de referencia (enteras y por partes). */
export function cifrasPermitidas(...textos: (string | null | undefined)[]): Set<string> {
  const s = new Set<string>();
  for (const t of textos) {
    if (!t) continue;
    for (const c of encontradas(t)) {
      s.add(c.entera);
      c.partes.forEach((p) => s.add(p));
    }
  }
  return s;
}

/** Las cifras del texto que no salen de las permitidas (vacío si todo cuadra). */
export function cifrasInventadas(texto: string, permitidas: Set<string>): string[] {
  return encontradas(texto)
    .filter((c) => !permitidas.has(c.entera) && !c.partes.every((p) => permitidas.has(p)))
    .map((c) => c.entera);
}

/** Si el texto trae esa cifra (por ejemplo el precio 1250000 escrito "$1.250.000"). */
export function traeCifra(texto: string, cifra: number | string): boolean {
  const buscada = normalizarCifra(String(cifra));
  return encontradas(texto).some((c) => c.entera === buscada || c.partes.includes(buscada));
}
