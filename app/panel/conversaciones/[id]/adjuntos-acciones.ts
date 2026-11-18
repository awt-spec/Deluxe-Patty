"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import type { Corredor } from "@/lib/datos/tipos";
import { enviarAdjuntosComoCorredor, type AdjuntoListo } from "@/lib/panel/acciones";
import {
  BUCKET_ADJUNTO,
  MAX_ADJUNTOS_CHAT,
  caminoAdjunto,
  leerCaminoAdjunto,
  urlAdjunto,
  type ClaseAdjunto,
} from "@/lib/panel/adjuntos-chat";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { hayTurnoPorMinuto } from "@/lib/panel/turno-ia";
import { reclamarEnvio } from "@/lib/panel/una-vez";
import { createAdminClient } from "@/lib/supabase/admin";

// Adjuntar fotos y PDF en el chat con un cliente. Dos pasos para no pasar por el límite de tamaño de las funciones:
// 1) permisos de subida (uno por archivo) a la carpeta de ese chat; 2) el teléfono sube y aquí se mandan por WhatsApp.
// Antes de todo se comprueba con la sesión del corredor (RLS) que el chat es suyo.

type Fallo = { ok: false; motivo: string };
const NO_ES_TUYO: Fallo = { ok: false, motivo: "No encontré ese chat." };
const EN_LA_DEMO: Fallo = { ok: false, motivo: "En la demostración no se mandan archivos a clientes." };
const ES_CODIGO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function chatPropio(conversacionId: unknown) {
  if (typeof conversacionId !== "string" || !ES_CODIGO.test(conversacionId)) return null;
  const s = await sesionConCorredor();
  const { data } = await s.supabase
    .from("conversaciones")
    .select("id")
    .eq("corredor_id", s.corredor.id)
    .eq("id", conversacionId)
    .maybeSingle();
  return data ? { corredor: s.corredor as Corredor, conversacionId } : null;
}

function baseStorage(): string | null {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  return u ? u.replace(/\/+$/, "") : null;
}

/** Paso 1: un permiso de subida por archivo, en la carpeta de este chat. */
export async function prepararAdjuntos(
  conversacionId: unknown,
  archivos: unknown,
): Promise<{ ok: true; subidas: { clase: ClaseAdjunto; camino: string; token: string }[] } | Fallo> {
  const chat = await chatPropio(conversacionId);
  if (!chat) return NO_ES_TUYO;
  if (chat.corredor.activo === false) return EN_LA_DEMO;
  if (!Array.isArray(archivos) || archivos.length < 1 || archivos.length > MAX_ADJUNTOS_CHAT) {
    return { ok: false, motivo: `Se mandan hasta ${MAX_ADJUNTOS_CHAT} archivos por vez.` };
  }
  const pedidos: { clase: ClaseAdjunto; nombre: string }[] = [];
  for (const a of archivos) {
    const clase = (a as { clase?: unknown })?.clase;
    const nombre = (a as { nombre?: unknown })?.nombre;
    if (clase !== "imagen" && clase !== "pdf") return { ok: false, motivo: "Desde aquí se mandan fotos y PDF." };
    pedidos.push({ clase, nombre: typeof nombre === "string" ? nombre.slice(0, 200) : "" });
  }
  if (!(await hayTurnoPorMinuto("chat_adjuntos", chat.corredor.id, 6))) {
    return { ok: false, motivo: "Muchos envíos seguidos. Espera un minuto." };
  }
  const admin = createAdminClient();
  const subidas: { clase: ClaseAdjunto; camino: string; token: string }[] = [];
  for (const p of pedidos) {
    const camino = caminoAdjunto(chat.corredor.id, chat.conversacionId, p.clase, randomUUID(), p.nombre);
    const { data, error } = await admin.storage.from(BUCKET_ADJUNTO[p.clase]).createSignedUploadUrl(camino);
    if (error || !data) return { ok: false, motivo: "No se pudo preparar el archivo. Inténtalo de nuevo." };
    subidas.push({ clase: p.clase, camino, token: data.token });
  }
  return { ok: true, subidas };
}

/** Paso 2: lo ya subido sale por WhatsApp (el texto de la caja va como pie del primero). */
export async function enviarAdjuntos(pedido: {
  conversacion: unknown;
  caminos: unknown;
  texto: unknown;
  envio: unknown;
}): Promise<{ ok: true; aviso: string } | Fallo> {
  const chat = await chatPropio(pedido.conversacion);
  if (!chat) return NO_ES_TUYO;
  if (chat.corredor.activo === false) return EN_LA_DEMO;
  const base = baseStorage();
  if (!base) return { ok: false, motivo: "El almacenamiento de archivos no está configurado." };
  if (!Array.isArray(pedido.caminos) || pedido.caminos.length < 1 || pedido.caminos.length > MAX_ADJUNTOS_CHAT) {
    return { ok: false, motivo: "No llegó ningún archivo." };
  }
  const adjuntos: AdjuntoListo[] = [];
  for (const camino of pedido.caminos) {
    const a = leerCaminoAdjunto(camino, chat.corredor.id, chat.conversacionId);
    if (!a) return { ok: false, motivo: "No reconocí uno de los archivos." };
    adjuntos.push({ clase: a.clase, url: urlAdjunto(base, a.clase, camino as string), nombre: a.nombre });
  }
  const texto = typeof pedido.texto === "string" ? pedido.texto : "";
  const codigo = typeof pedido.envio === "string" && ES_CODIGO.test(pedido.envio) ? pedido.envio : null;
  // Un doble toque no le manda los mismos archivos dos veces al cliente.
  const turno = await reclamarEnvio(createAdminClient(), "adjuntos", chat.corredor.id, codigo, (pedido.caminos as string[]).join("\n"));
  if (!turno.primero) return { ok: true, aviso: "Enviado." };
  const r = await enviarAdjuntosComoCorredor(dependenciasPara(chat.corredor), chat.corredor, chat.conversacionId, adjuntos, texto);
  if (!r.ok) {
    await turno.soltar();
    return r;
  }
  revalidatePath(`/panel/conversaciones/${chat.conversacionId}`);
  return { ok: true, aviso: r.aviso ?? "Enviado." };
}
