// Puesta en marcha (/panel/empezar) y "¿Lista para contestar sola?" (/panel/empezar/sola): qué está hecho, leído de
// los datos reales del corredor con su sesión (RLS) y decidido por código. Las reglas de casas, fotos, horario, tono
// y temas son las mismas de "Qué tan lista está" del Cerebro (listaPreparacion), así las dos pantallas coinciden.

import type { SupabaseClient } from "@supabase/supabase-js";
import { listaPreparacion } from "@/app/panel/cerebro/resumen";

export const PASOS_PUESTA = ["casas", "fichas", "horario", "tono", "temas", "google"] as const;
export type PasoPuesta = (typeof PASOS_PUESTA)[number];

/** Los pasos que hay que tener para que la tarjeta de Inicio desaparezca (Google es opcional). */
export const OBLIGATORIOS: readonly PasoPuesta[] = ["casas", "fichas", "horario", "tono", "temas"];

export type CasaPuesta = { id: string; titulo: string; codigo: string; precio: number | null; fotos: number };

export interface DatosPuesta {
  /** Casas activas (las que la asistente ofrece). */
  casas: CasaPuesta[];
  franjas: number;
  tono: string;
  temas: string[];
  google: boolean;
}

export interface EstadoPuesta {
  hechos: PasoPuesta[];
  listos: number;
  total: number;
  /** Lo obligatorio está hecho: la tarjeta de Inicio y el enlace de Más ya no salen. */
  completa: boolean;
  /** Casas activas sin precio o sin fotos (para listarlas con su enlace). */
  incompletas: CasaPuesta[];
}

export function estadoPuesta(d: DatosPuesta): EstadoPuesta {
  const lista = listaPreparacion({
    casas: d.casas,
    franjas: d.franjas,
    tono: d.tono,
    temasCorredor: d.temas.length,
    // Lo enseñado y las preguntas no son parte de la puesta en marcha (se ven en el Cerebro).
    sabe: 0,
    preguntas: 0,
  });
  const listo = (clave: string) => lista.find((r) => r.clave === clave)?.listo === true;
  const hecho: Record<PasoPuesta, boolean> = {
    casas: listo("casas"),
    fichas: listo("fichas"),
    horario: listo("horario"),
    tono: listo("tono"),
    temas: listo("temas"),
    google: d.google,
  };
  const hechos = PASOS_PUESTA.filter((p) => hecho[p]);
  return {
    hechos,
    listos: hechos.length,
    total: PASOS_PUESTA.length,
    completa: OBLIGATORIOS.every((p) => hecho[p]),
    incompletas: d.casas.filter((c) => !c.precio || c.fotos === 0),
  };
}

/** Lee lo necesario con la sesión del corredor (RLS), siempre filtrando por su corredor_id. */
export async function datosPuesta(
  supabase: SupabaseClient,
  corredor: { id: string; tono: string | null; reglas_escalamiento: string[] | null },
): Promise<DatosPuesta> {
  const [{ data: casas }, { count: franjas }, { data: google }] = await Promise.all([
    supabase.from("propiedades").select("id, titulo, codigo, precio, fotos").eq("corredor_id", corredor.id).eq("estado", "activa").limit(300),
    supabase.from("horarios_visitas").select("id", { count: "exact", head: true }).eq("corredor_id", corredor.id),
    supabase.from("google_conexiones").select("correo").eq("corredor_id", corredor.id).limit(1),
  ]);
  return {
    casas: ((casas ?? []) as { id: string; titulo: string; codigo: string; precio: number | null; fotos: unknown[] | null }[]).map((c) => ({
      id: c.id,
      titulo: c.titulo,
      codigo: c.codigo,
      precio: c.precio,
      fotos: Array.isArray(c.fotos) ? c.fotos.length : 0,
    })),
    franjas: franjas ?? 0,
    tono: corredor.tono ?? "",
    temas: corredor.reglas_escalamiento ?? [],
    google: ((google ?? []) as unknown[]).length > 0,
  };
}

// --- ¿Lista para contestar sola? ------------------------------------------------------------------------------

export interface Revisadas {
  /** Respuestas que el corredor aprobó tal cual (mensajes.estado_borrador = 'aprobado'). */
  aprobadas: number;
  corregidas: number;
  descartadas: number;
}

/** Con menos de esto, las cifras no alcanzan para decir nada. */
export const MINIMO_REVISADAS = 15;

export interface Veredicto {
  total: number;
  /** Porcentaje (0–100, entero) aprobado sin cambios. */
  bien: number;
  tono: "pocas" | "lista" | "casi" | "todavia";
  titulo: string;
  detalle: string;
}

/** Cómo le ha ido en las respuestas que revisó el corredor: solo cifras contadas, nada inventado. */
export function comoLeHaIdo(r: Revisadas, nombre: string): Veredicto {
  const total = r.aprobadas + r.corregidas + r.descartadas;
  const bien = total ? Math.round((r.aprobadas / total) * 100) : 0;
  if (total < MINIMO_REVISADAS) {
    return {
      total,
      bien,
      tono: "pocas",
      titulo: "Todavía son pocas respuestas para saberlo",
      detalle: total
        ? `Revisaste ${total} ${total === 1 ? "respuesta" : "respuestas"} en 30 días. Con unas ${MINIMO_REVISADAS} se ve mejor si ${nombre} ya escribe como tú. También puedes probarla tú misma.`
        : `En 30 días no revisaste respuestas de ${nombre}. Pruébala tú misma escribiéndole como un cliente.`,
    };
  }
  if (bien >= 85) {
    return {
      total,
      bien,
      tono: "lista",
      titulo: `${nombre} parece lista`,
      detalle: `De ${total} respuestas, aprobaste ${r.aprobadas} sin cambiar nada (${bien} de cada 100).`,
    };
  }
  if (bien >= 65) {
    return {
      total,
      bien,
      tono: "casi",
      titulo: "Va bien, pero todavía corriges varias",
      detalle: `De ${total} respuestas, aprobaste ${r.aprobadas} sin cambios (${bien} de cada 100). Revisa qué corriges: si es siempre lo mismo, enséñaselo.`,
    };
  }
  return {
    total,
    bien,
    tono: "todavia",
    titulo: "Todavía le corriges mucho",
    detalle: `De ${total} respuestas, aprobaste ${r.aprobadas} sin cambios (${bien} de cada 100). Mejor esperar y enseñarle lo que corriges.`,
  };
}

/** Cuenta las respuestas revisadas de los últimos 30 días con la sesión del corredor. */
export async function revisadas(supabase: SupabaseClient, corredorId: string, ahora = new Date()): Promise<Revisadas> {
  const desde = new Date(ahora.getTime() - 30 * 24 * 60 * 60_000).toISOString();
  const contar = async (estado: string) => {
    const { count } = await supabase
      .from("mensajes")
      .select("id", { count: "exact", head: true })
      .eq("corredor_id", corredorId)
      .eq("estado_borrador", estado)
      .gte("created_at", desde);
    return count ?? 0;
  };
  const [aprobadas, corregidas, descartadas] = await Promise.all([contar("aprobado"), contar("corregido"), contar("descartado")]);
  return { aprobadas, corregidas, descartadas };
}
