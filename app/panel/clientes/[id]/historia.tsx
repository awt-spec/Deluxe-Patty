import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { etiquetaHorario, horaCorta } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal } from "@/lib/agenda/tiempo";
import { ANOTAR, NOMBRE_ACTIVIDAD, type TipoActividad } from "@/lib/crm/actividades";
import { Vacio } from "../../piezas";
import { IconoAgenda, IconoChats, IconoCheck, IconoCorreo, IconoEnviar, IconoEstrella, IconoFlecha, IconoLapiz, IconoMas, IconoReloj, IconoTelefono } from "../../iconos";
import { anotarActividad } from "../acciones";
import { agruparPorDia } from "./que-sigue";

// Historia del cliente: lo que anotó el corredor, cambios de etapa, ofertas, visitas, correos y los días
// en que escribió por WhatsApp, del más nuevo al más viejo y agrupado por día. Arriba, "Anotar" con botones.

export type EventoHistoria = { cuando: Date; tipo: string; texto: string; autor?: string; href?: string };
export type CitaHistoria = { id: string; inicio: string; estado: string; created_at: string; casa: string | null };

const ESTADO_VISITA: Record<string, string> = {
  agendada: "Por confirmar",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  realizada: "Hecha",
  no_asistio: "No llegó",
};

/** Cuántos eventos se ven sin abrir "Ver todo". */
const VISIBLES = 10;

const ICONO: Record<string, (p: { tamano?: number }) => React.ReactNode> = {
  llamada: IconoTelefono,
  mensaje: IconoEnviar,
  visita: IconoAgenda,
  nota: IconoLapiz,
  correo: IconoCorreo,
  etapa: IconoFlecha,
  oferta: IconoEstrella,
  cierre: IconoCheck,
  whatsapp: IconoChats,
  otro: IconoMas,
};

/** Lee la historia (cada consulta filtra por el corredor) y de paso dice cuándo escribió por última vez. */
export async function cargarHistoria(
  supabase: SupabaseClient,
  corredorId: string,
  contactoId: string,
  conversacionId: string | null,
  citas: CitaHistoria[],
  zona: string,
  nombreAsistente: string,
): Promise<{ eventos: EventoHistoria[]; ultimoMensaje: Date | null; vinoDelSitio: boolean }> {
  const [{ data: actividades }, { data: correos }, { data: mensajes }] = await Promise.all([
    supabase.from("actividades").select("tipo, texto, autor, created_at").eq("corredor_id", corredorId).eq("contacto_id", contactoId).order("created_at", { ascending: false }).limit(60),
    supabase.from("correos_procesados").select("asunto, resumen, created_at").eq("corredor_id", corredorId).eq("contacto_id", contactoId).limit(20),
    conversacionId
      ? supabase.from("mensajes").select("direccion, autor, created_at").eq("corredor_id", corredorId).eq("conversacion_id", conversacionId).order("created_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as { direccion: string; autor: string; created_at: string }[] }),
  ]);

  const eventos: EventoHistoria[] = [
    ...(actividades ?? []).map((a) => ({ cuando: new Date(a.created_at as string), tipo: a.tipo as string, texto: a.texto as string, autor: a.autor as string })),
    ...citas.map((c) => ({
      cuando: new Date(c.created_at),
      tipo: "visita",
      texto: `${ESTADO_VISITA[c.estado] ?? c.estado}: ${etiquetaHorario(new Date(c.inicio), zona)}${c.casa ? ` · ${c.casa}` : ""}`,
      href: `/panel/agenda/visita/${c.id}`,
    })),
    ...(correos ?? []).map((c) => ({ cuando: new Date(c.created_at as string), tipo: "correo", texto: `Escribió por correo: ${(c.resumen as string | null) ?? (c.asunto as string | null) ?? "sin asunto"}` })),
  ];
  // Los mensajes de WhatsApp se agrupan por día (en la zona del corredor): "Escribió 3 mensajes · Patty contestó 2".
  const porDia = new Map<string, { cuando: Date; cliente: number; asistente: number; corredor: number }>();
  let ultimoMensaje: Date | null = null;
  for (const m of (mensajes ?? []) as { direccion: string; autor: string; created_at: string }[]) {
    const d = new Date(m.created_at);
    if (!ultimoMensaje || d > ultimoMensaje) ultimoMensaje = d;
    const k = fechaIso(fechaLocal(d, zona));
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
    ].filter((p): p is string => !!p);
    if (partes.length) {
      const texto = partes.join(" · ");
      eventos.push({ cuando: g.cuando, tipo: "whatsapp", texto: texto.charAt(0).toUpperCase() + texto.slice(1) });
    }
  }
  eventos.sort((a, b) => b.cuando.getTime() - a.cuando.getTime());
  const vinoDelSitio = (actividades ?? []).some((a) => /desde el sitio web/i.test(String(a.texto ?? "")));
  return { eventos, ultimoMensaje, vinoDelSitio };
}

