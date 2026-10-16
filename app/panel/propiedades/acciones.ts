"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prepararAnuncio } from "@/lib/anuncios/preparar";
import { dependencias } from "@/lib/asistente/dependencias";
import type { FichaParcial, Foto } from "@/lib/datos/tipos";
import { fichaDePropiedad } from "@/lib/fichas/comando";
import { mejorarFotos } from "@/lib/fotos/mejorar";
import {
  MAX_FOTOS_PROPIEDAD,
  agregarFotos,
  leerPropiedad,
  moverFoto,
  rutaDePropiedad,
  rutaFotoOriginal,
  siguienteCodigo,
} from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import {
  MAX_MENSAJES_FICHA,
  MAX_TEXTO_FICHA,
  conversarFicha,
  datosParaGuardar,
  fichaLimpia,
  resumenFicha,
} from "@/lib/propiedades/conversar";
import { createAdminClient } from "@/lib/supabase/admin";

// Las propiedades se leen y se guardan con la sesión del corredor (RLS). Solo la subida de fotos y lo
// que generan la ficha, el anuncio y la mejora de fotos usan el backend, después de comprobar con la
// sesión que la propiedad es suya.

const ir = (ruta: string, aviso: string): never => {
  revalidatePath("/panel/propiedades");
  redirect(`${ruta}?aviso=${encodeURIComponent(aviso)}`);
};

async function propiedadPropia(id: string) {
  const s = await sesionConCorredor();
  const { data } = await s.supabase.from("propiedades").select("id, codigo, fotos").eq("id", id).maybeSingle();
  if (!data) ir("/panel/propiedades", "No encontré la propiedad.");
  return { ...s, propiedad: data as { id: string; codigo: string; fotos: Foto[] } };
}

function motivoError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Ya tienes otra propiedad con ese código.";
  return "No se pudo guardar. Revisa los datos.";
}

/** Si algo no cuadra, el formulario vuelve con lo escrito y el motivo (no se pierde nada). */
export type EstadoFormulario = { motivo: string; datos: Record<string, string> } | null;

const devolver = (f: FormData, motivo: string): EstadoFormulario => ({
  motivo,
  datos: Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)])),
});

export async function crearPropiedad(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const { supabase, corredor } = await sesionConCorredor();
  const r = leerPropiedad(f);
  if (!r.ok) return devolver(f, r.motivo);
  const { data, error } = await supabase
    .from("propiedades")
    .insert({ ...r.valor, corredor_id: corredor.id })
    .select("id")
    .single();
  if (error || !data) return devolver(f, motivoError(error ?? { message: "" }));
  return ir(`/panel/propiedades/${data.id}`, "Guardada. Ahora súbele las fotos.");
}

export async function guardarPropiedad(_previo: EstadoFormulario, f: FormData): Promise<EstadoFormulario> {
  const id = String(f.get("id") ?? "");
  const { supabase, corredor } = await propiedadPropia(id);
  const r = leerPropiedad(f);
  if (!r.ok) return devolver(f, r.motivo);
  const { error } = await supabase.from("propiedades").update(r.valor).eq("corredor_id", corredor.id).eq("id", id);
  if (error) return devolver(f, motivoError(error));
  return ir(`/panel/propiedades/${id}`, "Guardado.");
}

export async function cambiarEstado(f: FormData) {
  const id = String(f.get("id") ?? "");
  const estado = String(f.get("estado") ?? "");
  const { supabase, corredor } = await propiedadPropia(id);
  const { error } = await supabase.from("propiedades").update({ estado }).eq("corredor_id", corredor.id).eq("id", id);
  ir(`/panel/propiedades/${id}`, error ? "No se pudo cambiar el estado." : "Estado actualizado.");
}

// --- Fotos -----------------------------------------------------------------------------------------

export type Subida = { camino: string; token: string };

/**
 * Permisos de subida directa al bucket "fotos" (el archivo no pasa por el servidor, así no choca con
 * el límite de tamaño de las funciones). Cada permiso sirve para una sola ruta dentro de la carpeta
 * del corredor y la propiedad.
 */
