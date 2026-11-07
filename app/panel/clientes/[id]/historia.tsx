import type { SupabaseClient } from "@supabase/supabase-js";
import { etiquetaHorario } from "@/lib/agenda/formato";
import { ANOTAR, NOMBRE_ACTIVIDAD, type TipoActividad } from "@/lib/crm/actividades";
import { anotarActividad } from "../acciones";

// Historia del cliente: lo que anotó el corredor, cambios de etapa, ofertas, visitas, correos y los días
// en que escribió por WhatsApp, del más nuevo al más viejo. Arriba, "Anotar" con botones.

type Evento = { cuando: Date; tipo: string; texto: string; autor?: string };

const ESTADO_VISITA: Record<string, string> = {
  agendada: "agendada",
  confirmada: "confirmada",
  cancelada: "cancelada",
  realizada: "hecha",
  no_asistio: "no llegó",
};

export async function Historia({
  supabase,
  corredorId,
  contactoId,
  zona,
  nombreAsistente,
}: {
  supabase: SupabaseClient;
  corredorId: string;
  contactoId: string;
  zona: string;
  nombreAsistente: string;
}) {
  const [{ data: actividades }, { data: citas }, { data: correos }, { data: conv }] = await Promise.all([
    supabase.from("actividades").select("tipo, texto, autor, created_at").eq("corredor_id", corredorId).eq("contacto_id", contactoId).order("created_at", { ascending: false }).limit(60),
    supabase.from("citas").select("inicio, estado, created_at, propiedades(titulo)").eq("corredor_id", corredorId).eq("contacto_id", contactoId).limit(20),
    supabase.from("correos_procesados").select("asunto, resumen, created_at").eq("corredor_id", corredorId).eq("contacto_id", contactoId).limit(20),
    supabase.from("conversaciones").select("id").eq("corredor_id", corredorId).eq("contacto_id", contactoId).limit(1).maybeSingle(),
  ]);
  const { data: mensajes } = conv
    ? await supabase.from("mensajes").select("direccion, autor, created_at").eq("corredor_id", corredorId).eq("conversacion_id", conv.id).order("created_at", { ascending: false }).limit(300)
    : { data: [] };

  const eventos: Evento[] = [
    ...(actividades ?? []).map((a) => ({ cuando: new Date(a.created_at as string), tipo: a.tipo as string, texto: a.texto as string, autor: a.autor as string })),
    ...(citas ?? []).map((c) => {
      const casa = (Array.isArray(c.propiedades) ? c.propiedades[0] : c.propiedades) as { titulo: string } | null;
      return {
        cuando: new Date(c.created_at as string),
        tipo: "visita",
        texto: `Visita del ${etiquetaHorario(new Date(c.inicio as string), zona)}${casa ? ` a ${casa.titulo}` : ""}: ${ESTADO_VISITA[c.estado as string] ?? c.estado}`,
      };
    }),
    ...(correos ?? []).map((c) => ({ cuando: new Date(c.created_at as string), tipo: "correo", texto: `Escribió por correo: ${(c.resumen as string | null) ?? (c.asunto as string | null) ?? "sin asunto"}` })),
  ];
  // Los mensajes de WhatsApp se agrupan por día: "Escribió 3 mensajes · la asistente contestó 2".
  const porDia = new Map<string, { cuando: Date; cliente: number; asistente: number; corredor: number }>();
  for (const m of (mensajes ?? []) as { direccion: string; autor: string; created_at: string }[]) {
    const d = new Date(m.created_at);
    const k = d.toISOString().slice(0, 10);
    const g = porDia.get(k) ?? { cuando: d, cliente: 0, asistente: 0, corredor: 0 };
    if (m.autor === "cliente") g.cliente++;
    else if (m.autor === "asistente") g.asistente++;
    else if (m.autor === "corredor") g.corredor++;
    if (d > g.cuando) g.cuando = d;
    porDia.set(k, g);
  }
  for (const g of porDia.values()) {
    const partes = [
      g.cliente ? `escribió ${g.cliente} ${g.cliente === 1 ? "mensaje" : "mensajes"}` : null,
      g.asistente ? `${nombreAsistente} contestó ${g.asistente}` : null,
      g.corredor ? `tú le escribiste ${g.corredor}` : null,
    ].filter(Boolean);
    if (partes.length) eventos.push({ cuando: g.cuando, tipo: "whatsapp", texto: `WhatsApp: ${partes.join(" · ")}` });
  }
  eventos.sort((a, b) => b.cuando.getTime() - a.cuando.getTime());

  return (
    <section className="tarjeta pila historia" data-patty="cliente-historia">
      <h2>Historia</h2>
      <form action={anotarActividad} className="anotar">
        <input type="hidden" name="id" value={contactoId} />
        <input name="texto" type="text" maxLength={500} placeholder="¿Qué pasó? Por ejemplo: le gustó la casa pero quiere bajar el precio" aria-label="Qué pasó" />
        <div className="anotar-botones">
          {ANOTAR.map((a) => (
            <button key={a.tipo} type="submit" name="tipo" value={a.tipo} className={a.tipo === "llamada" ? "primario" : undefined}>
              {a.nombre}
            </button>
          ))}
        </div>
      </form>
      {eventos.length === 0 ? (
        <p className="suave">Todavía no hay nada. Cuando lo llames o le escribas, anótalo aquí.</p>
      ) : (
        <ol className="historia-lista">
          {eventos.slice(0, 40).map((e, i) => (
            <li key={i} className={`historia-${e.tipo}`}>
              <span className="historia-punto" aria-hidden />
              <span className="historia-texto">
                <strong>{NOMBRE_ACTIVIDAD[e.tipo as TipoActividad] ?? (e.tipo === "whatsapp" ? "WhatsApp" : "Otro")}</strong>
                {e.autor === "asistente" ? ` · ${nombreAsistente}` : ""} — {e.texto.replace(/^WhatsApp: /, "")}
              </span>
              <time className="suave">{etiquetaHorario(e.cuando, zona)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
