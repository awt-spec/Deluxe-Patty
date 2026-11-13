"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { sincronizarAhora } from "@/lib/google/tareas";
import { aUtc, minutosDe } from "@/lib/agenda/tiempo";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { leerBloqueo } from "@/lib/panel/formularios";
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

// --- Bloqueos desde la agenda ---------------------------------------------------------------------
// Se guardan con la sesión del corredor (RLS), como en Mi horario.

const RATOS: Record<string, [string, string]> = { manana: ["07:00", "12:00"], tarde: ["12:00", "18:00"], noche: ["18:00", "22:00"] };

/** ¿Ya hay un bloqueo que cubre todo ese rato? (para no repetirlo si se pide dos veces) */
async function yaBloqueado(supabase: Awaited<ReturnType<typeof sesionConCorredor>>["supabase"], corredorId: string, inicio: string, fin: string) {
  const { count } = await supabase
    .from("bloqueos_agenda")
    .select("id", { count: "exact", head: true })
    .eq("corredor_id", corredorId)
    .lte("inicio", inicio)
    .gte("fin", fin);
  return (count ?? 0) > 0;
}

/** "Apartar tiempo": un día (o varios seguidos), entero, la mañana, la tarde, la noche o unas horas exactas. */
export async function bloquearDesdeAgenda(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const rato = campo(f, "rato");
  const desde = campo(f, "fecha");
  const hasta = campo(f, "fecha_hasta") > desde ? campo(f, "fecha_hasta") : desde;
  const volver = `/panel/agenda/bloquear?fecha=${encodeURIComponent(desde)}`;
  const horas: [string, string] | null = RATOS[rato] ?? (rato === "horas" ? [campo(f, "hora_desde"), campo(f, "hora_hasta")] : null);

  // Todo el día: un solo bloqueo de punta a punta. Con horas: uno por día (la mañana de cada día).
  const dias: [string, string][] = [];
  if (!horas) dias.push([desde, hasta]);
  else {
    for (let d = new Date(`${desde}T12:00:00Z`); dias.length < 62 && d.toISOString().slice(0, 10) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      dias.push([iso, iso]);
    }
  }
  const filas: { corredor_id: string; inicio: string; fin: string; motivo: string | null }[] = [];
  let problema: string | null = null;
  for (const [a, b] of dias) {
    const datos = new FormData();
    datos.set("fecha_desde", a);
    datos.set("fecha_hasta", b);
    if (horas) {
      datos.set("hora_desde", horas[0]);
      datos.set("hora_hasta", horas[1]);
    }
    datos.set("motivo", campo(f, "motivo"));
    const r = leerBloqueo(datos, corredor.zona_horaria, new Date());
    if (r.ok) filas.push({ corredor_id: corredor.id, inicio: r.valor.inicio.toISOString(), fin: r.valor.fin.toISOString(), motivo: r.valor.motivo });
    else problema ??= r.motivo;
  }
  if (filas.length === 0) irA(volver, problema ?? "Revisa el día y las horas.");
  const repetidos = await Promise.all(filas.map((b) => yaBloqueado(supabase, corredor.id, b.inicio, b.fin)));
  const nuevas = filas.filter((_, i) => !repetidos[i]);
  if (nuevas.length === 0) irA(`/panel/agenda?vista=dia&fecha=${desde}`, "Ese rato ya estaba apartado.");
  const { error } = await supabase.from("bloqueos_agenda").insert(nuevas);
  if (error) irA(volver, "No se pudo apartar ese tiempo.");
  const { data: encima } = await supabase
    .from("citas")
    .select("inicio, fin")
    .eq("corredor_id", corredor.id)
    .in("estado", ["agendada", "confirmada"])
    .lt("inicio", filas[filas.length - 1].fin)
    .gt("fin", filas[0].inicio);
  const chocan = (encima ?? []).filter((c) => filas.some((b) => Date.parse(c.inicio) < Date.parse(b.fin) && Date.parse(c.fin) > Date.parse(b.inicio))).length;
  irA(
    `/panel/agenda?vista=dia&fecha=${desde}`,
    chocan
      ? `Tiempo apartado. Ojo: ya tienes ${chocan} ${chocan === 1 ? "visita" : "visitas"} en ese rato; siguen en pie.`
      : "Tiempo apartado: la asistente no ofrecerá esas horas.",
  );
}

/** La pregunta diaria de Patty: "¿Tienes algún compromiso mañana?" con un toque. */
export async function bloquearRapido(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const rato = campo(f, "rato");
  const valido = new FormData();
  valido.set("fecha_desde", campo(f, "fecha"));
  if (RATOS[rato]) {
    valido.set("hora_desde", RATOS[rato][0]);
    valido.set("hora_hasta", RATOS[rato][1]);
  }
  const r = leerBloqueo(valido, corredor.zona_horaria, new Date());
  const destino = campo(f, "volver_a") === "/panel" ? "/panel" : "/panel/agenda";
  if (!r.ok) irA(destino, r.motivo);
  const { inicio, fin } = (r as Extract<typeof r, { ok: true }>).valor;
  if (await yaBloqueado(supabase, corredor.id, inicio.toISOString(), fin.toISOString())) irA(destino, "Ese rato ya estaba apartado.");
  const { error } = await supabase.from("bloqueos_agenda").insert({ corredor_id: corredor.id, inicio: inicio.toISOString(), fin: fin.toISOString(), motivo: null });
  irA(destino, error ? "No se pudo apartar ese tiempo." : "Listo, tiempo apartado: no se agendarán visitas en ese rato.");
}

export async function quitarBloqueoAgenda(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const id = campo(f, "id");
  if (esId(id)) await supabase.from("bloqueos_agenda").delete().eq("corredor_id", corredor.id).eq("id", id);
  const volver = campo(f, "volver");
  irA(volver.startsWith("/panel/agenda") ? volver : "/panel/agenda", "Listo, quitado: esas horas vuelven a estar libres.");
}