function Dias({ eventos, ahora, zona, nombreAsistente }: { eventos: EventoHistoria[]; ahora: Date; zona: string; nombreAsistente: string }) {
  return (
    <>
      {agruparPorDia(eventos, ahora, zona).map((g) => (
        <section key={g.clave} className="fc-dia" aria-label={g.titulo}>
          <h3 className="fc-dia-titulo">{g.titulo}</h3>
          <ol className="fc-linea">
            {g.eventos.map((e, i) => {
              const Icono = ICONO[e.tipo] ?? IconoReloj;
              const nombre = NOMBRE_ACTIVIDAD[e.tipo as TipoActividad] ?? (e.tipo === "whatsapp" ? "WhatsApp" : "Otro");
              const cuerpo = (
                <>
                  <span className="fc-evento-cabeza">
                    <strong>{nombre}</strong>
                    {e.autor === "asistente" ? (
                      <span className="fc-autor fc-autor-ia">{nombreAsistente}</span>
                    ) : e.autor === "corredor" ? (
                      <span className="fc-autor">Tú</span>
                    ) : null}
                    <time dateTime={e.cuando.toISOString()}>{horaCorta(e.cuando, zona)}</time>
                  </span>
                  <span className="fc-evento-texto">{e.texto}</span>
                </>
              );
              return (
                <li key={i} className={`fc-evento fc-t-${e.tipo}${e.autor === "asistente" ? " de-ia" : ""}`}>
                  <span className="fc-evento-icono" aria-hidden>
                    <Icono tamano={16} />
                  </span>
                  {e.href ? (
                    <Link href={e.href} className="fc-evento-cuerpo">
                      {cuerpo}
                    </Link>
                  ) : (
                    <span className="fc-evento-cuerpo">{cuerpo}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </>
  );
}

export function Historia({
  eventos,
  contactoId,
  ahora,
  zona,
  nombreAsistente,
}: {
  eventos: EventoHistoria[];
  contactoId: string;
  ahora: Date;
  zona: string;
  nombreAsistente: string;
}) {
  const primeros = eventos.slice(0, VISIBLES);
  const resto = eventos.slice(VISIBLES);
  return (
    <section className="tarjeta fc-bloque historia" data-patty="cliente-historia" id="historia">
      <div className="fc-bloque-cabeza">
        <h2>Historia</h2>
        {eventos.length > 0 && <span className="suave">{eventos.length === 1 ? "1 cosa" : `${eventos.length} cosas`}</span>}
      </div>
      <form action={anotarActividad} className="fc-anotar" id="anotar">
        <input type="hidden" name="id" value={contactoId} />
        <input name="texto" type="text" maxLength={500} placeholder="¿Qué pasó? Ej.: le gustó la casa pero quiere bajar el precio" aria-label="Qué pasó" />
        <div className="fc-anotar-botones">
          {ANOTAR.map((a) => (
            <button key={a.tipo} type="submit" name="tipo" value={a.tipo} className={a.tipo === "llamada" ? "primario" : undefined}>
              {a.nombre}
            </button>
          ))}
        </div>
      </form>
      {eventos.length === 0 ? (
        <Vacio Icono={IconoReloj} titulo="Todavía no hay nada" compacto>
          Cuando lo llames o le escribas, anótalo arriba. Las visitas, los cambios de etapa y sus mensajes aparecen solos.
        </Vacio>
      ) : (
        <div className="fc-historia">
          <Dias eventos={primeros} ahora={ahora} zona={zona} nombreAsistente={nombreAsistente} />
          {resto.length > 0 && (
            <details className="fc-ver-todo">
              <summary>Ver todo ({resto.length} más)</summary>
              <Dias eventos={resto} ahora={ahora} zona={zona} nombreAsistente={nombreAsistente} />
            </details>
          )}
        </div>
      )}
    </section>
  );
}
