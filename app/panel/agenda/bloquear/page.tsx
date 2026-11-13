import { rangoBloqueo } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, sumarDias } from "@/lib/agenda/tiempo";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { BotonEnviar } from "../../boton-enviar";
import { Volver } from "../../volver";
import { bloquearDesdeAgenda, quitarBloqueoAgenda } from "../acciones";
import { ElegirDia } from "./elegir-dia";

// "Apartar tiempo" (la ruta y las tablas siguen llamándose bloquear/bloqueos): un día o unas horas en que la
// asistente no ofrece visitas. También se puede pedir por WhatsApp o a Patty: "apartar mañana en la tarde".

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const RATOS = [
  ["todo", "Todo el día", "No agenda nada ese día"],
  ["manana", "Mañana", "7 a 12"],
  ["tarde", "Tarde", "12 a 6"],
  ["noche", "Noche", "6 a 10"],
  ["horas", "Horas exactas", "Tú eliges desde y hasta"],
] as const;

const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default async function Bloquear({ searchParams }: { searchParams: Promise<{ fecha?: string; aviso?: string }> }) {
  const { fecha, aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const zona = corredor.zona_horaria;
  const hoyLocal = fechaLocal(new Date(), zona);
  const hoy = fechaIso(hoyLocal);
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha >= hoy ? fecha : hoy;
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = sumarDias(hoyLocal, i);
    return { fecha: fechaIso(d), arriba: i === 0 ? "Hoy" : i === 1 ? "Mañana" : DIAS_CORTOS[d.diaSemana], numero: d.dia };
  });
  const { data } = await supabase
    .from("bloqueos_agenda")
    .select("id, inicio, fin, motivo")
    .eq("corredor_id", corredor.id)
    .gt("fin", new Date().toISOString())
    .order("inicio")
    .limit(20);
  const proximos = (data ?? []) as { id: string; inicio: string; fin: string; motivo: string | null }[];

  return (
    <div className="bloquear">
      <Volver href={`/panel/agenda?vista=dia&fecha=${dia}`} texto="Agenda" />
      <header className="encabezado">
        <div>
          <h1>Apartar tiempo</h1>
          <p className="suave">La asistente no agenda visitas en el tiempo que apartes. Las que ya tienes siguen en pie.</p>
        </div>
      </header>
      <Aviso texto={aviso} />

      <form action={bloquearDesdeAgenda} className="tarjeta pila form-bloquear">
        <h2 className="bloquear-paso">
          <span>1</span> ¿Qué día?
        </h2>
        <ElegirDia dias={dias} inicial={dia} hoy={hoy} />

        <h2 className="bloquear-paso">
          <span>2</span> ¿Qué parte del día?
        </h2>
        <fieldset className="bloquear-ratos" data-patty="bloquear-rato">
          <legend className="oculto">Parte del día</legend>
          {RATOS.map(([v, t, sub], i) => (
            <label key={v} className={`bloquear-rato rato-${v}`}>
              <input type="radio" name="rato" value={v} defaultChecked={i === 0} />
              <strong>{t}</strong>
              <small>{sub}</small>
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
          <summary>¿Son varios días seguidos? (vacaciones, un viaje)</summary>
          <label htmlFor="fecha_hasta">Hasta el día</label>
          <input id="fecha_hasta" type="date" name="fecha_hasta" min={hoy} />
          <p className="suave">Se aparta igual cada día, desde el día que elegiste arriba.</p>
        </details>

        <label htmlFor="motivo" className="bloquear-motivo-etiqueta">
          ¿Por qué? <span className="suave">(opcional, solo lo ves tú)</span>
        </label>
        <input id="motivo" name="motivo" maxLength={120} placeholder="Cita médica, reunión, vacaciones…" data-patty="bloquear-motivo" />

        <div className="bloquear-enviar">
          <BotonEnviar texto="Apartar tiempo" pendiente="Apartando…" className="primario grande" />
        </div>
      </form>

      <section className="tarjeta pila bloquear-lista">
        <h2>Tiempo apartado</h2>
        {proximos.length === 0 ? (
          <p className="suave">No tienes tiempo apartado. Todo tu horario está abierto para visitas.</p>
        ) : (
          proximos.map((b) => (
            <form key={b.id} action={quitarBloqueoAgenda} className="bloquear-item">
              <span className="bloquear-item-texto">
                <strong>{capitalizar(rangoBloqueo(b, zona))}</strong>
                {b.motivo && <small className="suave">{b.motivo}</small>}
              </span>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="volver" value="/panel/agenda/bloquear" />
              <button type="submit" className="chico">
                Quitar
              </button>
            </form>
          ))
        )}
      </section>

      <p className="suave bloquear-pie">
        También puedes escribirle a {corredor.nombre_asistente ?? "Patty"} o a la asistente por WhatsApp: «apartar el viernes de 2 a 4».
      </p>
    </div>
  );
}
