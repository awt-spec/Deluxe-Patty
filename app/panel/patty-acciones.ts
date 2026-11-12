"use server";

import type { Adjunto } from "@/lib/asistente/cerebro";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { SIN_PRESUPUESTO, hayPresupuestoHoy } from "@/lib/asistente/limites";
import { ErrorDocumento, LIMITE_DOCUMENTO, mensajeDeDocumento, textoDeDocumento } from "@/lib/medios/documentos";
import { crearTranscriptor } from "@/lib/medios/transcribir";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { diaLargo } from "@/lib/agenda/formato";
import { hablarConPatty, type TurnoPatty } from "@/lib/panel/patty";
import { generarPdfPatty } from "@/lib/panel/pdf-patty";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

/** El corredor le escribe a Patty. La sesión dice qué corredor es; los datos se leen solo de él. */
const TIPOS_ADJUNTO = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain"]);
// Hasta 12 archivos (10 fotos y los fotogramas de un video caben) y 4 MB en total (en base64 o en texto), lo que
// deja pasar Vercel en un pedido.
const MAX_ADJUNTOS = 12;
const MAX_BASE64 = 4 * 1024 * 1024;
const MAX_TEXTO_ARCHIVO = 60_000;

/** Fotos y PDF en base64 limpio, y archivos ya convertidos a texto, dentro del tamaño; lo demás se descarta. */
function adjuntosValidos(entrada: unknown): Adjunto[] | null {
  if (!Array.isArray(entrada)) return [];
  const lista = entrada.slice(0, MAX_ADJUNTOS).filter((a): a is Adjunto => {
    if (!a || typeof a !== "object" || !TIPOS_ADJUNTO.has((a as Adjunto).mediaType) || typeof (a as Adjunto).datos !== "string") return false;
    const x = a as Adjunto;
    return x.mediaType === "text/plain" ? x.datos.length <= MAX_TEXTO_ARCHIVO : /^[A-Za-z0-9+/=]+$/.test(x.datos);
  });
  if (lista.reduce((s, a) => s + a.datos.length, 0) > MAX_BASE64) return null;
  return lista.map((a) => ({
    tipo: a.mediaType === "application/pdf" ? "pdf" : a.mediaType === "text/plain" ? "texto" : "imagen",
    mediaType: a.mediaType,
    datos: a.datos,
    nombre: String(a.nombre ?? "archivo").slice(0, 100),
  }));
}

/** Nota de voz del chat: se pasa a texto y vuelve a la caja de mensaje para que el corredor la revise antes de enviar. */
export async function transcribirNota(f: FormData) {
  const { corredor } = await sesionConCorredor();
  const archivo = f.get("audio");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false as const, motivo: "No llegó el audio. Vuelve a grabarlo." };
  if (archivo.size > 3_500_000) return { ok: false as const, motivo: "El audio es muy largo. Graba menos de 3 minutos." };
  const mime = (archivo.type || "audio/webm").split(";")[0].toLowerCase();
  if (!/^(audio\/|video\/(webm|mp4))/.test(mime)) return { ok: false as const, motivo: "Eso no parece un audio." };
  // La cuenta de demo no gasta IA de verdad.
  if (corredor.activo === false) return { ok: true as const, texto: "(En la demostración no se transcribe el audio; aquí aparecería lo que dijiste.)" };
  if (!process.env.OPENAI_API_KEY) return { ok: false as const, motivo: "Todavía no están activadas las notas de voz. Escríbelo por ahora; el administrador puede activarlas." };
  const deps = dependenciasPara(corredor);
  if (!(await hayPresupuestoHoy(deps.repo, corredor))) return { ok: false as const, motivo: SIN_PRESUPUESTO };
  try {
    const t = await crearTranscriptor()(Buffer.from(await archivo.arrayBuffer()), mime);
    // El costo se suma aunque salga vacío: ya se pagó.
    await deps.repo.registrarAudio(corredor.id, t.segundos, t.costoUsd);
    if (!t.texto) return { ok: false as const, motivo: "No logré entender el audio. Habla más cerca del teléfono o escríbelo." };
    return { ok: true as const, texto: t.texto };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_transcribir", error: errorSeguro(e) }));
    return { ok: false as const, motivo: "No pude pasar el audio a texto ahora. Escríbelo o inténtalo de nuevo en un rato." };
  }
}

