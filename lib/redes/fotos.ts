import type { Foto } from "../datos/tipos";
import { ordenarFotos } from "../panel/formularios";

/** Las fotos que se pueden usar: originales, mejoradas e ilustrativas de esta casa (nunca una URL de afuera). */
export function opcionesDeFoto(fotos: Foto[]): { url: string; ilustrativa: boolean; nombre: string }[] {
  return ordenarFotos(fotos).flatMap((f, i) => [
    ...(f.mejorada_url ? [{ url: f.mejorada_url, ilustrativa: false, nombre: `Foto ${i + 1} mejorada` }] : []),
    { url: f.url, ilustrativa: false, nombre: `Foto ${i + 1}` },
    ...(f.variantes ?? []).map((v) => ({ url: v.url, ilustrativa: true, nombre: `Foto ${i + 1} ${v.tipo === "amueblada" ? "amueblada" : "limpia"}` })),
  ]);
}

/**
 * Fotos que el servidor puede leer para armar la imagen: las del bucket propio del corredor. La demo
 * (corredor inactivo) usa fotos de ejemplo de Unsplash, y solo para ella se acepta ese sitio fijo.
 */
export function fotosParaRedes(fotos: Foto[], corredor: { id: string; activo?: boolean }, propias: (f: Foto[], id: string) => Foto[]): Foto[] {
  if (corredor.activo !== false) return propias(fotos, corredor.id);
  return fotos.filter((f) => f.url.startsWith("https://images.unsplash.com/")).map((f) => ({ url: f.url, orden: f.orden }));
}
