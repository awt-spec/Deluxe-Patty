"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// En el teléfono la agenda abre en "Día". El servidor lo decide por el navegador; si no lo reconoce
// (por ejemplo, un iPhone que pide la versión de escritorio) y no se eligió vista, la pantalla angosta
// lo corrige aquí.
export function VistaDelTelefono({ actual, fecha }: { actual: string; fecha?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (actual !== "dia" && window.matchMedia("(max-width: 699px)").matches) {
      router.replace(`/panel/agenda?vista=dia${fecha ? `&fecha=${fecha}` : ""}`);
    }
  }, [actual, fecha, router]);
  return null;
}
