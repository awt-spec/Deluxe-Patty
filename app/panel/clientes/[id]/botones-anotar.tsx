"use client";

import { useFormStatus } from "react-dom";

// Botones rápidos de "Anotar": mientras la acción está pendiente quedan apagados, para que un doble toque no anote dos veces.
export function BotonesAnotar({ botones }: { botones: { tipo: string; nombre: string }[] }) {
  const { pending } = useFormStatus();
  return (
    <div className="fc-anotar-botones" aria-busy={pending}>
      {botones.map((a) => (
        <button key={a.tipo} type="submit" name="tipo" value={a.tipo} disabled={pending} className={a.tipo === "llamada" ? "primario" : undefined}>
          {a.nombre}
        </button>
      ))}
    </div>
  );
}
