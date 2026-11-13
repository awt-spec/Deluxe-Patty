"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  alAtras,
  alElegir,
  alEmpezarDeNuevo,
  alSiguiente,
  numeroDePaso,
  pasoGuardado,
  pasoVisible,
  type Eleccion,
} from "@/lib/panel/pasos";
import { IconoAtras, IconoCheck, IconoFlecha } from "../iconos";
import "./pasos.css";

// Asistente paso a paso del panel, sacado del de la extensión (app/panel/duenos/extension/): "Paso N de M", un paso
// por pantalla (título, instrucción, dibujo y la acción del paso), "Atrás / Ya lo hice, siguiente", "¿No te sale
// así?" plegado, el paso recordado en el navegador y el avance solo cuando los datos dicen que el paso está hecho
// (respetando el "Atrás" de la persona). Las reglas están en lib/panel/pasos.ts.

export const FINAL = "listo";

export interface PasoGuia {
  id: string;
  /** Nombre corto para el progreso ("Tus casas"). */
  nombre: string;
  titulo: string;
  contenido: React.ReactNode;
  ilustracion?: React.ReactNode;
  ayuda?: { p: string; r: React.ReactNode }[];
  /** Texto del botón de seguir; null: sin botón (la acción del paso es la que avanza). */
  siguiente?: string | null;
}

export interface PropsAsistente {
  /** Prefijo de ids y de data-patty ("empezar", "anuncio"…). */
  id: string;
  /** Para el lector de pantalla: "Pasos para preparar a tu asistente". */
  etiqueta: string;
  pasos: PasoGuia[];
  final: { titulo: string; contenido: React.ReactNode; ilustracion?: React.ReactNode };
  /** Pasos que los datos dan por hechos: se saltan solos y se marcan en el progreso. */
  cumplidos?: string[];
  /** Clave de localStorage (clavePasos); null: no se recuerda. */
  clave?: string | null;
  /** El progreso marca "hecho" por los datos (y deja tocar cualquier paso), no solo por ir antes. */
  porDatos?: boolean;
}

interface Control {
  paso: string;
  siguiente(): void;
  ir(p: string): void;
}

const ContextoPasos = createContext<Control | null>(null);

/** Para que la acción de un paso (elegir destino, copiar…) pueda avanzar la guía. */
export function usePasos(): Control {
  return useContext(ContextoPasos) ?? { paso: "", siguiente: () => {}, ir: () => {} };
}

function leer(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardar(clave: string, valor: string) {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // sin almacenamiento: solo no se recuerda
  }
}

