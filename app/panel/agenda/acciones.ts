"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { sincronizarAhora } from "@/lib/google/tareas";
import { aUtc, minutosDe } from "@/lib/agenda/tiempo";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { cambiarVisita, crearVisita, moverVisita } from "@/lib/panel/visitas";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cambia el enlace privado del calendario (por si se compartió sin querer). El enlace viejo deja de
 * funcionar. El token no es legible ni editable con la sesión: se escribe con el backend, solo para el
 * corredor de la sesión.
 */
export async function cambiarEnlaceCalendario() {
  const { corredor } = await sesionConCorredor();
  const { error } = await createAdminClient()
    .from("corredores")
    .update({ token_calendario: randomBytes(32).toString("hex") })
    .eq("id", corredor.id);
  revalidatePath("/panel/agenda");
  redirect(
    `/panel/agenda?aviso=${encodeURIComponent(
      error ? "No se pudo cambiar el enlace." : "Listo: el enlace anterior ya no funciona. Vuelve a suscribirte con el nuevo.",
    )}`,
  );
}

// --- Visitas desde el calendario ------------------------------------------------------------------
// Cada acción comprueba con la sesión (RLS) que el cliente o la visita son del corredor y luego actúa
// con el backend (lib/panel/visitas.ts).

const campo = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const esId = (v: string) => /^[0-9a-f-]{36}$/.test(v);

function instante(fecha: string, hora: string, zona: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) return null;
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return aUtc({ anio, mes, dia, diaSemana: new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay() }, minutosDe(hora), zona);
}

/** Lleva el cambio al Google Calendar del corredor (si lo conectó) después de responder. */
function alCalendario(corredor: Parameters<typeof sincronizarAhora>[1]) {
  after(() => sincronizarAhora(createAdminClient(), corredor));
}

function irA(ruta: string, aviso: string): never {
  revalidatePath("/panel/agenda");
  revalidatePath("/panel");
  redirect(`${ruta}${ruta.includes("?") ? "&" : "?"}aviso=${encodeURIComponent(aviso)}`);
}

export async function agendarVisita(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const contactoId = campo(f, "cliente");
  const propiedadId = campo(f, "casa") || null;
  const fecha = campo(f, "fecha");
  const inicio = instante(fecha, campo(f, "hora"), corredor.zona_horaria);
  const minutos = Number(campo(f, "minutos")) || corredor.duracion_visita_min;
  const volver = `/panel/agenda/nueva?fecha=${encodeURIComponent(fecha)}&hora=${encodeURIComponent(campo(f, "hora"))}`;
  if (!esId(contactoId)) irA(volver, "Elige el cliente.");
  if (!inicio) irA(volver, "Revisa el día y la hora.");
  if (propiedadId && !esId(propiedadId)) irA(volver, "Elige la casa de la lista.");
  const { data: propio } = await supabase.from("contactos").select("id").eq("corredor_id", corredor.id).eq("id", contactoId).maybeSingle();
  if (!propio) irA(volver, "No encontré ese cliente.");
  const r = await crearVisita(dependenciasPara(corredor), createAdminClient(), corredor, {
    contactoId,
    propiedadId,
    inicio: inicio!,
    minutos: Math.min(240, Math.max(15, minutos)),
    avisarCliente: f.get("avisar") !== null,
  });
  if (!r.ok) irA(volver, r.motivo);
  alCalendario(corredor);
  irA(`/panel/agenda?vista=dia&fecha=${fecha}`, r.aviso);
}

async function visitaPropia(citaId: string) {
  const { supabase, corredor } = await sesionConCorredor();
  if (!esId(citaId)) redirect("/panel/agenda");
  const { data } = await supabase.from("citas").select("id").eq("corredor_id", corredor.id).eq("id", citaId).maybeSingle();
  if (!data) redirect("/panel/agenda?aviso=No%20encontr%C3%A9%20la%20visita.");
  return corredor;
}

export async function moverLaVisita(f: FormData) {
  const id = campo(f, "id");
  const corredor = await visitaPropia(id);
  const inicio = instante(campo(f, "fecha"), campo(f, "hora"), corredor.zona_horaria);
  if (!inicio) irA(`/panel/agenda/visita/${id}`, "Revisa el día y la hora.");
  const r = await moverVisita(dependenciasPara(corredor), createAdminClient(), corredor, id, inicio!, f.get("avisar") !== null);
  if (r.ok) alCalendario(corredor);
  irA(`/panel/agenda/visita/${id}`, r.ok ? r.aviso : r.motivo);
}

export async function cambiarLaVisita(f: FormData) {
  const id = campo(f, "id");
  const estado = campo(f, "estado");
  if (!["confirmada", "cancelada", "realizada", "no_asistio"].includes(estado)) redirect("/panel/agenda");
  const corredor = await visitaPropia(id);
  const r = await cambiarVisita(
    dependenciasPara(corredor),
    createAdminClient(),
    corredor,
    id,
    estado as "confirmada" | "cancelada" | "realizada" | "no_asistio",
    f.get("avisar") !== null,
  );
  if (r.ok) alCalendario(corredor);
  irA(estado === "cancelada" ? "/panel/agenda" : `/panel/agenda/visita/${id}`, r.ok ? r.aviso : r.motivo);
}
