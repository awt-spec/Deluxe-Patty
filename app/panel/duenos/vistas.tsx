// Lo que se ve en Dueños directos: la tarjeta de la extensión (arriba), la búsqueda en vivo, el embudo y la tarjeta
// de cada dueño. Solo forma: los datos y las acciones llegan por props (los manejan page.tsx, estado-extension.tsx y
// busqueda-en-vivo.tsx), así se puede dibujar cada caso sin navegador. Reglas en lib/panel/duenos.ts y
// lib/panel/extension-hero.ts; estilos en duenos.css.

import Link from "next/link";
import type { EstadoEnergia } from "@/lib/ia/energia";
import { subtextoEnergia, tituloEnergia } from "@/lib/ia/energia";
import { medidorConfianza, type AccionDueno, type EtapaDueno, type PasoEmbudo } from "@/lib/panel/duenos";
import { avanceBusqueda, type AccionHero, type PasoHero, type PasoVivo, type TonoHero } from "@/lib/panel/extension-hero";
import { textoBusqueda, textoRestante, type EstadoBusquedaExt, type OrdenBusqueda } from "@/lib/panel/extension-instalar";
import { IconoBateria, IconoCheck, IconoReloj } from "../iconos";
import { FotosDueno } from "./fotos-dueno";

// --- Íconos propios de esta pantalla ---------------------------------------------------------------------

function Svg({ tamano = 20, children }: { tamano?: number; children: React.ReactNode }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {children}
    </svg>
  );
}
/** La pieza de rompecabezas de las extensiones de Chrome. */
export const IconoPieza = ({ tamano }: { tamano?: number }) => (
  <Svg tamano={tamano}>
    <path d="M9 4.5a2 2 0 1 1 4 0V6h3.5A1.5 1.5 0 0 1 18 7.5V11h1.5a2 2 0 1 1 0 4H18v3.5a1.5 1.5 0 0 1-1.5 1.5H13v-1.5a2 2 0 1 0-4 0V20H5.5A1.5 1.5 0 0 1 4 18.5V15h1.5a2 2 0 1 0 0-4H4V7.5A1.5 1.5 0 0 1 5.5 6H9Z" />
  </Svg>
);
const IconoPausa = () => (
  <Svg tamano={18}>
    <path d="M9 6v12M15 6v12" strokeWidth={2.4} />
  </Svg>
);
const IconoSeguir = () => (
  <Svg tamano={18}>
    <path d="M8 5.5v13l10.5-6.5Z" fill="currentColor" />
  </Svg>
);
const IconoParar = () => (
  <Svg tamano={18}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />
  </Svg>
);
const IconoWhatsApp = () => (
  <Svg tamano={20}>
    <path d="M4.5 19.5 5.6 16A7.8 7.8 0 1 1 8.4 18.6Z" />
    <path d="M9.3 9.2c.2 1.9 1.6 3.6 3.6 4.5l1.1-.9 1.5.8c-.3 1-1.1 1.4-2 1.3-2.6-.4-4.9-2.8-5.2-5.3 0-.8.4-1.6 1.3-1.9l.8 1.5Z" fill="currentColor" stroke="none" />
  </Svg>
);
const IconoExterno = () => (
  <Svg tamano={18}>
    <path d="M14 5h5v5M19 5l-8 8M17 14v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V8.5A1.5 1.5 0 0 1 6.5 7H10" />
  </Svg>
);

// --- La búsqueda en vivo -------------------------------------------------------------------------------------

const PALABRA_FASE: Partial<Record<EstadoBusquedaExt["fase"], string>> = {
  buscando: "Buscando",
  pausada: "En pausa",
  verificacion: "Te necesita",
  revisando: "Revisando",
};

const hora = (ms: number) => new Date(ms).toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit" });

/** El anillo de avance (como en el panel lateral): "3/12" al centro; sin total gira despacio. */
export function Anillo({ pagina, total, fase }: { pagina: number; total: number; fase: string }) {
  const a = avanceBusqueda({ pagina, total });
  const r = 34;
  const largo = 2 * Math.PI * r;
  return (
    <div className="dd-anillo" data-fase={fase} data-con-numero={a ? "si" : "no"} role="img" aria-label={a ? `Página ${a.texto.replace("/", " de ")}` : "Trabajando"}>
      <svg viewBox="0 0 80 80" aria-hidden>
        <circle className="dd-anillo-pista" cx="40" cy="40" r={r} />
        <circle className="dd-anillo-valor" cx="40" cy="40" r={r} strokeDasharray={largo} strokeDashoffset={a ? largo * (1 - a.pct / 100) : largo * 0.72} />
      </svg>
      <span aria-hidden>{a ? a.texto : "…"}</span>
    </div>
  );
}

