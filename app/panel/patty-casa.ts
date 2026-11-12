"use client";

import { createClient } from "@supabase/supabase-js";
import { pedirSubidas, registrarFotos } from "./propiedades/acciones";

// Fotos de una casa que se cargó desde el chat de Patty. Las miniaturas del chat (y lo que va al modelo) son
// chicas; para la casa se conserva el archivo original solo en memoria (nunca en localStorage ni al modelo) y,
// al guardarla, se achica a 2400 px como en la ficha de la casa y sube directo al bucket con un permiso por foto.

const LADO_MAXIMO = 2400;
export const FOTOS_POR_VEZ = 12;

/** Archivos originales de la casa en curso, por chat. Viven mientras la pestaña esté abierta (sobreviven al cambio de pantalla). */
const fotosEnCurso = new Map<string, File[]>();

export function anotarFotos(clave: string, archivos: File[]): number {
  const todas = [...(fotosEnCurso.get(clave) ?? []), ...archivos].slice(0, FOTOS_POR_VEZ);
  if (todas.length) fotosEnCurso.set(clave, todas);
  return todas.length;
}

export const fotosAnotadas = (clave: string) => fotosEnCurso.get(clave)?.length ?? 0;
export const olvidarFotos = (clave: string) => void fotosEnCurso.delete(clave);

// Al volver a dibujarla se le quitan los datos ocultos (como la ubicación GPS).
async function achicar(archivo: File): Promise<Blob | null> {
  try {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    return await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.88));
  } catch {
    return null;
  }
}

/** Sube las fotos anotadas a la casa recién guardada. Devuelve una frase para el chat (o null si no había fotos). */
export async function subirFotosAnotadas(clave: string, propiedadId: string): Promise<string | null> {
  const archivos = fotosEnCurso.get(clave) ?? [];
  fotosEnCurso.delete(clave);
  if (archivos.length === 0) return null;
  const subidas = await pedirSubidas(
    propiedadId,
    archivos.map(() => "foto.jpg"),
  );
  // En la demo (o si no caben) pedirSubidas explica por qué: se dice tal cual.
  if ("error" in subidas) return subidas.error;
  const almacen = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  }).storage.from("fotos");
  const listos: string[] = [];
  for (const [i, archivo] of archivos.entries()) {
    const foto = await achicar(archivo);
    if (!foto) continue;
    const { camino, token } = subidas[i];
    const { error } = await almacen.uploadToSignedUrl(camino, token, foto, { contentType: "image/jpeg" });
    if (!error) listos.push(camino);
  }
  if (listos.length === 0) return "No pude subir las fotos. Súbelas en la casa.";
  const r = await registrarFotos(propiedadId, listos);
  if (r.error) return r.error;
  const guardadas = r.guardadas ?? listos.length;
  const faltan = archivos.length - guardadas;
  return `Le puse ${guardadas} ${guardadas === 1 ? "foto" : "fotos"}${faltan > 0 ? ` (${faltan} no se pudieron; súbelas en la casa)` : ""}. La primera es la principal.`;
}
