import { NOMBRE_ETAPA, resumenBusca, type Busca, type Etapa } from "@/lib/crm/perfil";
import { Escribir } from "./escribir";
import { IconoCamara, IconoCheck, IconoDocumento, IconoDobleCheck } from "../../iconos";
import Link from "next/link";
import { notFound } from "next/navigation";
import { conPunto, diaLargo, etiquetaHorario, horaCorta } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, sumarDias } from "@/lib/agenda/tiempo";
import type { AccionPendiente } from "@/lib/datos/tipos";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { aprobar, descartar, devolver, escribir, tomar } from "../../acciones";
import { Aviso } from "../../aviso";
import { Avatar } from "../../avatar";
import { IconoAtras, IconoEnviar, IconoTelefono } from "../../iconos";

type Mensaje = {
  id: string;
  direccion: "entrante" | "saliente";
  autor: "cliente" | "asistente" | "corredor" | "sistema";
  tipo: string;
  contenido: string | null;
  estado_borrador: "pendiente" | "aprobado" | "corregido" | "descartado" | null;
  estado_entrega: string | null;
  accion: AccionPendiente | null;
  intencion: string | null;
  created_at: string;
};

const INTENCION: Record<string, string> = {
  consulta_propiedad: "pregunta por una propiedad",
  agendar_visita: "quiere agendar una visita",
  pasar_a_corredor: "quiere hablar contigo",
  otro: "un saludo o comentario",
};

