"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bloquearRapido } from "./acciones";

// La pregunta de cada día: "¿Tienes algún compromiso mañana?". Con un toque se bloquea la mañana, la
// tarde o el día entero y la asistente no agenda visitas ahí. Sale una vez al día (se recuerda en el
// navegador) y desaparece al contestar.

const CLAVE = "patty-pregunta-bloqueo";

export function PreguntaBloqueo({
  nombre,
  fecha,
  dia,
  hoy,
  volverA,
}: {
  nombre: string;
  /** Mañana, en AAAA-MM-DD (lo que se bloquea). */
  fecha: string;
  /** "mañana sábado 8" para la pregunta. */
  dia: string;
  /** Hoy, en AAAA-MM-DD: la pregunta sale una vez por día. */
  hoy: string;
  volverA: "/panel" | "/panel/agenda";
}) {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    try {
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
    <section className="tarjeta pregunta-bloqueo" data-patty="pregunta-bloqueo">
      <p>
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
          onClick={() => {
            contestar();
            setVer(false);
          }}
        >
          No, estoy libre
        </button>
      </div>
    </section>
  );
}
