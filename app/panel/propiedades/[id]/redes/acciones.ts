"use server";

import { revalidatePath } from "next/cache";
import { fichaPropiedades } from "@/lib/asistente/cerebro";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { SIN_PRESUPUESTO, hayPresupuestoHoy } from "@/lib/asistente/limites";
import type { Consumo } from "@/lib/asistente/costo";
import type { Corredor, Foto, Propiedad } from "@/lib/datos/tipos";
import { mejorarFotos } from "@/lib/fotos/mejorar";
import { fotosPropias } from "@/lib/fotos/origen";
import { puedeUsarImagenes } from "@/lib/fotos/variantes";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { cifrasPermitidas } from "@/lib/redes/cifras";
import { fotosParaRedes, opcionesDeFoto } from "@/lib/redes/fotos";
import { lineaContacto, precioCasa } from "@/lib/redes/texto";
import { MAX_TEXTO_REDES, esModoTexto, revisarTextoIA, textoDemo } from "@/lib/redes/texto-ia";
import { MAX_FOTOS_VIDEO, guionDemo, revisarGuion, type FotoParaGuion } from "@/lib/redes/video";

// Lo que hace la IA en "Imagen para redes": mejorar una foto, reescribir el texto y proponer el guion del
// video. Cada acción comprueba con la sesión que la casa es del corredor (corredor_id), respeta el tope de
// gasto de IA y, en la demo (corredor inactivo), no gasta: responde con una versión simulada.

type Resultado<T> = ({ ok: true } & T) | { ok: false; motivo: string };

const COLUMNAS =
  "id, codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno, descripcion, amenidades, url_e24, estado, fotos";

async function casaPropia(id: unknown) {
  const s = await sesionConCorredor();
  if (typeof id !== "string" || !id) return null;
  const { data } = await s.supabase.from("propiedades").select(COLUMNAS).eq("corredor_id", s.corredor.id).eq("id", id).maybeSingle();
  if (!data) return null;
  const casa = data as Propiedad & { fotos: Foto[] };
  return { corredor: s.corredor as Corredor, casa, opciones: opcionesDeFoto(fotosParaRedes(casa.fotos ?? [], s.corredor, fotosPropias)) };
}

const NO_ES_TUYA = "No encontré esa casa.";
const contactoDe = (c: Corredor) => ({ nombre: c.nombre_contacto, whatsapp: c.whatsapp_numero });

async function sumarConsumo(repo: ReturnType<typeof dependenciasPara>["repo"], corredorId: string, c: Consumo) {
  await repo.registrarUso(corredorId, { llamadasClaude: 1, tokensEntrada: c.tokensEntrada, tokensSalida: c.tokensSalida, costoClaudeUsd: c.costoUsd });
}

/** "Mejorar esta foto con IA": la misma mejora de la ficha de la casa, solo para la foto elegida. */
export async function mejorarFotoRedes(propiedadId: unknown, url: unknown): Promise<Resultado<{ url: string }>> {
  const r = await casaPropia(propiedadId);
  if (!r) return { ok: false, motivo: NO_ES_TUYA };
  const opcion = r.opciones.find((o) => o.url === url);
  if (!opcion) return { ok: false, motivo: "No encontré esa foto en la casa." };
  if (opcion.ilustrativa) return { ok: false, motivo: "Esta es una imagen ilustrativa. Elige la foto original para mejorarla." };
  if (opcion.tipo === "mejorada") return { ok: true, url: opcion.url };
  const yaMejorada = r.opciones.find((o) => o.tipo === "mejorada" && o.original === opcion.original);
  if (yaMejorada) return { ok: true, url: yaMejorada.url };

  const deps = dependenciasPara(r.corredor);
  // Mismas reglas que las demás imágenes con IA: configuradas, permitidas a la cuenta, no en la demo y dentro del tope.
  const bloqueo = await puedeUsarImagenes(deps, r.corredor);
  if (bloqueo) return { ok: false, motivo: bloqueo };
  try {
    const m = await mejorarFotos(deps, r.corredor, r.casa.codigo, async () => {}, opcion.original);
    revalidatePath(`/panel/propiedades/${r.casa.id}`);
    const nueva = m.mejoradas[0];
    return nueva ? { ok: true, url: nueva.url } : { ok: false, motivo: m.mensajes[0] ?? "No pude mejorar la foto ahora. Inténtalo de nuevo en un rato." };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_foto_redes", corredorId: r.corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude mejorar la foto ahora. Inténtalo de nuevo en un rato." };
  }
}

