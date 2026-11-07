import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { conPunto, etiquetaHorario } from "../agenda/formato";
import type { Dependencias } from "../asistente/procesar";
import type { Corredor } from "../datos/tipos";
import { fechaIso, fechaLocal, sumarDias } from "../agenda/tiempo";
import { anotar } from "../crm/actividades";
import { escribirComoCorredor } from "./acciones";

// Visitas que el corredor maneja desde el calendario: crear una a mano, confirmarla, moverla de hora o
// cancelarla. Las citas las escribe el backend (la acción ya comprobó con la sesión que son suyas) y
// cada consulta filtra por corredor_id. Si el corredor lo pide, se le avisa al cliente por WhatsApp
// con un texto armado por el código.

export type ResultadoVisita = { ok: true; aviso: string } | { ok: false; motivo: string };

const OCUPADO = "A esa hora ya hay otra visita. Elige otra hora.";

async function avisar(
  deps: Dependencias,
  db: SupabaseClient,
  corredor: Corredor,
  contactoId: string,
  texto: string,
): Promise<string> {
  const { data: conv } = await db
    .from("conversaciones")
    .select("id")
    .eq("corredor_id", corredor.id)
    .eq("contacto_id", contactoId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conv) return " No le avisé: no tiene chat de WhatsApp.";
  const r = await escribirComoCorredor(deps, corredor, conv.id as string, texto);
  return r.ok ? " Le avisé por WhatsApp." : ` No le pude avisar: ${r.motivo}`;
}

export async function crearVisita(
  deps: Dependencias,
  db: SupabaseClient,
  corredor: Corredor,
  v: { contactoId: string; propiedadId: string | null; inicio: Date; minutos: number; avisarCliente: boolean },
): Promise<ResultadoVisita> {
  const fin = new Date(v.inicio.getTime() + v.minutos * 60_000);
  const { data: casa } = v.propiedadId
    ? await db.from("propiedades").select("titulo").eq("corredor_id", corredor.id).eq("id", v.propiedadId).maybeSingle()
    : { data: null };
  const id = await deps.repo.crearCita({
    corredor_id: corredor.id,
    contacto_id: v.contactoId,
    conversacion_id: null,
    propiedad_id: casa ? v.propiedadId : null,
    inicio: v.inicio,
    fin,
  });
  if (!id) return { ok: false, motivo: OCUPADO };
  // Agendar una visita la lleva a la etapa "visita" si todavía no estaba más adelante.
  await deps.repo.actualizarPerfilCliente(corredor.id, v.contactoId, { etapa: "visita", soloDesde: ["nuevo", "interesado"] });
  const cuando = etiquetaHorario(v.inicio, corredor.zona_horaria);
  await anotar(db, corredor.id, v.contactoId, "visita", `Visita agendada${casa ? ` a ${casa.titulo as string}` : ""} para el ${cuando}`);
  const extra = v.avisarCliente
    ? await avisar(
        deps,
        db,
        corredor,
        v.contactoId,
        conPunto(`Le confirmo su visita${casa ? ` para ver ${casa.titulo as string}` : ""} el ${cuando}`) + ` ${corredor.nombre_contacto} le estará esperando.`,
      )
    : "";
  return { ok: true, aviso: `Visita agendada.${extra}` };
}

async function citaPropia(db: SupabaseClient, corredor: Corredor, citaId: string) {
  const { data } = await db
    .from("citas")
    .select("id, contacto_id, inicio, fin, estado, propiedades(titulo)")
    .eq("corredor_id", corredor.id)
    .eq("id", citaId)
    .in("estado", ["agendada", "confirmada"])
    .maybeSingle();
  if (!data) return null;
  const p = data.propiedades as { titulo: string } | { titulo: string }[] | null;
  return {
    id: data.id as string,
    contactoId: data.contacto_id as string,
    inicio: new Date(data.inicio as string),
    fin: new Date(data.fin as string),
    casa: (Array.isArray(p) ? p[0] : p)?.titulo ?? null,
  };
}

