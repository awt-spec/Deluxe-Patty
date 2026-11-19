import type { Foto, Propiedad } from "../datos/tipos";
import { contenidoAdjunto } from "../panel/adjuntos-chat";
import { errorSeguro } from "../monitoreo/errores";
import { ErrorWhatsApp, codigoWhatsApp, esErrorDeConfiguracion } from "../whatsapp/enviar";
import type { Contexto } from "./contexto";

// Fotos de una casa por WhatsApp, cuando el cliente las pide: la respuesta del modelo trae el código de UNA casa
// (`enviar_fotos`) y el código decide qué se manda. Solo las fotos originales (nunca la mejorada con IA ni las
// variantes, que el corredor revisa o son ilustrativas), en el orden guardado (la primera es la portada).

/** Máximo de fotos que salen por pedido. */
export const MAX_FOTOS_CLIENTE = 6;

/** No se vuelven a mandar las fotos de la misma casa al mismo chat antes de 24 horas. */
const MINUTOS_SIN_REPETIR = 24 * 60;

const ESTADOS_CON_FOTOS = new Set(["activa", "reservada"]);

function esHttps(url: string | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Las fotos reales que se pueden mandar de una casa: el original (https), en el orden guardado. */
export function fotosParaMandar(fotos: Foto[] | undefined): string[] {
  return (fotos ?? []).map((f) => f.url).filter(esHttps);
}

/**
 * La casa cuyas fotos pidió el modelo, solo si está entre las que se le dieron (las del corredor, activas o
 * reservadas) y tiene fotos. Se busca por código (o por id), sin distinguir mayúsculas. Un código que no está: null.
 */
export function casaParaFotos(propiedades: Propiedad[], pedido: string | null | undefined): Propiedad | null {
  const clave = pedido?.trim().toLowerCase();
  if (!clave) return null;
  const casa = propiedades.find((p) => p.codigo.trim().toLowerCase() === clave || p.id.toLowerCase() === clave);
  if (!casa || !ESTADOS_CON_FOTOS.has(casa.estado)) return null;
  return fotosParaMandar(casa.fotos).length ? casa : null;
}

/** Leyenda de la primera foto, armada por el código: título y código de la casa (sin precio ni nada del modelo). */
export function leyendaFotos(casa: Pick<Propiedad, "titulo" | "codigo">): string {
  return `${casa.titulo.trim()} (código ${casa.codigo})`.slice(0, 200);
}

/**
 * Manda las fotos de la casa después del texto. Nada en piloto en sombra (lo decide quien llama), nada si la casa no
 * es válida o si ya salieron a este chat en las últimas 24 horas. Si una foto no sale, no se mandan las demás.
 * Devuelve cuántas salieron.
 */
export async function mandarFotosDeCasa(ctx: Contexto, propiedades: Propiedad[], pedido: string | null | undefined): Promise<number> {
  const casa = casaParaFotos(propiedades, pedido);
  const { corredor, conversacion } = ctx;
  if (!casa) {
    if (pedido?.trim()) ctx.log("fotos_casa_no_valida", { corredorId: corredor.id, conversacionId: conversacion.id });
    return 0;
  }
  if (!(await ctx.unaVez(`fotos_casa:${corredor.id}:${conversacion.id}:${casa.id}`, MINUTOS_SIN_REPETIR))) return 0;

  const urls = fotosParaMandar(casa.fotos).slice(0, MAX_FOTOS_CLIENTE);
  const leyenda = leyendaFotos(casa);
  let enviadas = 0;
  for (const [i, url] of urls.entries()) {
    const pie = i === 0 ? leyenda : "";
    let waId: string;
    try {
      // El enviador ya reintentó lo pasajero; si igual falla, las demás tampoco salen.
      waId = await ctx.deps.whatsapp.imagen(corredor.whatsapp_phone_number_id!, ctx.telefonoCliente, url, pie);
    } catch (error) {
      const codigo = codigoWhatsApp(error);
      ctx.log("envio_fotos_fallo", { corredorId: corredor.id, conversacionId: conversacion.id, enviadas, codigo, error: errorSeguro(error) });
      if (esErrorDeConfiguracion(codigo, error instanceof ErrorWhatsApp ? error.status : undefined)) {
        ctx.log("error_whatsapp_config", { corredorId: corredor.id, codigo });
      }
      break;
    }
    enviadas++;
    try {
      // En el panel se ve como foto enviada (dirección y, en la primera, la leyenda).
      await ctx.deps.repo.guardarMensaje({
        corredor_id: corredor.id,
        conversacion_id: conversacion.id,
        direccion: "saliente",
        autor: "asistente",
        tipo: "imagen",
        contenido: contenidoAdjunto(url, pie || null),
        wa_message_id: waId,
        estado_entrega: "enviado",
      });
    } catch (e) {
      // Guardarla es para verla en el panel: la foto ya salió.
      ctx.log("fotos_casa_sin_guardar", { corredorId: corredor.id, error: errorSeguro(e) });
    }
  }
  if (enviadas) {
    await ctx.uso({ mensajesSalientes: enviadas });
    ctx.log("fotos_casa_enviadas", { corredorId: corredor.id, conversacionId: conversacion.id, propiedadId: casa.id, enviadas });
  }
  return enviadas;
}
