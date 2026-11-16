import Link from "next/link";
import { IconoBateria } from "./iconos";
import { subtextoEnergia, textoEnergia, tituloEnergia, type EstadoEnergia } from "@/lib/ia/energia";

// "Energía" de la asistente en el mes, como la batería de un teléfono: un porcentaje que baja (lib/ia/energia.ts).
// Verde normal, ámbar con poco, rojo agotado; colores en las variables --t-* de globals.css (PALETA_ENERGIA,
// probadas AA en tests/colores-menu.test.ts). Sin hooks: sirve en el menú (cliente) y en Ajustes y Más (servidor).
// Sin tope no se muestra nada (más calmado que un "sin límite").

function Bateria({ e, tamano }: { e: EstadoEnergia; tamano: number }) {
  return <IconoBateria pct={e.restante} tamano={tamano} className="tk-bateria" />;
}

function Barra({ e }: { e: EstadoEnergia }) {
  return (
    <span className="tk-barra" aria-hidden>
      <i style={{ width: `${e.nivel === "agotado" ? 100 : e.restante}%` }} />
    </span>
  );
}

/** En el menú lateral, arriba de la cuenta: batería con texto y barra, o solo la batería con globo en el riel. */
export function EnergiaMenu({ estado, asistente }: { estado: EstadoEnergia | null; asistente?: string | null }) {
  if (!estado || estado.nivel === "sin_tope") return null;
  const texto = estado.nivel === "bien" ? textoEnergia(estado, asistente) : subtextoEnergia(estado, asistente);
  return (
    <Link href="/panel/ajustes#energia" className={`tk tk-menu tk-${estado.nivel}`} data-tip={texto} aria-label={texto} data-patty="nav-energia">
      <span className="lat-icono tk-icono-riel" aria-hidden>
        <Bateria e={estado} tamano={26} />
      </span>
      <span className="tk-cuerpo lat-ocultable">
        <span className="tk-linea">
          <span className="tk-bat-menu" aria-hidden>
            <Bateria e={estado} tamano={22} />
          </span>
          <span className="tk-titulo">{tituloEnergia(asistente)}</span>
          <strong>{estado.nivel === "agotado" ? "0 %" : `${estado.restante} %`}</strong>
        </span>
        <Barra e={estado} />
        {estado.nivel !== "bien" && <span className="tk-sub">{subtextoEnergia(estado, asistente)}</span>}
      </span>
    </Link>
  );
}

/** Tarjeta para Ajustes y Más (también en el teléfono). */
export function EnergiaTarjeta({ estado, id, asistente }: { estado: EstadoEnergia | null; id?: string; asistente?: string | null }) {
  if (!estado || estado.nivel === "sin_tope") return null;
  const sub = subtextoEnergia(estado, asistente);
  return (
    <section className={`tarjeta pila tk tk-tarjeta tk-${estado.nivel}`} id={id} aria-label={`${tituloEnergia(asistente)} este mes`}>
      <div className="fila">
        <span className="tk-titulo-tarjeta">
          <Bateria e={estado} tamano={28} />
          {tituloEnergia(asistente)}
        </span>
        <strong>{estado.restante} %</strong>
      </div>
      <Barra e={estado} />
      {estado.nivel === "bien" ? (
        <p className="suave">{sub}. Cada respuesta, foto o nota de voz con IA gasta un poco; se llena de nuevo el primer día del mes.</p>
      ) : (
        <p className="tk-aviso" role="status">
          {sub}
        </p>
      )}
    </section>
  );
}
