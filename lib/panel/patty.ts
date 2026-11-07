import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { etiquetaHorario } from "../agenda/formato";
import { fechaIso, fechaLocal } from "../agenda/tiempo";
import { fichaPropiedades, RechazoModelo, type Adjunto } from "../asistente/cerebro";
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
      .select("id, nombre, telefono, etapa, etapa_at, busca, seguimiento_fecha, seguimiento_nota, motivo_perdida, updated_at, oferta_monto, cierre_precio, cierre_comision, cierre_at, ultima_actividad_at")
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
  // Lo último que pasó con cada cliente (para no sugerir llamar a quien ya llamó hoy).
  const { data: actividades } = await db
    .from("actividades")
    .select("contacto_id, tipo, texto, created_at")
    .eq("corredor_id", corredor.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const ultimas = new Map<string, string[]>();
  for (const a of (actividades ?? []) as { contacto_id: string; tipo: string; texto: string; created_at: string }[]) {
    const l = ultimas.get(a.contacto_id) ?? [];
    if (l.length < 2) l.push(`${a.texto} (${etiquetaHorario(new Date(a.created_at), zona).split(",")[0]})`);
    ultimas.set(a.contacto_id, l);
  }

  const lineasClientes = ((clientes ?? []) as {
    id: string;
    oferta_monto: number | null;
    cierre_precio: number | null;
    cierre_comision: number | null;
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
      c.oferta_monto ? `ofreció $${Number(c.oferta_monto).toLocaleString("es-CR")}` : null,
      c.cierre_precio ? `cerró en $${Number(c.cierre_precio).toLocaleString("es-CR")} (comisión $${Number(c.cierre_comision ?? 0).toLocaleString("es-CR")})` : null,
      ultimas.get(c.id)?.length ? `lo último: ${ultimas.get(c.id)!.join("; ")}` : null,
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
    `Comisión de ${corredor.nombre_contacto}: ${corredor.comision_pct ?? 5}% del precio.`,
    `Casas activas:\n${fichaPropiedades(propiedades)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const PANTALLAS: [RegExp, string][] = [
  [/^\/panel\/?$/, "Inicio"],
  [/^\/panel\/revisar/, "Revisar respuestas"],
  [/^\/panel\/clientes\/nuevo/, "Agregar cliente"],
  [/^\/panel\/clientes\/[0-9a-f-]{36}/, "Ficha de un cliente"],
  [/^\/panel\/clientes/, "Clientes"],
  [/^\/panel\/agenda\/horario/, "Mi horario"],
  [/^\/panel\/agenda\/nueva/, "Agendar una visita"],
  [/^\/panel\/agenda\/visita\//, "Una visita"],
  [/^\/panel\/agenda/, "Agenda"],
  [/^\/panel\/propiedades\/nueva/, "Agregar casa"],
  [/^\/panel\/propiedades\/[0-9a-f-]{36}/, "Ficha de una casa"],
  [/^\/panel\/propiedades/, "Mis casas"],
  [/^\/panel\/cerebro/, "Cerebro de la asistente"],
  [/^\/panel\/duenos/, "Dueños directos"],
  [/^\/panel\/anuncios/, "Anuncios"],
  [/^\/panel\/ajustes/, "Ajustes"],
  [/^\/panel\/mas/, "Más"],
];

/** Qué pantalla está viendo el corredor y, si es la ficha de un cliente, una visita o una casa, sus datos. */
export async function contextoPantalla(db: SupabaseClient, corredor: Corredor, ruta: string): Promise<string> {
  const camino = ruta.split("?")[0];
  const nombre = PANTALLAS.find(([r]) => r.test(camino))?.[1] ?? "Panel";
  const id = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(camino)?.[1];
  const zona = corredor.zona_horaria;
  const lineas = [`Pantalla: ${nombre}.`];
  if (id && camino.startsWith("/panel/clientes/")) {
    const [{ data: c }, { data: citas }, { data: conv }] = await Promise.all([
      db.from("contactos").select("nombre, telefono, email, origen, etapa, busca, notas, seguimiento_fecha, seguimiento_nota, motivo_perdida, created_at").eq("corredor_id", corredor.id).eq("id", id).maybeSingle(),
      db.from("citas").select("inicio, estado, propiedades(titulo)").eq("corredor_id", corredor.id).eq("contacto_id", id).order("inicio", { ascending: false }).limit(5),
      db.from("conversaciones").select("id").eq("corredor_id", corredor.id).eq("contacto_id", id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (c) {
      lineas.push(
        `Cliente: ${c.nombre ?? c.telefono}. Etapa: ${NOMBRE_ETAPA[c.etapa as Etapa]}. Llegó por ${c.origen}.`,
        `Busca: ${resumenBusca((c.busca ?? {}) as Busca) || "todavía no lo dijo"}.`,
        c.seguimiento_fecha ? `Recordatorio ${c.seguimiento_fecha}: ${c.seguimiento_nota ?? "escribirle"}.` : "Sin recordatorio.",
        c.notas ? `Notas del corredor: ${String(c.notas).slice(0, 800)}` : "Sin notas.",
        c.motivo_perdida ? `Se perdió: ${c.motivo_perdida}.` : "",
        `Visitas: ${(citas ?? [])
          .map((v) => {
            const casa = uno(v.propiedades as unknown as { titulo: string } | null);
            return `${etiquetaHorario(new Date(v.inicio as string), zona)} (${v.estado}${casa ? `, ${casa.titulo}` : ""})`;
          })
          .join("; ") || "ninguna"}.`,
      );
      if (conv) {
        const { data: msjs } = await db
          .from("mensajes")
          .select("autor, contenido")
          .eq("corredor_id", corredor.id)
          .eq("conversacion_id", conv.id)
          .neq("estado_borrador", "descartado")
          .order("created_at", { ascending: false })
          .limit(10);
        const chat = (msjs ?? []).reverse().map((m) => `${m.autor === "cliente" ? "Cliente" : m.autor === "corredor" ? corredor.nombre_contacto : "Asistente"}: ${String(m.contenido ?? "(archivo)").slice(0, 300)}`);
        if (chat.length) lineas.push(`Últimos mensajes del chat de WhatsApp:\n${chat.join("\n")}`);
      }
    }
  } else if (id && camino.startsWith("/panel/agenda/visita/")) {
    const { data: v } = await db.from("citas").select("inicio, estado, contactos(nombre, telefono, busca), propiedades(titulo, zona)").eq("corredor_id", corredor.id).eq("id", id).maybeSingle();
    if (v) {
      const cl = uno(v.contactos as never) as { nombre: string | null; telefono: string; busca: Busca } | null;
      const casa = uno(v.propiedades as never) as { titulo: string; zona: string | null } | null;
      lineas.push(`Visita: ${etiquetaHorario(new Date(v.inicio as string), zona)}, ${v.estado}, con ${cl?.nombre ?? cl?.telefono ?? "un cliente"}${casa ? `, para ver ${casa.titulo}${casa.zona ? ` en ${casa.zona}` : ""}` : ""}. El cliente busca: ${resumenBusca(cl?.busca ?? {}) || "no lo dijo"}.`);
    }
  } else if (id && camino.startsWith("/panel/propiedades/")) {
    const { data: p } = await db.from("propiedades").select("codigo, titulo, estado, operacion, tipo, precio, moneda, zona, habitaciones, banos, descripcion").eq("corredor_id", corredor.id).eq("id", id).maybeSingle();
    if (p) lineas.push(`Casa: ${JSON.stringify(p).slice(0, 1500)}`);
  }
  return lineas.filter(Boolean).join("\n");
}

export async function hablarConPatty(
  deps: Dependencias,
  db: SupabaseClient,
  corredor: Corredor,
  historial: TurnoPatty[],
  mensaje: string,
  ruta = "/panel",
  adjuntos: Adjunto[] = [],
): Promise<{ ok: true; texto: string } | { ok: false; motivo: string }> {
  const limpio = mensaje.trim().slice(0, 4000) || (adjuntos.length ? "Revisa lo que te adjunto y dime qué ves o qué me recomiendas." : "");
  if (!limpio) return { ok: false, motivo: "Escribe algo para Patty." };
  if (!(await hayPresupuestoHoy(deps.repo, corredor))) {
    return { ok: false, motivo: "Por hoy se llegó al tope de uso de la asistente. Mañana sigue." };
  }
  const registrarCosto = (c: { tokensEntrada: number; tokensSalida: number; costoUsd: number }) =>
    deps.repo.registrarUso(corredor.id, { llamadasClaude: 1, tokensEntrada: c.tokensEntrada, tokensSalida: c.tokensSalida, costoClaudeUsd: c.costoUsd });
  try {
    const [negocio, pantalla] = await Promise.all([contextoPatty(deps, db, corredor), contextoPantalla(db, corredor, ruta)]);
    const contexto = `<pantalla_actual>\n${pantalla}\n</pantalla_actual>\n\n${negocio}`;
    const r = await deps.cerebro.conversarConCorredor(corredor, contexto, historial.slice(-12), limpio, adjuntos);
    await registrarCosto(r.consumo);
    return { ok: true, texto: r.texto };
  } catch (e) {
    if (e instanceof RechazoModelo) await registrarCosto(e.consumo);
    console.error(JSON.stringify({ evento: "error_patty", corredorId: corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude contestar ahora. Inténtalo de nuevo en un momento." };
  }
}
