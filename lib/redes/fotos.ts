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
