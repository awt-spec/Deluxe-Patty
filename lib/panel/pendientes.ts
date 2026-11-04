import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccionPendiente } from "../datos/tipos";

// Lo que espera a la corredora: respuestas de la asistente por aprobar y clientes que pidieron hablar
// con ella. Lo usan el inicio (cuántos y el botón "Revisar") y la pantalla Revisar (uno a la vez).
// Se lee con la sesión de la corredora (RLS).

export type Contacto = { id: string; nombre: string | null; telefono: string };

export type Pendiente =
  | {
      tipo: "respuesta";
      mensajeId: string;
      conversacionId: string;
      contacto: Contacto;
      propuesta: string;
      accion: AccionPendiente | null;
      dijo: string | null;
      /** El cliente escribió hace menos de 24 horas: WhatsApp deja contestarle desde aquí. */
      abierta: boolean;
    }
  | { tipo: "hablar"; conversacionId: string; contacto: Contacto; dijo: string | null };

const DIA = 24 * 60 * 60_000;
const uno = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);

export async function pendientesDe(supabase: SupabaseClient, corredorId: string, ahora = new Date()): Promise<Pendiente[]> {
  const [{ data: borradores }, { data: escaladas }] = await Promise.all([
    supabase
      .from("mensajes")
      .select("id, conversacion_id, contenido, accion, conversaciones!inner(ultimo_mensaje_cliente_at, contactos!inner(id, nombre, telefono, es_corredor))")
      .eq("corredor_id", corredorId)
      .eq("estado_borrador", "pendiente")
      .eq("conversaciones.contactos.es_corredor", false)
      .order("created_at"),
    supabase
      .from("conversaciones")
      .select("id, contactos!inner(id, nombre, telefono, es_corredor)")
      .eq("corredor_id", corredorId)
      .eq("estado", "escalada")
      .eq("contactos.es_corredor", false)
      .order("updated_at"),
  ]);

  const conBorrador = new Set((borradores ?? []).map((b) => b.conversacion_id as string));
  const ids = [...conBorrador, ...(escaladas ?? []).map((c) => c.id as string)];
  // Último mensaje del cliente en cada chat, para mostrar qué dijo.
  const { data: entrantes } = ids.length
    ? await supabase
        .from("mensajes")
        .select("conversacion_id, contenido")
        .eq("corredor_id", corredorId)
        .eq("direccion", "entrante")
        .in("conversacion_id", ids)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] };
  const dijo = new Map<string, string | null>();
  for (const m of entrantes ?? []) if (!dijo.has(m.conversacion_id as string)) dijo.set(m.conversacion_id as string, m.contenido as string | null);

  const respuestas: Pendiente[] = (borradores ?? []).map((b) => {
    const conv = uno(b.conversaciones as unknown as { ultimo_mensaje_cliente_at: string | null; contactos: Contacto | Contacto[] });
    const ultimo = conv.ultimo_mensaje_cliente_at;
    return {
      tipo: "respuesta",
      mensajeId: b.id as string,
      conversacionId: b.conversacion_id as string,
      contacto: uno(conv.contactos),
      propuesta: (b.contenido as string | null) ?? "",
      accion: (b.accion as AccionPendiente | null) ?? null,
      dijo: dijo.get(b.conversacion_id as string) ?? null,
      abierta: !!ultimo && ahora.getTime() - Date.parse(ultimo) < DIA,
    };
  });
  const hablar: Pendiente[] = (escaladas ?? [])
    .filter((c) => !conBorrador.has(c.id as string))
    .map((c) => ({
      tipo: "hablar",
      conversacionId: c.id as string,
      contacto: uno(c.contactos as unknown as Contacto | Contacto[]),
      dijo: dijo.get(c.id as string) ?? null,
    }));
  return [...respuestas, ...hablar];
}
