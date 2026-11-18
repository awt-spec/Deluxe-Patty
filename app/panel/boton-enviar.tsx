"use client";

import { useFormStatus } from "react-dom";

/**
 * Botón de envío que se apaga mientras la acción trabaja: un doble toque no manda el formulario dos veces (el
 * servidor además lo frena, lib/panel/una-vez.ts). Todos los botones de un mismo formulario se apagan juntos.
 */
export function BotonEnviar({
  texto,
  pendiente,
  className,
  formAction,
  name,
  value,
  ariaLabel,
  title,
  formNoValidate,
}: {
  texto: React.ReactNode;
  pendiente: React.ReactNode;
  className?: string;
  /** Otra acción para este botón (un formulario con dos salidas, como "Entrar" y "Mándame un enlace"). */
  formAction?: (formulario: FormData) => void | Promise<void>;
  name?: string;
  value?: string;
  ariaLabel?: string;
  title?: string;
  formNoValidate?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-busy={pending}
      aria-label={ariaLabel}
      title={title}
      formAction={formAction}
      formNoValidate={formNoValidate}
      name={name}
      value={value}
      onClick={(e) => {
        // Por si el segundo toque llega antes de que el botón se vea apagado.
        if (pending) e.preventDefault();
      }}
    >
      {pending ? pendiente : texto}
    </button>
  );
}