/** Word, Excel o texto del chat: se convierte a texto en el servidor (no se guarda el archivo). */
export async function leerDocumento(f: FormData) {
  await sesionConCorredor();
  const archivo = f.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false as const, motivo: "No llegó el archivo." };
  if (archivo.size > LIMITE_DOCUMENTO) return { ok: false as const, motivo: mensajeDeDocumento("muy_grande") };
  try {
    return { ok: true as const, texto: await textoDeDocumento(Buffer.from(await archivo.arrayBuffer()), archivo.name), nombre: archivo.name.slice(0, 100) };
  } catch (e) {
    if (e instanceof ErrorDocumento) return { ok: false as const, motivo: mensajeDeDocumento(e.razon) };
    return { ok: false as const, motivo: mensajeDeDocumento("ilegible") };
  }
}

export async function preguntarAPatty(historial: TurnoPatty[], mensaje: string, ruta?: string, adjuntos?: unknown) {
  const { corredor } = await sesionConCorredor();
  const limpio = (Array.isArray(historial) ? historial : [])
    .filter((t) => (t?.autor === "corredor" || t?.autor === "asistente") && typeof t.texto === "string")
    .slice(-12)
    .map((t) => ({ autor: t.autor, texto: t.texto.slice(0, 4000) }));
  const archivos = adjuntosValidos(adjuntos);
  if (archivos === null) return { ok: false as const, motivo: "Los archivos pesan demasiado. Manda menos o más livianos (hasta 4 MB en total)." };
  return hablarConPatty(
    dependenciasPara(corredor),
    createAdminClient(),
    corredor,
    limpio,
    String(mensaje ?? ""),
    typeof ruta === "string" && ruta.startsWith("/panel") ? ruta.slice(0, 200) : "/panel",
    archivos,
  );
}

const PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/**
 * PDF con lo que preparó Patty en una respuesta (informe, comparación, resumen para un cliente), con la marca del
 * corredor. No usa IA ni guarda nada: el PDF vuelve al navegador para verlo y descargarlo.
 */
export async function pdfDePatty(titulo: unknown, texto: unknown, diagramas?: unknown) {
  const { corredor } = await sesionConCorredor();
  const t = String(titulo ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 120) || "Documento";
  const cuerpo = String(texto ?? "").slice(0, 40_000);
  if (!cuerpo.trim()) return { ok: false as const, motivo: "No hay nada que poner en el PDF." };
  const imagenes = (Array.isArray(diagramas) ? diagramas : []).filter((d): d is string => typeof d === "string" && PNG.test(d)).slice(0, 6);
  if (imagenes.reduce((s, d) => s + d.length, 0) > 3_500_000) return { ok: false as const, motivo: "Los diagramas pesan demasiado para el PDF." };
  try {
    const pdf = await generarPdfPatty({
      titulo: t,
      texto: cuerpo,
      diagramas: imagenes,
      marca: corredor.marca ?? null,
      corredor: corredor.nombre,
      fecha: diaLargo(new Date(), corredor.zona_horaria),
    });
    const nombre = `${t.replace(/[\\/:*?"<>|]+/g, "").slice(0, 80)}.pdf`;
    return { ok: true as const, datos: pdf.toString("base64"), nombre };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_pdf_patty", error: errorSeguro(e) }));
    return { ok: false as const, motivo: "No pude armar el PDF. Inténtalo de nuevo." };
  }
}

/** Lo que necesita el navegador para armar una lámina PNG con la marca del corredor: nombre, colores y logo. */
export async function marcaParaLamina() {
  const { supabase, corredor } = await sesionConCorredor();
  const marca = corredor.marca ?? null;
  let logo: string | null = null;
  const archivo = marca?.logoSobreProfundo ?? null;
  if (archivo && /^https:\/\//.test(archivo)) logo = archivo;
  else if (archivo) {
    const { data } = await supabase.from("corredores").select("slug").eq("id", corredor.id).maybeSingle();
    if (data?.slug) logo = `/marca/${data.slug as string}/logo`;
  }
  return {
    nombre: marca?.nombre ?? corredor.nombre,
    logo,
    fondoLogo: marca?.fondoLogo ?? null,
    colores: marca?.colores ?? { principal: "#00a884", soporte: "#54656f", profundo: "#111b21", base: "#ffffff" },
    firma: marca?.firma ? `${marca.firma.nombre} · ${marca.firma.cargo}` : null,
  };
}
