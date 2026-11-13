import type { Foto } from "../datos/tipos";
import { ordenarFotos } from "../panel/formularios";

export type TipoOpcion = "original" | "mejorada" | "amueblada" | "limpia";

export interface OpcionFoto {
  url: string;
  ilustrativa: boolean;
  nombre: string;
  /** Qué versión es de la foto. */
  tipo: TipoOpcion;
  /** La foto original de la que sale (para mejorarla o agruparla). */
  original: string;
}

/** Las fotos que se pueden usar: originales, mejoradas e ilustrativas de esta casa (nunca una URL de afuera). */
export function opcionesDeFoto(fotos: Foto[]): OpcionFoto[] {
  return ordenarFotos(fotos).flatMap((f, i) => [
    ...(f.mejorada_url ? [{ url: f.mejorada_url, ilustrativa: false, nombre: `Foto ${i + 1} mejorada`, tipo: "mejorada" as const, original: f.url }] : []),
    { url: f.url, ilustrativa: false, nombre: `Foto ${i + 1}`, tipo: "original" as const, original: f.url },
    ...(f.variantes ?? []).map((v) => ({
      url: v.url,
      ilustrativa: true,
      nombre: `Foto ${i + 1} ${v.tipo === "amueblada" ? "amueblada" : "limpia"}`,
      tipo: v.tipo,
      original: f.url,
    })),
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

/** Una foto por foto de la casa, la mejor versión real (mejorada si la hay): la que usa el video por defecto. */
export function mejoresReales(opciones: OpcionFoto[]): OpcionFoto[] {
  const vistas = new Set<string>();
  return opciones.filter((o) => {
    if (o.ilustrativa || vistas.has(o.original)) return false;
    vistas.add(o.original);
    return true;
  });
}
