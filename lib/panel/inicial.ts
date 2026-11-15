// La inicial de un nombre para la foto redonda. Con `charAt(0)` un nombre que empieza con emoji («🏠🏠 Ñandú») daba
// media letra (un sustituto UTF-16 suelto): el HTML del servidor la escribe como «�» (U+FFFD, no se puede codificar
// en UTF-8) y los datos de React la traen tal cual («\ud83c» en JSON), así que al hidratar el texto no coincidía
// (error #418 en /panel/clientes). Aquí se toma la primera letra completa (grafema), nunca media.

const segmentador = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("es", { granularity: "grapheme" }) : null;

/** Primera letra completa del texto, en mayúscula; `porDefecto` si no hay ninguna. */
export function inicialDe(texto: string | null | undefined, porDefecto = "#"): string {
  const limpio = (texto ?? "").trim();
  if (!limpio) return porDefecto;
  const primera = segmentador ? (segmentador.segment(limpio)[Symbol.iterator]().next().value?.segment ?? "") : (Array.from(limpio)[0] ?? "");
  return primera.toLocaleUpperCase("es") || porDefecto;
}
