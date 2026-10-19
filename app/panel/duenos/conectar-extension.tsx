"use client";

import { useActionState } from "react";
import { pedirCodigoExtension, type EstadoCodigo } from "./acciones";

/** Botón que muestra el código para escribir en la extensión. */
export function ConectarExtension() {
  const [estado, pedir, pidiendo] = useActionState<EstadoCodigo, FormData>(pedirCodigoExtension, {});
  return (
    <form action={pedir} className="pila">
      {estado.codigo && (
        <div className="tarjeta acento pila">
          <p>Escribe este código en la extensión (vale 10 minutos):</p>
          <p className="codigo-extension" aria-live="polite">
            {estado.codigo}
          </p>
        </div>
      )}
      {estado.error && <p className="aviso">{estado.error}</p>}
      <button type="submit" className={estado.codigo ? "" : "primario"} disabled={pidiendo}>
        {estado.codigo ? "Pedir otro código" : "Conectar la extensión"}
      </button>
    </form>
  );
}
