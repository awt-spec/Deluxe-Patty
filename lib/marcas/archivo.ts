import path from "node:path";

// Logos de las marcas guardados en el repositorio (marcas/<corredor>/<archivo>). La ruta se arma siempre dentro
// de marcas/, con el nombre de carpeta y de archivo validados: nunca sale de esa carpeta (aunque el dato traiga
// "../") y el build solo empaqueta marcas/ (una ruta libre hacía que se rastreara el proyecto entero).

const PARTE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** "marcas/deluxe/logo.jpg" → ruta absoluta dentro de marcas/, o null si no es un archivo de marcas/ válido. */
export function rutaDeMarca(logo: string): string | null {
  const partes = logo.replace(/^\.?\//, "").split("/");
  if (partes.length !== 3 || partes[0] !== "marcas") return null;
  const [, carpeta, archivo] = partes;
  if (!PARTE.test(carpeta) || !PARTE.test(archivo) || archivo.includes("..")) return null;
  return path.join(process.cwd(), "marcas", carpeta, archivo);
}
