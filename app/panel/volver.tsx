import Link from "next/link";
import { IconoAtras } from "./iconos";

/** Enlace para volver a la pantalla anterior, con su flecha dibujada. */
export function Volver({ href, texto }: { href: string; texto: string }) {
  return (
    <p>
      <Link href={href} className="volver">
        <IconoAtras tamano={20} />
        {texto}
      </Link>
    </p>
  );
}
