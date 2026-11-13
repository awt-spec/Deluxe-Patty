import Link from "next/link";
import { IconoAtras } from "./iconos";

/** Enlace para volver a la pantalla anterior, con su flecha dibujada. */
export function Volver({ href, texto, className }: { href: string; texto: string; className?: string }) {
  return (
    <p className={className}>
      <Link href={href} className="volver">
        <IconoAtras tamano={20} />
        {texto}
      </Link>
    </p>
  );
}
