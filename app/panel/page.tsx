import Link from "next/link";
import { diaLargo, horaCorta } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, limitesDia, sumarDias } from "@/lib/agenda/tiempo";
import { minutosEntre } from "@/lib/agenda/zonas";
import { encaja, telefonoBonito, type Busca } from "@/lib/crm/perfil";
import { pendientesDe } from "@/lib/panel/pendientes";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "./aviso";
import { PreguntaBloqueo } from "./agenda/pregunta-bloqueo";
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
const nombre = (c: { nombre: string | null; telefono: string }) => c.nombre ?? telefonoBonito(c.telefono);

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

  // Visitas de los últimos 7 días que ya pasaron y no dicen cómo salieron.
  const { data: pasadasData } = await supabase
    .from("citas")
    .select("id, inicio, contactos(nombre, telefono), propiedades(titulo)")
    .eq("corredor_id", corredor.id)
    .in("estado", ["agendada", "confirmada"])
    .lt("fin", ahora.toISOString())
    .gte("inicio", new Date(ahora.getTime() - 7 * DIA).toISOString())
    .order("inicio", { ascending: false })
    .limit(5);
  const pasadas = (pasadasData ?? []) as unknown as {
    id: string;
    inicio: string;
    contactos: { nombre: string | null; telefono: string } | null;
    propiedades: { titulo: string } | null;
  }[];

  // Casas agregadas en la última semana que le sirven a algún cliente.
  const [{ data: casasNuevasData }, { data: buscanData }] = await Promise.all([
    supabase
      .from("propiedades")
      .select("id, titulo, operacion, tipo, precio, moneda, zona, canton, habitaciones")
      .eq("corredor_id", corredor.id)
      .eq("estado", "activa")
      .gte("created_at", new Date(ahora.getTime() - 7 * DIA).toISOString())
      .limit(10),
    supabase.from("contactos").select("busca").eq("corredor_id", corredor.id).eq("es_corredor", false).not("etapa", "in", "(cerrado,perdido)").limit(500),
  ]);
  const casasNuevas = ((casasNuevasData ?? []) as (Parameters<typeof encaja>[1] & { id: string; titulo: string })[])
    .map((casa) => ({ casa, cuantos: ((buscanData ?? []) as { busca: Busca }[]).filter((c) => encaja(c.busca ?? {}, casa)).length }))
    .filter((x) => x.cuantos > 0)
    .slice(0, 3);
  const visitas = (visitasData ?? []) as unknown as Visita[];
  const seguimientos = (seguimientosData ?? []) as { id: string; nombre: string | null; telefono: string; seguimiento_nota: string | null }[];

  const ids = conversaciones.map((c) => c.id);
  const { data: recientes } = ids.length
    ? await supabase
        .from("mensajes")
        .select("conversacion_id, direccion, contenido, created_at")
        .eq("corredor_id", corredor.id)
        .in("conversacion_id", ids)
        // Solo lo que de verdad se mandó o llegó (sin borradores). Ojo: neq() deja afuera los null.
        .or("estado_borrador.is.null,estado_borrador.in.(aprobado,corregido)")
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

  // Como en WhatsApp: la hora si es de hoy, "Ayer", el día de la semana si fue esta semana y si no, "11 nov.".
  const cuando = (iso: string) => {
    const d = new Date(iso);
    const dia = fechaLocal(d, zona);
    const hoy = fechaLocal(ahora, zona);
    if (fechaIso(dia) === fechaIso(hoy)) return horaCorta(d, zona);
    if (fechaIso(dia) === fechaIso(sumarDias(hoy, -1))) return "Ayer";
    const SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    if (fechaIso(dia) > fechaIso(sumarDias(hoy, -7))) return SEMANA[dia.diaSemana];
    const MESES = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sept.", "oct.", "nov.", "dic."];
    return `${dia.dia} ${MESES[dia.mes - 1]}${dia.anio !== hoy.anio ? ` ${dia.anio}` : ""}`;
  };
  const hora = Number(new Intl.DateTimeFormat("es-CR", { hour: "numeric", hourCycle: "h23", timeZone: zona }).format(ahora));
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  // Lo del día en una línea, arriba: lo primero que se lee al abrir.
  const resumenDia = [
    visitas.length ? `${visitas.length} ${visitas.length === 1 ? "visita" : "visitas"} hoy` : "Sin visitas hoy",
    pendientes.length ? `${pendientes.length} ${pendientes.length === 1 ? "cliente espera" : "clientes esperan"}` : null,
    seguimientos.length ? `${seguimientos.length} ${seguimientos.length === 1 ? "por llamar" : "por llamar"}` : null,
  ].filter((x): x is string => !!x);
  const nombreAsistente = corredor.nombre_asistente ?? "Patty";

  return (
    <div className="inicio">
      <header className="saludo">
        <div>
          <h1>
            {saludo}, {corredor.nombre_contacto}
          </h1>
          <p className="saludo-fecha">{diaLargo(ahora, zona)}</p>
          <p className="saludo-resumen">
            {resumenDia.map((r, i) => (
              <span key={r} className={i === 0 && visitas.length ? "destacado" : undefined}>
                {r}
              </span>
            ))}
          </p>
        </div>
        <Link href="/panel/mas" className="boton boton-mas" aria-label="Más opciones">
          <IconoMas tamano={22} />
        </Link>
      </header>
      <Aviso texto={aviso} />

      {/* Computadora: dos columnas (lo de hoy y los chats a la izquierda; Patty y el resumen a la derecha).
          Teléfono: una sola, con lo urgente primero (el orden lo pone el CSS). */}
      <div className="inicio-grid">
        <div className="inicio-principal">
          <div className="inicio-bloque bloque-esperan">
            {pendientes.length > 0 ? (
              <section className="esperan" aria-label="Clientes que te esperan">
                <Link data-patty="inicio-revisar" href="/panel/revisar" className="esperan-cabecera">
                  <span className="revisar-numero">{pendientes.length}</span>
                  <span className="revisar-texto">
                    <strong>{pendientes.length === 1 ? "Un cliente te espera" : `${pendientes.length} clientes te esperan`}</strong>
                    <span>
                      {[respuestas ? `${respuestas} ${respuestas === 1 ? "respuesta lista" : "respuestas listas"} para que la revises` : null, hablar ? `${hablar} ${hablar === 1 ? "quiere" : "quieren"} hablar contigo` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="revisar-ir">
                    Revisar {pendientes.length > 1 ? "uno por uno" : ""} <IconoFlecha tamano={20} />
                  </span>
                </Link>
                <ul className="esperan-lista">
                  {pendientes.slice(0, 4).map((p) => (
                    <li key={p.tipo === "respuesta" ? p.mensajeId : p.conversacionId}>
                      <Link href={p.tipo === "respuesta" ? "/panel/revisar" : `/panel/conversaciones/${p.conversacionId}`}>
                        <Avatar nombre={p.contacto.nombre} telefono={p.contacto.telefono} />
                        <span className="esperan-texto">
                          <strong>{nombre(p.contacto)}</strong>
                          <span className="suave">{p.dijo ? `“${p.dijo.length > 110 ? `${p.dijo.slice(0, 110)}…` : p.dijo}”` : "Te escribió"}</span>
                        </span>
                        <span className={`esperan-etiqueta ${p.tipo}`}>{p.tipo === "respuesta" ? "Respuesta lista" : "Quiere hablar contigo"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {pendientes.length > 4 && (
                  <Link href="/panel/revisar" className="esperan-mas">
                    y {pendientes.length - 4} más
                  </Link>
                )}
              </section>
            ) : (
              <section className="al-dia-tarjeta" aria-label="Todo al día">
                <span className="al-dia-icono">
                  <IconoCheck tamano={26} />
                </span>
                <span>
                  <strong>Todo al día</strong>
                  <span className="suave">Ningún cliente espera respuesta. {nombreAsistente} te avisa aquí si alguien te necesita.</span>
                </span>
              </section>
            )}
          </div>
          <div className="inicio-bloque bloque-hoy">
            {visitas.length === 0 && seguimientos.length === 0 && sinRespuesta.length === 0 && pasadas.length === 0 && casasNuevas.length === 0 && (
              <section className="hoy hoy-vacio" aria-label="Hoy">
                <h2>
                  <IconoCampana tamano={20} /> Qué hacer hoy
                </h2>
                <p className="suave">Hoy no tienes visitas ni recordatorios. Buen momento para ofrecer casas o llamar a quien no ha contestado.</p>
              </section>
            )}
            {(visitas.length > 0 || seguimientos.length > 0 || sinRespuesta.length > 0 || pasadas.length > 0 || casasNuevas.length > 0) && (
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
                  {pasadas.map((v) => (
                    <li key={`p-${v.id}`}>
                      <Link href={`/panel/agenda/visita/${v.id}`}>
                        <span className="hoy-hora">Anotar</span>
                        <span>
                          ¿Cómo salió la visita con <strong>{v.contactos ? nombre(v.contactos) : "el cliente"}</strong>?
                          {v.propiedades && <span className="suave"> · {v.propiedades.titulo}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {casasNuevas.map(({ casa, cuantos }) => (
                    <li key={`c-${casa.id}`}>
                      <Link href={`/panel/propiedades/${casa.id}`}>
                        <span className="hoy-hora">Ofrecer</span>
                        <span>
                          <strong>{casa.titulo}</strong>
                          <span className="suave">
                            {" "}
                            · le sirve a {cuantos} {cuantos === 1 ? "cliente" : "clientes"}
                          </span>
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
          </div>
          <div className="inicio-bloque bloque-correos">
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
          </div>
          <div className="inicio-bloque bloque-chats">
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
          </div>
        </div>
        <aside className="inicio-lateral">
          <div className="inicio-bloque bloque-pregunta">
            {(() => {
              const hoyLocal = fechaLocal(ahora, zona);
              const manana = sumarDias(hoyLocal, 1);
              const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
              return (
                <PreguntaBloqueo
                  nombre={corredor.nombre_asistente ?? "Patty"}
                  fecha={fechaIso(manana)}
                  dia={`mañana ${DIAS[manana.diaSemana]} ${manana.dia}`}
                  hoy={fechaIso(hoyLocal)}
                  volverA="/panel"
                />
              );
            })()}
          </div>
          <section className="inicio-bloque bloque-patty tarjeta" aria-label={`Pregúntale a ${nombreAsistente}`}>
            <h2>Pregúntale a {nombreAsistente}</h2>
            <p className="suave">Conoce tu agenda, tus clientes y tus casas.</p>
            <div className="preguntas-patty">
              <PreguntarPatty nombre={nombreAsistente} pregunta="¿Por dónde empiezo hoy?" />
              <PreguntarPatty nombre={nombreAsistente} pregunta="¿A quién debería llamar?" />
              <PreguntarPatty nombre={nombreAsistente} pregunta="¿Qué casa le ofrezco a quién?" />
            </div>
          </section>
          <div className="inicio-bloque bloque-resumen">
            <section className="resumen-asistente" aria-label="Lo que hizo la asistente">
              <h2>Lo que hizo {nombreAsistente} en 24 horas</h2>
              <div className="cifras inicio-cifras">
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
          </div>
        </aside>
      </div>
    </div>
  );
}
