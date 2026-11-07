import type { SupabaseClient } from "@supabase/supabase-js";
import { errorSeguro } from "../monitoreo/errores";
import { anotarError, type ConexionGoogle } from "./conexion";
import { actualizarEvento, borrarEvento, crearEvento, ocupado, type EventoVisita } from "./google";

// Las visitas del corredor en su Google Calendar: cada visita nueva se crea como evento (con el cliente
// invitado si tiene correo, y Google le manda la invitación), una visita movida se actualiza y una
// cancelada se borra. Corre al cambiar una visita y cada hora por si algo quedó pendiente.

const TOLERANCIA_MS = 10_000;

type Fila = {
  id: string;
  inicio: string;
  fin: string;
  estado: string;
  calendario_evento_id: string | null;
  calendario_sincronizado_at: string | null;
  updated_at: string;
  contactos: { nombre: string | null; telefono: string | null; email: string | null } | null;
  propiedades: { titulo: string; zona: string | null; canton: string | null } | null;
};

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function evento(f: Fila, nombreCorredor: string): EventoVisita {
  const cliente = uno(f.contactos);
  const casa = uno(f.propiedades);
  const nombre = cliente?.nombre ?? cliente?.telefono ?? "cliente";
  return {
    titulo: `Visita${casa ? `: ${casa.titulo}` : ""} · ${nombre}`,
    descripcion: [
      `Visita con ${nombre}${cliente?.telefono ? ` (${cliente.telefono})` : ""}.`,
      casa ? `Casa: ${casa.titulo}.` : null,
      `Agendada por la asistente de ${nombreCorredor}.`,
    ]
      .filter(Boolean)
      .join("\n"),
    lugar: casa ? [casa.zona, casa.canton, "Costa Rica"].filter(Boolean).join(", ") : null,
    inicio: new Date(f.inicio),
    fin: new Date(f.fin),
    invitado: cliente?.email ?? null,
  };
}

export async function sincronizarVisitas(
  db: SupabaseClient,
  conexion: ConexionGoogle,
  corredor: { id: string; nombre_contacto: string },
): Promise<{ creados: number; actualizados: number; borrados: number; fallidos: number }> {
  const r = { creados: 0, actualizados: 0, borrados: 0, fallidos: 0 };
  const desde = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data, error } = await db
    .from("citas")
    .select("id, inicio, fin, estado, calendario_evento_id, calendario_sincronizado_at, updated_at, contactos(nombre, telefono, email), propiedades(titulo, zona, canton)")
    .eq("corredor_id", corredor.id)
    .gte("inicio", desde)
    .limit(300);
  if (error) throw new Error(`citas_${error.code}`);

  let acceso: string;
  try {
    acceso = await conexion.acceso();
  } catch {
    return { ...r, fallidos: 1 };
  }
  for (const f of (data ?? []) as unknown as Fila[]) {
    const activa = f.estado === "agendada" || f.estado === "confirmada";
    const cambio =
      !f.calendario_sincronizado_at || Date.parse(f.updated_at) - Date.parse(f.calendario_sincronizado_at) > TOLERANCIA_MS;
    try {
      if (activa && !f.calendario_evento_id) {
        const id = await crearEvento(acceso, conexion.calendario, evento(f, corredor.nombre_contacto));
        await marcar(db, corredor.id, f.id, id);
        r.creados++;
      } else if (activa && f.calendario_evento_id && cambio) {
        await actualizarEvento(acceso, conexion.calendario, f.calendario_evento_id, evento(f, corredor.nombre_contacto));
        await marcar(db, corredor.id, f.id, f.calendario_evento_id);
        r.actualizados++;
      } else if (!activa && f.estado === "cancelada" && f.calendario_evento_id) {
        await borrarEvento(acceso, conexion.calendario, f.calendario_evento_id);
        await marcar(db, corredor.id, f.id, null);
        r.borrados++;
      }
    } catch (e) {
      r.fallidos++;
      await anotarError(db, corredor.id, errorSeguro(e));
    }
  }
  return r;
}

async function marcar(db: SupabaseClient, corredorId: string, citaId: string, eventoId: string | null) {
  await db
    .from("citas")
    .update({ calendario_evento_id: eventoId, calendario_sincronizado_at: new Date().toISOString() })
    .eq("corredor_id", corredorId)
    .eq("id", citaId);
}

/**
 * Lo que el corredor ya tiene ocupado en Google (sin contar las visitas que puso la asistente, que ya
 * están en la agenda). Si Google falla, la agenda sigue con lo propio: mejor ofrecer horarios que no
 * contestar.
 */
export async function ocupadoEnGoogle(conexion: ConexionGoogle, desde: Date, hasta: Date): Promise<{ inicio: Date; fin: Date }[]> {
  try {
    return await ocupado(await conexion.acceso(), conexion.calendario, desde, hasta);
  } catch {
    return [];
  }
}
