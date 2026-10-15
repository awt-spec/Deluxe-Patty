import type { SupabaseClient } from "@supabase/supabase-js";

// Revisión periódica de la operación: costo del día y mensajes que WhatsApp no entregó.

export interface Hallazgo {
  clave: string;
  texto: string;
}

export async function revisarSalud(db: SupabaseClient, ahora = new Date()): Promise<Hallazgo[]> {
  const limiteCosto = Number(process.env.COSTO_DIARIO_ALERTA_USD ?? "3");
  const hallazgos: Hallazgo[] = [];

  const { data: corredores, error } = await db.from("corredores").select("id, nombre, zona_horaria").eq("activo", true);
  if (error) throw new Error(`corredores: ${error.message}`);

  for (const c of corredores ?? []) {
    const dia = new Intl.DateTimeFormat("en-CA", { timeZone: c.zona_horaria as string }).format(ahora);
    const { data: uso } = await db
      .from("uso_diario")
      .select("costo_claude_usd, mensajes")
      .eq("corredor_id", c.id)
      .eq("dia", dia)
      .maybeSingle();
    const costo = Number(uso?.costo_claude_usd ?? 0);
    if (costo > limiteCosto) {
      hallazgos.push({
        clave: `costo:${c.id}:${dia}`,
        texto: `${c.nombre}: costo de IA de hoy USD ${costo.toFixed(2)} (límite ${limiteCosto}), ${uso?.mensajes ?? 0} mensajes`,
      });
    }

    const { count } = await db
      .from("mensajes")
      .select("id", { count: "exact", head: true })
      .eq("corredor_id", c.id)
      .eq("estado_entrega", "fallido")
      .gte("created_at", new Date(ahora.getTime() - 60 * 60_000).toISOString());
    if ((count ?? 0) >= 3) {
      hallazgos.push({ clave: `fallidos:${c.id}`, texto: `${c.nombre}: ${count} mensajes de WhatsApp sin entregar en la última hora` });
    }
  }
  return hallazgos;
}
