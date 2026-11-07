import { fechaIso, fechaLocal } from "@/lib/agenda/tiempo";
import { telefonoBonito } from "@/lib/crm/perfil";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { Volver } from "../../volver";
import { agendarVisita } from "../acciones";

// Agendar una visita a mano: se llega tocando una hora libre del calendario (trae día y hora) o desde la
// ficha del cliente (trae el cliente).

export default async function NuevaVisita({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; hora?: string; cliente?: string; aviso?: string }>;
}) {
  const { fecha, hora, cliente, aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const [{ data: clientes }, { data: casas }] = await Promise.all([
    supabase
      .from("contactos")
      .select("id, nombre, telefono")
      .eq("corredor_id", corredor.id)
      .eq("es_corredor", false)
      .not("etapa", "in", "(cerrado,perdido)")
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase.from("propiedades").select("id, titulo, zona").eq("corredor_id", corredor.id).eq("estado", "activa").order("titulo"),
  ]);
  const hoy = fechaIso(fechaLocal(new Date(), corredor.zona_horaria));
  return (
    <>
      <Volver href={`/panel/agenda${fecha ? `?vista=dia&fecha=${fecha}` : ""}`} texto="Agenda" />
      <header className="encabezado">
        <h1>Agendar visita</h1>
      </header>
      <Aviso texto={aviso} />
      <form action={agendarVisita} className="tarjeta pila">
        <label htmlFor="cliente">Cliente</label>
        <select id="cliente" name="cliente" required defaultValue={cliente ?? ""}>
          <option value="" disabled>
            Elige el cliente
          </option>
          {(clientes ?? []).map((c) => (
            <option key={c.id as string} value={c.id as string}>
              {(c.nombre as string | null) ?? telefonoBonito(c.telefono as string)}
            </option>
          ))}
        </select>
        <label htmlFor="casa">Casa que va a ver</label>
        <select id="casa" name="casa" defaultValue="">
          <option value="">Todavía no sé</option>
          {(casas ?? []).map((p) => (
            <option key={p.id as string} value={p.id as string}>
              {p.titulo as string}
              {p.zona ? ` · ${p.zona as string}` : ""}
            </option>
          ))}
        </select>
        <div className="fila campos">
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="fecha">Día</label>
            <input id="fecha" name="fecha" type="date" required min={hoy} defaultValue={fecha ?? hoy} />
          </div>
          <div className="pila" style={{ flex: 1 }}>
            <label htmlFor="hora">Hora</label>
            <input id="hora" name="hora" type="time" required step={900} defaultValue={hora ?? "09:00"} />
          </div>
        </div>
        <label htmlFor="minutos">Cuánto dura (minutos)</label>
        <input id="minutos" name="minutos" type="number" min={15} max={240} step={15} defaultValue={corredor.duracion_visita_min} />
        <label className="casilla">
          <input type="checkbox" name="avisar" defaultChecked /> Avisarle al cliente por WhatsApp
        </label>
        <button type="submit" className="primario">
          Agendar
        </button>
      </form>
    </>
  );
}
