"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que avisa mientras la acción trabaja (ficha, anuncio, fotos: tardan). */
export function BotonEnviar({
  texto,
  pendiente,
  className,
  formAction,
}: {
  texto: React.ReactNode;
  pendiente: string;
  className?: string;
  /** Otra acción para este botón (un formulario con dos salidas, como "Entrar" y "Mándame un enlace"). */
  formAction?: (formulario: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending} formAction={formAction}>
      {pending ? pendiente : texto}
    </button>
  );
}
