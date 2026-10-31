import {
  IconoAgenda,
  IconoCasa,
  IconoChats,
  IconoCheck,
  IconoDobleCheck,
  IconoLapiz,
  IconoLlave,
} from "./iconos";
import Link from "next/link";
import {
  conPunto,
  diaLargo,
  etiquetaHorario,
  horaCorta,
} from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, limitesDia } from "@/lib/agenda/tiempo";
import { semanaDe } from "@/lib/encuentra24/busqueda";
import { precio } from "@/lib/formato";
import { ordenarFotos } from "@/lib/panel/formularios";
import type { Foto } from "@/lib/datos/tipos";
import type { AccionPendiente } from "@/lib/datos/tipos";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { aprobar, devolver, yoLeEscribo } from "./acciones";
import { Aviso } from "./aviso";
import { BotonEnviar } from "./boton-enviar";
import { Avatar } from "./avatar";
import { IconoCampana, IconoMas } from "./iconos";

// Inicio del panel: el día de un vistazo (cifras, próxima visita con la foto de la casa y sus casas),
// lo que espera a la corredora con botones grandes y, abajo, todos los chats como en WhatsApp.

type Contacto = { id?: string; nombre: string | null; telefono: string; etapa?: string };
type Conv = {
  id: string;
  estado: "abierta" | "escalada" | "cerrada";
  control: "asistente" | "corredor";
  ultimo_mensaje_cliente_at: string | null;
  updated_at: string;
  contactos: Contacto | Contacto[];
};
type Casa = {
  id: string;
  titulo: string;
  precio: number | null;
  moneda: string;
  operacion: string;
  zona: string | null;
  fotos: Foto[];
};
type Visita = {
  inicio: string;
  contactos: Contacto | Contacto[] | null;
  propiedades: Casa | Casa[] | null;
};
type Msj = {
  conversacion_id: string;
  direccion: string;
  contenido: string | null;
  created_at: string;
};
type Borrador = {
  id: string;
  conversacion_id: string;
  contenido: string | null;
  accion: AccionPendiente | null;
};

const uno = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);
const DIA = 24 * 60 * 60_000;
const nombre = (c: Contacto) => c.nombre ?? c.telefono;
const whatsapp = (telefono: string) =>
  `https://wa.me/${telefono.replace(/\D/g, "")}`;

function queHace(a: AccionPendiente, zona: string): string {
  if (a.tipo === "crear_cita")
    return conPunto(
      `Al enviarla queda agendada la visita del ${etiquetaHorario(new Date(a.inicio), zona)}`,
    );
  if (a.tipo === "cancelar_cita") return "Al enviarla se cancela la visita.";
  return "Al enviarla la visita queda confirmada.";
}

