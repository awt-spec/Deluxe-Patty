import Link from "next/link";
import { notFound } from "next/navigation";
import { conPunto, etiquetaHorario } from "@/lib/agenda/formato";
import type { AccionPendiente } from "@/lib/datos/tipos";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { aprobar, descartar, devolver, escribir, tomar } from "../../acciones";
import { Aviso } from "../../aviso";

type Mensaje = {
  id: string;
  direccion: "entrante" | "saliente";
  autor: "cliente" | "asistente" | "corredor" | "sistema";
  tipo: string;
  contenido: string | null;
  estado_borrador: "pendiente" | "aprobado" | "corregido" | "descartado" | null;
  estado_entrega: string | null;
  accion: AccionPendiente | null;
  created_at: string;
};

const AUTOR: Record<Mensaje["autor"], string> = {
  cliente: "Cliente",
  asistente: "Asistente",
  corredor: "Tú",
  sistema: "Sistema",
};

function describirAccion(a: AccionPendiente, zona: string): string {
  if (a.tipo === "crear_cita") return conPunto(`Al aprobar se agenda la visita del ${etiquetaHorario(new Date(a.inicio), zona)}`);
  if (a.tipo === "cancelar_cita") return "Al aprobar se cancela la visita.";
  return "Al aprobar se marca la visita como confirmada.";
}

export default async function Conversacion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { id } = await params;
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;

  const [{ data: conv }, { data: mensajes }] = await Promise.all([
    supabase
      .from("conversaciones")
      .select("id, estado, control, ultimo_mensaje_cliente_at, contactos!inner(nombre, telefono, origen)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("mensajes")
      .select("id, direccion, autor, tipo, contenido, estado_borrador, estado_entrega, accion, created_at")
      .eq("conversacion_id", id)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);
  if (!conv) notFound();
  const contacto = (Array.isArray(conv.contactos) ? conv.contactos[0] : conv.contactos) as {
    nombre: string | null;
    telefono: string;
    origen: string;
  };
  const ultimo = conv.ultimo_mensaje_cliente_at ? new Date(conv.ultimo_mensaje_cliente_at as string) : null;
  const ventanaAbierta = !!ultimo && Date.now() - ultimo.getTime() < 24 * 60 * 60_000;
  const suya = conv.control === "corredor";

  return (
    <>
      <p>
        <Link href="/panel/conversaciones" className="suave">
          ← Conversaciones
        </Link>
      </p>
      <header className="encabezado">
        <div>
          <h1>{contacto.nombre ?? contacto.telefono}</h1>
          <p className="suave">
            <a href={`tel:${contacto.telefono}`}>{contacto.telefono}</a> · llegó por {contacto.origen}
          </p>
        </div>
      </header>

      <div className="botones">
        {conv.estado === "escalada" && <span className="insignia alerta">Te espera</span>}
        {suya ? (
          <form action={devolver}>
            <input type="hidden" name="conversacion" value={id} />
            <button type="submit">Devolver a la asistente</button>
          </form>
        ) : (
          <form action={tomar}>
            <input type="hidden" name="conversacion" value={id} />
            <button type="submit">Tomar control</button>
          </form>
        )}
        {conv.estado === "escalada" && !suya && (
          <form action={devolver}>
            <input type="hidden" name="conversacion" value={id} />
            <button type="submit">Ya lo atendí: que siga la asistente</button>
          </form>
        )}
      </div>
      <Aviso texto={aviso} />

      <section className="hilo" aria-label="Mensajes">
        {((mensajes ?? []) as Mensaje[]).map((m) => {
          const hora = etiquetaHorario(new Date(m.created_at), zona);
          if (m.estado_borrador === "pendiente") {
            return (
              <form key={m.id} action={aprobar} className="borrador pila">
                <span className="etiqueta">Borrador de la asistente</span>
                {m.accion && <p className="suave">{describirAccion(m.accion, zona)}</p>}
                <input type="hidden" name="mensaje" value={m.id} />
                <label htmlFor={`texto-${m.id}`} className="suave">
                  Puedes corregirlo antes de enviarlo:
                </label>
                <textarea
                  id={`texto-${m.id}`}
                  name="texto"
                  defaultValue={m.contenido ?? ""}
                  // Alto según el largo, para leer el borrador completo sin desplazarse dentro del cuadro.
                  rows={Math.min(12, Math.max(4, Math.ceil((m.contenido ?? "").length / 30) + 1))}
                />
                <div className="botones">
                  <button type="submit" className="primario" disabled={!ventanaAbierta}>
                    Enviar
                  </button>
                  <button type="submit" formAction={descartar} className="peligro">
                    Descartar
                  </button>
                </div>
              </form>
            );
          }
          const clase =
            m.direccion === "entrante" ? "cliente" : `saliente ${m.estado_borrador === "descartado" ? "descartado" : ""}`;
          return (
            <div key={m.id} className={`burbuja ${clase}`}>
              {m.tipo === "documento" || m.tipo === "imagen" ? (
                <a href={m.contenido ?? "#"} target="_blank" rel="noreferrer">
                  {m.tipo === "documento" ? "Documento" : "Imagen"}
                </a>
              ) : (
                m.contenido ?? `(${m.tipo})`
              )}
              <span className="meta">
                {AUTOR[m.autor]} · {hora}
                {m.estado_borrador === "corregido" && " · corregido por ti"}
                {m.estado_entrega === "fallido" && " · no se entregó"}
              </span>
            </div>
          );
        })}
      </section>

      {ventanaAbierta ? (
        <form action={escribir} className="pila tarjeta">
          <input type="hidden" name="conversacion" value={id} />
          <label htmlFor="texto-nuevo">Escribirle como tú</label>
          <textarea id="texto-nuevo" name="texto" placeholder="Al enviar, la conversación pasa a ser tuya." />
          <button type="submit" className="primario">
            Enviar
          </button>
        </form>
      ) : (
        <p className="aviso">
          Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp no deja escribirle desde la
          asistente. Escríbele desde tu WhatsApp.
        </p>
      )}
    </>
  );
}
