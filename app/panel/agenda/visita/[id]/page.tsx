import Link from "next/link";
import { notFound } from "next/navigation";
import { etiquetaHorario } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, minutosLocales } from "@/lib/agenda/tiempo";
import { telefonoBonito } from "@/lib/crm/perfil";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../../aviso";
import { ComoLlegar } from "../../../como-llegar";
import { Volver } from "../../../volver";
import { cambiarLaVisita, moverLaVisita } from "../../acciones";

// Una visita: con quién, qué casa y dónde; confirmarla, moverla de hora, cancelarla o, después,
// anotar si se hizo o si el cliente no llegó. Al cambiarla se le puede avisar al cliente por WhatsApp.

const ESTADO: Record<string, string> = {
  agendada: "Por confirmar",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  realizada: "Hecha",
  no_asistio: "No llegó",
};

export default async function Visita({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { id } = await params;
  const { aviso } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const { data: v } = await supabase
    .from("citas")
    .select("id, inicio, fin, estado, contacto_id, contactos(nombre, telefono), propiedades(id, titulo, zona, canton)")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!v) notFound();
  const contacto = (Array.isArray(v.contactos) ? v.contactos[0] : v.contactos) as { nombre: string | null; telefono: string } | null;
  const casa = (Array.isArray(v.propiedades) ? v.propiedades[0] : v.propiedades) as { id: string; titulo: string; zona: string | null; canton: string | null } | null;
  const inicio = new Date(v.inicio as string);
  const activa = v.estado === "agendada" || v.estado === "confirmada";
  const paso = inicio.getTime() < Date.now();
  const min = minutosLocales(inicio, zona);
  const hora = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  const nombre = contacto?.nombre ?? (contacto ? telefonoBonito(contacto.telefono) : "Cliente");
  const dia = fechaIso(fechaLocal(inicio, zona));

  const boton = (estado: string, texto: string, clase = "") => (
    <form action={cambiarLaVisita}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estado" value={estado} />
      {(estado === "confirmada" || estado === "cancelada") && <input type="hidden" name="avisar" value="1" />}
      <button type="submit" className={clase}>
        {texto}
      </button>
    </form>
  );

  return (
    <>
      <Volver href={`/panel/agenda?vista=dia&fecha=${dia}`} texto="Agenda" />
      <header className="encabezado">
        <div>
          <h1>Visita con {nombre}</h1>
          <p className="suave">{etiquetaHorario(inicio, zona)}</p>
        </div>
        <span className={`insignia${v.estado === "confirmada" ? " dorada" : ""}`}>{ESTADO[v.estado as string] ?? (v.estado as string)}</span>
      </header>
      <Aviso texto={aviso} />

      <section className="tarjeta pila">
        {casa ? (
          <p>
            <strong>
              <Link href={`/panel/propiedades/${casa.id}`}>{casa.titulo}</Link>
            </strong>
            {casa.zona && <span className="suave"> · {casa.zona}</span>}
            {casa.canton && casa.canton !== casa.zona && <span className="suave"> · {casa.canton}</span>}
          </p>
        ) : (
          <p className="suave">Todavía no se sabe qué casa va a ver.</p>
        )}
        <div className="botones">
          <Link href={`/panel/clientes/${v.contacto_id as string}`} className="boton">
            Ver el cliente
          </Link>
        </div>
        {casa && (
          <>
            <p className="suave">Cómo llegar:</p>
            <ComoLlegar casa={casa} />
          </>
        )}
      </section>

      {activa && !paso && (
        <>
          <div className="botones visita-botones">
            {v.estado === "agendada" && boton("confirmada", "Confirmar y avisarle", "primario")}
            {boton("cancelada", "Cancelar y avisarle", "peligro")}
          </div>
          <h2>Moverla a otra hora</h2>
          <form action={moverLaVisita} className="tarjeta pila">
            <input type="hidden" name="id" value={id} />
            <div className="fila campos">
              <div className="pila" style={{ flex: 1 }}>
                <label htmlFor="fecha">Día</label>
                <input id="fecha" name="fecha" type="date" required defaultValue={dia} />
              </div>
              <div className="pila" style={{ flex: 1 }}>
                <label htmlFor="hora">Hora</label>
                <input id="hora" name="hora" type="time" required step={900} defaultValue={hora} />
              </div>
            </div>
            <label className="casilla">
              <input type="checkbox" name="avisar" defaultChecked /> Avisarle al cliente por WhatsApp
            </label>
            <button type="submit" className="primario">
              Mover la visita
            </button>
          </form>
        </>
      )}
      {activa && paso && (
        <>
          <h2>¿Cómo salió?</h2>
          <div className="botones visita-botones">
            {boton("realizada", "Se hizo", "primario")}
            {boton("no_asistio", "No llegó")}
          </div>
        </>
      )}
    </>
  );
}
