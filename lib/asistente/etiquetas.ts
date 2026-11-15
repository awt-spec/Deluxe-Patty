// Texto de afuera (un anuncio de Encuentra24, una página) que va al modelo dentro de una etiqueta como
// <anuncio>…</anuncio>: se le quitan las etiquetas con esos nombres (abiertas o cerradas, con espacios, atributos,
// mayúsculas o caracteres invisibles) para que no pueda cerrar la suya y escribir fuera de ella como si fueran
// instrucciones. Se repite hasta que no quede ninguna ("<</anuncio>/anuncio>" no deja una nueva).

const INVISIBLES = "\\s\\u200b-\\u200d\\u2060\\ufeff";

export function quitarEtiquetas(texto: string, nombres: string[]): string {
  const nombre = nombres.map((n) => n.replace(/[^a-z0-9_]/gi, "")).join("|");
  // Todo lo que empiece con el nombre ("anuncio" también quita "anuncio_encuentra24"); sin ">" quita hasta el final.
  const re = new RegExp(`<[${INVISIBLES}]*/?[${INVISIBLES}]*(?:${nombre})[^>]*(?:>|$)`, "gi");
  let antes: string;
  let ahora = texto;
  do {
    antes = ahora;
    ahora = antes.replace(re, "");
  } while (ahora !== antes);
  return ahora;
}
