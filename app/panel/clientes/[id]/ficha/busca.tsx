import { ZONAS_CONOCIDAS } from "@/lib/agenda/zonas";
import type { Busca } from "@/lib/crm/perfil";
import { resumenBusca } from "@/lib/panel/movil";
import { guardarBusca } from "../../acciones";
import { SeccionPlegable } from "../movil";
import type { DatoBusca } from "./reglas";

/** Qué busca (#busca): lo que la asistente anotó del chat y "Corregirlo". */
export function QueBusca({ id, busca, datos, asistente }: { id: string; busca: Busca; datos: DatoBusca[]; asistente: string }) {
  return (
    <SeccionPlegable id="busca" className="tarjeta fc-bloque" resumen={resumenBusca(datos)}>
      <div className="fc-bloque-cabeza">
        <h2 data-patty="cliente-busca">Qué busca</h2>
      </div>
      {datos.length > 0 ? (
        <dl className="fc-busca">
          {datos.map((x) => (
            <div key={x.k}>
              <dt>{x.k}</dt>
              <dd>{x.v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="suave">Todavía no lo dijo. {asistente} lo anota sola cuando el cliente lo cuenta en el chat.</p>
      )}
      <details className="fc-editar">
        <summary>Corregirlo</summary>
        <FormularioBusca id={id} busca={busca} />
      </details>
    </SeccionPlegable>
  );
}

function FormularioBusca({ id, busca }: { id: string; busca: Busca }) {
  return (
    <form action={guardarBusca} className="fc-form">
      <input type="hidden" name="id" value={id} />
      <div className="fc-dos">
        <div className="fc-campo">
          <label htmlFor="operacion">Para</label>
          <select id="operacion" name="operacion" defaultValue={busca.operacion ?? ""}>
            <option value="">Sin decir</option>
            <option value="venta">Comprar</option>
            <option value="alquiler">Alquilar</option>
          </select>
        </div>
        <div className="fc-campo">
          <label htmlFor="tipo">Tipo</label>
          <input id="tipo" name="tipo" type="text" defaultValue={busca.tipo ?? ""} placeholder="casa, apartamento…" />
        </div>
      </div>
      <label htmlFor="zonas">Zonas (separadas por coma)</label>
      <input id="zonas" name="zonas" type="text" list="zonas-conocidas" defaultValue={(busca.zonas ?? []).join(", ")} placeholder="Escazú, Santa Ana" />
      <datalist id="zonas-conocidas">
        {ZONAS_CONOCIDAS.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
      <label htmlFor="presupuesto">Presupuesto máximo</label>
      <div className="fc-monto">
        <input id="presupuesto" name="presupuesto" type="text" inputMode="numeric" defaultValue={busca.presupuesto_max ?? ""} />
        <select id="moneda" name="moneda" aria-label="Moneda" defaultValue={busca.moneda ?? "USD"}>
          <option value="USD">Dólares</option>
          <option value="CRC">Colones</option>
        </select>
      </div>
      <label htmlFor="habitaciones">Cuartos</label>
      <input id="habitaciones" name="habitaciones" type="number" min={0} defaultValue={busca.habitaciones ?? ""} />
      <button type="submit" className="primario">
        Guardar
      </button>
    </form>
  );
}
