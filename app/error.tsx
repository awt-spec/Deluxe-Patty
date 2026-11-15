"use client";

import { PantallaError } from "./pantalla-error";

// Error fuera del panel (o en su layout): la misma pantalla amable, sin detalle técnico a la vista.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PantallaError error={error} reset={reset} />;
}
