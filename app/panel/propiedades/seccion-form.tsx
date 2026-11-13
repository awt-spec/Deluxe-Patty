"use client";

import { useEffect, useRef, useState } from "react";
import { resumenCampos } from "@/lib/panel/movil";

// Una parte de un formulario largo. En el teléfono (< 900 px) se pliega: la línea dice el título y lo ya llenado
// ("Precio · 450000 · Dólares"), y se abre al tocarla o si el navegador marca un campo de adentro como faltante. En
// computadora no existe: sus campos se ven como siempre (formulario-movil.css usa display: contents).

/** Lo que muestra un campo en el resumen: el texto de la opción elegida o lo escrito. */
function valorVisible(el: Element): string {
  if (el instanceof HTMLSelectElement) return el.value ? (el.selectedOptions[0]?.textContent ?? "") : "";
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.type === "hidden" || el.type === "checkbox" || el.type === "radio") return "";
    return el.value;
  }
  return "";
}

export function SeccionForm({ titulo, abierta: inicial = false, children }: { titulo: string; abierta?: boolean; children: React.ReactNode }) {
  const [abierta, setAbierta] = useState(inicial);
  const [resumen, setResumen] = useState("");
  const cuerpo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cuerpo.current;
    if (!el) return;
    const leer = () => setResumen(resumenCampos(Array.from(el.querySelectorAll("input, select, textarea"), valorVisible), 56));
    const faltante = () => setAbierta(true);
    const r = requestAnimationFrame(leer);
    el.addEventListener("input", leer);
    el.addEventListener("change", leer);
    el.addEventListener("invalid", faltante, true);
    return () => {
      cancelAnimationFrame(r);
      el.removeEventListener("input", leer);
      el.removeEventListener("change", leer);
      el.removeEventListener("invalid", faltante, true);
    };
  }, []);

  return (
    <div className={`seccion-form${abierta ? " abierta" : ""}`}>
      <button type="button" className="seccion-form-boton" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}>
        <span className="seccion-form-titulo">{titulo}</span>
        {!abierta && <span className="seccion-form-resumen">{resumen}</span>}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div ref={cuerpo} className="seccion-form-cuerpo">
        {children}
      </div>
    </div>
  );
}
