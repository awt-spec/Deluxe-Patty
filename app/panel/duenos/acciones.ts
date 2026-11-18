"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { mensajeFallaIA, registrarFallaIA } from "@/lib/asistente/falla-ia";
import { SIN_PRESUPUESTO, hayPresupuestoHoy } from "@/lib/asistente/limites";
import { precio as formatoPrecio } from "@/lib/formato";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { siguienteCodigo } from "@/lib/panel/formularios";
import {
  PEDIDOS_MENSAJE_POR_MINUTO,
  datosParaMensaje,
  mensajesDeCodigo,
  revisarMensajes,
  type MensajeDueno,
} from "@/lib/panel/mensaje-dueno";
import { hayTurnoPorMinuto } from "@/lib/panel/turno-ia";
import { crearAlmacenExtension } from "@/lib/encuentra24/datos";
import { nuevoCodigo } from "@/lib/encuentra24/extension";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoCodigo = { codigo?: string; error?: string };

/** Código de un solo uso para conectar la extensión de Chrome al corredor que se está viendo. */
export async function pedirCodigoExtension(_previo: EstadoCodigo): Promise<EstadoCodigo> {
  // El corredor sale de la sesión (RLS): solo puede pedir código para los suyos.
  const { corredor } = await sesionConCorredor();
  if (corredor.activo === false) return { error: "En la demo no se conecta la extensión." };
  try {
    return { codigo: await nuevoCodigo(crearAlmacenExtension(createAdminClient()), corredor.id) };
  } catch {
    return { error: "No se pudo crear el código. Vuelve a intentarlo." };
  }
}

/** Desconecta todas las extensiones del corredor (por ejemplo, si cambió de computadora). */
export async function desconectarExtension() {
  const { corredor } = await sesionConCorredor();
  await crearAlmacenExtension(createAdminClient()).revocarTodas(corredor.id, new Date());
  revalidatePath("/panel/duenos");
}

/**
 * Un dueño firmó: la casa pasa a Mis casas con lo que se sabe del anuncio (título, zona, precio, cuartos,
 * metros y descripción) y el dueño queda como "Publicada", enlazado a ella. La casa se guarda con la
 * sesión del corredor, como cualquier casa que agrega él; después completa la ficha y sube sus fotos.
 */
export async function pasarAMisCasas(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const id = String(f.get("lead") ?? "");
  const { data: lead } = await supabase
    .from("leads_duenos")
    .select("id, titulo, zona, precio, moneda, habitaciones, m2_construccion, descripcion, estado_contacto, propiedad_id")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!lead) redirect("/panel/duenos?aviso=No%20encontr%C3%A9%20ese%20due%C3%B1o.");
  if (lead.propiedad_id) redirect(`/panel/propiedades/${lead.propiedad_id}`);
  const titulo = ((lead.titulo as string | null) ?? "Casa de dueño directo").slice(0, 120);
  const t = titulo.toLowerCase();
  const tipo = /apartamento|apto|condominio vertical/.test(t) ? "apartamento" : /lote|terreno/.test(t) ? "lote" : /local/.test(t) ? "local" : /finca/.test(t) ? "finca" : "casa";
  let nueva: string | null = null;
  for (let intento = 0; intento < 3 && !nueva; intento++) {
    const { data: codigos } = await supabase.from("propiedades").select("codigo").eq("corredor_id", corredor.id);
    const { data, error } = await supabase
      .from("propiedades")
      .insert({
        corredor_id: corredor.id,
        codigo: siguienteCodigo((codigos ?? []).map((c) => c.codigo as string)),
        titulo,
        tipo,
        operacion: "venta",
        precio: lead.precio,
        moneda: (lead.moneda as string | null) ?? "USD",
        zona: lead.zona,
        habitaciones: lead.habitaciones,
        m2_construccion: lead.m2_construccion,
        descripcion: lead.descripcion,
        estado: "activa",
      })
      .select("id")
      .single();
    if (data) nueva = data.id as string;
    else if (error?.code !== "23505") break;
  }
  if (!nueva) redirect("/panel/duenos?etapa=captado&aviso=No%20se%20pudo%20crear%20la%20casa.%20Vuelve%20a%20intentarlo.");
  await supabase
    .from("leads_duenos")
    .update({ estado_contacto: "publicada", estado_at: new Date().toISOString(), propiedad_id: nueva })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  revalidatePath("/panel/duenos");
  revalidatePath("/panel/propiedades");
  redirect(`/panel/propiedades/${nueva}?aviso=${encodeURIComponent("Lista en Mis casas. Revisa la ficha, sube las fotos y prepara el anuncio.")}`);
}

