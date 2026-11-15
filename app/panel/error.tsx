"use client";

import { PantallaError } from "../pantalla-error";

// Error en una pantalla del panel: se muestra dentro del panel (con la barra y el menú), así "Volver a Inicio" y
// Patty siguen a mano y el resto de la página no desaparece.
export default function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PantallaError error={error} reset={reset} dentroDelPanel />;
}
