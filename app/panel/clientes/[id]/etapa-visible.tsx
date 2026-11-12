"use client";

import { useEffect } from "react";

/** En el teléfono las etapas se deslizan de lado: al abrir la ficha, la fila se corre hasta la etapa actual. */
export function EtapaVisible() {
  useEffect(() => {
    const fila = document.querySelector<HTMLElement>(".etapas-selector");
    const actual = fila?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!fila || !actual || fila.scrollWidth <= fila.clientWidth) return;
    fila.scrollLeft = Math.max(0, actual.offsetLeft - fila.offsetLeft - (fila.clientWidth - actual.offsetWidth) / 2);
  }, []);
  return null;
}
