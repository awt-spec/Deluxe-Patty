"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bloquearRapido } from "./acciones";

// La pregunta de cada día: "¿Tienes algún compromiso mañana?". Con un toque se aparta la mañana, la
// tarde o el día entero y la asistente no agenda visitas ahí. Sale una vez al día (se recuerda en el
// navegador) y desaparece al contestar. `compacta` (la de la Agenda): en el teléfono es una sola línea con "Sí, apartar",
// "No" y "×"; las opciones salen al tocar "Sí". En computadora se ve completa, como en Inicio.

const CLAVE = "patty-pregunta-bloqueo";

export function PreguntaBloqueo({
  nombre,
  fecha,
  dia,
  hoy,
  volverA,
  compacta,
}: {
  nombre: string;
  /** Mañana, en AAAA-MM-DD (lo que se aparta). */
  fecha: string;
  /** "mañana sábado 8" para la pregunta. */
  dia: string;
  /** Hoy, en AAAA-MM-DD: la pregunta sale una vez por día. */
  hoy: string;
  volverA: "/panel" | "/panel/agenda";
  compacta?: boolean;
}) {
  const [ver, setVer] = useState(false);
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador: se lee al montar para no romper la hidratación.
      setVer(localStorage.getItem(CLAVE) !== hoy);
    } catch {
      setVer(true);
    }
  }, [hoy]);
  const contestar = () => {
    try {
      localStorage.setItem(CLAVE, hoy);
    } catch {
      /* sin almacenamiento: vuelve a salir, no pasa nada */
    }
  };
  if (!ver) return null;
  const libre = () => {
    contestar();
    setVer(false);
  };

  const boton = (rato: string, texto: string) => (
    <form action={bloquearRapido} onSubmit={contestar}>
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="rato" value={rato} />
      <input type="hidden" name="volver_a" value={volverA} />
      <button type="submit" className="chico">
        {texto}
      </button>
    </form>
  );

  return (
    <section className={`tarjeta pregunta-bloqueo${compacta ? " compacta" : ""}${abierta ? " abierta" : ""}`} data-patty="pregunta-bloqueo">
      {compacta && (
        <div className="pb-linea solo-telefono">
          <p>
            <span className="oculto">{nombre}: </span>¿Algún compromiso mañana?
          </p>
          {!abierta && (
            <>
              <button type="button" className="chico" onClick={() => setAbierta(true)} aria-expanded={abierta}>
                Sí, apartar
              </button>
              <button type="button" className="chico" onClick={libre}>
                No
              </button>
            </>
          )}
          <button type="button" className="pb-cerrar" onClick={libre} aria-label="Cerrar por hoy">
            ×
          </button>
        </div>
      )}
      <p className="pb-pregunta">
        <strong>{nombre}:</strong> ¿Tienes algún compromiso {dia}? Así no te agendo visitas encima.
      </p>
      <div className="pregunta-bloqueo-botones">
        {boton("manana", "En la mañana")}
        {boton("tarde", "En la tarde")}
        {boton("todo", "Todo el día")}
        <Link href={`/panel/agenda/bloquear?fecha=${fecha}`} className="boton chico" onClick={contestar}>
          Otro día u hora…
        </Link>
        <button
          type="button"
          className="chico enlace"
          onClick={libre}
        >
          No, estoy libre
        </button>
      </div>
    </section>
  );
}
