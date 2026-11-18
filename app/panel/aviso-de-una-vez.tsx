"use client";

import { useEffect } from "react";
import { sinAviso } from "@/lib/panel/aviso-url";

/**
 * Quita `?aviso=` de la dirección apenas se muestra el aviso (sin volver a cargar la página): así "Atrás" o recargar
 * no vuelven a mostrar un aviso viejo, por ejemplo el error de un cierre que ya se corrigió.
 */
export function AvisoDeUnaVez() {
  useEffect(() => {
    try {
      const nueva = sinAviso(window.location.href);
      if (nueva) window.history.replaceState(null, "", nueva);
    } catch {
      // Si el navegador no deja cambiar la dirección, el aviso se queda: no pasa nada.
    }
  }, []);
  return null;
}
