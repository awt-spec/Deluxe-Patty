import type { Foto } from "@/lib/datos/tipos";
import { ordenarFotos } from "@/lib/panel/formularios";
import { IconoCasa } from "../../../iconos";

/** La primera foto de la casa o, si no tiene, el dibujo de una casa. */
export function FotoCasa({ fotos, tamano = 36 }: { fotos?: Foto[]; tamano?: number }) {
  const foto = ordenarFotos(fotos ?? [])[0]?.url;
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={foto} alt="" loading="lazy" />
  ) : (
    <span className="fc-sin-foto" aria-hidden>
      <IconoCasa tamano={tamano} />
    </span>
  );
}