export function AsistentePasos({ id, etiqueta, pasos, final, cumplidos, clave = null, porDatos = false }: PropsAsistente) {
  const ids = useMemo(() => [...pasos.map((p) => p.id), FINAL], [pasos]);
  const hechos = useMemo(() => new Set(cumplidos ?? []), [cumplidos]);
  const conDatos = cumplidos !== undefined;
  const cumplido = (p: string) => hechos.has(p);
  const [eleccion, setEleccion] = useState<Eleccion<string>>({ elegido: null, volvioAtras: false });
  const [leido, setLeido] = useState(!clave);
  const raiz = useRef<HTMLDivElement>(null);

  // Lo guardado se lee después del primer dibujo (en el servidor no hay navegador).
  useEffect(() => {
    if (!clave) return;
    const g = pasoGuardado(ids, leer(clave), conDatos ? (p) => hechos.has(p) : undefined);
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage solo existe en el navegador: se lee ya montado para no desajustar la hidratación */
    if (g) setEleccion((e) => (e.elegido ? e : { elegido: g, volvioAtras: false }));
    setLeido(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Solo al llegar: después manda lo que la persona toque.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se lee una vez por guía, no en cada cambio de datos
  }, [clave, ids]);

  const paso = pasoVisible(ids, eleccion, cumplido);
  const actual = pasos.find((p) => p.id === paso) ?? null;

  useEffect(() => {
    if (clave && leido) guardar(clave, paso);
  }, [clave, leido, paso]);

  // Al cambiar de paso, el foco va al título (lector de pantalla y teclado) y el paso queda a la vista.
  const primero = useRef(true);
  useEffect(() => {
    if (primero.current) {
      primero.current = false;
      return;
    }
    const t = raiz.current?.querySelector<HTMLElement>(`#${id}-paso-titulo`);
    t?.focus({ preventScroll: true });
    const caja = raiz.current?.getBoundingClientRect();
    if (caja && caja.top < 0) raiz.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [paso, id]);

  const control: Control = {
    paso,
    siguiente: () => setEleccion(alSiguiente(ids, paso)),
    ir: (p) => setEleccion(alElegir(ids, paso, p)),
  };
  const { numero, total } = numeroDePaso(ids, paso);
  const indiceActual = ids.indexOf(paso);

  return (
    <ContextoPasos.Provider value={control}>
      <div className="pap" ref={raiz} data-paso={paso} data-patty={`${id}-guia`}>
        <nav className="pap-progreso" aria-label={etiqueta}>
          <p className="pap-cuenta">{paso === FINAL ? "Todo listo" : `Paso ${numero} de ${total}`}</p>
          <ol>
            {pasos.map((p, i) => {
              const hecho = porDatos ? cumplido(p.id) : i < indiceActual;
              const esActual = p.id === paso;
              return (
                <li key={p.id} data-estado={esActual ? "actual" : hecho ? "hecho" : "falta"}>
                  <button
                    type="button"
                    onClick={() => control.ir(p.id)}
                    aria-current={esActual ? "step" : undefined}
                    disabled={!porDatos && i > indiceActual}
                    data-patty={`${id}-paso-${p.id}`}
                  >
                    <span className="pap-num" aria-hidden>
                      {hecho && !esActual ? <IconoCheck tamano={16} /> : i + 1}
                    </span>
                    <span className="pap-nombre">{p.nombre}</span>
                    {hecho && <span className="solo-lector"> (hecho)</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="pap-tarjeta">
          {actual ? (
            <section className={`pap-paso${actual.ilustracion ? "" : " sin-dibujo"}`} aria-labelledby={`${id}-paso-titulo`}>
              <div className="pap-texto">
                <h2 id={`${id}-paso-titulo`} tabIndex={-1}>
                  {actual.titulo}
                </h2>
                {porDatos && cumplido(actual.id) && (
                  <p className="pap-hecho" role="status">
                    <IconoCheck tamano={18} /> Esto ya está hecho.
                  </p>
                )}
                {actual.contenido}
                <div className="pap-botonera">
                  {indiceActual > 0 ? (
                    <button type="button" className="pap-atras" onClick={() => setEleccion(alAtras(ids, paso))} data-patty={`${id}-atras`}>
                      <IconoAtras tamano={18} />
                      Atrás
                    </button>
                  ) : (
                    <span />
                  )}
                  {actual.siguiente !== null && (
                    <button
                      type="button"
                      className={`pap-siguiente${cumplido(actual.id) ? " primario" : ""}`}
                      onClick={control.siguiente}
                      data-patty={`${id}-siguiente`}
                    >
                      {cumplido(actual.id) ? "Siguiente" : (actual.siguiente ?? "Ya lo hice, siguiente")}
                      <IconoFlecha tamano={18} />
                    </button>
                  )}
                </div>
                {actual.ayuda && actual.ayuda.length > 0 && (
                  <details className="pap-ayuda" data-patty={`${id}-ayuda`}>
                    <summary>¿No te sale así?</summary>
                    <dl>
                      {actual.ayuda.map((a) => (
                        <div key={a.p}>
                          <dt>{a.p}</dt>
                          <dd>{a.r}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </div>
              {actual.ilustracion && <div className="pap-dibujo">{actual.ilustracion}</div>}
            </section>
          ) : (
            <section className="pap-final" aria-labelledby={`${id}-paso-titulo`}>
              <span className="pap-final-check" aria-hidden>
                <IconoCheck tamano={34} />
              </span>
              <h2 id={`${id}-paso-titulo`} tabIndex={-1}>
                {final.titulo}
              </h2>
              {final.ilustracion && <div className="pap-final-dibujo">{final.ilustracion}</div>}
              {final.contenido}
            </section>
          )}
        </div>

        {indiceActual > 0 && (
          <p className="pap-empezar">
            <button type="button" className="enlace" onClick={() => setEleccion(alEmpezarDeNuevo(ids))} data-patty={`${id}-empezar-de-nuevo`}>
              Empezar de nuevo
            </button>
          </p>
        )}
      </div>
    </ContextoPasos.Provider>
  );
}

/** Botón para copiar un texto, con "Copiado" unos segundos (y aviso al lector de pantalla). */
export function BotonCopiar({ texto, etiqueta = "Copiar", patty, principal = false }: { texto: string; etiqueta?: string; patty?: string; principal?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`pap-copiar${principal ? " primario" : ""}${copiado ? " copiado" : ""}`}
        data-patty={patty}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
          } catch {
            // sin permiso para copiar: el texto queda a la vista para copiarlo a mano
          }
        }}
      >
        {copiado ? <IconoCheck tamano={18} /> : null}
        {copiado ? "Copiado" : etiqueta}
      </button>
      <span className="solo-lector" aria-live="polite">
        {copiado ? "Copiado" : ""}
      </span>
    </>
  );
}
