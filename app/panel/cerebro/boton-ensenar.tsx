"use client";

import { useEffect, useState } from "react";
import { IconoIdea } from "../iconos";

// Botón fijo del teléfono: lleva a "Enséñale algo" y pone el cursor en la pregunta. Se esconde mientras ese
// recuadro ya está a la vista, para no taparlo.
export function BotonEnsenar() {
  const [aLaVista, setALaVista] = useState(false);
  useEffect(() => {
    const caja = document.getElementById("ensenar");
    if (!caja || typeof IntersectionObserver === "undefined") return;
    const o = new IntersectionObserver(([e]) => setALaVista(e.isIntersecting), { threshold: 0.15 });
    o.observe(caja);
    return () => o.disconnect();
  }, []);
  return (
    <a
      href="#ensenar"
      className="cer-flotante"
      data-patty="cerebro-boton-ensenar"
      hidden={aLaVista}
      onClick={() => setTimeout(() => document.getElementById("tema")?.focus({ preventScroll: true }), 350)}
    >
      <IconoIdea tamano={20} />
      Enseñarle algo
    </a>
  );
}
