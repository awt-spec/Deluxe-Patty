"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import {
  aprobarBorrador,
  descartarBorrador,
  devolverControl,
  escribirComoCorredor,
  tomarControl,
  type Resultado,
} from "@/lib/panel/acciones";
import { quitarConexion } from "@/lib/google/conexion";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { leerAjustes, normalizarTelefono } from "@/lib/panel/formularios";
import { reclamarConSupabase } from "@/lib/monitoreo/alertas";
import { crearEnviadorWhatsApp, explicarErrorWhatsApp } from "@/lib/whatsapp/enviar";
import { COOKIE_CORREDOR, sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerEnvio, reclamarEnvio } from "@/lib/panel/una-vez";
import { clienteConSesion } from "@/lib/supabase/servidor";

// Server actions del panel. Antes de actuar con el backend (service_role) se comprueba con la sesión
// del usuario (RLS) que el mensaje o la conversación son de su corredor.

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");
// Desde el inicio o desde "Revisar" las acciones vuelven ahí; si no, a la conversación.
const destino = (f: FormData, ruta: string) =>
  ["/panel", "/panel/revisar"].includes(texto(f, "volver")) ? texto(f, "volver") : ruta;

function volver(ruta: string, r: Resultado, ok: string): never {
  revalidatePath(ruta);
  redirect(`${ruta}?aviso=${encodeURIComponent(r.ok ? (r.aviso ?? ok) : r.motivo)}`);
}

async function conversacionPropia(conversacionId: string) {
  const s = await sesionConCorredor();
  const { data } = await s.supabase
    .from("conversaciones")
    .select("id")
    .eq("corredor_id", s.corredor.id)
    .eq("id", conversacionId)
    .maybeSingle();
  if (!data) redirect("/panel/conversaciones?aviso=No%20encontr%C3%A9%20la%20conversaci%C3%B3n.");
  return s.corredor;
}

async function mensajePropio(mensajeId: string) {
  const s = await sesionConCorredor();
  const { data } = await s.supabase
    .from("mensajes")
    .select("id, conversacion_id")
    .eq("corredor_id", s.corredor.id)
    .eq("id", mensajeId)
    .maybeSingle();
  if (!data) redirect("/panel/conversaciones?aviso=No%20encontr%C3%A9%20el%20mensaje.");
  return { corredor: s.corredor, conversacionId: data.conversacion_id as string };
}

export async function aprobar(f: FormData) {
  const mensaje = texto(f, "mensaje");
  const { corredor, conversacionId } = await mensajePropio(mensaje);
  const r = await aprobarBorrador(dependenciasPara(corredor), corredor, mensaje, texto(f, "texto"));
  volver(destino(f, `/panel/conversaciones/${conversacionId}`), r, "Enviado.");
}

export async function descartar(f: FormData) {
  const mensaje = texto(f, "mensaje");
  const { corredor, conversacionId } = await mensajePropio(mensaje);
  const r = await descartarBorrador(dependenciasPara(corredor), corredor, mensaje);
  volver(destino(f, `/panel/conversaciones/${conversacionId}`), r, "Listo, no se envió.");
}

export async function tomar(f: FormData) {
  const id = texto(f, "conversacion");
  const corredor = await conversacionPropia(id);
  volver(
    `/panel/conversaciones/${id}`,
    await tomarControl(dependenciasPara(corredor), corredor, id),
    "Ahora le contestas tú: la asistente no se mete en este chat.",
  );
}

export async function devolver(f: FormData) {
  const id = texto(f, "conversacion");
  const corredor = await conversacionPropia(id);
  volver(
    destino(f, `/panel/conversaciones/${id}`),
    await devolverControl(dependenciasPara(corredor), corredor, id),
    "Listo: la asistente vuelve a contestarle.",
  );
}

