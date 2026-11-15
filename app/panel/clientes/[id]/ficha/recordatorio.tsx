import { IconoCheck } from "../../../iconos";
import { guardarSeguimiento } from "../../acciones";
import { pastillaRecordatorio, venceRecordatorio } from "./reglas";

/** Recordatorio (#recordatorio): qué hacer y cuándo, con atajos de día y "Ya lo hice". */
export function Recordatorio({ id, fecha, nota, hoy, manana }: { id: string; fecha: string | null; nota: string | null; hoy: string; manana: string }) {
  const vence = venceRecordatorio(fecha, hoy);
  return (
    <section id="recordatorio" className={`tarjeta fc-bloque${vence ? " fc-vence" : ""}`}>
      <div className="fc-bloque-cabeza">
        <h2 data-patty="cliente-recordatorio">Recordatorio</h2>
        {fecha && <span className={`fc-pastilla${vence ? " vence" : ""}`}>{pastillaRecordatorio(fecha, hoy, manana)}</span>}
      </div>
      <form action={guardarSeguimiento} className="fc-form">
        <input type="hidden" name="id" value={id} />
        <input
          data-patty="cliente-recordatorio-texto"
          id="nota"
          name="nota"
          type="text"
          aria-label="Qué tienes que hacer"
          defaultValue={nota ?? ""}
          placeholder="¿Qué tienes que hacer? Ej.: llamarla"
        />
        <div className="fc-atajos" role="group" aria-label="Cuándo">
          <button type="submit" name="dias" value="1">
            Mañana
          </button>
          <button type="submit" name="dias" value="3">
            En 3 días
          </button>
          <button type="submit" name="dias" value="7">
            En 1 semana
          </button>
        </div>
        <div className="fc-fila-final">
          <details>
            <summary>Otro día</summary>
            <div className="fc-fila">
              <input id="fecha" name="fecha" type="date" aria-label="Día" defaultValue={fecha ?? manana} />
              <button type="submit" className="primario">
                Guardar
              </button>
            </div>
          </details>
          {fecha && (
            <button type="submit" name="quitar" value="1" className="fc-ya">
              <IconoCheck tamano={18} />
              Ya lo hice
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
