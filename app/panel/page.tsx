import Link from "next/link";
import { diaLargo, etiquetaHorario, horaCorta } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, limitesDia } from "@/lib/agenda/tiempo";
import { minutosEntre } from "@/lib/agenda/zonas";
import { pendientesDe } from "@/lib/panel/pendientes";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "./aviso";
import { PreguntarPatty } from "./preguntar-patty";
import { ComoLlegar } from "./como-llegar";
import { Avatar } from "./avatar";
import { IconoCampana, IconoCheck, IconoDobleCheck, IconoFlecha, IconoMas } from "./iconos";

// Inicio: arriba lo urgente (un botón para revisar lo que espera), el resumen de lo que hizo la
// asistente en las últimas 24 horas y lo que hay que hacer hoy (visitas con su hora de salida,
// recordatorios y clientes que no contestan); abajo todos los chats, como en WhatsApp.

type Contacto = { id: string; nombre: string | null; telefono: string; etapa: string };
type Conv = {
  id: string;
  estado: "abierta" | "escalada" | "cerrada";
  control: "asistente" | "corredor";
  updated_at: string;
  contactos: Contacto | Contacto[];
};
type Msj = { conversacion_id: string; direccion: string; contenido: string | null; created_at: string };
type Visita = {
  id: string;
  inicio: string;
  fin: string;
  contactos: { nombre: string | null; telefono: string } | null;
  propiedades: { titulo: string; zona: string | null; canton: string | null } | null;
};

const uno = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);
const DIA = 24 * 60 * 60_000;
const nombre = (c: { nombre: string | null; telefono: string }) => c.nombre ?? c.telefono;

