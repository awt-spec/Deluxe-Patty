import { fechaIso, fechaLocal } from "@/lib/agenda/tiempo";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { BotonEnviar } from "../../boton-enviar";
import { Volver } from "../../volver";
import { bloquearDesdeAgenda } from "../acciones";

// Bloquear un día o unas horas desde la agenda: la asistente no ofrece visitas en ese rato.
// También se puede pedir por WhatsApp o a Patty: "bloquear mañana en la tarde".

export default async function Bloquear({ searchParams }: { searchParams: Promise<{ fecha?: string; aviso?: string }> }) {
  const { fecha, aviso } = await searchParams;
  const { corredor } = await sesionConCorredor();
  const hoy = fechaIso(fechaLocal(new Date(), corredor.zona_horaria));
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha >= hoy ? fecha : hoy;
  return (
    <>
      <Volver href={`/panel/agenda?vista=dia&fecha=${dia}`} texto="Agenda" />
      <header className="encabezado">
        <h1>Bloquear un rato</h1>
      </header>
      <Aviso texto={aviso} />
      <p className="suave">Elige cuándo no puedes y la asistente no agendará visitas ahí.</p>
      <form action={bloquearDesdeAgenda} className="tarjeta pila form-bloquear">
        <label htmlFor="fecha">Día</label>
        <input id="fecha" type="date" name="fecha" defaultValue={dia} min={hoy} required data-patty="bloquear-dia" />

        <fieldset className="bloquear-ratos" data-patty="bloquear-rato">
          <legend>¿Qué parte del día?</legend>
          {[
            ["todo", "Todo el día"],
            ["manana", "En la mañana (7 a 12)"],
            ["tarde", "En la tarde (12 a 6)"],
            ["noche", "En la noche (6 a 10)"],
            ["horas", "Unas horas exactas"],
          ].map(([v, t], i) => (
            <label key={v} className="opcion">
              <input type="radio" name="rato" value={v} defaultChecked={i === 0} /> {t}
            </label>
          ))}
        </fieldset>

        <div className="bloquear-horas">
          <label>
            Desde
            <input type="time" name="hora_desde" defaultValue="14:00" step={900} />
          </label>
          <label>
            Hasta
            <input type="time" name="hora_hasta" defaultValue="16:00" step={900} />
          </label>
        </div>

        <details className="bloquear-varios">
          <summary>¿Son varios días seguidos?</summary>
          <label htmlFor="fecha_hasta">Hasta el día</label>
          <input id="fecha_hasta" type="date" name="fecha_hasta" min={hoy} />
          <p className="suave">Por ejemplo, unas vacaciones. Se bloquea igual cada día.</p>
        </details>

        <label htmlFor="motivo">¿Por qué? (opcional, solo lo ves tú)</label>
        <input id="motivo" name="motivo" maxLength={120} placeholder="Cita médica, reunión, vacaciones…" data-patty="bloquear-motivo" />

        <BotonEnviar texto="Bloquear" pendiente="Bloqueando…" className="primario grande" />
      </form>
      <p className="suave">
        También puedes escribirle a {corredor.nombre_asistente ?? "Patty"} o a la asistente por WhatsApp: «bloquear el viernes de 2 a 4».
      </p>
    </>
  );
}
