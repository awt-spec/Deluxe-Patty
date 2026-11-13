"use client";

import { useEffect } from "react";

// Al llegar con un ancla (?ver=errores → #correcciones, o un #ensenar en la dirección), abre el grupo plegado que la
// contiene y baja hasta ella. Un enlace al mismo ancla ya puesta no dispara hashchange: también se mira el clic.
export function IrAlAncla({ ancla }: { ancla?: string }) {
  useEffect(() => {
    const ir = (id: string | undefined, suave: boolean) => {
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      for (let p: HTMLElement | null = el; p; p = p.parentElement) if (p instanceof HTMLDetailsElement) p.open = true;
      requestAnimationFrame(() =>
        el.scrollIntoView({
          block: "start",
          behavior: suave ? "smooth" : "auto",
        }),
      );
    };
    const r = requestAnimationFrame(() => ir(window.location.hash.slice(1) || ancla, false));
    const alCambiar = () => ir(window.location.hash.slice(1), true);
    const alTocar = (e: MouseEvent) => {
      const href = (e.target as Element | null)?.closest?.("a")?.getAttribute("href") ?? "";
      if (href.startsWith("#")) ir(href.slice(1), true);
    };
    window.addEventListener("hashchange", alCambiar);
    document.addEventListener("click", alTocar);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener("hashchange", alCambiar);
      document.removeEventListener("click", alTocar);
    };
  }, [ancla]);
  return null;
}
