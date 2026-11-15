import { ConservarBorrador } from "../../../conservar-borrador";
import { guardarNotas } from "../../acciones";
import { SeccionPlegable } from "../movil";
import { resumenNotas } from "./reglas";

/** Notas (#fc-notas) y el nombre del cliente; lo escrito se conserva con ConservarBorrador. */
export function Notas({ id, nombre, notas }: { id: string; nombre: string | null; notas: string | null }) {
  return (
    <SeccionPlegable id="fc-notas" className="tarjeta fc-bloque" resumen={resumenNotas(notas)}>
      <div className="fc-bloque-cabeza">
        <h2 data-patty="cliente-notas">Notas</h2>
      </div>
      <p className={notas ? "fc-notas" : "suave"}>{notas ?? "Sin notas todavía."}</p>
      <details className="fc-editar">
        <summary>{notas ? "Editar" : "Escribir notas"}</summary>
        <form action={guardarNotas} className="fc-form">
          <input type="hidden" name="id" value={id} />
          <label htmlFor="nombre">Nombre</label>
          <input id="nombre" name="nombre" type="text" defaultValue={nombre ?? ""} />
          <label htmlFor="notas">Lo que quieras recordar</label>
          <textarea id="notas" name="notas" maxLength={4000} defaultValue={notas ?? ""} placeholder="Tiene dos hijos, busca colegio cerca, viene de Estados Unidos…" />
          <ConservarBorrador nombre={`notas-${id}`} />
          <button type="submit" className="primario">
            Guardar
          </button>
        </form>
      </details>
    </SeccionPlegable>
  );
}
