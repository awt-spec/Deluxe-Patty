import { destino, enlaceMaps, enlaceWaze } from "@/lib/agenda/mapas";

/** Dos botones, Waze y Google Maps, con la ruta a la casa. Nada si no se sabe la zona. */
export function ComoLlegar({ casa, chico = false }: { casa: { zona: string | null; canton?: string | null }; chico?: boolean }) {
  const lugar = destino(casa);
  if (!lugar) return null;
  return (
    <span className={`como-llegar${chico ? " chico" : ""}`}>
      <a href={enlaceWaze(lugar)} target="_blank" rel="noreferrer" className="boton waze">
        Waze
      </a>
      <a href={enlaceMaps(lugar)} target="_blank" rel="noreferrer" className="boton maps">
        Google Maps
      </a>
    </span>
  );
}