export async function pedirSubidas(propiedadId: string, nombres: string[]): Promise<Subida[] | { error: string }> {
  const { corredor, propiedad } = await propiedadPropia(propiedadId);
  if (propiedad.fotos.length + nombres.length > MAX_FOTOS_PROPIEDAD) {
    return { error: `Cada propiedad lleva hasta ${MAX_FOTOS_PROPIEDAD} fotos.` };
  }
  const almacen = createAdminClient().storage.from("fotos");
  const subidas: Subida[] = [];
  for (const nombre of nombres) {
    const camino = `${corredor.id}/${rutaFotoOriginal(propiedadId, nombre)}`;
    const { data, error } = await almacen.createSignedUploadUrl(camino);
    if (error || !data) return { error: "No se pudo preparar la subida. Inténtalo de nuevo." };
    subidas.push({ camino, token: data.token });
  }
  return subidas;
}

/** Después de subirlas, las fotos se agregan a la propiedad en su orden. */
export async function registrarFotos(propiedadId: string, caminos: string[]): Promise<{ error?: string }> {
  const { supabase, corredor, propiedad } = await propiedadPropia(propiedadId);
  const prefijo = `${corredor.id}/`;
  const validos = caminos.filter((c) => c.startsWith(prefijo) && rutaDePropiedad(c.slice(prefijo.length), propiedadId));
  if (validos.length !== caminos.length) return { error: "Alguna foto no se reconoció." };
  const almacen = createAdminClient().storage.from("fotos");
  const urls = validos.map((c) => almacen.getPublicUrl(c).data.publicUrl);
  const { error } = await supabase
    .from("propiedades")
    .update({ fotos: agregarFotos(propiedad.fotos, urls) })
    .eq("corredor_id", corredor.id)
    .eq("id", propiedadId);
  revalidatePath(`/panel/propiedades/${propiedadId}`);
  return error ? { error: "No se pudieron guardar las fotos." } : {};
}

const ACCIONES_FOTO = new Set(["principal", "subir", "bajar", "quitar"]);

export async function ordenarFoto(f: FormData) {
  const id = String(f.get("id") ?? "");
  const accion = String(f.get("accion") ?? "");
  const { supabase, corredor, propiedad } = await propiedadPropia(id);
  if (ACCIONES_FOTO.has(accion)) {
    const fotos = moverFoto(propiedad.fotos, String(f.get("url") ?? ""), accion as "principal");
    // El archivo queda en el bucket: quitarla de la propiedad no borra nada que ya se haya compartido.
    await supabase.from("propiedades").update({ fotos }).eq("corredor_id", corredor.id).eq("id", id);
  }
  revalidatePath(`/panel/propiedades/${id}`);
  redirect(`/panel/propiedades/${id}#fotos`);
}

// --- Lo que la asistente prepara -----------------------------------------------------------------

export async function generarFicha(f: FormData) {
  const id = String(f.get("id") ?? "");
  const { corredor, propiedad } = await propiedadPropia(id);
  let destino: string;
  try {
    const ficha = await fichaDePropiedad(dependencias(), corredor, propiedad.codigo);
    if (ficha.tipo === "mensaje") ir(`/panel/propiedades/${id}`, ficha.texto);
    destino = (ficha as Extract<typeof ficha, { tipo: "pdf" }>).url;
  } catch {
    ir(`/panel/propiedades/${id}`, "No pude generar la ficha ahora. Inténtalo de nuevo en un rato.");
  }
  redirect(destino!);
}

export async function prepararAnuncioPanel(f: FormData) {
  const id = String(f.get("id") ?? "");
  const { corredor, propiedad } = await propiedadPropia(id);
  const deps = dependencias();
  let aviso: string;
  try {
    const listo = await prepararAnuncio(deps, corredor, propiedad.codigo);
    if (listo.consumo) {
      await deps.repo.registrarUso(corredor.id, {
        llamadasClaude: 1,
        tokensEntrada: listo.consumo.tokensEntrada,
        tokensSalida: listo.consumo.tokensSalida,
        costoClaudeUsd: listo.consumo.costoUsd,
      });
    }
    aviso = listo.consumo ? "Anuncio listo: el texto está abajo, en “Por publicar”." : listo.mensajes[0];
  } catch {
    aviso = "No pude preparar el anuncio ahora. Inténtalo de nuevo en un rato.";
  }
  ir("/panel/anuncios", aviso);
}

