// Textos de "Cómo va el negocio" que dependen de una cifra (singular o plural). Puras, para probarlas.

/** Lo que va debajo del promedio de días hasta cerrar: "1 día en promedio…", "12 días en promedio…". */
export function textoPromedioDias(dias: number | null): string {
  if (dias === null) return "días hasta cerrar (todavía sin cierres)";
  return `${dias === 1 ? "día" : "días"} en promedio hasta cerrar`;
}