export default async function Chats({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const ahora = new Date();

  const [{ data: convs }, { data: borradores }] = await Promise.all([
    supabase
      .from("conversaciones")
      .select(
        "id, estado, control, ultimo_mensaje_cliente_at, updated_at, contactos!inner(id, nombre, telefono, es_corredor, etapa)",
      )
      .eq("corredor_id", corredor.id)
      .eq("contactos.es_corredor", false)
      .neq("estado", "cerrada")
      .order("updated_at", { ascending: false })
      .limit(60),
    supabase
      .from("mensajes")
      .select("id, conversacion_id, contenido, accion")
      .eq("corredor_id", corredor.id)
      .eq("estado_borrador", "pendiente")
      .order("created_at"),
  ]);
  const hoy = limitesDia(ahora, zona);
  const [
    { data: visitas },
    { count: visitasHoy },
    { data: casasData },
    { count: duenosNuevos },
  ] = await Promise.all([
    supabase
      .from("citas")
      .select(
        "inicio, contactos(nombre, telefono), propiedades(id, titulo, precio, moneda, operacion, zona, fotos)",
      )
      .eq("corredor_id", corredor.id)
      .in("estado", ["agendada", "confirmada"])
      .gte("inicio", ahora.toISOString())
      .order("inicio")
      .limit(1),
    supabase
      .from("citas")
      .select("id", { count: "exact", head: true })
      .eq("corredor_id", corredor.id)
      .in("estado", ["agendada", "confirmada"])
      .gte("inicio", hoy.desde.toISOString())
      .lt("inicio", hoy.hasta.toISOString()),
    supabase
      .from("propiedades")
      .select("id, titulo, precio, moneda, operacion, zona, fotos")
      .eq("corredor_id", corredor.id)
      .in("estado", ["activa", "reservada"])
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("leads_duenos")
      .select("id", { count: "exact", head: true })
      .eq("corredor_id", corredor.id)
      .eq("es_dueno", true)
      .eq("estado_contacto", "nuevo")
      .eq("semana", semanaDe(ahora, zona)),
  ]);
  const { data: seguimientosData } = await supabase
    .from("contactos")
    .select("id, nombre, telefono, seguimiento_nota")
    .eq("corredor_id", corredor.id)
    .lte("seguimiento_fecha", fechaIso(fechaLocal(ahora, zona)))
    .order("seguimiento_fecha")
    .limit(10);
  const seguimientos = (seguimientosData ?? []) as { id: string; nombre: string | null; telefono: string; seguimiento_nota: string | null }[];
  const casas = (casasData ?? []) as Casa[];
  const proxima = ((visitas ?? []) as Visita[])[0];
  const fotoDe = (c: Casa | null | undefined) =>
    c ? ordenarFotos(c.fotos ?? [])[0]?.url : undefined;
  const hora = Number(
    new Intl.DateTimeFormat("es-CR", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: zona,
    }).format(ahora),
  );
  const saludo =
    hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  const conversaciones = (convs ?? []) as Conv[];
  const ids = conversaciones.map((c) => c.id);
  // Último mensaje de cada chat (para la vista previa) y último del cliente (para "te escribió").
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
  const delCliente = new Map<string, Msj>();
  for (const m of (recientes ?? []) as Msj[]) {
    if (!ultimo.has(m.conversacion_id)) ultimo.set(m.conversacion_id, m);
    if (m.direccion === "entrante" && !delCliente.has(m.conversacion_id))
      delCliente.set(m.conversacion_id, m);
  }

  const porId = new Map(conversaciones.map((c) => [c.id, c]));
  const pendientes = ((borradores ?? []) as Borrador[]).filter((b) =>
    porId.has(b.conversacion_id),
  );
  const conBorrador = new Set(pendientes.map((b) => b.conversacion_id));
  const esperan = conversaciones.filter(
    (c) => c.estado === "escalada" && !conBorrador.has(c.id),
  );
  const total = pendientes.length + esperan.length;
  const abierta = (c: Conv) =>
    !!c.ultimo_mensaje_cliente_at &&
    ahora.getTime() - Date.parse(c.ultimo_mensaje_cliente_at) < DIA;

  // Clientes que no contestan: el último mensaje del chat fue nuestro hace más de 3 días.
  const sinRespuesta = conversaciones
    .filter((c) => {
      const m = ultimo.get(c.id);
      const etapa = uno(c.contactos).etapa;
      return m?.direccion === "saliente" && ahora.getTime() - Date.parse(m.created_at) > 3 * DIA && etapa !== "cerrado" && etapa !== "perdido";
    })
    .slice(0, 6);

  const cuando = (iso: string) => {
    const d = new Date(iso);
    return fechaIso(fechaLocal(d, zona)) === fechaIso(fechaLocal(ahora, zona))
      ? horaCorta(d, zona)
      : etiquetaHorario(d, zona).split(",")[0];
  };

  return (
    <>
      <header className="saludo">
        <div>
          <p className="etiqueta">{corredor.nombre}</p>
          <h1>
            {saludo}, {corredor.nombre_contacto}
          </h1>
          <p className="saludo-fecha">{diaLargo(ahora, zona)}</p>
        </div>
        <Link href="/panel/mas" className="boton boton-mas">
          <IconoMas tamano={22} />
          Más
        </Link>
      </header>
      <Aviso texto={aviso} />

      <section className="kpis" aria-label="Tu día">
        <a href="#te-esperan" className={`kpi${total > 0 ? " urgente" : ""}`}>
          <IconoChats tamano={26} />
          <strong>{total}</strong>
          <span>
            {total === 1 ? "cliente te espera" : "clientes te esperan"}
          </span>
        </a>
        <Link href="/panel/agenda" className="kpi">
          <IconoAgenda tamano={26} />
          <strong>{visitasHoy ?? 0}</strong>
          <span>{visitasHoy === 1 ? "visita hoy" : "visitas hoy"}</span>
        </Link>
        <Link href="/panel/propiedades" className="kpi">
          <IconoCasa tamano={26} />
          <strong>{casas.length}</strong>
          <span>
            {casas.length === 1 ? "casa en oferta" : "casas en oferta"}
          </span>
        </Link>
        <Link href="/panel/duenos" className="kpi">
          <IconoLlave tamano={26} />
          <strong>{duenosNuevos ?? 0}</strong>
          <span>
            {duenosNuevos === 1
              ? "dueño nuevo esta semana"
              : "dueños nuevos esta semana"}
          </span>
        </Link>
      </section>

      <div className="destacados">
        {proxima && (
          <div>
            <h2>Próxima visita</h2>
            <Link
              href="/panel/agenda"
              className="proxima"
              style={
                fotoDe(uno(proxima.propiedades))
                  ? {
                      backgroundImage: `url("${fotoDe(uno(proxima.propiedades))}")`,
                    }
                  : undefined
              }
            >
              <span className="proxima-texto">
                <span className="etiqueta">
                  {proxima.contactos
                    ? nombre(uno(proxima.contactos))
                    : "Visita"}
                </span>
                <span className="proxima-cuando">
                  {etiquetaHorario(new Date(proxima.inicio), zona)}
                </span>
                <span>{uno(proxima.propiedades)?.titulo ?? ""}</span>
              </span>
            </Link>
          </div>
        )}

        {casas.length > 0 && (
          <div className="destacado-casas">
            <div className="titulo-seccion">
              <h2>Tus casas</h2>
              <Link href="/panel/propiedades">Ver todas</Link>
            </div>
            <div className="carrusel">
              {casas.map((c) => {
                const foto = fotoDe(c);
                return (
                  <Link
                    key={c.id}
                    href={`/panel/propiedades/${c.id}`}
                    className="casa-tarjeta"
                  >
                    {foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={foto} alt="" loading="lazy" />
                    ) : (
                      <span className="sin-foto" aria-hidden>
                        <IconoCasa tamano={44} />
                      </span>
                    )}
                    <span className="casa-tarjeta-texto">
                      <strong>{c.titulo}</strong>
                      {c.precio !== null && (
                        <span>
                          {precio(c.precio, c.moneda)}
                          {c.operacion === "alquiler" ? " al mes" : ""}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {total > 0 ? (
        <section
          className="te-necesitan"
          id="te-esperan"
          aria-label="Te necesitan"
        >
          <h2>
            {total === 1
              ? "1 cliente te espera"
              : `${total} clientes te esperan`}
          </h2>

          {pendientes.map((b) => {
            const c = porId.get(b.conversacion_id)!;
            const contacto = uno(c.contactos);
            const dijo = delCliente.get(c.id);
            return (
              <article key={b.id} className="pendiente">
                <Link
                  href={`/panel/conversaciones/${c.id}`}
                  className="pendiente-quien"
                >
                  <Avatar
                    nombre={contacto.nombre}
                    telefono={contacto.telefono}
                  />
                  <strong>{nombre(contacto)}</strong>
                </Link>
                <div className="mini-hilo">
                  {dijo?.contenido && (
                    <p className="burbuja cliente">{dijo.contenido}</p>
                  )}
                  <p className="burbuja saliente propuesta">
                    <span className="propuesta-titulo">
                      La asistente le contestaría:
                    </span>
                    {b.contenido}
                  </p>
                </div>
                {b.accion && <p className="suave">{queHace(b.accion, zona)}</p>}
                {abierta(c) ? (
                  <form action={aprobar}>
                    <input type="hidden" name="mensaje" value={b.id} />
                    <input
                      type="hidden"
                      name="texto"
                      value={b.contenido ?? ""}
                    />
                    <input type="hidden" name="volver" value="/panel" />
                    <BotonEnviar
                      texto={
                        <>
                          <IconoCheck tamano={24} /> Enviar así
                        </>
                      }
                      pendiente="Enviando…"
                      className="verde grande"
                    />
                  </form>
                ) : (
                  <p className="aviso">
                    Pasó más de un día desde que escribió: contéstale desde tu
                    WhatsApp.
                  </p>
                )}
                <div className="botones secundarios">
                  <Link
                    href={`/panel/conversaciones/${c.id}#borrador`}
                    className="boton secundario"
                  >
                    <IconoLapiz tamano={20} /> Cambiarla
                  </Link>
                  <form
                    action={yoLeEscribo}
                    style={{ flex: "1 1 auto", display: "flex" }}
                  >
                    <input type="hidden" name="conversacion" value={c.id} />
                    <button
                      type="submit"
                      className="secundario"
                      style={{ flex: 1 }}
                    >
                      Le escribo yo
                    </button>
                  </form>
                </div>
              </article>
            );
          })}

          {esperan.map((c) => {
            const contacto = uno(c.contactos);
            const dijo = delCliente.get(c.id);
            return (
              <article key={c.id} className="pendiente">
                <Link
                  href={`/panel/conversaciones/${c.id}`}
                  className="pendiente-quien"
                >
                  <Avatar
                    nombre={contacto.nombre}
                    telefono={contacto.telefono}
                  />
                  <strong>{nombre(contacto)} quiere hablar contigo</strong>
                </Link>
                {dijo?.contenido && (
                  <div className="mini-hilo">
                    <p className="burbuja cliente">{dijo.contenido}</p>
                  </div>
                )}
                <a
                  href={whatsapp(contacto.telefono)}
                  className="boton verde grande"
                  target="_blank"
                  rel="noreferrer"
                >
                  Escribirle por WhatsApp
                </a>
                <form action={devolver}>
                  <input type="hidden" name="conversacion" value={c.id} />
                  <input type="hidden" name="volver" value="/panel" />
                  <BotonEnviar
                    texto="Ya lo atendí"
                    pendiente="Un momento…"
                    className="grande secundario"
                  />
                </form>
              </article>
            );
          })}
        </section>
      ) : (
        <p className="al-dia">
          <IconoCheck tamano={24} /> Todo al día: ningún cliente te espera.
        </p>
      )}

      {(seguimientos.length > 0 || sinRespuesta.length > 0) && (
        <section className="para-hoy" aria-label="Para hoy">
          <h2>
            <IconoCampana tamano={22} /> Para hoy
          </h2>
          <ul className="chat-lista">
            {seguimientos.map((s) => (
              <li key={`s-${s.id}`}>
                <Link href={`/panel/clientes/${s.id}`}>
                  <Avatar nombre={s.nombre} telefono={s.telefono} />
                  <span className="texto">
                    <strong>{s.nombre ?? s.telefono}</strong>
                    <span className="vista">{s.seguimiento_nota ?? "Darle seguimiento"}</span>
                  </span>
                </Link>
              </li>
            ))}
            {sinRespuesta.map((c) => {
              const contacto = uno(c.contactos);
              return (
                <li key={`r-${c.id}`}>
                  <Link href={`/panel/conversaciones/${c.id}`}>
                    <Avatar nombre={contacto.nombre} telefono={contacto.telefono} />
                    <span className="texto">
                      <strong>{nombre(contacto)}</strong>
                      <span className="vista">No contesta hace más de 3 días: escríbele</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <h2>Chats</h2>
      {conversaciones.length === 0 && (
        <p className="vacio">Todavía no te ha escrito ningún cliente.</p>
      )}
      <ul className="chat-lista" aria-label="Todos los chats">
        {conversaciones.map((c) => {
          const contacto = uno(c.contactos);
          const m = ultimo.get(c.id);
          const marca = conBorrador.has(c.id) || c.estado === "escalada";
          return (
            <li key={c.id}>
              <Link href={`/panel/conversaciones/${c.id}`}>
                <Avatar nombre={contacto.nombre} telefono={contacto.telefono} />
                <span className="texto">
                  <span className="renglon">
                    <strong>{nombre(contacto)}</strong>
                    {m && (
                      <span className={`hora${marca ? " nueva" : ""}`}>
                        {cuando(m.created_at)}
                      </span>
                    )}
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