export async function escribir(f: FormData) {
  const id = texto(f, "conversacion");
  const corredor = await conversacionPropia(id);
  const ruta = `/panel/conversaciones/${id}`;
  // Un doble toque (o el navegador que reenvía el formulario) no le manda el mismo mensaje dos veces al cliente: el
  // segundo envío del mismo formulario con el mismo texto encuentra la marca y responde "Enviado." sin mandar nada.
  const turno = await reclamarEnvio(createAdminClient(), "escribir", corredor.id, leerEnvio(f), `${id}\n${texto(f, "texto").trim()}`);
  if (!turno.primero) volver(ruta, { ok: true }, "Enviado.");
  const r = await escribirComoCorredor(dependenciasPara(corredor), corredor, id, texto(f, "texto"));
  if (!r.ok) await turno.soltar();
  volver(ruta, r, "Enviado.");
}

/**
 * "Le escribo yo": la asistente deja ese chat (lo que tenía por enviar no sale) y se abre el WhatsApp
 * de la corredora con el cliente.
 */
export async function yoLeEscribo(f: FormData) {
  const id = texto(f, "conversacion");
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("conversaciones")
    .select("id, contactos!inner(telefono)")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) redirect("/panel?aviso=No%20encontr%C3%A9%20el%20chat.");
  const deps = dependenciasPara(corredor);
  const { data: pendientes } = await supabase
    .from("mensajes")
    .select("id")
    .eq("corredor_id", corredor.id)
    .eq("conversacion_id", id)
    .eq("estado_borrador", "pendiente");
  for (const m of pendientes ?? []) await descartarBorrador(deps, corredor, m.id as string);
  await tomarControl(deps, corredor, id);
  revalidatePath("/panel");
  const contacto = (Array.isArray(data!.contactos) ? data!.contactos[0] : data!.contactos) as { telefono: string };
  redirect(`https://wa.me/${contacto.telefono.replace(/\D/g, "")}`);
}

const ESTADOS_LEAD = new Set(["contactado", "respondio", "visitada", "captado", "descartado"]);

export async function marcarLead(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const id = texto(f, "lead");
  const estado = texto(f, "estado");
  if (estado === "corredor") {
    // Es un corredor: se descarta y su cuenta no vuelve a aparecer en la búsqueda.
    const { data: lead } = await supabase
      .from("leads_duenos")
      .select("anunciante_e24_id, nombre_anunciante")
      .eq("corredor_id", corredor.id)
      .eq("id", id)
      .maybeSingle();
    if (lead) {
      await supabase.from("corredores_bloqueados").insert({
        corredor_id: corredor.id,
        anunciante_e24_id: lead.anunciante_e24_id,
        nombre: lead.nombre_anunciante,
      });
      await supabase
        .from("leads_duenos")
        .update({ es_dueno: false, estado_contacto: "descartado" })
        .eq("corredor_id", corredor.id)
        .eq("id", id);
    }
  } else if (ESTADOS_LEAD.has(estado)) {
    await supabase
      .from("leads_duenos")
      .update({ estado_contacto: estado, estado_at: new Date().toISOString() })
      .eq("corredor_id", corredor.id)
      .eq("id", id);
  }
  revalidatePath("/panel/duenos");
  // Se queda en la etapa en que estaba, para seguir con el siguiente dueño.
  const volverA = texto(f, "volver");
  redirect(/^[a-z]+$/.test(volverA) ? `/panel/duenos?etapa=${volverA}` : "/panel/duenos");
}

export async function guardarAjustes(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const volver = VOLVER_AJUSTES.includes(texto(f, "volver")) ? texto(f, "volver") : "/panel/ajustes";
  const leidos = leerAjustes(f);
  // Con `solo`, solo cuenta el error de ese campo (las guías mandan uno nomás).
  const soloCampo = SOLO_AJUSTE[texto(f, "solo")];
  const error = soloCampo ? leidos.errores[soloCampo] : Object.values(leidos.errores)[0];
  if (error) redirect(`${volver}?aviso=${encodeURIComponent(error)}`);
  const todo = leidos.valores;
  // Las guías paso a paso (/panel/empezar) guardan un solo campo con la misma lectura: `solo` dice cuál, y el resto
  // no se toca. Sin `solo`, el formulario completo de Ajustes, como siempre.
  const cambios = soloCampo ? { [soloCampo]: todo[soloCampo] } : todo;
  const { error: fallo } = await supabase.from("corredores").update(cambios).eq("id", corredor.id);
  revalidatePath("/panel", "layout");
  redirect(`${volver}?aviso=${encodeURIComponent(fallo ? "No se pudo guardar. Revisa los datos." : "Guardado.")}`);
}