export async function mejorarFotosPanel(f: FormData) {
  const id = String(f.get("id") ?? "");
  const { corredor, propiedad } = await propiedadPropia(id);
  let aviso: string;
  try {
    const r = await mejorarFotos(dependencias(), corredor, propiedad.codigo, async () => {});
    aviso =
      r.mejoradas.length > 0
        ? `Mejoré ${r.mejoradas.length} ${r.mejoradas.length === 1 ? "foto" : "fotos"}${r.fallidas ? ` (${r.fallidas} no se pudieron)` : ""}. Revísalas antes de publicarlas.`
        : (r.mensajes[0] ?? "No se pudo mejorar ninguna foto.");
  } catch {
    aviso = "No pude mejorar las fotos ahora. Inténtalo de nuevo en un rato.";
  }
  ir(`/panel/propiedades/${id}#fotos`, aviso);
}

// --- Agregar casa conversando ----------------------------------------------------------------------

export type RespuestaCasa =
  | { ficha: FichaParcial; mensaje: string; lista: boolean; resumen: string[] }
  | { error: string };

/** Un turno del chat de "Agregar casa": Claude actualiza la ficha con lo que contó el corredor. */
export async function conversarCasa(mensajesNavegador: unknown, fichaNavegador: unknown): Promise<RespuestaCasa> {
  const { corredor } = await sesionConCorredor();
  const mensajes = (Array.isArray(mensajesNavegador) ? mensajesNavegador : [])
    .slice(-MAX_MENSAJES_FICHA)
    .map((m) => ({
      autor: (m?.autor === "asistente" ? "asistente" : "corredor") as "asistente" | "corredor",
      texto: String(m?.texto ?? "").slice(0, MAX_TEXTO_FICHA),
    }))
    .filter((m) => m.texto.trim());
  if (!mensajes.some((m) => m.autor === "corredor")) return { error: "Cuéntame algo de la casa." };
  const deps = dependencias();
  try {
    const r = await conversarFicha(deps.cerebro, corredor, mensajes, fichaNavegador ? fichaLimpia(fichaNavegador) : null);
    await deps.repo.registrarUso(corredor.id, {
      llamadasClaude: 1,
      tokensEntrada: r.consumo.tokensEntrada,
      tokensSalida: r.consumo.tokensSalida,
      costoClaudeUsd: r.consumo.costoUsd,
    });
    return { ficha: r.ficha, mensaje: r.mensaje, lista: r.lista, resumen: resumenFicha(r.ficha) };
  } catch (error) {
    console.error(JSON.stringify({ evento: "error_ficha_conversada", corredorId: corredor.id, error: error instanceof Error ? error.name : "desconocido" }));
    return { error: "No te entendí bien esta vez. ¿Me lo repites?" };
  }
}

/** Guarda la casa conversada, con el siguiente código libre. */
export async function guardarCasaConversada(fichaNavegador: unknown): Promise<{ id: string } | { error: string }> {
  const { supabase, corredor } = await sesionConCorredor();
  const ficha = fichaLimpia(fichaNavegador);
  for (let intento = 0; intento < 3; intento++) {
    const { data: codigos } = await supabase.from("propiedades").select("codigo").eq("corredor_id", corredor.id);
    const r = datosParaGuardar(ficha, siguienteCodigo((codigos ?? []).map((c) => c.codigo as string)));
    if (!r.ok) return { error: r.motivo };
    const { data, error } = await supabase
      .from("propiedades")
      .insert({ ...r.valor, corredor_id: corredor.id })
      .select("id")
      .single();
    if (data) {
      revalidatePath("/panel/propiedades");
      return { id: data.id as string };
    }
    // Otro guardado tomó el mismo código al mismo tiempo: se reintenta con el siguiente.
    if (error?.code !== "23505") break;
  }
  return { error: "No se pudo guardar. Inténtalo de nuevo." };
}
