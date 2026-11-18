import { LIMITES } from "@/lib/panel/texto-libre";
import { BotonEnviar } from "../../../boton-enviar";
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
        {/* Enter (o "Ir" en el teclado del teléfono) usa el primer botón del formulario: este, que guarda el texto con el día
            que ya tenía (el de "Otro día"). Antes el primero era "Mañana" y Enter cambiaba la fecha. */}
        <button type="submit" className="oculto" tabIndex={-1} aria-hidden="true">
          Guardar
        </button>
        <input
          data-patty="cliente-recordatorio-texto"
          id="nota"
          name="nota"
          type="text"
          aria-label="Qué tienes que hacer"
          defaultValue={nota ?? ""}
          maxLength={LIMITES.nota}
          placeholder="¿Qué tienes que hacer? Ej.: llamarla"
        />
        <div className="fc-atajos" role="group" aria-label="Cuándo">
          <BotonEnviar texto="Mañana" pendiente="Mañana" name="dias" value="1" />
          <BotonEnviar texto="En 3 días" pendiente="En 3 días" name="dias" value="3" />
          <BotonEnviar texto="En 1 semana" pendiente="En 1 semana" name="dias" value="7" />
        </div>
        <div className="fc-fila-final">
          <details>
            <summary>Otro día</summary>
            <div className="fc-fila">
              <input id="fecha" name="fecha" type="date" aria-label="Día" defaultValue={fecha ?? manana} />
              <BotonEnviar texto="Guardar" pendiente="Guardando…" className="primario" />
            </div>
          </details>
          {fecha && (
            <BotonEnviar
              texto={
                <>
                  <IconoCheck tamano={18} />
                  Ya lo hice
                </>
              }
              pendiente="Un momento…"
              name="quitar"
              value="1"
              className="fc-ya"
            />
          )}
        </div>
      </form>
    </section>
  );
}
