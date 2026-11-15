import Link from "next/link";
import { precio } from "@/lib/formato";
import { IconoCasa } from "../../../iconos";
import { Vacio } from "../../../piezas";
import { SeccionPlegable } from "../movil";
import { FotoCasa } from "./foto-casa";
import { resumenCasas, type CasaLista } from "./reglas";

/** Casas que le encajan (#casas): primero la que le interesa, luego las demás. */
export function CasasQueEncajan({ casas, sabeQueBusca }: { casas: CasaLista[]; sabeQueBusca: boolean }) {
  return (
    <SeccionPlegable id="casas" className="tarjeta fc-bloque" resumen={resumenCasas(casas)}>
      <div className="fc-bloque-cabeza">
        <h2>Casas que le encajan</h2>
        {casas.length > 0 && <span className="suave">{casas.length}</span>}
      </div>
      {casas.length === 0 ? (
        <Vacio
          Icono={IconoCasa}
          compacto
          titulo={sabeQueBusca ? "Ninguna le encaja todavía" : "Falta saber qué busca"}
          accion={<Link href="/panel/propiedades">Ver mis casas</Link>}
        >
          {sabeQueBusca ? "Cuando agregues una casa que le sirva, aparece aquí." : "Cuando sepas qué busca, aquí salen las casas que le sirven."}
        </Vacio>
      ) : (
        <ul className="fc-casas">
          {casas.map((p) => (
            <CasaEnLista key={p.id} p={p} />
          ))}
        </ul>
      )}
    </SeccionPlegable>
  );
}

function CasaEnLista({ p }: { p: CasaLista }) {
  return (
    <li className={p.interes ? "interes" : undefined}>
      <Link href={`/panel/propiedades/${p.id}`}>
        <span className="fc-casa-foto">
          <FotoCasa fotos={p.fotos} />
          {p.interes && <span className="fc-casa-marca">Le interesa</span>}
        </span>
        <span className="fc-casa-texto">
          <strong>{p.titulo}</strong>
          {p.precio !== null && <span className="fc-casa-precio">{precio(p.precio, p.moneda)}</span>}
          {p.zona && <span className="suave">{p.zona}</span>}
        </span>
      </Link>
    </li>
  );
}
