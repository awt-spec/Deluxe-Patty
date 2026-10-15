import type { Dependencias } from "../asistente/contexto";
import type { AnuncioPreparado } from "../asistente/cerebro";
import type { Corredor } from "../datos/tipos";
import { enlaceWhatsApp } from "./atribucion";

export interface AnuncioListo {
  mensajes: string[];
  consumo: AnuncioPreparado["consumo"] | null;
}

/**
 * Prepara el anuncio de una propiedad (texto en español e inglés y orden de fotos) y lo guarda como
 * borrador con su referencia. El enlace de WhatsApp con la referencia lo agrega el código.
 * La publicación en Encuentra24 la hace el corredor.
 */
export async function prepararAnuncio(deps: Dependencias, corredor: Corredor, codigo: string): Promise<AnuncioListo> {
  const propiedad = await deps.repo.propiedadPorCodigo(corredor.id, codigo);
  if (!propiedad) {
    return {
      mensajes: [`No encontré una propiedad con el código ${codigo}. Revisa el código tal como está en tu lista.`],
      consumo: null,
    };
  }

  const a = await deps.cerebro.prepararAnuncio(corredor, propiedad);
  const referencia = await deps.repo.guardarBorradorAnuncio(corredor.id, propiedad.id, a.tituloEs, {
    es: { titulo: a.tituloEs, descripcion: a.descripcionEs },
    en: { titulo: a.tituloEn, descripcion: a.descripcionEn },
    orden_fotos: a.ordenFotos,
    sugerencias: a.sugerencias,
  });
  const enlace = corredor.whatsapp_numero ? enlaceWhatsApp(corredor.whatsapp_numero, referencia) : null;

  const es = `${a.tituloEs}\n\n${a.descripcionEs}${enlace ? `\n\nEscríbeme por WhatsApp: ${enlace}` : ""}`;
  const en = `${a.tituloEn}\n\n${a.descripcionEn}${enlace ? `\n\nMessage me on WhatsApp: ${enlace}` : ""}`;

  const notas = [
    `*Anuncio de ${propiedad.titulo} listo* (ref. ${referencia})`,
    "Arriba van el texto en español y en inglés: la primera línea es el título y el resto la descripción.",
  ];
  if (!enlace) {
    notas.push("Falta configurar el número de la asistente, así que el texto no lleva el enlace de WhatsApp.");
  }
  if (a.ordenFotos.length) {
    notas.push("", "*Orden sugerido de fotos*");
    a.ordenFotos.forEach((f, i) => notas.push(`${i + 1}. Foto ${f.foto}: ${f.muestra}`));
  } else if (propiedad.fotos.length === 0) {
    notas.push("", "La propiedad no tiene fotos cargadas; cuando las tenga te sugiero el orden.");
  }
  if (a.sugerencias.length) {
    notas.push("", "*Para mejorarlo*");
    for (const s of a.sugerencias) notas.push(`• ${s}`);
  }
  return { mensajes: [es, en, notas.join("\n")], consumo: a.consumo };
}
