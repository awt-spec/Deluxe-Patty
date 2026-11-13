"use client";

import { useEffect, useRef } from "react";

// En el teléfono las pestañas del Cerebro no caben: al abrir, la fila se corre para que la pestaña activa quede a la
// vista (sin mover la página de arriba abajo). No dibuja nada.
export function PestanaALaVista() {
  const ancla = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const fila = ancla.current?.parentElement?.querySelector<HTMLElement>(".cer-pestanas-fila");
    const activa = fila?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!fila || !activa) return;
    const izquierda = activa.offsetLeft - fila.offsetLeft;
    if (izquierda < fila.scrollLeft || izquierda + activa.offsetWidth > fila.scrollLeft + fila.clientWidth) {
      fila.scrollLeft = Math.max(0, izquierda - 24);
    }
  }, []);
  return <span ref={ancla} hidden />;
}