/** Lo que una guía puede guardar sola desde guardarAjustes (nombre del campo del formulario → columna). */
const SOLO_AJUSTE: Record<string, "tono" | "reglas_escalamiento" | "respuesta_automatica" | undefined> = {
  tono: "tono",
  reglas: "reglas_escalamiento",
  respuesta_automatica: "respuesta_automatica",
};
/** Adónde puede volver guardarAjustes (nada de direcciones de afuera). */
const VOLVER_AJUSTES = ["/panel/ajustes", "/panel/empezar", "/panel/empezar/sola"];

export async function elegirCorredor(f: FormData) {
  (await cookies()).set(COOKIE_CORREDOR, texto(f, "corredor"), { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/panel");
}

// Sin exigir corredor: también sale quien entró con un correo que todavía no tiene acceso.
export async function salir() {
  const supabase = await clienteConSesion();
  await supabase.auth.signOut();
  (await cookies()).delete(COOKIE_CORREDOR);
  redirect("/entrar");
}

/** Quita la conexión con Google (el permiso cifrado se borra; en Google puede quitarse también). */
export async function desconectarGoogle() {
  const { corredor } = await sesionConCorredor();
  await quitarConexion(createAdminClient(), corredor.id);
  revalidatePath("/panel/ajustes");
  redirect(`/panel/ajustes?aviso=${encodeURIComponent("Google desconectado.")}`);
}

/**
 * "Probar WhatsApp" (Ajustes): manda la plantilla hello_world de Meta (viene aprobada en todo número, en inglés) al
 * celular que escriba el corredor, desde su propio número. Comprueba con su sesión quién es; en la demo (corredor
 * inactivo) no sale nada. El aviso no lleva el teléfono ni el mensaje de Meta, solo tipo y código.
 */
export async function probarWhatsApp(f: FormData) {
  const { corredor } = await sesionConCorredor();
  const ruta = "/panel/ajustes";
  // El resultado vuelve dentro de la tarjeta de la prueba (que está abajo): un aviso arriba de la página no se veía.
  const aviso = (m: string, ok = false): never => {
    console.info(JSON.stringify({ evento: "prueba_whatsapp", ok }));
    revalidatePath(ruta);
    redirect(`${ruta}?prueba=${encodeURIComponent(m)}&ok=${ok ? 1 : 0}#probar-whatsapp`);
  };
  const para = normalizarTelefono(texto(f, "telefono"));
  if (!para) aviso("Escribe el celular con código de país, por ejemplo +506 8888 8888.");
  if (corredor.activo === false) aviso("Esta es una cuenta de demostración: no manda nada por WhatsApp.");
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) aviso("Falta conectar WhatsApp: no está la llave de acceso en el servidor.");
  if (!corredor.whatsapp_phone_number_id) aviso("Este corredor todavía no tiene número de WhatsApp conectado.");
  // Tope: una prueba cada 5 minutos por corredor. Sin él, cualquier usuario del panel podría mandar plantillas a
  // cualquier número con la llave y el número de WhatsApp de la plataforma (costo y riesgo de que Meta lo marque).
  const libre = await reclamarConSupabase(createAdminClient())(`prueba_whatsapp:${corredor.id}`, 5).catch(() => false);
  if (!libre) aviso("Ya mandaste una prueba hace poco. Espera 5 minutos para mandar otra.");
  try {
    await crearEnviadorWhatsApp(token!).plantilla(corredor.whatsapp_phone_number_id!, para!, "hello_world", [], "en_US");
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_prueba_whatsapp", error: errorSeguro(e) }));
    aviso(`WhatsApp no aceptó el mensaje (${errorSeguro(e)}). ${explicarErrorWhatsApp(e)}`);
  }
  aviso("Meta aceptó el mensaje de prueba. Si en un minuto no llega, revisa que el celular esté verificado en la lista de prueba de Meta.", true);
}
