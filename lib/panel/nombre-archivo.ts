/** Nombre de archivo seguro para descargar: sin barras ni caracteres raros, sin puntos al inicio, con su extensión. */
export function nombreArchivo(titulo: unknown, ext: string, vacio = "Documento"): string {
  const base = String(titulo ?? "")
    .replace(new RegExp(`\\.${ext}$`, "i"), "")
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
  return `${base || vacio}.${ext}`;
}