/** Botones de IA del texto: mejorarlo, más corto, más vendedor o en inglés. */
export async function mejorarTextoRedes(propiedadId: unknown, texto: unknown, modo: unknown): Promise<Resultado<{ texto: string; aviso: string | null }>> {
  const r = await casaPropia(propiedadId);
  if (!r) return { ok: false, motivo: NO_ES_TUYA };
  if (!esModoTexto(modo)) return { ok: false, motivo: "No entendí qué quieres hacer con el texto." };
  const anterior = String(texto ?? "").trim();
  if (!anterior) return { ok: false, motivo: "Primero escribe algo en el texto (o toca «Volver al original»)." };
  if (anterior.length > MAX_TEXTO_REDES) return { ok: false, motivo: `El texto es muy largo: déjalo en menos de ${MAX_TEXTO_REDES.toLocaleString("es-CR")} letras.` };

  // La cuenta de demo no gasta IA de verdad.
  if (r.corredor.activo === false) return { ok: true, texto: textoDemo(modo, anterior), aviso: "En la demostración el texto no lo escribe la IA de verdad." };
  const deps = dependenciasPara(r.corredor);
  if (!(await hayPresupuestoHoy(deps.repo, r.corredor))) return { ok: false, motivo: SIN_PRESUPUESTO };

  const ficha = fichaPropiedades([r.casa]);
  try {
    const propuesto = await deps.cerebro.textoRedes(r.corredor, ficha, anterior, modo);
    // Ya se pagó: suma aunque después se descarte.
    await sumarConsumo(deps.repo, r.corredor.id, propuesto.consumo);
    const revisado = revisarTextoIA(propuesto.texto, { ficha, anterior, casa: r.casa, contacto: contactoDe(r.corredor), modo });
    if (!revisado.ok) return revisado;
    return {
      ok: true,
      texto: revisado.texto,
      aviso: revisado.repuesto.length ? `La IA había quitado ${revisado.repuesto.join(" y ")}: lo volví a poner al final.` : null,
    };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_texto_redes", corredorId: r.corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude mejorar el texto ahora. Inténtalo de nuevo en un rato." };
  }
}

/**
 * "Proponer guion con IA" del video: el orden de las fotos elegidas y un texto corto por foto. Las fotos
 * llegan por URL desde el navegador y solo se aceptan las de esta casa.
 */
export async function proponerGuionVideo(
  propiedadId: unknown,
  urls: unknown,
): Promise<Resultado<{ escenas: { url: string; texto: string }[]; aviso: string | null }>> {
  const r = await casaPropia(propiedadId);
  if (!r) return { ok: false, motivo: NO_ES_TUYA };
  const pedidas = (Array.isArray(urls) ? urls : []).filter((u): u is string => typeof u === "string");
  const fotos: FotoParaGuion[] = [...new Set(pedidas)]
    .map((u) => r.opciones.find((o) => o.url === u))
    .filter((o): o is NonNullable<typeof o> => !!o)
    .slice(0, MAX_FOTOS_VIDEO)
    .map((o, i) => ({ id: `F${i + 1}`, url: o.url, nombre: o.nombre, ilustrativa: o.ilustrativa }));
  if (fotos.length === 0) return { ok: false, motivo: "Elige al menos una foto de la casa para el video." };

  if (r.corredor.activo === false) {
    return { ok: true, escenas: guionDemo(fotos), aviso: "En la demostración el guion no lo propone la IA de verdad." };
  }
  const deps = dependenciasPara(r.corredor);
  if (!(await hayPresupuestoHoy(deps.repo, r.corredor))) return { ok: false, motivo: SIN_PRESUPUESTO };

  const ficha = fichaPropiedades([r.casa]);
  try {
    // Las fotos del bucket propio se le muestran al modelo (por su dirección) para que elija mejor el orden.
    const g = await deps.cerebro.guionVideo(r.corredor, ficha, fotos, true);
    await sumarConsumo(deps.repo, r.corredor.id, g.consumo);
    const permitidas = cifrasPermitidas(ficha, precioCasa(r.casa), lineaContacto(r.casa, contactoDe(r.corredor)));
    const revisado = revisarGuion(g, fotos, permitidas);
    if (!revisado.ok) return revisado;
    return {
      ok: true,
      escenas: revisado.escenas,
      aviso: revisado.quitados ? `Quité ${revisado.quitados === 1 ? "un texto que traía" : `${revisado.quitados} textos que traían`} cifras que no están en la ficha.` : null,
    };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_guion_redes", corredorId: r.corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude proponer el guion ahora. Arma el video a mano o inténtalo de nuevo en un rato." };
  }
}