function describirAccion(a: AccionPendiente, zona: string): string {
  if (a.tipo === "crear_cita") return conPunto(`Al enviarla queda agendada la visita del ${etiquetaHorario(new Date(a.inicio), zona)}`);
  if (a.tipo === "cancelar_cita") return "Al enviarla se cancela la visita.";
  return "Al enviarla la visita queda confirmada.";
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
      .select("id, estado, control, ultimo_mensaje_cliente_at, contactos!inner(id, nombre, telefono, origen, etapa, busca)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("mensajes")
      .select("id, direccion, autor, tipo, contenido, estado_borrador, estado_entrega, accion, intencion, created_at")
      .eq("conversacion_id", id)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);
  if (!conv) notFound();
  const contacto = (Array.isArray(conv.contactos) ? conv.contactos[0] : conv.contactos) as {
    id: string;
    nombre: string | null;
    telefono: string;
    origen: string;
    etapa: Etapa;
    busca: Busca;
  };
  const lista = (mensajes ?? []) as Mensaje[];
  // Para la propuesta pendiente: qué entendió la asistente del último mensaje del cliente y qué casas menciona.
  const hayBorrador = lista.some((m) => m.estado_borrador === "pendiente");
  const { data: casas } = hayBorrador
    ? await supabase.from("propiedades").select("id, codigo, titulo").eq("corredor_id", corredor.id).in("estado", ["activa", "reservada"]).limit(200)
    : { data: [] };
  const casasEn = (texto: string | null) =>
    ((casas ?? []) as { id: string; codigo: string; titulo: string }[]).filter(
      (p) => !!texto && (texto.toLowerCase().includes(p.titulo.toLowerCase()) || texto.includes(p.codigo)),
    );
  const ultimaIntencion = [...lista].reverse().find((m) => m.direccion === "entrante" && m.intencion)?.intencion ?? null;
  const ultimo = conv.ultimo_mensaje_cliente_at ? new Date(conv.ultimo_mensaje_cliente_at as string) : null;
  const ventanaAbierta = !!ultimo && Date.now() - ultimo.getTime() < 24 * 60 * 60_000;
  const suya = conv.control === "corredor";

  // Separadores de día como en WhatsApp: "Hoy", "Ayer" o la fecha.
  const hoy = fechaLocal(new Date(), zona);
  const diaDe = (iso: string) => {
    const d = fechaIso(fechaLocal(new Date(iso), zona));
    if (d === fechaIso(hoy)) return "Hoy";
    if (d === fechaIso(sumarDias(hoy, -1))) return "Ayer";
    return diaLargo(new Date(iso), zona);
  };
  let diaAnterior = "";

  return (
    <>
      <header className="barra-chat">
        <Link href="/panel" className="atras" aria-label="Volver a los chats">
          <IconoAtras tamano={28} />
        </Link>
        <Avatar nombre={contacto.nombre} telefono={contacto.telefono} />
        <Link href={`/panel/clientes/${contacto.id}`} className="barra-chat-nombre" aria-label="Ver la ficha del cliente">
          <strong>{contacto.nombre ?? contacto.telefono}</strong>
          <span>
            <span className={`etapa etapa-${contacto.etapa}`}>{NOMBRE_ETAPA[contacto.etapa] ?? contacto.etapa}</span>{" "}
            {resumenBusca(contacto.busca ?? {}) || "toca para ver su ficha"}
          </span>
        </Link>
        <a href={`tel:${contacto.telefono}`} className="llamar" aria-label="Llamar">
          <IconoTelefono tamano={26} />
        </a>
      </header>

      <div className={`quien-contesta${suya ? " tu" : ""}${conv.estado === "escalada" ? " espera" : ""}`}>
        <p>
          {conv.estado === "escalada"
            ? "Quiere hablar contigo."
            : suya
              ? "Le estás contestando tú."
              : "La asistente le está contestando."}
        </p>
        {suya ? (
          <form action={devolver}>
            <input type="hidden" name="conversacion" value={id} />
            <button type="submit">Que siga la asistente</button>
          </form>
        ) : (
          <form action={tomar}>
            <input type="hidden" name="conversacion" value={id} />
            <button type="submit">Le contesto yo</button>
          </form>
        )}
        {conv.estado === "escalada" && !suya && (
          <form action={devolver}>
            <input type="hidden" name="conversacion" value={id} />
            <button type="submit">Ya lo atendí</button>
          </form>
        )}
      </div>
      <Aviso texto={aviso} />

      <section className="hilo fondo-wa" aria-label="Mensajes">
        {lista.map((m) => {
          const dia = diaDe(m.created_at);
          const separador =
            dia !== diaAnterior ? (
              <p className="dia-separador" key={`d-${m.id}`}>
                {dia}
              </p>
            ) : null;
          diaAnterior = dia;
          const hora = horaCorta(new Date(m.created_at), zona);
          if (m.estado_borrador === "pendiente") {
            return [
              separador,
              <form key={m.id} id="borrador" action={aprobar} className="borrador pila">
                <span className="propuesta-titulo">La asistente le contestaría esto. ¿Se lo mando?</span>
                <p className="por-que">
                  {ultimaIntencion && <>Entendió: {INTENCION[ultimaIntencion] ?? ultimaIntencion}.</>}
                  {casasEn(m.contenido).length > 0 && (
                    <>
                      {" "}
                      Menciona:{" "}
                      {casasEn(m.contenido).map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && ", "}
                          <Link href={`/panel/propiedades/${p.id}`}>{p.titulo}</Link>
                        </span>
                      ))}
                      .
                    </>
                  )}
                </p>
                {m.accion && <p className="suave">{describirAccion(m.accion, zona)}</p>}
                <input type="hidden" name="mensaje" value={m.id} />
                <label htmlFor={`texto-${m.id}`} className="suave">
                  Puedes cambiar el texto antes de enviarlo:
                </label>
                <textarea
                  id={`texto-${m.id}`}
                  name="texto"
                  defaultValue={m.contenido ?? ""}
                  // Alto según el largo, para leer el borrador completo sin desplazarse dentro del cuadro.
                  rows={Math.min(12, Math.max(4, Math.ceil((m.contenido ?? "").length / 30) + 1))}
                />
                <div className="botones">
                  <button type="submit" className="verde grande" disabled={!ventanaAbierta}>
                    <IconoCheck tamano={24} /> Enviar
                  </button>
                  <button type="submit" formAction={descartar} className="peligro">
                    No enviar
                  </button>
                </div>
              </form>,
            ];
          }
          const clase =
            m.direccion === "entrante" ? "cliente" : `saliente ${m.estado_borrador === "descartado" ? "descartado" : ""}`;
          return [
            separador,
            <div key={m.id} className={`burbuja ${clase}`}>
              {m.direccion === "saliente" && m.autor === "asistente" && <span className="autor">Asistente</span>}
              {(m.tipo === "documento" || m.tipo === "imagen") && m.direccion === "entrante" ? (
                // Lo que manda el cliente con una foto es su pie de foto: se muestra como texto, nunca
                // como enlace (podría ser una página falsa). La foto se ve en el WhatsApp del corredor.
                <>
                  {m.tipo === "documento" ? <IconoDocumento tamano={20} /> : <IconoCamara tamano={20} />}{" "}
                  {m.tipo === "documento" ? "Mandó un documento" : "Mandó una foto"}
                  {m.contenido ? `: ${m.contenido}` : ""}
                </>
              ) : (m.tipo === "documento" || m.tipo === "imagen") && m.contenido?.startsWith("https://") ? (
                <a href={m.contenido} target="_blank" rel="noreferrer">
                  {m.tipo === "documento" ? "Documento" : "Imagen"}
                </a>
              ) : (
                m.contenido ?? `(${m.tipo})`
              )}
              <span className="meta">
                {m.estado_borrador === "corregido" && "corregido por ti · "}
                {m.estado_entrega === "fallido" && "no se entregó · "}
                {hora}
                {m.direccion === "saliente" && m.estado_entrega !== "fallido" && (
                  <span className={`visto${m.estado_entrega === "leido" ? " leido" : ""}`} aria-label={m.estado_entrega === "leido" ? "leído" : "enviado"}>
                    <IconoDobleCheck tamano={18} />
                  </span>
                )}
              </span>
            </div>,
          ];
        })}
      </section>

      {ventanaAbierta ? (
        <Escribir conversacion={id} accion={escribir} />
      ) : (
        <div className="escribir-wa cerrado">
          <p>Pasó más de un día desde que te escribió: contéstale desde tu WhatsApp.</p>
          <a href={`https://wa.me/${contacto.telefono.replace(/\D/g, "")}`} className="boton verde" target="_blank" rel="noreferrer">
            Abrir WhatsApp
          </a>
        </div>
      )}
    </>
  );
}
