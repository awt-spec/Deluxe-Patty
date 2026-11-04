import Link from "next/link";
import { diaLargo, etiquetaHorario, horaCorta } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, limitesDia } from "@/lib/agenda/tiempo";
import { pendientesDe } from "@/lib/panel/pendientes";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "./aviso";
import { Avatar } from "./avatar";
import { IconoCampana, IconoCheck, IconoDobleCheck, IconoFlecha, IconoMas } from "./iconos";

// Inicio, como WhatsApp: arriba solo lo urgente (un botón para revisar lo que espera, las visitas de
// hoy y los seguimientos), abajo todos los chats. Lo demás vive en su pestaña.

type Contacto = { id: string; nombre: string | null; telefono: string; etapa: string };
type Conv = {
  id: string;
  estado: "abierta" | "escalada" | "cerrada";
  control: "asistente" | "corredor";
  updated_at: string;
  contactos: Contacto | Contacto[];
};
type Msj = { conversacion_id: string; direccion: string; contenido: string | null; created_at: string };
type Visita = { id: string; inicio: string; contactos: { nombre: string | null; telefono: string } | null; propiedades: { titulo: string } | null };

const uno = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);
const DIA = 24 * 60 * 60_000;
const nombre = (c: { nombre: string | null; telefono: string }) => c.nombre ?? c.telefono;

export default async function Chats({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const ahora = new Date();
  const hoy = limitesDia(ahora, zona);

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
      .select("id, inicio, contactos(nombre, telefono), propiedades(titulo)")
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

      {(visitas.length > 0 || seguimientos.length > 0 || sinRespuesta.length > 0) && (
        <section className="hoy" aria-label="Hoy">
          <h2>
            <IconoCampana tamano={20} /> Hoy
          </h2>
          <ul className="hoy-lista">
            {visitas.map((v) => (
              <li key={`v-${v.id}`}>
                <Link href="/panel/agenda">
                  <span className="hoy-hora">{horaCorta(new Date(v.inicio), zona)}</span>
                  <span>
                    Visita con <strong>{v.contactos ? nombre(v.contactos) : "un cliente"}</strong>
                    {v.propiedades && <span className="suave"> · {v.propiedades.titulo}</span>}
                  </span>
                </Link>
              </li>
            ))}
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

      <h2>Chats</h2>
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