export function VistaEnVivo({
  estado,
  pasos,
  ocupado,
  alOrdenar,
}: {
  estado: EstadoBusquedaExt;
  pasos: PasoVivo[];
  ocupado: OrdenBusqueda | null;
  alOrdenar?: (o: OrdenBusqueda) => void;
}) {
  const t = textoBusqueda(estado);
  const ordenar = (o: OrdenBusqueda) => () => alOrdenar?.(o);
  const quedan = estado.fase === "buscando" && estado.restanteMs > 0 ? textoRestante(estado.restanteMs) : null;
  return (
    <div className="dd-vivo" data-fase={estado.fase} data-patty="duenos-busqueda">
      <div className="dd-vivo-cabeza" role="status" aria-live="polite">
        <Anillo pagina={estado.pagina} total={estado.total} fase={estado.fase} />
        <div className="dd-vivo-texto">
          <span className="dd-palabra" data-tono={estado.fase === "verificacion" ? "ambar" : estado.fase === "pausada" ? "gris" : "verde"}>
            <i aria-hidden />
            {PALABRA_FASE[estado.fase] ?? "Trabajando"}
            {estado.automatica ? " · la semanal" : ""}
          </span>
          <strong>{t.titulo}</strong>
          {(estado.fase !== "buscando" ? t.detalle : estado.haciendo) && <span className="dd-vivo-detalle">{estado.fase !== "buscando" ? t.detalle : estado.haciendo}</span>}
          {quedan && (
            <span className="dd-vivo-tiempo">
              <IconoReloj tamano={16} />
              {quedan.replace(/^q/, "Q")}
            </span>
          )}
        </div>
      </div>
      <div className="dd-vivo-botones">
        {estado.fase === "buscando" && (
          <button type="button" className="grande" onClick={ordenar("pausar")} disabled={!!ocupado} data-patty="duenos-pausar">
            <IconoPausa />
            {ocupado === "pausar" ? "Pausando…" : "Pausar"}
          </button>
        )}
        {(estado.fase === "pausada" || estado.fase === "verificacion") && (
          <button type="button" className="primario grande" onClick={ordenar("seguir")} disabled={!!ocupado} data-patty="duenos-seguir">
            <IconoSeguir />
            {ocupado === "seguir" ? "Siguiendo…" : "Seguir"}
          </button>
        )}
        {estado.fase !== "revisando" && (
          <button type="button" className="grande dd-detener" onClick={ordenar("detener")} disabled={!!ocupado} data-patty="duenos-detener">
            <IconoParar />
            {ocupado === "detener" ? "Deteniendo…" : "Detener"}
          </button>
        )}
      </div>
      {pasos.length > 0 && (
        <ol className="dd-pasos" aria-label="Lo último que hizo">
          {pasos.map((p, i) => (
            <li key={`${p.en}-${i}`} data-actual={i === 0 ? "si" : undefined}>
              <span className="dd-pasos-punto" aria-hidden />
              <span className="dd-pasos-texto">{p.texto}</span>
              <time className="dd-pasos-hora">{hora(p.en)}</time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// --- La tarjeta de la extensión --------------------------------------------------------------------------------

export interface PropsHero {
  palabra: string;
  tono: TonoHero;
  titulo: string;
  detalle: string;
  pasos: PasoHero[];
  ultima: { cuando: string; duenos: number } | null;
  proxima: string | null;
  energia: EstadoEnergia | null;
  asistente: string;
  accion: AccionHero;
  /** El botón o enlace de la acción (lo arma quien sabe qué hace). */
  boton: React.ReactNode;
  /** Lo secundario: Desconectar, la instalación paso a paso… */
  secundario?: React.ReactNode;
  /** La búsqueda en vivo, si hay una. */
  enVivo?: React.ReactNode;
  /** Resultado reciente de la extensión ("Terminó: 18 anuncios · 3 posibles dueños") o un error. */
  aviso?: { texto: string; error: boolean } | null;
}

function Energia({ e, asistente }: { e: EstadoEnergia; asistente: string }) {
  const pct = e.nivel === "agotado" ? 0 : e.restante;
  return (
    <div className={`dd-dato tk tk-${e.nivel}`} title={subtextoEnergia(e, asistente)}>
      <span className="dd-dato-etiqueta">{tituloEnergia(asistente)}</span>
      <span className="dd-dato-valor dd-energia">
        <IconoBateria pct={pct} tamano={26} className="tk-bateria" />
        {pct} %
      </span>
      {e.nivel !== "bien" && <span className="dd-dato-sub">{e.nivel === "poco" ? "Le queda poca este mes" : "Sin energía este mes"}</span>}
    </div>
  );
}

const MARCA_TEXTO = { ok: "listo", falta: "falta", no_se: "no se sabe aquí" } as const;

export function VistaHero(p: PropsHero) {
  return (
    <section className="dd-hero" data-tono={p.tono} aria-labelledby="dd-hero-titulo" data-patty="extension-estado">
      <div className="dd-hero-cabeza">
        <span className="dd-aro" aria-hidden>
          <IconoPieza tamano={26} />
        </span>
        <div className="dd-hero-nombre">
          <span>Buscador de dueños</span>
          <span className="dd-palabra" data-tono={p.tono}>
            <i aria-hidden />
            {p.palabra}
          </span>
        </div>
      </div>
      <h2 id="dd-hero-titulo">{p.titulo}</h2>
      <p className="dd-hero-detalle">{p.detalle}</p>

      {p.enVivo ?? (
        <ul className="dd-chequeo" aria-label="Cómo está la extensión">
          {p.pasos.map((x) => (
            <li key={x.clave} data-marca={x.marca}>
              <span className="dd-chequeo-icono" aria-hidden>
                {x.marca === "ok" ? <IconoCheck tamano={14} /> : x.marca === "falta" ? "!" : "?"}
              </span>
              {x.texto}
              <span className="solo-lector"> ({MARCA_TEXTO[x.marca]})</span>
            </li>
          ))}
        </ul>
      )}

      {p.aviso && !p.enVivo && (
        <p className={p.aviso.error ? "dd-hero-aviso error" : "dd-hero-aviso"} role="status">
          {p.aviso.texto}
        </p>
      )}

      {(p.ultima || p.proxima || p.energia) && (
        <div className="dd-datos">
          {p.ultima && (
            <div className="dd-dato">
              <span className="dd-dato-etiqueta">Última búsqueda</span>
              <span className="dd-dato-valor">{p.ultima.cuando}</span>
              <span className="dd-dato-sub">
                {p.ultima.duenos === 0 ? "Sin dueños nuevos" : p.ultima.duenos === 1 ? "1 dueño encontrado" : `${p.ultima.duenos} dueños encontrados`}
              </span>
            </div>
          )}
          {p.proxima && (
            <div className="dd-dato">
              <span className="dd-dato-etiqueta">Próxima búsqueda</span>
              <span className="dd-dato-valor">{p.proxima.split(", ")[0]}</span>
              {p.proxima.includes(", ") && <span className="dd-dato-sub">{p.proxima.split(", ").slice(1).join(", ")}</span>}
            </div>
          )}
          {p.energia && p.energia.nivel !== "sin_tope" && <Energia e={p.energia} asistente={p.asistente} />}
        </div>
      )}

      {(p.accion.tipo !== "ninguna" || p.secundario) && !p.enVivo && (
        <div className="dd-hero-acciones">
          {p.accion.tipo !== "ninguna" && p.boton}
          {p.secundario && <div className="dd-hero-secundario">{p.secundario}</div>}
        </div>
      )}
    </section>
  );
}

// --- El embudo -----------------------------------------------------------------------------------------------

export function EmbudoDuenos({ pasos, elegida }: { pasos: PasoEmbudo[]; elegida: EtapaDueno }) {
  return (
    <nav className="dd-embudo" aria-label="Etapas de los dueños">
      <ol>
        {pasos.map((p, i) => (
          <li key={p.clave}>
            <Link href={`/panel/duenos?etapa=${p.clave}`} aria-current={elegida === p.clave ? "page" : undefined} data-patty={`duenos-etapa-${p.clave}`} scroll={false}>
              <span className="dd-embudo-num">{p.ahora}</span>
              <span className="dd-embudo-nombre">{p.nombre}</span>
              <span className="dd-embudo-conv">
                {i === 0 ? (p.llegaron === 1 ? "1 en total" : `${p.llegaron} en total`) : p.conversion === null ? "—" : `${p.conversion} % llegó`}
              </span>
              <span className="dd-embudo-barra" aria-hidden>
                <i style={{ width: `${pasos[0].llegaron ? Math.max(4, Math.round((p.llegaron / pasos[0].llegaron) * 100)) : 0}%` }} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// --- La tarjeta de un dueño ---------------------------------------------------------------------------------------

export interface DuenoVista {
  id: string;
  url: string;
  titulo: string | null;
  zona: string | null;
  precio: string | null;
  puntaje: number | null;
  esDueno: boolean;
  /** Las razones ya separadas (razonesDueno en lib/panel/duenos.ts). */
  razones: { aFavor: string[]; enContra: string[] };
  /** Hasta 4 fotos del anuncio (https de *.encuentra24.com, validadas al leer). */
  fotos: string[];
  cuando: string | null;
  quieto: number | null;
  nombre: string | null;
}

/** Los formularios (acciones del servidor) los pone la página; aquí solo la forma. */
export interface FormulariosDueno {
  /** Mover de etapa: un botón submit con el texto y el estado. */
  etapa: (d: DuenoVista, estado: string, texto: string, principal: boolean) => React.ReactNode;
  misCasas: (d: DuenoVista) => React.ReactNode;
  descartar: (d: DuenoVista) => React.ReactNode;
  /** "Crear mensaje con Patty" (componente del navegador con su acción). */
  patty: (d: DuenoVista, principal: boolean) => React.ReactNode;
}

const IconoAviso = () => (
  <Svg tamano={16}>
    <path d="M12 4.5 20.5 19h-17Z" />
    <path d="M12 10v4" strokeWidth={2} />
    <circle cx="12" cy="16.6" r=".6" fill="currentColor" />
  </Svg>
);

function Accion({ a, d, f, principal }: { a: AccionDueno; d: DuenoVista; f: FormulariosDueno; principal: boolean }) {
  if (!a) return null;
  const clase = principal ? "boton primario" : "boton";
  switch (a.tipo) {
    case "whatsapp":
      return (
        <a href={a.href} target="_blank" rel="noopener noreferrer" className={`${clase} dd-wa`} data-patty="duenos-whatsapp">
          <IconoWhatsApp />
          {a.texto}
        </a>
      );
    case "anuncio":
      return <BotonE24 url={a.href} />;
    case "etapa":
      return f.etapa(d, a.estado, a.texto, principal);
    case "mis_casas":
      return f.misCasas(d);
    case "ver_casa":
      return (
        <Link href={`/panel/propiedades/${a.propiedadId}`} className={clase}>
          {a.texto}
        </Link>
      );
  }
}

/** "Ver en Encuentra24": el anuncio en otra pestaña, con el nombre del sitio y el ícono de enlace externo. */
export function BotonE24({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="boton dd-e24" data-patty="duenos-ver-e24">
      <span className="dd-e24-marca" aria-hidden>
        E24
      </span>
      Ver en Encuentra24
      <IconoExterno />
      <span className="solo-lector"> (se abre en otra pestaña)</span>
    </a>
  );
}

/** "Por qué creemos que es el dueño": el medidor con su etiqueta y las razones a favor y en contra. */
export function PorQueDueno({ d, id }: { d: DuenoVista; id: string }) {
  const m = medidorConfianza(d.puntaje, d.esDueno);
  const { aFavor, enContra } = d.razones;
  return (
    <section className="dd-porque" data-tono={m.tono} aria-labelledby={id}>
      <div className="dd-porque-cabeza">
        <h4 id={id}>Por qué creemos que es el dueño</h4>
        <span className="dd-porque-etiqueta">
          {m.etiqueta}
          {m.pct !== null && <b> {m.pct} %</b>}
        </span>
      </div>
      {m.pct !== null && (
        <div className="dd-medidor" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.pct} aria-valuetext={`${m.etiqueta}, ${m.pct} %`} aria-labelledby={id}>
          <i style={{ width: `${Math.max(3, m.pct)}%` }} />
        </div>
      )}
      {(aFavor.length > 0 || enContra.length > 0) && (
        <div className="dd-razones">
          {aFavor.length > 0 && (
            <div>
              <span className="dd-razones-titulo">A favor</span>
              <ul>
                {aFavor.map((r) => (
                  <li key={r} data-lado="pro">
                    <span className="dd-razon-icono" aria-hidden>
                      <IconoCheck tamano={14} />
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {enContra.length > 0 && (
            <div>
              <span className="dd-razones-titulo">En contra / dudas</span>
              <ul>
                {enContra.map((r) => (
                  <li key={r} data-lado="contra">
                    <span className="dd-razon-icono" aria-hidden>
                      <IconoAviso />
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * La tarjeta de un dueño. Jerarquía en Encontrados: lo principal es "Crear mensaje con Patty"; después "Ver en
 * Encuentra24" (y WhatsApp si hay número); al final, chicos, "Ya le escribí" y "No es para mí". En las demás etapas lo
 * principal es el paso de la etapa y Patty queda para escribirle otra vez.
 */
export function TarjetaDueno({
  d,
  etapa,
  principal,
  segunda,
  formularios,
  instagram,
}: {
  d: DuenoVista;
  etapa: EtapaDueno;
  principal: AccionDueno;
  segunda: AccionDueno;
  formularios: FormulariosDueno;
  /** "Así se vería en tu Instagram" (con la foto y la marca), si hay foto. */
  instagram?: React.ReactNode;
}) {
  const nuevo = etapa === "nuevo";
  const conPatty = nuevo || etapa === "contactado" || etapa === "respondio";
  // En Encontrados, WhatsApp (si hay número) va como secundario y "Escribirle desde el anuncio" es "Ver en Encuentra24".
  const whatsapp = nuevo && principal?.tipo === "whatsapp" ? principal : etapa === "contactado" && segunda?.tipo === "whatsapp" ? segunda : null;
  const primera = nuevo ? null : principal;
  const terciaria = nuevo ? segunda : null;
  return (
    <article className="dd-dueno" aria-labelledby={`dd-${d.id}`}>
      <FotosDueno fotos={d.fotos} titulo={d.titulo ?? "Casa"} />
      <div className="dd-dueno-cuerpo">
        <div className="dd-dueno-arriba">
          {d.precio ? <strong className="dd-dueno-precio">{d.precio}</strong> : <strong className="dd-dueno-precio suave">Sin precio</strong>}
          {d.cuando && <span className="dd-dueno-cuando">{d.cuando}</span>}
        </div>
        <h3 id={`dd-${d.id}`}>{d.titulo ?? "Casa"}</h3>
        {d.zona && (
          <ul className="dd-chips" aria-label="Zona">
            <li className="dd-chip zona">{d.zona}</li>
          </ul>
        )}
        <PorQueDueno d={d} id={`dd-pq-${d.id}`} />
        {d.quieto !== null && d.quieto >= 5 && etapa !== "publicada" && <p className="dd-quieto">Sin movimiento hace {d.quieto} días</p>}
        <div className="dd-dueno-acciones">
          {nuevo ? formularios.patty(d, true) : <Accion a={primera} d={d} f={formularios} principal />}
          <div className="dd-dueno-secundarias">
            {!nuevo && conPatty && formularios.patty(d, false)}
            <BotonE24 url={d.url} />
            {whatsapp && <Accion a={whatsapp} d={d} f={formularios} principal={false} />}
          </div>
        </div>
        <div className="dd-dueno-pie">
          {terciaria?.tipo === "etapa" && <div className="dd-terciaria">{formularios.etapa(d, terciaria.estado, terciaria.texto, false)}</div>}
          {etapa !== "publicada" && (
            <details className="dd-mas">
              <summary>No es para mí</summary>
              {formularios.descartar(d)}
            </details>
          )}
        </div>
        {instagram && d.fotos.length > 0 && (
          <details className="dd-insta-plegado">
            <summary>Así se vería en tu Instagram</summary>
            {instagram}
          </details>
        )}
      </div>
    </article>
  );
}
