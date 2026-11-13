"use client";

import { useEffect } from "react";

// Tiras de chips y pestañas que se deslizan de lado en el teléfono (etapas de Clientes y de Dueños, filtros de Mis
// casas, respuestas rápidas…). Una sola pieza para todas: marca hacia dónde hay más (`data-desliza`, que el CSS
// "Teléfono v4" vuelve un desvanecido en ese borde) y, si el chip elegido quedó fuera de la vista al cargar, lo trae.
// Para una tira nueva basta la clase `tira-desliza`.
export const SELECTOR_TIRAS = ".tira-desliza, main .filtro-etapas, main .casas-filtros, main .etapas-selector, .rapidas";
const ELEGIDO = '[aria-current="page"], [aria-selected="true"], [aria-pressed="true"], [aria-checked="true"], .activo';

/** Hacia dónde le queda contenido a una tira: nada, a la derecha, a la izquierda o a los dos lados. */
export function haciaDonde(scrollLeft: number, ancho: number, total: number): "no" | "derecha" | "izquierda" | "ambos" {
  const izquierda = scrollLeft > 2;
  const derecha = scrollLeft + ancho < total - 2;
  return izquierda && derecha ? "ambos" : derecha ? "derecha" : izquierda ? "izquierda" : "no";
}

/** Cuánto desplazar para que el elegido quede a la vista (null si ya se ve entero). */
export function desplazarHasta(scrollLeft: number, ancho: number, inicio: number, largo: number): number | null {
  if (inicio >= scrollLeft && inicio + largo <= scrollLeft + ancho) return null;
  return Math.max(0, inicio - Math.max(16, (ancho - largo) / 2));
}

export function TirasDesliza() {
  useEffect(() => {
    const marcar = (t: HTMLElement) => t.setAttribute("data-desliza", haciaDonde(t.scrollLeft, t.clientWidth, t.scrollWidth));
    const elegidos = new WeakMap<HTMLElement, Element | null>();
    const vistas = new WeakSet<HTMLElement>();
    const alDeslizar = (e: Event) => marcar(e.currentTarget as HTMLElement);

    const revisar = () => {
      for (const t of document.querySelectorAll<HTMLElement>(SELECTOR_TIRAS)) {
        if (!vistas.has(t)) {
          vistas.add(t);
          t.addEventListener("scroll", alDeslizar, { passive: true });
        }
        const elegido = t.querySelector<HTMLElement>(ELEGIDO);
        if (elegido && elegidos.get(t) !== elegido) {
          elegidos.set(t, elegido);
          const caja = elegido.getBoundingClientRect();
          const inicio = caja.left - t.getBoundingClientRect().left + t.scrollLeft;
          const destino = desplazarHasta(t.scrollLeft, t.clientWidth, inicio, caja.width);
          if (destino !== null) t.scrollLeft = destino;
        }
        marcar(t);
      }
    };

    let pendiente = 0;
    const programar = () => {
      cancelAnimationFrame(pendiente);
      pendiente = requestAnimationFrame(revisar);
    };
    programar();
    // Al cambiar de pantalla (o de filtro) el contenido de <main> se rehace: se vuelve a revisar.
    const observador = new MutationObserver(programar);
    observador.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current", "aria-selected", "aria-pressed"] });
    window.addEventListener("resize", programar);
    return () => {
      cancelAnimationFrame(pendiente);
      observador.disconnect();
      window.removeEventListener("resize", programar);
    };
  }, []);
  return null;
}
