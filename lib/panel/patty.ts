import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { etiquetaHorario } from "../agenda/formato";
import { fechaIso, fechaLocal } from "../agenda/tiempo";
import { fichaPropiedades, RechazoModelo } from "../asistente/cerebro";
import { hayPresupuestoHoy } from "../asistente/limites";
import { armarPlan, datosDelPlan } from "../asistente/plan";
import type { Dependencias } from "../asistente/procesar";
import { NOMBRE_ETAPA, resumenBusca, type Busca, type Etapa } from "../crm/perfil";
import type { Corredor } from "../datos/tipos";
import { errorSeguro } from "../monitoreo/errores";

// Chat del corredor con su asistente (Patty) desde cualquier página del panel. Patty contesta con un
// resumen del negocio que arma el código (plan de hoy, clientes, visitas y casas): no escribe en la base,
// no manda mensajes ni agenda. La conversación vive en el navegador; aquí solo se cuenta el costo.

export interface TurnoPatty {
  autor: "corredor" | "asistente";
  texto: string;
}

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Lo que Patty sabe del negocio en este momento, en texto. */
export async function contextoPatty(deps: Dependencias, db: SupabaseClient, corredor: Corredor, ahora = new Date()): Promise<string> {
  const zona = corredor.zona_horaria;
  const hoy = fechaIso(fechaLocal(ahora, zona));
  const en7 = new Date(ahora.getTime() + 7 * 24 * 60 * 60_000);
  const [plan, propiedades, { data: clientes }, { data: citas }, { data: dudas }] = await Promise.all([
    datosDelPlan(deps, corredor, ahora),
    deps.repo.propiedadesActivas(corredor.id),
    db
      .from("contactos")
      .select("nombre, telefono, etapa, etapa_at, busca, seguimiento_fecha, seguimiento_nota, motivo_perdida, updated_at")
      .eq("corredor_id", corredor.id)
      .eq("es_corredor", false)
      .order("updated_at", { ascending: false })
      .limit(80),
    db
      .from("citas")
      .select("inicio, estado, contactos(nombre, telefono), propiedades(titulo, zona)")
      .eq("corredor_id", corredor.id)
      .in("estado", ["agendada", "confirmada"])
      .gte("inicio", ahora.toISOString())
      .lt("inicio", en7.toISOString())
      .order("inicio")
      .limit(40),
    db.from("conocimiento").select("tema").eq("corredor_id", corredor.id).eq("estado", "pendiente").limit(10),
  ]);

  const lineasClientes = ((clientes ?? []) as {
    nombre: string | null;
    telefono: string;
    etapa: Etapa;
    etapa_at: string;
    busca: Busca;
    seguimiento_fecha: string | null;
    seguimiento_nota: string | null;
    motivo_perdida: string | null;
  }[]).map((c) => {
    const dias = Math.floor((ahora.getTime() - Date.parse(c.etapa_at)) / 86_400_000);
    return [
      `- ${c.nombre ?? c.telefono}: ${NOMBRE_ETAPA[c.etapa]} (hace ${dias} días)`,
      resumenBusca(c.busca ?? {}) ? `busca ${resumenBusca(c.busca)}` : null,
      c.seguimiento_fecha ? `recordatorio ${c.seguimiento_fecha <= hoy ? "para hoy o vencido" : c.seguimiento_fecha}: ${c.seguimiento_nota ?? "escribirle"}` : null,
      c.motivo_perdida ? `se perdió: ${c.motivo_perdida}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  });

  const lineasCitas = ((citas ?? []) as unknown as {
    inicio: string;
    estado: string;
    contactos: { nombre: string | null; telefono: string } | null;
    propiedades: { titulo: string; zona: string | null } | null;
  }[]).map((c) => {
    const cl = uno(c.contactos);
    const casa = uno(c.propiedades);
    return `- ${etiquetaHorario(new Date(c.inicio), zona)}: ${cl?.nombre ?? cl?.telefono ?? "cliente"}${casa ? `, ${casa.titulo}${casa.zona ? ` (${casa.zona})` : ""}` : ""}${c.estado === "confirmada" ? ", confirmada" : ", por confirmar"}`;
  });

  return [
    `Ahora: ${etiquetaHorario(ahora, zona)}.`,
    corredor.zona_base ? `${corredor.nombre_contacto} sale cada día desde ${corredor.zona_base}.` : null,
    `Plan de hoy:\n${armarPlan(corredor, plan, ahora)}`,
    `Visitas de los próximos 7 días:\n${lineasCitas.join("\n") || "- ninguna"}`,
    `Clientes (los más recientes primero):\n${lineasClientes.join("\n") || "- todavía no hay"}`,
    `Preguntas de clientes que la asistente no supo contestar: ${(dudas ?? []).map((d) => d.tema as string).join("; ") || "ninguna"}`,
    `Casas activas:\n${fichaPropiedades(propiedades)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function hablarConPatty(
  deps: Dependencias,
  db: SupabaseClient,
  corredor: Corredor,
  historial: TurnoPatty[],
  mensaje: string,
): Promise<{ ok: true; texto: string } | { ok: false; motivo: string }> {
  const limpio = mensaje.trim().slice(0, 4000);
  if (!limpio) return { ok: false, motivo: "Escribe algo para Patty." };
  if (!(await hayPresupuestoHoy(deps.repo, corredor))) {
    return { ok: false, motivo: "Por hoy se llegó al tope de uso de la asistente. Mañana sigue." };
  }
  const registrarCosto = (c: { tokensEntrada: number; tokensSalida: number; costoUsd: number }) =>
    deps.repo.registrarUso(corredor.id, { llamadasClaude: 1, tokensEntrada: c.tokensEntrada, tokensSalida: c.tokensSalida, costoClaudeUsd: c.costoUsd });
  try {
    const contexto = await contextoPatty(deps, db, corredor);
    const r = await deps.cerebro.conversarConCorredor(corredor, contexto, historial.slice(-12), limpio);
    await registrarCosto(r.consumo);
    return { ok: true, texto: r.texto };
  } catch (e) {
    if (e instanceof RechazoModelo) await registrarCosto(e.consumo);
    console.error(JSON.stringify({ evento: "error_patty", corredorId: corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude contestar ahora. Inténtalo de nuevo en un momento." };
  }
}
