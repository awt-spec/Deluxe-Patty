"use client";

import { abrirPatty } from "./patty";

/** Botón dentro de una pantalla que abre a Patty con una pregunta sobre lo que se está viendo. */
export function PreguntarPatty({ pregunta, texto, nombre = "Patty" }: { pregunta: string; texto?: string; nombre?: string }) {
  return (
    <button type="button" className="preguntar-patty" onClick={() => abrirPatty(pregunta)}>
      <span className="patty-avatar mini" aria-hidden>
        {nombre.charAt(0).toUpperCase()}
      </span>
      {texto ?? pregunta}
    </button>
  );
}
