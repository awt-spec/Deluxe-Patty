// Texto de afuera (un anuncio de Encuentra24, una página) que va al modelo dentro de una etiqueta como
// <anuncio>…</anuncio>: se le quitan las etiquetas con esos nombres (abiertas o cerradas, con espacios, atributos,
// mayúsculas, caracteres invisibles, signos de ancho completo, entidades o letras parecidas de otro alfabeto) para que
// no pueda cerrar la suya y escribir fuera de ella como si fueran instrucciones. Se repite hasta que no quede ninguna
// ("<</anuncio>/anuncio>" no deja una nueva).
//
// Antes de buscar, el texto se normaliza (NFKC: "＜" pasa a "<") y se le quitan los caracteres de formato invisibles
// (\p{Cf}: espacio de ancho cero, guion suave, marcas de dirección, separadores). Una etiqueta sin ">" cerca no se
// come el resto del texto: se quita solo "<" con el nombre.

/** Letras latinas y sus parecidas en cirílico y griego (las que se confunden a la vista). */
const PARECIDAS: Record<string, string> = {
  a: "аɑα",
  c: "сϲ",
  d: "ԁ",
  e: "еε",
  h: "һ",
  i: "іιı",
  j: "ј",
  k: "κк",
  l: "ӏ",
  m: "м",
  n: "ո",
  o: "оοσ",
  p: "рρ",
  s: "ѕ",
  t: "т",
  u: "υ",
  v: "ν",
  x: "хχ",
  y: "уγ",
};

/** Hasta dónde se busca el ">" de una etiqueta (atributos incluidos). */
const MAX_ETIQUETA = 100;

const ESPACIO = "[\\s]*";
const ABRE = "(?:<|&lt;|&#0*60;|&#x0*3c;)";
const CIERRA = "(?:>|&gt;|&#0*62;|&#x0*3e;)";

function patronNombre(n: string): string {
  return [...n.toLowerCase().replace(/[^a-z0-9_]/g, "")]
    .map((c) => (PARECIDAS[c] ? `[${c}${PARECIDAS[c]}]` : c === "_" ? "_" : c))
    .join("");
}

export function quitarEtiquetas(texto: string, nombres: string[]): string {
  const nombre = nombres.map(patronNombre).filter(Boolean).join("|");
  const limpio = texto.normalize("NFKC").replace(/\p{Cf}/gu, "");
  if (!nombre) return limpio;
  // Todo lo que empiece con el nombre ("anuncio" también quita "anuncio_encuentra24"), hasta su ">" si está cerca;
  // si no, solo "<", la barra y el nombre.
  const re = new RegExp(
    `${ABRE}${ESPACIO}/?${ESPACIO}(?:${nombre})(?:[^<>]{0,${MAX_ETIQUETA}}?${CIERRA}|[\\p{L}\\p{N}_-]*)`,
    "giu",
  );
  let antes: string;
  let ahora = limpio;
  do {
    antes = ahora;
    ahora = antes.replace(re, "");
  } while (ahora !== antes);
  return ahora;
}
