"use client";

import { useState } from "react";

export function CopiarTexto({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="primario chico"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        } catch {
          /* sin permiso para copiar: el texto queda a la vista para copiarlo a mano */
        }
      }}
    >
      {copiado ? "¡Copiado!" : "Copiar el texto"}
    </button>
  );
}
