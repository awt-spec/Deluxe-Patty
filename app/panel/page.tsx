import Link from "next/link";
import { conPunto, etiquetaHorario, horaCorta } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal } from "@/lib/agenda/tiempo";
import type { AccionPendiente } from "@/lib/datos/tipos";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { aprobar, devolver, yoLeEscribo } from "./acciones";
import { Aviso } from "./aviso";
import { BotonEnviar } from "./boton-enviar";
import { Avatar } from "./avatar";
import { IconoMas } from "./iconos";

// Inicio del panel, como WhatsApp: arriba lo que espera a Patricia (respuestas por enviar y clientes que
// quieren hablar con ella), con botones grandes; abajo, todos los chats.

type Contacto = { nombre: string | null; telefono: string };
type Conv = {
  id: string;
  estado: "abierta" | "escalada" | "cerrada";
  control: "asistente" | "corredor";
  ultimo_mensaje_cliente_at: string | null;
  updated_at: string;
  contactos: Contacto | Contacto[];
};
type Msj = { conversacion_id: string; direccion: string; contenido: string | null; created_at: string };
type Borrador = { id: string; conversacion_id: string; contenido: string | null; accion: AccionPendiente | null };

const uno = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);
const DIA = 24 * 60 * 60_000;
const nombre = (c: Contacto) => c.nombre ?? c.telefono;
const whatsapp = (telefono: string) => `https://wa.me/${telefono.replace(/\D/g, "")}`;

function queHace(a: AccionPendiente, zona: string): string {
  if (a.tipo === "crear_cita") return conPunto(`Al enviarla queda agendada la visita del ${etiquetaHorario(new Date(a.inicio), zona)}`);
  if (a.tipo === "cancelar_cita") return "Al enviarla se cancela la visita.";
  return "Al enviarla la visita queda confirmada.";
}

export default async function Chats({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const ahora = new Date();

  const [{ data: convs }, { data: borradores }] = await Promise.all([
    supabase
      .from("conversaciones")
      .select("id, estado, control, ultimo_mensaje_cliente_at, updated_at, contactos!inner(nombre, telefono, es_corredor)")
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
    if (m.direccion === "entrante" && !delCliente.has(m.conversacion_id)) delCliente.set(m.conversacion_id, m);
  }

  const porId = new Map(conversaciones.map((c) => [c.id, c]));
  const pendientes = ((borradores ?? []) as Borrador[]).filter((b) => porId.has(b.conversacion_id));
  const conBorrador = new Set(pendientes.map((b) => b.conversacion_id));
  const esperan = conversaciones.filter((c) => c.estado === "escalada" && !conBorrador.has(c.id));
  const total = pendientes.length + esperan.length;
  const abierta = (c: Conv) => !!c.ultimo_mensaje_cliente_at && ahora.getTime() - Date.parse(c.ultimo_mensaje_cliente_at) < DIA;

  const cuando = (iso: string) => {
    const d = new Date(iso);
    return fechaIso(fechaLocal(d, zona)) === fechaIso(fechaLocal(ahora, zona)) ? horaCorta(d, zona) : etiquetaHorario(d, zona).split(",")[0];
  };

  return (
    <>
      <header className="barra-wa">
        <div>
          <h1>Chats</h1>
          <p className="barra-sub">Hola, {corredor.nombre_contacto}</p>
        </div>
        <Link href="/panel/mas" className="boton boton-mas">
          <IconoMas tamano={22} />
          Más
        </Link>
      </header>
      <Aviso texto={aviso} />

      {total > 0 ? (
        <section className="te-necesitan" aria-label="Te necesitan">
          <h2>
            {total === 1 ? "1 cliente te espera" : `${total} clientes te esperan`}
          </h2>

          {pendientes.map((b) => {
            const c = porId.get(b.conversacion_id)!;
            const contacto = uno(c.contactos);
            const dijo = delCliente.get(c.id);
            return (
              <article key={b.id} className="pendiente">
                <Link href={`/panel/conversaciones/${c.id}`} className="pendiente-quien">
                  <Avatar nombre={contacto.nombre} telefono={contacto.telefono} />
                  <strong>{nombre(contacto)}</strong>
                </Link>
                <div className="mini-hilo">
                  {dijo?.contenido && <p className="burbuja cliente">{dijo.contenido}</p>}
                  <p className="burbuja saliente propuesta">
                    <span className="propuesta-titulo">La asistente le contestaría:</span>
                    {b.contenido}
                  </p>
                </div>
                {b.accion && <p className="suave">{queHace(b.accion, zona)}</p>}
                {abierta(c) ? (
                  <form action={aprobar}>
                    <input type="hidden" name="mensaje" value={b.id} />
                    <input type="hidden" name="texto" value={b.contenido ?? ""} />
                    <input type="hidden" name="volver" value="/panel" />
                    <BotonEnviar texto="✓ Enviar así" pendiente="Enviando…" className="verde grande" />
                  </form>
                ) : (
                  <p className="aviso">Pasó más de un día desde que escribió: contéstale desde tu WhatsApp.</p>
                )}
                <div className="botones secundarios">
                  <Link href={`/panel/conversaciones/${c.id}#borrador`} className="boton secundario">
                    ✎ Cambiarla
                  </Link>
                  <form action={yoLeEscribo} style={{ flex: "1 1 auto", display: "flex" }}>
                    <input type="hidden" name="conversacion" value={c.id} />
                    <button type="submit" className="secundario" style={{ flex: 1 }}>
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
                <Link href={`/panel/conversaciones/${c.id}`} className="pendiente-quien">
                  <Avatar nombre={contacto.nombre} telefono={contacto.telefono} />
                  <strong>{nombre(contacto)} quiere hablar contigo</strong>
                </Link>
                {dijo?.contenido && (
                  <div className="mini-hilo">
                    <p className="burbuja cliente">{dijo.contenido}</p>
                  </div>
                )}
                <a href={whatsapp(contacto.telefono)} className="boton verde grande" target="_blank" rel="noreferrer">
                  Escribirle por WhatsApp
                </a>
                <form action={devolver}>
                  <input type="hidden" name="conversacion" value={c.id} />
                  <input type="hidden" name="volver" value="/panel" />
                  <BotonEnviar texto="Ya lo atendí" pendiente="Un momento…" className="grande secundario" />
                </form>
              </article>
            );
          })}
        </section>
      ) : (
        <p className="al-dia">
          <span aria-hidden>✓</span> Todo al día: ningún cliente te espera.
        </p>
      )}

      {conversaciones.length === 0 && <p className="vacio">Todavía no te ha escrito ningún cliente.</p>}
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
                    {m && <span className={`hora${marca ? " nueva" : ""}`}>{cuando(m.created_at)}</span>}
                  </span>
                  <span className="renglon">
                    <span className="vista">
                      {c.control === "corredor" ? "Le contestas tú · " : ""}
                      {m?.direccion === "saliente" && <span className="visto" aria-label="enviado">✓✓ </span>}
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
