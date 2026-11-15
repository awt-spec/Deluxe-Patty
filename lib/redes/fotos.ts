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

/** Único sitio externo aceptado, y solo en la demo (fotos de ejemplo que no se pudieron copiar). */
const SITIO_DEMO = "https://images.unsplash.com/";

/**
 * Fotos que el servidor puede leer para armar la imagen: las del bucket propio del corredor. La demo
 * (corredor inactivo) copia sus fotos de ejemplo a su bucket propio (`copiarFotosDemo`); si alguna no se
 * pudo copiar queda en Unsplash, y solo para la demo se acepta además ese sitio fijo. Nunca un host cualquiera.
 */
export function fotosParaRedes(fotos: Foto[], corredor: { id: string; activo?: boolean }, propias: (f: Foto[], id: string) => Foto[]): Foto[] {
  const delBucket = propias(fotos, corredor.id);
  if (corredor.activo !== false) return delBucket;
  const aceptadas = new Set(delBucket.map((f) => f.url));
  return fotos.flatMap((f) => {
    if (aceptadas.has(f.url)) return [delBucket.find((p) => p.url === f.url)!];
    return esDeEjemplo(f.url) ? [{ url: f.url, orden: f.orden }] : [];
  });
}

function esDeEjemplo(url: string): boolean {
  try {
    const u = new URL(url);
    return url.startsWith(SITIO_DEMO) && u.protocol === "https:" && u.host === "images.unsplash.com";
  } catch {
    return false;
  }
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