export default async function Inicio({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const ahora = new Date();
  const hoy = limitesDia(ahora, zona);

  const desde24 = new Date(ahora.getTime() - DIA).toISOString();
  const cuenta = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const { data: correosData } = await supabase
    .from("correos_procesados")
    .select("gmail_id, contacto_id, remitente, asunto, resumen")
    .eq("corredor_id", corredor.id)
    .eq("tipo", "cliente")
    .gte("created_at", desde24)
    .order("created_at", { ascending: false })
    .limit(5);
  const correos = (correosData ?? []) as { gmail_id: string; contacto_id: string | null; remitente: string | null; asunto: string | null; resumen: string | null }[];
  const [contestados, agendadas, nuevos, dudas] = await Promise.all([
    cuenta(
      supabase
        .from("mensajes")
        .select("id", { count: "exact", head: true })
        .eq("corredor_id", corredor.id)
        .eq("autor", "asistente")
        .eq("direccion", "saliente")
        .gte("created_at", desde24),
    ),
    cuenta(supabase.from("citas").select("id", { count: "exact", head: true }).eq("corredor_id", corredor.id).gte("created_at", desde24)),
    cuenta(
      supabase
        .from("contactos")
        .select("id", { count: "exact", head: true })
        .eq("corredor_id", corredor.id)
        .eq("es_corredor", false)
        .gte("created_at", desde24),
    ),
    cuenta(supabase.from("conocimiento").select("id", { count: "exact", head: true }).eq("corredor_id", corredor.id).eq("estado", "pendiente")),
  ]);

  const [pendientes, { data: convs }, { data: visitasData }, { data: seguimientosData }] = await Promise.all([
    pendientesDe(supabase, corredor.id, ahora),
    supabase
      .from("conversaciones")
      .select("id, estado, control, updated_at, contactos!inner(id, nombre, telefono, es_corredor, etapa)")
      .eq("corredor_id", corredor.id)
      .eq("contactos.es_corredor", false)
      .neq("estado", "cerrada")
      .order("updated_at", { ascending: false })
      .limit(60),
    supabase
      .from("citas")
      .select("id, inicio, fin, contactos(nombre, telefono), propiedades(titulo, zona, canton)")
      .eq("corredor_id", corredor.id)
      .in("estado", ["agendada", "confirmada"])
      .gte("inicio", hoy.desde.toISOString())
      .lt("inicio", hoy.hasta.toISOString())
      .order("inicio"),
    supabase
      .from("contactos")
      .select("id, nombre, telefono, seguimiento_nota")
      .eq("corredor_id", corredor.id)
      .lte("seguimiento_fecha", fechaIso(fechaLocal(ahora, zona)))
      .order("seguimiento_fecha")
      .limit(5),
  ]);
  const conversaciones = (convs ?? []) as Conv[];
  const visitas = (visitasData ?? []) as unknown as Visita[];
  const seguimientos = (seguimientosData ?? []) as { id: string; nombre: string | null; telefono: string; seguimiento_nota: string | null }[];

  const ids = conversaciones.map((c) => c.id);
  const { data: recientes } = ids.length
    ? await supabase
        .from("mensajes")
        .select("conversacion_id, direccion, contenido, created_at")
        .eq("corredor_id", corredor.id)
        .in("conversacion_id", ids)
        .neq("estado_borrador", "descartado")
        .order("created_at", { ascending: false })
        .limit(400)
    : { data: [] };
  const ultimo = new Map<string, Msj>();
  for (const m of (recientes ?? []) as Msj[]) if (!ultimo.has(m.conversacion_id)) ultimo.set(m.conversacion_id, m);

  const espera = new Set(pendientes.map((p) => p.conversacionId));
  const respuestas = pendientes.filter((p) => p.tipo === "respuesta").length;
  const hablar = pendientes.length - respuestas;
  // Clientes que no contestan: el último mensaje fue nuestro hace más de 3 días.
  const sinRespuesta = conversaciones
    .filter((c) => {
      const m = ultimo.get(c.id);
      const etapa = uno(c.contactos).etapa;
      return m?.direccion === "saliente" && ahora.getTime() - Date.parse(m.created_at) > 3 * DIA && etapa !== "cerrado" && etapa !== "perdido";
    })
    .slice(0, 3);

  // Hora de salida a cada visita: desde la casa del corredor (la primera) o desde la visita anterior.
  const salida = (i: number): string | null => {
    const v = visitas[i];
    const zonaV = v.propiedades?.zona ?? v.propiedades?.canton ?? null;
    const antes = visitas[i - 1];
    const desde = antes ? (antes.propiedades?.zona ?? antes.propiedades?.canton ?? null) : (corredor.zona_base ?? null);
    const min = minutosEntre(desde, zonaV);
    if (min === null || !desde) return null;
    const hora = horaCorta(new Date(Date.parse(v.inicio) - min * 60_000), zona);
    return antes ? `Salir a las ${hora} (${min} min desde la visita anterior)` : `Salir de ${desde} a las ${hora} (${min} min)`;
  };

  const cuando = (iso: string) => {
    const d = new Date(iso);
    return fechaIso(fechaLocal(d, zona)) === fechaIso(fechaLocal(ahora, zona)) ? horaCorta(d, zona) : etiquetaHorario(d, zona).split(",")[0];
  };
  const hora = Number(new Intl.DateTimeFormat("es-CR", { hour: "numeric", hourCycle: "h23", timeZone: zona }).format(ahora));
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <>
      <header className="saludo">
        <div>
          <h1>
            {saludo}, {corredor.nombre_contacto}
          </h1>
          <p className="saludo-fecha">{diaLargo(ahora, zona)}</p>
        </div>
        <Link href="/panel/mas" className="boton boton-mas" aria-label="Más opciones">
          <IconoMas tamano={22} />
        </Link>
      </header>
      <Aviso texto={aviso} />
      <div className="preguntas-patty">
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿Por dónde empiezo hoy?" />
        <PreguntarPatty nombre={corredor.nombre_asistente ?? "Patty"} pregunta="¿A quién debería llamar?" />
      </div>

      {pendientes.length > 0 ? (
        <Link href="/panel/revisar" className="revisar-boton">
          <span className="revisar-numero">{pendientes.length}</span>
          <span className="revisar-texto">
            <strong>{pendientes.length === 1 ? "Un cliente te espera" : `${pendientes.length} clientes te esperan`}</strong>
            <span>
              {[respuestas ? `${respuestas} ${respuestas === 1 ? "respuesta" : "respuestas"} por revisar` : null, hablar ? `${hablar} ${hablar === 1 ? "quiere" : "quieren"} hablar contigo` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <span className="revisar-ir">
            Revisar <IconoFlecha tamano={20} />
          </span>
        </Link>
      ) : (
        <p className="al-dia">
          <IconoCheck tamano={24} /> Todo al día
        </p>
      )}

      <section className="resumen-asistente" aria-label="Lo que hizo la asistente">
        <h2>Lo que hizo la asistente en las últimas 24 horas</h2>
        <div className="cifras">
          <Link href="/panel#chats" className="tarjeta cifra">
            <strong>{contestados}</strong>
            <span className="suave">{contestados === 1 ? "mensaje contestado" : "mensajes contestados"}</span>
          </Link>
          <Link href="/panel/agenda" className="tarjeta cifra">
            <strong>{agendadas}</strong>
            <span className="suave">{agendadas === 1 ? "visita agendada" : "visitas agendadas"}</span>
          </Link>
          <Link href="/panel/clientes" className="tarjeta cifra">
            <strong>{nuevos}</strong>
            <span className="suave">{nuevos === 1 ? "cliente nuevo" : "clientes nuevos"}</span>
          </Link>
          <Link href="/panel/cerebro?ver=dudas" className="tarjeta cifra">
            <strong>{dudas}</strong>
            <span className="suave">{dudas === 1 ? "pregunta que no supo" : "preguntas que no supo"}</span>
          </Link>
        </div>
      </section>

      {correos.length > 0 && (
        <section className="hoy" aria-label="Correos de clientes">
          <h2>Correos de clientes: la respuesta está lista en Gmail</h2>
          <ul className="hoy-lista">
            {correos.map((c) => (
              <li key={c.gmail_id}>
                <a href={c.contacto_id ? `/panel/clientes/${c.contacto_id}` : "https://mail.google.com/mail/u/0/#drafts"} target={c.contacto_id ? undefined : "_blank"} rel="noreferrer">
                  <span className="hoy-hora">Correo</span>
                  <span>
                    <strong>{c.remitente}</strong>
                    {c.resumen && <span className="suave"> · {c.resumen}</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="suave">
            Revísalas y mándalas desde <a href="https://mail.google.com/mail/u/0/#drafts" target="_blank" rel="noreferrer">tus borradores de Gmail</a>.
          </p>
        </section>
      )}

      {visitas.length === 0 && seguimientos.length === 0 && sinRespuesta.length === 0 && (
        <p className="suave">Hoy no tienes visitas ni recordatorios.</p>
      )}
      {(visitas.length > 0 || seguimientos.length > 0 || sinRespuesta.length > 0) && (
        <section className="hoy" aria-label="Hoy">
          <h2>
            <IconoCampana tamano={20} /> Qué hacer hoy
          </h2>
          <ul className="hoy-lista">
            {visitas.map((v, i) => {
              const sale = salida(i);
              return (
                <li key={`v-${v.id}`} className="hoy-visita">
                  <Link href={`/panel/agenda/visita/${v.id}`}>
                    <span className="hoy-hora">{horaCorta(new Date(v.inicio), zona)}</span>
                    <span>
                      Visita con <strong>{v.contactos ? nombre(v.contactos) : "un cliente"}</strong>
                      {v.propiedades && <span className="suave"> · {v.propiedades.titulo}</span>}
                      {sale && <span className="salida">{sale}</span>}
                    </span>
                  </Link>
                  {v.propiedades && <ComoLlegar casa={v.propiedades} chico />}
                </li>
              );
            })}
            {seguimientos.map((s) => (
              <li key={`s-${s.id}`}>
                <Link href={`/panel/clientes/${s.id}`}>
                  <span className="hoy-hora">Llamar</span>
                  <span>
                    <strong>{nombre(s)}</strong>
                    {s.seguimiento_nota && <span className="suave"> · {s.seguimiento_nota}</span>}
                  </span>
                </Link>
              </li>
            ))}
            {sinRespuesta.map((c) => (
              <li key={`r-${c.id}`}>
                <Link href={`/panel/conversaciones/${c.id}`}>
                  <span className="hoy-hora">Escribir</span>
                  <span>
                    <strong>{nombre(uno(c.contactos))}</strong>
                    <span className="suave"> · no contesta hace días</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 id="chats">Chats</h2>
      {conversaciones.length === 0 && <p className="vacio">Todavía no te ha escrito ningún cliente.</p>}
      <ul className="chat-lista" aria-label="Todos los chats">
        {conversaciones.map((c) => {
          const contacto = uno(c.contactos);
          const m = ultimo.get(c.id);
          const marca = espera.has(c.id);
          return (
            <li key={c.id}>
              <Link href={`/panel/conversaciones/${c.id}`}>
                <Avatar nombre={contacto.nombre} telefono={contacto.telefono} />
                <span className="texto">
                  <span className="renglon">
                    <strong>{nombre(contacto)}</strong>
                    {m && <span className={`hora${marca ? " nueva" : ""}`}>{cuando(m.created_at)}</span>}
                  </span>
                  <span className="renglon">
                    <span className="vista">
                      {c.control === "corredor" ? "Le contestas tú · " : ""}
                      {m?.direccion === "saliente" && (
                        <span className="visto" aria-label="enviado">
                          <IconoDobleCheck tamano={18} />
                        </span>
                      )}
                      {m ? (m.contenido ?? "(archivo)") : ""}
                    </span>
                    {marca && (
                      <span className="punto" aria-label="te espera">
                        1
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
