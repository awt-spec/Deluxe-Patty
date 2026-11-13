"use client";

import { useEffect, useState } from "react";
import { cambioBarra } from "@/lib/panel/movil";

// Ficha del cliente en el teléfono (< 900 px). SeccionPlegable: en el teléfono la sección se ve como una línea con
// su resumen ("Qué busca: comprar · Escazú · hasta $1.100.000") y se abre al tocarla o al llegar por su ancla
// (#busca, #juego…); en computadora el botón no existe y se ve completa, como siempre (ficha.css). OcultarAlBajar:
// la barra de acciones se esconde al bajar y vuelve al subir o al detenerse.

const TELEFONO = "(max-width: 899px)";

export function SeccionPlegable({
  id,
  className,
  resumen,
  abierta: inicial = false,
  dataPatty,
  children,
}: {
  id: string;
  className: string;
  resumen: string;
  abierta?: boolean;
  dataPatty?: string;
  children: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(inicial);

  // Si se llega a su ancla (desde "Qué sigue", una cifra o la dirección), se abre.
  useEffect(() => {
    const abrirSiEsElAncla = (href?: string | null) => {
      if ((href ?? window.location.hash) !== `#${id}`) return;
      setAbierta(true);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    const r = requestAnimationFrame(() => abrirSiEsElAncla());
    const alCambiar = () => abrirSiEsElAncla();
    // Un enlace al mismo ancla ya puesta no dispara hashchange: se mira el clic.
    const alTocar = (e: MouseEvent) => abrirSiEsElAncla((e.target as Element | null)?.closest?.("a")?.getAttribute("href"));
    window.addEventListener("hashchange", alCambiar);
    document.addEventListener("click", alTocar);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener("hashchange", alCambiar);
      document.removeEventListener("click", alTocar);
    };
  }, [id]);

  return (
    <section id={id} className={`${className} plegable${abierta ? " abierta" : ""}`} data-patty={dataPatty}>
      <button type="button" className="plegable-boton" aria-expanded={abierta} aria-controls={`${id}-cuerpo`} onClick={() => setAbierta((a) => !a)}>
        <span>{resumen}</span>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={`${id}-cuerpo`} className="plegable-cuerpo">
        {children}
      </div>
    </section>
  );
}

/** Esconde `selector` (clase `oculta`) al bajar y lo muestra al subir, cerca de arriba o al detenerse. */
export function OcultarAlBajar({ selector, quieto = 700 }: { selector: string; quieto?: number }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    const telefono = window.matchMedia(TELEFONO);
    let anterior = window.scrollY;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const poner = (oculta: boolean) => el.classList.toggle("oculta", oculta);
    const alMover = () => {
      const y = window.scrollY;
      if (!telefono.matches) return poner(false);
      const c = cambioBarra(anterior, y);
      if (c) {
        poner(c === "ocultar");
        anterior = y;
      }
      clearTimeout(reloj);
      reloj = setTimeout(() => poner(false), quieto);
    };
    window.addEventListener("scroll", alMover, { passive: true });
    return () => {
      clearTimeout(reloj);
      window.removeEventListener("scroll", alMover);
      poner(false);
    };
  }, [selector, quieto]);
  return null;
}
