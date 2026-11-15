import Link from "next/link";
import { AGOTADO_TEXTO, cifraTokens, textoTokens, type EstadoTokens } from "@/lib/ia/tokens";

// "Tokens de IA" del mes para el corredor: cuánto le queda de IA sin hablar de dinero (lib/ia/tokens.ts).
// Verde normal, ámbar con poco, rojo agotado; colores en las variables --t-* de globals.css (PALETA_TOKENS,
// probadas AA en tests/colores-menu.test.ts). Sin hooks: sirve en el menú (cliente) y en Ajustes y Más (servidor).

const R = 9;
const VUELTA = 2 * Math.PI * R;

/** Anillo chico para el riel contraído del menú (72 px). */
function Anillo({ e }: { e: EstadoTokens }) {
  const lleno = e.nivel === "sin_tope" ? 0 : e.pct / 100;
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden className="tk-anillo">
      <circle cx={12} cy={12} r={R} fill="none" strokeWidth={4} className="tk-pista" />
      <circle
        cx={12}
        cy={12}
        r={R}
        fill="none"
        strokeWidth={4}
        strokeLinecap={lleno > 0 && lleno < 1 ? "round" : "butt"}
        strokeDasharray={`${VUELTA * lleno} ${VUELTA}`}
        transform="rotate(-90 12 12)"
        className="tk-relleno"
      />
    </svg>
  );
}

function Barra({ e }: { e: EstadoTokens }) {
  return (
    <span className="tk-barra" aria-hidden>
      <i style={{ width: `${e.nivel === "sin_tope" ? 0 : e.pct}%` }} />
    </span>
  );
}

/** En el menú lateral, arriba de la cuenta: barra con texto, o solo el anillo con globo en el riel. */
export function TokensMenu({ estado }: { estado: EstadoTokens | null }) {
  if (!estado) return null;
  const texto = textoTokens(estado);
  return (
    <Link href="/panel/ajustes#tokens" className={`tk tk-menu tk-${estado.nivel}`} data-tip={texto} aria-label={texto} data-patty="nav-tokens">
      <span className="lat-icono tk-icono-riel" aria-hidden>
        <Anillo e={estado} />
      </span>
      <span className="tk-cuerpo lat-ocultable">
        <span className="tk-linea">
          <span>Tokens de IA</span>
          {estado.nivel === "agotado" ? (
            <strong>Se acabaron</strong>
          ) : estado.nivel === "sin_tope" ? (
            <strong>Sin límite</strong>
          ) : (
            <strong>
              {cifraTokens(estado.usados)} <span className="tk-suave">de {cifraTokens(estado.total)}</span>
            </strong>
          )}
        </span>
        <Barra e={estado} />
      </span>
    </Link>
  );
}

/** Tarjeta para Ajustes y Más (también en el teléfono). */
export function TokensTarjeta({ estado, id }: { estado: EstadoTokens | null; id?: string }) {
  if (!estado) return null;
  return (
    <section className={`tarjeta pila tk tk-tarjeta tk-${estado.nivel}`} id={id} aria-label="Tokens de IA de este mes">
      <div className="fila">
        <span>Tokens de IA este mes</span>
        {estado.nivel === "sin_tope" ? (
          <strong>Sin límite</strong>
        ) : (
          <strong>
            {cifraTokens(estado.usados)} de {cifraTokens(estado.total)}
          </strong>
        )}
      </div>
      <Barra e={estado} />
      {estado.nivel === "agotado" ? (
        <p className="tk-aviso" role="status">
          {AGOTADO_TEXTO}
        </p>
      ) : estado.nivel === "poco" ? (
        <p className="tk-aviso" role="status">
          Te quedan {cifraTokens(estado.restantes)} tokens este mes. Cuando se acaben, la asistente deja los chats para ti.
        </p>
      ) : estado.nivel === "bien" ? (
        <p className="suave">
          Te quedan {cifraTokens(estado.restantes)}. Cada respuesta, foto o nota de voz con IA gasta algunos; se llenan de nuevo el primer día del mes.
        </p>
      ) : null}
    </section>
  );
}
