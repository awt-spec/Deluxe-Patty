"use client";

import { useEffect, useState } from "react";
import { IconoAlerta, IconoCerrar, IconoCheck } from "../panel/iconos";

// Resultado de la última acción (?m=&ok=) como aviso flotante: se ve aunque el botón estuviera abajo de la página.
// Se cierra con la ×; el de éxito se va solo a los 8 s. Al cerrarlo se quita ?m=&ok= de la dirección (sin recargar),
// así no reaparece al refrescar. El de error se queda hasta que la persona lo cierra.

export function AvisoResultado({ m, ok }: { m: string; ok: boolean }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => cerrar(), 8000);
    return () => clearTimeout(t);
  }, [m, ok]);

  function cerrar() {
    setVisible(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("m");
      url.searchParams.delete("ok");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch {
      // Sin acceso a la dirección: solo se oculta.
    }
  }

  if (!visible) return null;
  return (
    <div className={`ad-aviso ${ok ? "bien" : "mal"}`} role={ok ? "status" : "alert"}>
      <span className="ad-aviso-icono">{ok ? <IconoCheck tamano={20} /> : <IconoAlerta tamano={20} />}</span>
      <p>
        <strong>{ok ? "Listo" : "No se pudo"}</strong>
        <span>{m}</span>
      </p>
      <button type="button" className="ad-aviso-cerrar" onClick={cerrar} aria-label="Cerrar aviso">
        <IconoCerrar tamano={18} />
      </button>
    </div>
  );
}
