"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que avisa mientras la acción trabaja (ficha, anuncio, fotos: tardan). */
export function BotonEnviar({ texto, pendiente, className }: { texto: string; pendiente: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendiente : texto}
    </button>
  );
}
