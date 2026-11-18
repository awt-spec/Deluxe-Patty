"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  filtrarCasas,
  moverFotoEnvio,
  pedidoDeEnvio,
  portadaDe,
  proponerCasa,
  quitarFotoEnvio,
  resumenEnvio,
  textoResultado,
  type CasaDelSitio,
  type EnvioSitio,
  type FotoEnvio,
} from "@/lib/panel/sitio-fotos";
import { achicar } from "./patty-casa";
import { casasDelSitio, mejorarFotoSitio, prepararFotosSitio, subirFotosAlSitio } from "./patty-sitio-acciones";

// Tarjeta del chat de Patty para subir fotos al sitio web: ¿a qué casa? → ¿mejorarlas con IA? → orden y portada →
// "¿Las subo?" → resultado. Los archivos viven solo en memoria mientras la tarjeta está abierta; nada sale al sitio
// hasta "Sí, subir al sitio". Reglas puras en lib/panel/sitio-fotos.ts; acciones en patty-sitio-acciones.ts.

export const MAX_FOTOS_SITIO = 12;

export type FinEnvioSitio = { texto: string; sitio?: { fotos: string[]; url: string | null } };

const VER_CASAS = 8;

export function SubirAlSitio({
  texto,
  archivos,
  nombre,
  alTerminar,
}: {
  texto: string;
  archivos: File[];
  nombre: string;
  /** Al terminar (o cancelar): la respuesta que queda en el chat. */
  alTerminar: (fin: FinEnvioSitio) => void;
}) {
  const [casas, setCasas] = useState<CasaDelSitio[] | null>(null);
  const [propuesta, setPropuesta] = useState<CasaDelSitio | null>(null);
  const [buscar, setBuscar] = useState("");
  const [nota, setNota] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const envioId = useRef<string | null>(null);
  const [e, setE] = useState<EnvioSitio>(() => ({
    paso: "casa",
    casa: null,
    fotos: archivos.slice(0, MAX_FOTOS_SITIO).map((a, i) => ({ id: `f${i}`, mini: URL.createObjectURL(a), camino: null, mejorada: null, usar: "original" })),
    portada: null,
    demo: false,
    resultado: null,
  }));
  const minis = useRef(e.fotos.map((f) => f.mini));

  useEffect(() => {
    const lista = minis.current;
    return () => lista.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await casasDelSitio();
        if (!vivo) return;
        if (!r.ok) return alTerminar({ texto: r.motivo });
        setCasas(r.casas);
        setPropuesta(proponerCasa(texto, r.casas));
        setE((x) => ({ ...x, demo: r.demo }));
      } catch {
        if (vivo) alTerminar({ texto: "No pude leer tus casas del sitio. Revisa la conexión e inténtalo de nuevo." });
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibles = useMemo(() => filtrarCasas(casas ?? [], buscar).slice(0, VER_CASAS), [casas, buscar]);
  const sobran = archivos.length - e.fotos.length;

  /** Paso 2: la casa elegida; las fotos suben a la carpeta de envío (achicadas a 2400 px, sin datos ocultos). */
  async function elegir(casa: CasaDelSitio) {
    setNota(null);
    setE((x) => ({ ...x, casa, paso: "subiendo" }));
    setTrabajando("Preparando las fotos…");
    try {
      const r = await prepararFotosSitio(casa.id, e.fotos.length);
      if (!r.ok) {
        setNota(r.motivo);
        setE((x) => ({ ...x, casa: null, paso: "casa" }));
        return;
      }
      if (r.demo) {
        setE((x) => ({ ...x, paso: "mejorar" }));
        return;
      }
      const almacen = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } }).storage.from("fotos");
      const listas: FotoEnvio[] = [];
      for (const [i, foto] of e.fotos.entries()) {
        setTrabajando(`Preparando foto ${i + 1} de ${e.fotos.length}…`);
        const blob = await achicar(archivos[i]);
        if (!blob) continue;
        const { camino, token } = r.subidas[i];
        const { error } = await almacen.uploadToSignedUrl(camino, token, blob, { contentType: "image/jpeg" });
        if (!error) listas.push({ ...foto, camino });
      }
      if (listas.length === 0) {
        setNota("No pude preparar las fotos. Revisa la conexión e inténtalo de nuevo.");
        setE((x) => ({ ...x, casa: null, paso: "casa" }));
        return;
      }
      if (listas.length < e.fotos.length) setNota(`${e.fotos.length - listas.length} no se pudieron preparar; sigo con ${listas.length}.`);
      setE((x) => ({ ...x, fotos: listas, paso: "mejorar" }));
    } catch {
      setNota("No pude preparar las fotos. Revisa la conexión e inténtalo de nuevo.");
      setE((x) => ({ ...x, casa: null, paso: "casa" }));
    } finally {
      setTrabajando(null);
    }
  }

  /** Paso 3: mejorar con IA una por una (cada una gasta Energía; si se acaba, el resto va original). */
  async function mejorar() {
    if (!e.casa) return;
    if (e.demo) {
      setNota("En la demo no se mejoran fotos: van las originales.");
      setE((x) => ({ ...x, paso: "orden" }));
      return;
    }
    setNota(null);
    setE((x) => ({ ...x, paso: "mejorando" }));
    let fotos = e.fotos;
    let fallas = 0;
    for (const [i, foto] of e.fotos.entries()) {
      if (!foto.camino) continue;
      setTrabajando(`Mejorando foto ${i + 1} de ${e.fotos.length}…`);
      try {
        const r = await mejorarFotoSitio(e.casa.id, foto.camino);
        if (r.ok) {
          fotos = fotos.map((f) => (f.id === foto.id ? { ...f, mejorada: { camino: r.camino, url: r.url }, usar: "mejorada" } : f));
          setE((x) => ({ ...x, fotos }));
        } else {
          fallas++;
          // Sin Energía, sin permiso o muy rápido: no se sigue intentando con las demás.
          if (!r.motivo.startsWith("No pude mejorar esa foto")) {
            setNota(r.motivo);
            break;
          }
        }
      } catch {
        fallas++;
      }
    }
    if (fallas) setNota((n) => n ?? `${fallas === 1 ? "Una foto no se pudo mejorar" : `${fallas} fotos no se pudieron mejorar`}: van las originales.`);
    setTrabajando(null);
    setE((x) => ({ ...x, fotos, paso: "orden" }));
  }

  function aConfirmar() {
    envioId.current = crypto.randomUUID();
    setNota(null);
    setE((x) => ({ ...x, paso: "confirmar" }));
  }

  /** "Sí, subir al sitio": lo único que manda algo al sitio. */
  async function subir() {
    const pedido = pedidoDeEnvio(e);
    if (!e.casa || (!pedido && !e.demo) || e.paso === "enviando") return;
    setNota(null);
    setE((x) => ({ ...x, paso: "enviando" }));
    setTrabajando("Subiendo al sitio…");
    try {
      const r = await subirFotosAlSitio({ casaId: e.casa.id, fotos: pedido?.fotos ?? [], portada: pedido?.portada ?? 0, envio: envioId.current });
      if (!r.ok) {
        setNota(r.motivo);
        setE((x) => ({ ...x, paso: "confirmar" }));
        return;
      }
      const final: EnvioSitio = { ...e, paso: "listo", resultado: { fotos: r.fotos, urlCasa: r.urlCasa }, demo: r.demo };
      setE(final);
      alTerminar({ texto: textoResultado(final), sitio: r.demo ? undefined : { fotos: r.fotos, url: r.urlCasa } });
    } catch {
      setNota("No pude subir las fotos. Revisa la conexión e inténtalo de nuevo.");
      setE((x) => ({ ...x, paso: "confirmar" }));
    } finally {
      setTrabajando(null);
    }
  }

  const cancelar = () => alTerminar({ texto: "Listo, no subí nada al sitio." });
  const verFoto = (f: FotoEnvio) => (f.usar === "mejorada" && f.mejorada ? f.mejorada.url : f.mini);
  const portada = portadaDe(e);

  return (
    <div className="patty-burbuja suya patty-sitio" aria-live="polite">
      <strong className="patty-sitio-titulo">Subir {e.fotos.length === 1 ? "1 foto" : `${e.fotos.length} fotos`} al sitio web</strong>
      {e.demo && <small className="patty-sitio-demo">Demostración: no se manda nada al sitio.</small>}
      {sobran > 0 && <small>Uso las primeras {MAX_FOTOS_SITIO}; las demás súbelas en otro envío.</small>}

      {e.paso === "casa" && casas === null && <span>Buscando tus casas del sitio…</span>}

      {e.paso === "casa" && casas && propuesta && (
        <div className="patty-sitio-propuesta">
          <span>¿Es esta casa?</span>
          <TarjetaCasa casa={propuesta} />
          <span className="patty-casa-botones">
            <button type="button" className="primario" onClick={() => void elegir(propuesta)}>
              Sí, esta
            </button>
            <button type="button" onClick={() => setPropuesta(null)}>
              Otra casa
            </button>
          </span>
        </div>
      )}

      {e.paso === "casa" && casas && !propuesta && (
        <div className="patty-sitio-casas">
          <span>¿A qué casa del sitio?</span>
          <input
            type="search"
            className="patty-sitio-buscar"
            placeholder="Código, nombre o zona"
            value={buscar}
            onChange={(ev) => setBuscar(ev.target.value)}
            aria-label="Buscar la casa"
          />
          <ul>
            {visibles.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => void elegir(c)}>
                  <TarjetaCasa casa={c} />
                </button>
              </li>
            ))}
            {visibles.length === 0 && <li className="patty-sitio-vacio">No encontré ninguna con eso.</li>}
          </ul>
        </div>
      )}

      {(e.paso === "subiendo" || e.paso === "mejorando" || e.paso === "enviando") && <span className="patty-sitio-trabajando">{trabajando ?? "Un momento…"}</span>}

      {e.paso === "mejorar" && e.casa && (
        <div>
          <TarjetaCasa casa={e.casa} />
          <span>¿Las mejoro con IA primero? Luz, color y nitidez, sin cambiar nada de la casa. La original queda guardada y eliges cuál va.</span>
          <span className="patty-casa-botones">
            <button type="button" onClick={() => void mejorar()}>
              Sí, mejorarlas
            </button>
            <button type="button" className="primario" onClick={() => setE((x) => ({ ...x, paso: "orden" }))}>
              No, así están
            </button>
          </span>
        </div>
      )}

      {e.paso === "orden" && (
        <div>
          <span>Ordénalas y elige la portada. Van al final de la galería; la portada pasa al frente.</span>
          <ol className="patty-sitio-fotos">
            {e.fotos.map((f, i) => (
              <li key={f.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={verFoto(f)} alt={`Foto ${i + 1}`} />
                <span className="patty-sitio-foto-datos">
                  <b>Foto {i + 1}</b>
                  {portada?.id === f.id ? <em className="patty-sitio-etiqueta">Portada</em> : null}
                  {f.usar === "mejorada" && f.mejorada ? <em className="patty-sitio-etiqueta ia">Mejorada con IA</em> : null}
                  {f.mejorada && (
                    <span className="patty-sitio-version" role="group" aria-label={`Versión de la foto ${i + 1}`}>
                      <button type="button" aria-pressed={f.usar === "original"} onClick={() => setE((x) => ({ ...x, fotos: x.fotos.map((y) => (y.id === f.id ? { ...y, usar: "original" } : y)) }))}>
                        Original
                      </button>
                      <button type="button" aria-pressed={f.usar === "mejorada"} onClick={() => setE((x) => ({ ...x, fotos: x.fotos.map((y) => (y.id === f.id ? { ...y, usar: "mejorada" } : y)) }))}>
                        Mejorada
                      </button>
                    </span>
                  )}
                </span>
                <span className="patty-sitio-mover">
                  <button type="button" aria-label={`Subir la foto ${i + 1}`} disabled={i === 0} onClick={() => setE((x) => ({ ...x, fotos: moverFotoEnvio(x.fotos, f.id, -1) }))}>
                    ↑
                  </button>
                  <button type="button" aria-label={`Bajar la foto ${i + 1}`} disabled={i === e.fotos.length - 1} onClick={() => setE((x) => ({ ...x, fotos: moverFotoEnvio(x.fotos, f.id, 1) }))}>
                    ↓
                  </button>
                  {portada?.id !== f.id && (
                    <button type="button" onClick={() => setE((x) => ({ ...x, portada: f.id }))}>
                      Portada
                    </button>
                  )}
                  {e.fotos.length > 1 && (
                    <button type="button" aria-label={`Quitar la foto ${i + 1}`} onClick={() => setE((x) => quitarFotoEnvio(x, f.id))}>
                      Quitar
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <span className="patty-casa-botones">
            <button type="button" className="primario" onClick={aConfirmar}>
              Listo, ver cómo queda
            </button>
          </span>
        </div>
      )}

      {(e.paso === "confirmar" || e.paso === "enviando") && (
        <div className="patty-casa">
          {resumenEnvio(e).map((l, j) => (j === 0 ? <strong key={j}>{l}</strong> : <span key={j}>{l}</span>))}
          <div className="patty-sitio-tira">
            {e.fotos.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.id} src={verFoto(f)} alt={`Foto ${i + 1}`} className={portada?.id === f.id ? "portada" : undefined} />
            ))}
          </div>
          <span className="patty-casa-botones">
            <button type="button" className="primario" onClick={() => void subir()} disabled={e.paso === "enviando"}>
              {e.paso === "enviando" ? "Subiendo…" : "Sí, subir al sitio"}
            </button>
            <button type="button" onClick={() => setE((x) => ({ ...x, paso: "orden" }))} disabled={e.paso === "enviando"}>
              Cambiar algo
            </button>
          </span>
        </div>
      )}

      {nota && (
        <small className="patty-sitio-nota" role="status">
          {nota}
        </small>
      )}

      {e.paso !== "listo" && e.paso !== "enviando" && e.paso !== "subiendo" && e.paso !== "mejorando" && (
        <button type="button" className="patty-mini" onClick={cancelar}>
          No subir nada
        </button>
      )}
      <span className="patty-sitio-pie">{nombre} no manda nada al sitio hasta que tocas «Sí, subir al sitio».</span>
    </div>
  );
}

function TarjetaCasa({ casa }: { casa: CasaDelSitio }) {
  return (
    <span className="patty-sitio-casa">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {casa.foto ? <img src={casa.foto} alt="" /> : <span className="patty-sitio-sinfoto" aria-hidden />}
      <span>
        <b>{casa.titulo}</b>
        <small>
          {casa.codigo}
          {casa.zona ? ` · ${casa.zona}` : ""}
        </small>
      </span>
    </span>
  );
}

/** Resultado que queda en el chat: las fotos como se ven en el sitio y el enlace a la casa allá. */
export function ResultadoSitio({ fotos, url }: { fotos: string[]; url: string | null }) {
  return (
    <div className="patty-sitio-resultado">
      {fotos.length > 0 && (
        <div className="patty-sitio-tira">
          {fotos.map((f, i) => (
            <a key={f} href={f} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f} alt={`Foto ${i + 1} en el sitio`} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {url && (
        <a className="patty-sitio-enlace" href={url} target="_blank" rel="noreferrer">
          Ver la casa en el sitio
        </a>
      )}
    </div>
  );
}