export type ResultadoMensajes =
  | { ok: true; mensajes: MensajeDueno[]; demo: boolean; aviso: string | null }
  | { ok: false; motivo: string };

/**
 * "Crear mensaje con Patty": tres primeros mensajes para un dueño (WhatsApp, formulario de Encuentra24 y para
 * escribirle otra vez). No guarda ni envía nada: los textos vuelven al navegador y los manda el corredor. Solo con un
 * dueño suyo (corredor_id de la sesión), dentro del tope de gasto y hasta 6 por minuto; en la demo, armados por código.
 * A la IA solo van título, zona y precio del anuncio (nunca la descripción) y nada de eso va a los registros.
 */
export async function crearMensajesDueno(leadId: unknown): Promise<ResultadoMensajes> {
  const { supabase, corredor } = await sesionConCorredor();
  if (typeof leadId !== "string" || !/^[0-9a-f-]{36}$/i.test(leadId)) return { ok: false, motivo: "No encontré ese dueño." };
  const { data: lead } = await supabase
    .from("leads_duenos")
    .select("id, titulo, zona, precio, moneda, nombre_anunciante")
    .eq("corredor_id", corredor.id)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, motivo: "No encontré ese dueño." };
  const datos = datosParaMensaje(
    {
      titulo: lead.titulo as string | null,
      zona: lead.zona as string | null,
      precio: lead.precio ? formatoPrecio(Number(lead.precio), lead.moneda as string | null) : null,
      nombre_anunciante: lead.nombre_anunciante as string | null,
    },
    corredor,
  );
  const asistente = corredor.nombre_asistente || "Patty";

  // La demo no gasta IA: los mensajes los arma el código y se dice.
  if (corredor.activo === false) {
    return { ok: true, mensajes: mensajesDeCodigo(datos), demo: true, aviso: "Ejemplo de la demostración: estos mensajes los armó el sistema, no la IA." };
  }
  if (!(await hayTurnoPorMinuto("mensaje_dueno", corredor.id, PEDIDOS_MENSAJE_POR_MINUTO))) {
    return { ok: false, motivo: "Vas muy rápido: espera un minuto y vuelve a pedírmelo." };
  }
  const deps = dependenciasPara(corredor);
  if (!(await hayPresupuestoHoy(deps.repo, corredor))) return { ok: false, motivo: SIN_PRESUPUESTO };
  if (!deps.cerebro.mensajesDueno) return { ok: true, mensajes: mensajesDeCodigo(datos), demo: false, aviso: null };
  try {
    const r = await deps.cerebro.mensajesDueno(corredor, datos);
    // Ya se pagó: suma aunque algo se descarte.
    await deps.repo.registrarUso(corredor.id, {
      llamadasClaude: 1,
      tokensEntrada: r.consumo.tokensEntrada,
      tokensSalida: r.consumo.tokensSalida,
      costoClaudeUsd: r.consumo.costoUsd,
    });
    const revisado = revisarMensajes(r.mensajes, datos);
    return {
      ok: true,
      mensajes: revisado.mensajes,
      demo: false,
      aviso: revisado.cambiados
        ? `${revisado.cambiados === 1 ? "Un mensaje traía" : `${revisado.cambiados} mensajes traían`} algo que no está en el anuncio: lo cambié por uno sencillo.`
        : null,
    };
  } catch (e) {
    const causa = registrarFallaIA(deps.registrar, { corredorId: corredor.id, donde: "mensaje_dueno" }, e);
    console.error(JSON.stringify({ evento: "error_mensaje_dueno", corredorId: corredor.id, causa, error: errorSeguro(e) }));
    return { ok: false, motivo: mensajeFallaIA(causa, asistente) };
  }
}