export async function moverVisita(
  deps: Dependencias,
  db: SupabaseClient,
  corredor: Corredor,
  citaId: string,
  inicio: Date,
  avisarCliente: boolean,
): Promise<ResultadoVisita> {
  const cita = await citaPropia(db, corredor, citaId);
  if (!cita) return { ok: false, motivo: "No encontré la visita." };
  const fin = new Date(inicio.getTime() + (cita.fin.getTime() - cita.inicio.getTime()));
  // La restricción de la base impide que quede encima de otra visita.
  const { error } = await db
    .from("citas")
    .update({ inicio: inicio.toISOString(), fin: fin.toISOString(), estado: "agendada", recordatorio_enviado_at: null })
    .eq("corredor_id", corredor.id)
    .eq("id", citaId);
  if (error) return { ok: false, motivo: error.code === "23P01" ? OCUPADO : "No se pudo mover la visita." };
  const zona = corredor.zona_horaria;
  await anotar(db, corredor.id, cita.contactoId, "visita", `Visita movida del ${etiquetaHorario(cita.inicio, zona)} al ${etiquetaHorario(inicio, zona)}`);
  const extra = avisarCliente
    ? await avisar(
        deps,
        db,
        corredor,
        cita.contactoId,
        conPunto(`Le escribo para cambiar su visita${cita.casa ? ` a ${cita.casa}` : ""}: en vez del ${etiquetaHorario(cita.inicio, zona)}, sería el ${etiquetaHorario(inicio, zona)}`) +
          " ¿Le queda bien?",
      )
    : "";
  return { ok: true, aviso: `Visita movida.${extra}` };
}

export async function cambiarVisita(
  deps: Dependencias,
  db: SupabaseClient,
  corredor: Corredor,
  citaId: string,
  estado: "confirmada" | "cancelada" | "realizada" | "no_asistio",
  avisarCliente: boolean,
): Promise<ResultadoVisita> {
  const cita = await citaPropia(db, corredor, citaId);
  if (!cita) return { ok: false, motivo: "No encontré la visita." };
  if (!(await deps.repo.cambiarEstadoCita(corredor.id, citaId, estado))) return { ok: false, motivo: "La visita ya cambió." };
  const cuando = etiquetaHorario(cita.inicio, corredor.zona_horaria);
  // Queda en la historia del cliente y, si la visita se hizo, un recordatorio para mañana: "¿Qué le
  // pareció la casa?" (si no tenía otro recordatorio puesto).
  const deLaCasa = cita.casa ? ` a ${cita.casa}` : "";
  const historia = {
    confirmada: `Visita${deLaCasa} confirmada para el ${cuando}`,
    cancelada: `Visita${deLaCasa} del ${cuando} cancelada`,
    realizada: `Fue a ver la casa${cita.casa ? ` ${cita.casa}` : ""}`,
    no_asistio: `No llegó a la visita${deLaCasa}`,
  }[estado];
  await anotar(db, corredor.id, cita.contactoId, "visita", historia);
  let recordatorio = "";
  if (estado === "realizada") {
    const manana = fechaIso(sumarDias(fechaLocal(new Date(), corredor.zona_horaria), 1));
    const { data: puesto } = await db
      .from("contactos")
      .update({ seguimiento_fecha: manana, seguimiento_nota: `Preguntarle qué le pareció ${cita.casa ?? "la casa"}` })
      .eq("corredor_id", corredor.id)
      .eq("id", cita.contactoId)
      .is("seguimiento_fecha", null)
      .select("id");
    if (puesto?.length) recordatorio = " Te dejé un recordatorio para mañana: preguntarle qué le pareció.";
  }
  const texto =
    estado === "cancelada"
      ? conPunto(`Le escribo para avisarle que la visita del ${cuando} queda cancelada`) + " Con gusto buscamos otro día."
      : estado === "confirmada"
        ? conPunto(`Le confirmo su visita del ${cuando}`)
        : null;
  const extra = avisarCliente && texto ? await avisar(deps, db, corredor, cita.contactoId, texto) : "";
  const listo = { confirmada: "Visita confirmada.", cancelada: "Visita cancelada.", realizada: "Listo, la visita quedó hecha.", no_asistio: "Anotado: no llegó." };
  return { ok: true, aviso: `${listo[estado]}${extra}${recordatorio}` };
}
