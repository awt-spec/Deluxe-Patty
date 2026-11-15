import { AYUDA_ETAPA, MOTIVOS_PERDIDA, NOMBRE_ETAPA, type Etapa } from "@/lib/crm/perfil";
import { IconoCheck } from "../../../iconos";
import { cambiarEtapa } from "../../acciones";
import { CAMINO, desdeCuando, estadoPaso } from "./reglas";

// El camino del cliente: también es el control para cambiar de etapa. Si está perdido, abajo se elige el motivo.

export function Camino({ id, etapa, diasEnEtapa, motivoPerdida }: { id: string; etapa: Etapa; diasEnEtapa: number; motivoPerdida: string | null }) {
  return (
    <section className="tarjeta fc-bloque">
      <div className="fc-bloque-cabeza">
        <h2 data-patty="cliente-etapa">¿En qué va?</h2>
        <span className="suave">
          {NOMBRE_ETAPA[etapa]} {desdeCuando(diasEnEtapa)}
        </span>
      </div>
      <form action={cambiarEtapa} className="fc-camino">
        <input type="hidden" name="id" value={id} />
        <ol>
          {CAMINO.map((e, i) => (
            <Paso key={e} e={e} i={i} etapa={etapa} />
          ))}
        </ol>
        <p className="fc-camino-ayuda">
          <AyudaEtapa etapa={etapa} />
        </p>
      </form>
      {etapa === "perdido" && <MotivoPerdido id={id} motivo={motivoPerdida} />}
    </section>
  );
}

function Paso({ e, i, etapa }: { e: Etapa; i: number; etapa: Etapa }) {
  const estado = estadoPaso(e, i, etapa);
  return (
    <li className={`fc-paso ${estado} etapa-${e}`}>
      <button type="submit" name="etapa" value={e} aria-pressed={e === etapa} aria-label={`${NOMBRE_ETAPA[e]}: ${AYUDA_ETAPA[e]}`}>
        <span className="fc-paso-punto" aria-hidden>
          {estado === "hecho" ? <IconoCheck tamano={16} /> : i + 1}
        </span>
        <span className="fc-paso-nombre">{NOMBRE_ETAPA[e]}</span>
      </button>
    </li>
  );
}

function AyudaEtapa({ etapa }: { etapa: Etapa }) {
  return etapa === "perdido" ? (
    <>
      <span className="etapa etapa-perdido">Perdido</span> Ya no sigue. Si vuelve, toca la etapa en la que va.
    </>
  ) : (
    <>
      <strong>{NOMBRE_ETAPA[etapa]}:</strong> {AYUDA_ETAPA[etapa].toLowerCase()}. Toca otra etapa para moverlo.
    </>
  );
}

function MotivoPerdido({ id, motivo }: { id: string; motivo: string | null }) {
  return (
    <form action={cambiarEtapa} className="fc-motivo">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="etapa" value="perdido" />
      <p>
        <strong>¿Por qué se perdió?</strong>
        {motivo ? <span className="suave"> Ahora dice: {motivo}</span> : null}
      </p>
      <div className="fc-botones-motivo">
        {MOTIVOS_PERDIDA.map((m) => (
          <button key={m} type="submit" name="motivo" value={m} aria-pressed={m === motivo}>
            {m}
          </button>
        ))}
      </div>
    </form>
  );
}
