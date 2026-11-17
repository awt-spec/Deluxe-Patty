"use client";

import { useState } from "react";

// Botón "Copiar" junto a un texto (la dirección del webhook). Si el navegador no deja copiar, el texto queda a la vista.
export function Copiar({ texto }: { texto: string }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button
      type="button"
      className="ad-boton chico"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setHecho(true);
          setTimeout(() => setHecho(false), 2000);
        } catch {
          setHecho(false);
        }
      }}
    >
      <span aria-live="polite">{hecho ? "Copiada" : "Copiar"}</span>
    </button>
  );
}
