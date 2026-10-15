"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { dependencias } from "@/lib/asistente/dependencias";
import {
  aprobarBorrador,
  descartarBorrador,
  devolverControl,
  escribirComoCorredor,
  tomarControl,
  type Resultado,
} from "@/lib/panel/acciones";
import { COOKIE_CORREDOR, sesionConCorredor } from "@/lib/panel/sesion";

// Server actions del panel. Antes de actuar con el backend (service_role) se comprueba con la sesión
// del usuario (RLS) que el mensaje o la conversación son de su corredor.

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");

function volver(ruta: string, r: Resultado, ok: string): never {
  revalidatePath(ruta);
  redirect(`${ruta}?aviso=${encodeURIComponent(r.ok ? ok : r.motivo)}`);
}

async function conversacionPropia(conversacionId: string) {
  const s = await sesionConCorredor();
  const { data } = await s.supabase.from("conversaciones").select("id").eq("id", conversacionId).maybeSingle();
  if (!data) redirect("/panel/conversaciones?aviso=No%20encontr%C3%A9%20la%20conversaci%C3%B3n.");
  return s.corredor;
}

async function mensajePropio(mensajeId: string) {
  const s = await sesionConCorredor();
  const { data } = await s.supabase.from("mensajes").select("id, conversacion_id").eq("id", mensajeId).maybeSingle();
  if (!data) redirect("/panel/conversaciones?aviso=No%20encontr%C3%A9%20el%20mensaje.");
  return { corredor: s.corredor, conversacionId: data.conversacion_id as string };
}

export async function aprobar(f: FormData) {
  const mensaje = texto(f, "mensaje");
  const { corredor, conversacionId } = await mensajePropio(mensaje);
  const r = await aprobarBorrador(dependencias(), corredor, mensaje, texto(f, "texto"));
  volver(`/panel/conversaciones/${conversacionId}`, r, "Enviado.");
}

export async function descartar(f: FormData) {
  const mensaje = texto(f, "mensaje");
  const { corredor, conversacionId } = await mensajePropio(mensaje);
  const r = await descartarBorrador(dependencias(), corredor, mensaje);
  volver(`/panel/conversaciones/${conversacionId}`, r, "Borrador descartado.");
}

export async function tomar(f: FormData) {
  const id = texto(f, "conversacion");
  const corredor = await conversacionPropia(id);
  volver(
    `/panel/conversaciones/${id}`,
    await tomarControl(dependencias(), corredor, id),
    "La conversación es tuya: la asistente no contesta aquí.",
  );
}

export async function devolver(f: FormData) {
  const id = texto(f, "conversacion");
  const corredor = await conversacionPropia(id);
  volver(
    `/panel/conversaciones/${id}`,
    await devolverControl(dependencias(), corredor, id),
    "La asistente vuelve a contestar aquí.",
  );
}

export async function escribir(f: FormData) {
  const id = texto(f, "conversacion");
  const corredor = await conversacionPropia(id);
  volver(
    `/panel/conversaciones/${id}`,
    await escribirComoCorredor(dependencias(), corredor, id, texto(f, "texto")),
    "Enviado.",
  );
}

const ESTADOS_LEAD = new Set(["contactado", "respondio", "captado", "descartado"]);

export async function marcarLead(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const id = texto(f, "lead");
  const estado = texto(f, "estado");
  if (estado === "corredor") {
    // Es un corredor: se descarta y su cuenta no vuelve a aparecer en la búsqueda.
    const { data: lead } = await supabase
      .from("leads_duenos")
      .select("anunciante_e24_id, nombre_anunciante")
      .eq("id", id)
      .maybeSingle();
    if (lead) {
      await supabase.from("corredores_bloqueados").insert({
        corredor_id: corredor.id,
        anunciante_e24_id: lead.anunciante_e24_id,
        nombre: lead.nombre_anunciante,
      });
      await supabase.from("leads_duenos").update({ es_dueno: false, estado_contacto: "descartado" }).eq("id", id);
    }
  } else if (ESTADOS_LEAD.has(estado)) {
    await supabase.from("leads_duenos").update({ estado_contacto: estado }).eq("id", id);
  }
  revalidatePath("/panel/duenos");
  redirect("/panel/duenos");
}

export async function guardarAjustes(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const lineas = (k: string) =>
    texto(f, k)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  const numero = (k: string) => {
    const v = texto(f, k).replace(/[^\d]/g, "");
    return v ? Number(v) : null;
  };
  const { error } = await supabase
    .from("corredores")
    .update({
      tono: texto(f, "tono").trim(),
      reglas_escalamiento: lineas("reglas"),
      hora_plan_dia: texto(f, "hora_plan") || "07:00",
      respuesta_automatica: f.get("respuesta_automatica") === "on",
      zonas_e24: lineas("zonas_e24"),
      precio_busqueda_min: numero("precio_min"),
      precio_busqueda_max: numero("precio_max"),
    })
    .eq("id", corredor.id);
  revalidatePath("/panel/ajustes");
  redirect(`/panel/ajustes?aviso=${encodeURIComponent(error ? "No se pudo guardar. Revisa los datos." : "Guardado.")}`);
}

export async function elegirCorredor(f: FormData) {
  (await cookies()).set(COOKIE_CORREDOR, texto(f, "corredor"), { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/panel");
}

export async function salir() {
  const { supabase } = await sesionConCorredor();
  await supabase.auth.signOut();
  redirect("/entrar");
}
