"use client";

import { useState } from "react";

// Día del bloqueo: chips con los próximos días (como la tira de la Agenda) y "Otro día" con el calendario.
// Todo termina en un solo campo `fecha`, el que lee la acción.

export function ElegirDia({ dias, inicial, hoy }: { dias: { fecha: string; arriba: string; numero: number }[]; inicial: string; hoy: string }) {
  const [fecha, setFecha] = useState(inicial);
  const enChips = dias.some((d) => d.fecha === fecha);
  return (
    <div className="elegir-dia">
      <div className="elegir-dia-chips" role="radiogroup" aria-label="Día">
        {dias.map((d) => (
          <button
            key={d.fecha}
            type="button"
            role="radio"
            aria-checked={d.fecha === fecha}
            className={d.fecha === fecha ? "activo" : undefined}
            onClick={() => setFecha(d.fecha)}
          >
            <small>{d.arriba}</small>
            <strong>{d.numero}</strong>
          </button>
        ))}
      </div>
      <label className={`elegir-dia-otro${enChips ? "" : " activo"}`}>
        <span>Otro día</span>
        <input type="date" name="fecha" value={fecha} min={hoy} required onChange={(e) => e.target.value && setFecha(e.target.value)} data-patty="bloquear-dia" />
      </label>
    </div>
  );
}
