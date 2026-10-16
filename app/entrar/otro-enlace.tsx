"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const ESPERA = 60;

/**
 * "Pedir otro enlace" se habilita después de un minuto: así no se gasta el límite de correos por hora
 * pidiendo enlaces seguidos mientras el primero todavía viene en camino.
 */
export function OtroEnlace({ destino }: { destino: string }) {
  const [faltan, setFaltan] = useState(ESPERA);
  useEffect(() => {
    if (faltan <= 0) return;
    const t = setTimeout(() => setFaltan((f) => f - 1), 1000);
    return () => clearTimeout(t);
  }, [faltan]);

  if (faltan > 0) {
    return (
      <p className="boton grande deshabilitado" aria-disabled="true">
        Pedir otro enlace en {Math.floor(faltan / 60)}:{String(faltan % 60).padStart(2, "0")}
      </p>
    );
  }
  return (
    <Link href={destino} className="boton grande">
      Pedir otro enlace
    </Link>
  );
}
