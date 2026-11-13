"use client";

import { useState } from "react";
import "./modo-corredor.css";

/** Botón "Modo corredor": hojita con el enlace de la casa sin los datos de contacto, para otro corredor. */
export function ModoCorredor({ enlace, titulo }: { enlace: string; titulo: string }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const puedeCompartir = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sin portapapeles: el enlace sigue a la vista para copiarlo a mano */
    }
  }

  async function compartir() {
    try {
      await navigator.share({ title: titulo, url: enlace });
    } catch {
      /* canceló */
    }
  }

  return (
    <>
      <button type="button" className="boton" data-patty="casa-modo-corredor" onClick={() => setAbierto(true)}>
        Modo corredor
      </button>
      {abierto && (
        <div className="modo-corredor-fondo" onClick={() => setAbierto(false)}>
          <div className="modo-corredor-hoja" role="dialog" aria-modal="true" aria-label="Modo corredor" onClick={(e) => e.stopPropagation()}>
            <h2>Modo corredor</h2>
            <p>Enlace de esta casa sin tus datos de contacto, para pasárselo a otro corredor.</p>
            <input readOnly value={enlace} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace en modo corredor" />
            <div className="modo-corredor-botones">
              <button type="button" className="boton primario" onClick={copiar}>
                {copiado ? "Copiado" : "Copiar"}
              </button>
              {puedeCompartir && (
                <button type="button" className="boton" onClick={compartir}>
                  Compartir
                </button>
              )}
              <a className="boton" href={enlace} target="_blank" rel="noreferrer">
                Abrir
              </a>
              <button type="button" className="boton" onClick={() => setAbierto(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
