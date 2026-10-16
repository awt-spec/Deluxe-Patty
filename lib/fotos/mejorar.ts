import type { Dependencias } from "../asistente/contexto";
import type { Corredor } from "../datos/tipos";
import { esFotoPropia } from "./origen";

export const MAX_FOTOS = 12;
const EN_PARALELO = 3;
const TIPOS = /^image\/(jpeg|png|webp)$/;

export interface FotoMejorada {
  numero: number;
  url: string;
}

export interface ResultadoFotos {
  mensajes: string[];
  mejoradas: FotoMejorada[];
  fallidas: number;
}

async function enParalelo<T, R>(items: T[], limite: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length);
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, items.length) }, async () => {
      while (siguiente < items.length) {
        const i = siguiente++;
        res[i] = await fn(items[i], i);
      }
    }),
  );
  return res;
}

/**
 * Mejora hasta 12 fotos de una propiedad con IA. Guarda cada versión mejorada junto a la original
 * (propiedades.fotos[i].mejorada_url); la original nunca se reemplaza.
 */
export async function mejorarFotos(
  deps: Dependencias,
  corredor: Corredor,
  codigo: string,
  avisar: (texto: string) => Promise<unknown>,
): Promise<ResultadoFotos> {
  const editor = deps.fotos;
  if (!editor) {
    return { mensajes: ["La mejora de fotos todavía no está configurada."], mejoradas: [], fallidas: 0 };
  }
  const propiedad = await deps.repo.propiedadPorCodigo(corredor.id, codigo);
  if (!propiedad) {
    return { mensajes: [`No encontré una propiedad con el código ${codigo}.`], mejoradas: [], fallidas: 0 };
  }
  const fotos = [...propiedad.fotos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  if (fotos.length === 0) {
    return { mensajes: [`${propiedad.titulo} no tiene fotos cargadas.`], mejoradas: [], fallidas: 0 };
  }
  // Solo fotos del bucket propio y que todavía no tienen versión mejorada (no se paga dos veces).
  const aMejorar = fotos.filter((f) => esFotoPropia(f.url, corredor.id) && !f.mejorada_url).slice(0, MAX_FOTOS);
  if (aMejorar.length === 0) {
    return { mensajes: [`Las fotos de ${propiedad.titulo} ya están mejoradas.`], mejoradas: [], fallidas: 0 };
  }
  await avisar(
    `Estoy mejorando ${aMejorar.length} ${aMejorar.length === 1 ? "foto" : "fotos"} de ${propiedad.titulo}. ` +
      "Te las mando en unos minutos.",
  );

  const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));
  const resultados = await enParalelo(aMejorar, EN_PARALELO, async (foto) => {
    // Número de la foto en el orden de la propiedad, para que coincida con lo que ve el corredor.
    const numero = fotos.indexOf(foto) + 1;
    try {
      const original = await fetch(foto.url);
      const tipo = (original.headers.get("content-type") ?? "").split(";")[0];
      if (!original.ok || !TIPOS.test(tipo)) throw new Error(`descarga ${original.status} ${tipo}`);
      const mejorada = await editor.mejorar(Buffer.from(await original.arrayBuffer()), tipo);
      const url = await deps.repo.subirArchivo(
        corredor.id,
        "fotos",
        `${propiedad.id}/${numero}-mejorada-${Date.now()}.jpg`,
        mejorada,
        "image/jpeg",
      );
      foto.mejorada_url = url;
      return { numero, url };
    } catch (error) {
      log("error_foto", {
        corredorId: corredor.id,
        propiedadId: propiedad.id,
        foto: numero,
        error: error instanceof Error ? error.name : "desconocido",
      });
      return null;
    }
  });

  const mejoradas = resultados.filter((r): r is FotoMejorada => r !== null);
  if (mejoradas.length) {
    await deps.repo.guardarFotos(corredor.id, propiedad.id, fotos);
    await deps.repo.registrarFotosMejoradas(corredor.id, mejoradas.length);
  }
  const fallidas = aMejorar.length - mejoradas.length;

  const cierre = mejoradas.length
    ? [
        `Listo: ${mejoradas.length} ${mejoradas.length === 1 ? "foto mejorada" : "fotos mejoradas"} de ${propiedad.titulo}` +
          (fallidas ? ` (${fallidas} no se pudieron).` : "."),
        "Revísalas antes de publicarlas: la IA a veces cambia detalles. Si alguna no se ve igual a la propiedad, usa la original.",
      ].join(" ")
    : "No pude mejorar las fotos ahora. Inténtalo de nuevo en un rato.";
  return { mensajes: [cierre], mejoradas, fallidas };
}
