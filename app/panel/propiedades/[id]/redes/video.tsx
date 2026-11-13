"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { mejoresReales, type OpcionFoto } from "@/lib/redes/fotos";
import {
  DURACION_MAX,
  DURACION_MIN,
  FORMATOS_VIDEO,
  MAX_FOTOS_VIDEO,
  MAX_TEXTO_ESCENA,
  TOTAL_MAX,
  agregarFoto,
  ajustar,
  aplicarGuion,
  duracionTotal,
  guionPorDefecto,
  mover,
  quitar,
  type Escena,
  type FormatoVideo,
} from "@/lib/redes/video";
import { proponerGuionVideo } from "./acciones";
import { cargarFoto, dibujarCuadro, formatoDeGrabacion, grabarVideo, type Recursos } from "./dibujo";
import type { DatosEstudio } from "./estudio";

// Editor del video para redes: escenas en orden (portada, fotos, datos y cierre), texto y duración de cada
// una, formato, vista previa en el lienzo y "Descargar video". Todo pasa en el teléfono: las fotos son las
// reales de la casa y el video se graba del lienzo con MediaRecorder. La IA solo propone el guion.

const NOMBRE: Record<Escena["tipo"], string> = { portada: "Portada", foto: "Foto", datos: "Datos de la casa", cierre: "Cierre" };
const AYUDA: Record<Escena["tipo"], string> = {
  portada: "Título (el precio y la zona los pone la ficha)",
  foto: "Texto sobre la foto (opcional)",
  datos: "Encabezado (los datos salen de la ficha)",
  cierre: "Invitación (abajo va tu WhatsApp)",
};

// Lo que sabe grabar este navegador: se pregunta una vez y solo en el navegador (en el servidor no hay MediaRecorder).
let grabacion: ReturnType<typeof formatoDeGrabacion> | undefined;
const sinSuscripcion = () => () => {};
const formatoDelNavegador = () => (grabacion === undefined ? (grabacion = formatoDeGrabacion()) : grabacion);

const segundos = (n: number) => `${String(n).replace(".", ",")} s`;

export function EditorVideo(d: DatosEstudio) {
  const reales = useMemo(() => mejoresReales(d.opciones), [d.opciones]);
  const porUrl = useMemo(() => new Map(d.opciones.map((o) => [o.url, o])), [d.opciones]);
  const comoFoto = (o: OpcionFoto) => ({ url: o.url, ilustrativa: o.ilustrativa });

  const [formato, setFormato] = useState<FormatoVideo>("vertical");
  const [escenas, setEscenas] = useState<Escena[]>(() => guionPorDefecto(reales.map(comoFoto), d.datosVideo));
  const [tiempo, setTiempo] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [grabando, setGrabando] = useState<number | null>(null);
  const [archivo, setArchivo] = useState<{ url: string; extension: string; nombre: string } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);
  const [pensando, setPensando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [agregando, setAgregando] = useState(false);

  const lienzo = useRef<HTMLCanvasElement>(null);
  const fotos = useRef(new Map<string, HTMLImageElement>());
  const logo = useRef<HTMLImageElement | null>(null);
  const cancelar = useRef(false);
  const soporte = useSyncExternalStore(sinSuscripcion, formatoDelNavegador, () => undefined);

  const total = duracionTotal(escenas);
  const { ancho, alto } = FORMATOS_VIDEO[formato];
  const recursos = useCallback(
    (): Recursos => ({ fotos: fotos.current, logo: logo.current, colores: d.colores, fondoLogo: d.fondoLogo }),
    [d.colores, d.fondoLogo],
  );
  const pintar = useCallback(
    (t: number) => {
      const ctx = lienzo.current?.getContext("2d");
      if (ctx) dibujarCuadro(ctx, escenas, d.datosVideo, recursos(), t);
    },
    [escenas, d.datosVideo, recursos],
  );

  // Fotos y logo: se cargan una vez cada uno (directo del bucket o por la ruta propia si el navegador no deja leerlas).
  useEffect(() => {
    let vivo = true;
    const faltan = escenas.map((e) => e.foto?.url).filter((u): u is string => !!u && !fotos.current.has(u));
    const alterna = (u: string) => `/panel/propiedades/${d.propiedadId}/redes/foto?img=${encodeURIComponent(u)}`;
    (async () => {
      setCargando(true);
      await Promise.all([
        document.fonts?.load(`500 60px "Playfair Display"`).catch(() => null),
        document.fonts?.load(`600 60px Inter`).catch(() => null),
        document.fonts?.load(`700 60px Inter`).catch(() => null),
        ...faltan.map((u) =>
          cargarFoto(u, alterna(u))
            .then((img) => fotos.current.set(u, img))
            .catch(() => null),
        ),
        !logo.current && d.logo
          ? cargarFoto(d.logo, null)
              .then((img) => (logo.current = img))
              .catch(() => null)
          : null,
      ]);
      if (vivo) setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [escenas, d.propiedadId, d.logo]);

  // Cuadro quieto cuando no se reproduce.
  useEffect(() => {
    if (!reproduciendo && grabando === null) pintar(Math.min(tiempo, total));
  }, [pintar, tiempo, total, reproduciendo, grabando, cargando, formato]);

  // Vista previa: se reproduce en el lienzo.
  useEffect(() => {
    if (!reproduciendo) return;
    let marco = 0;
    const inicio = performance.now() - tiempo * 1000;
    const paso = () => {
      const t = (performance.now() - inicio) / 1000;
      if (t >= total) {
        pintar(total);
        setTiempo(0);
        setReproduciendo(false);
        return;
      }
      pintar(t);
      marco = requestAnimationFrame(paso);
    };
    marco = requestAnimationFrame(paso);
    return () => {
      cancelAnimationFrame(marco);
    };
    // El tiempo inicial se toma al empezar; no se reinicia en cada cuadro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reproduciendo, pintar, total]);

  const cambiar = (nuevas: Escena[]) => {
    setEscenas(ajustar(nuevas));
    setArchivo(null);
  };
  const editar = (i: number, cambio: Partial<Escena>) => cambiar(escenas.map((e, j) => (j === i ? { ...e, ...cambio } : e)));
  const inicioDe = (i: number) => duracionTotal(escenas.slice(0, i));

  const enVideo = new Set(escenas.map((e) => e.foto?.url).filter(Boolean) as string[]);
  const cuantasFotos = escenas.filter((e) => e.tipo === "foto").length;

  const proponer = async () => {
    setPensando(true);
    setAviso(null);
    // Las fotos que ya están en el video y, para completar, las demás reales de la casa.
    const urls = [...enVideo, ...reales.map((o) => o.url).filter((u) => !enVideo.has(u))].slice(0, MAX_FOTOS_VIDEO);
    try {
      const r = await proponerGuionVideo(d.propiedadId, urls);
      if (!r.ok) setAviso({ texto: r.motivo, error: true });
      else {
        cambiar(aplicarGuion(escenas, r.escenas, urls.map((u) => porUrl.get(u)).filter((o): o is OpcionFoto => !!o).map(comoFoto)));
        setTiempo(0);
        setAviso({ texto: r.aviso ?? "Listo: revisa el orden y los textos. Puedes cambiar lo que quieras.", error: false });
      }
    } catch {
      setAviso({ texto: "No se pudo conectar. Revisa el internet e inténtalo de nuevo.", error: true });
    } finally {
      setPensando(false);
    }
  };

  const descargar = async () => {
    if (!lienzo.current || !soporte) return;
    setReproduciendo(false);
    setAviso(null);
    if (archivo) URL.revokeObjectURL(archivo.url);
    setArchivo(null);
    cancelar.current = false;
    setGrabando(0);
    try {
      const r = await grabarVideo(lienzo.current, total, pintar, { alAvanzar: setGrabando, cancelado: () => cancelar.current });
      const nombre = `${d.codigo}-video-${formato}.${r.extension}`;
      const url = URL.createObjectURL(r.archivo);
      setArchivo({ url, extension: r.extension, nombre });
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
    } catch (e) {
      if (!(e instanceof Error && e.message === "cancelado")) setAviso({ texto: "No se pudo grabar el video en este navegador. Prueba en Chrome o Safari actualizados.", error: true });
    } finally {
      setGrabando(null);
      setTiempo(0);
    }
  };

  if (reales.length === 0 && d.opciones.length === 0) return null;
  const ocupado = grabando !== null;

  return (
    <div className="redes-video pila">
      <p className="suave">
        Un video corto con las fotos reales de la casa. Ordena las escenas, cambia los textos y descárgalo. Sin música: agrégala en
        Instagram o TikTok.
      </p>

      <div className="redes-formato" role="radiogroup" aria-label="Formato del video" data-patty="redes-video-formato">
        {(Object.keys(FORMATOS_VIDEO) as FormatoVideo[]).map((f) => (
          <label key={f} className="chip">
            <input
              type="radio"
              name="formato-video"
              checked={formato === f}
              disabled={ocupado}
              onChange={() => {
                setFormato(f);
                setArchivo(null);
              }}
            />
            {FORMATOS_VIDEO[f].nombre}
          </label>
        ))}
      </div>

      <div className="redes-video-cuerpo">
        <div className="redes-lienzo">
          <canvas ref={lienzo} width={ancho} height={alto} className={formato} aria-label="Vista previa del video" />
          {cargando && <p className="suave">Cargando las fotos…</p>}
          <input
            type="range"
            min={0}
            max={total}
            step={0.1}
            value={Math.min(tiempo, total)}
            disabled={ocupado}
            onChange={(e) => {
              setReproduciendo(false);
              setTiempo(Number(e.target.value));
            }}
            aria-label="Momento del video"
          />
          <div className="redes-controles">
            <button type="button" className="boton grande" onClick={() => setReproduciendo((r) => !r)} disabled={ocupado} data-patty="redes-video-reproducir">
              {reproduciendo ? "Pausar" : "Ver el video"}
            </button>
            <p className="suave">
              Dura {segundos(total)} (máximo {TOTAL_MAX} s)
            </p>
          </div>

          <div className="pila redes-descarga">
            {soporte === null ? (
              <p className="aviso error">Este navegador no puede grabar el video. Ábrelo en Chrome o Safari actualizados.</p>
            ) : ocupado ? (
              <>
                <p className="aviso" role="status">
                  Grabando el video… {Math.round((grabando ?? 0) * 100)} %. Tarda lo que dura el video: no cambies de pantalla.
                </p>
                <button type="button" className="boton" onClick={() => (cancelar.current = true)}>
                  Cancelar
                </button>
              </>
            ) : (
              <button type="button" className="boton primario grande" onClick={descargar} disabled={cargando || !soporte || escenas.length === 0} data-patty="redes-video-descargar">
                Descargar video
              </button>
            )}
            {archivo && (
              <p className="aviso" role="status">
                Listo: video en {archivo.extension.toUpperCase()}.{" "}
                <a href={archivo.url} download={archivo.nombre}>
                  Bajarlo otra vez
                </a>
                {archivo.extension === "webm" && (
                  <>
                    <br />
                    Ojo: salió en WebM. WhatsApp e Instagram a veces piden MP4; si no lo aceptan, ábrelo desde Safari en el iPhone o
                    en Chrome actualizado.
                  </>
                )}
              </p>
            )}
            {soporte && !archivo && !ocupado && <p className="suave">Saldrá en {soporte.extension.toUpperCase()}.</p>}
          </div>
        </div>

        <div className="pila">
          <button type="button" className="boton grande" onClick={proponer} disabled={pensando || ocupado} data-patty="redes-video-guion">
            {pensando ? "Pensando el guion…" : "Proponer guion con IA"}
          </button>
          {aviso && (
            <p className={aviso.error ? "aviso error" : "aviso"} role="status">
              {aviso.texto}
            </p>
          )}

          <ol className="redes-escenas" data-patty="redes-video-escenas">
            {escenas.map((e, i) => (
              <li key={e.id} className={`redes-escena ${e.tipo}`}>
                <button
                  type="button"
                  className="redes-escena-ver"
                  onClick={() => {
                    setReproduciendo(false);
                    setTiempo(inicioDe(i) + Math.min(1.2, e.duracion / 2));
                  }}
                  aria-label={`Ver ${NOMBRE[e.tipo]} ${i + 1}`}
                  disabled={ocupado}
                >
                  {e.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.foto.url} alt="" />
                  ) : (
                    <span className="redes-escena-icono">{e.tipo === "datos" ? "Datos" : "Fin"}</span>
                  )}
                </button>
                <div className="redes-escena-cuerpo">
                  <p className="redes-escena-titulo">
                    {i + 1}. {NOMBRE[e.tipo]}
                    {e.foto?.ilustrativa && <span className="redes-ilustrativa">Imagen ilustrativa</span>}
                  </p>
                  <input
                    value={e.texto}
                    maxLength={MAX_TEXTO_ESCENA}
                    placeholder={AYUDA[e.tipo]}
                    aria-label={`${AYUDA[e.tipo]}, escena ${i + 1}`}
                    disabled={ocupado}
                    onChange={(ev) => setEscenas(escenas.map((x, j) => (j === i ? { ...x, texto: ev.target.value.slice(0, MAX_TEXTO_ESCENA) } : x)))}
                    onBlur={() => cambiar(escenas)}
                  />
                  <div className="redes-escena-acciones">
                    <span className="redes-duracion" aria-label="Duración">
                      <button type="button" onClick={() => editar(i, { duracion: e.duracion - 1 })} disabled={ocupado || e.duracion <= DURACION_MIN} aria-label="Menos tiempo">
                        −
                      </button>
                      <span>{segundos(e.duracion)}</span>
                      <button
                        type="button"
                        onClick={() => editar(i, { duracion: e.duracion + 1 })}
                        disabled={ocupado || e.duracion >= DURACION_MAX || total + 1 > TOTAL_MAX}
                        aria-label="Más tiempo"
                      >
                        +
                      </button>
                    </span>
                    {(e.tipo === "foto" || e.tipo === "datos") && (
                      <>
                        <button type="button" onClick={() => cambiar(mover(escenas, i, -1))} disabled={ocupado || escenas[i - 1]?.tipo === "portada"} aria-label="Subir">
                          ↑
                        </button>
                        <button type="button" onClick={() => cambiar(mover(escenas, i, 1))} disabled={ocupado || escenas[i + 1]?.tipo === "cierre"} aria-label="Bajar">
                          ↓
                        </button>
                      </>
                    )}
                    {e.tipo === "foto" && (
                      <button type="button" className="peligro" onClick={() => cambiar(quitar(escenas, i))} disabled={ocupado}>
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {cuantasFotos < MAX_FOTOS_VIDEO && (
            <div className="pila">
              <button type="button" className="boton" onClick={() => setAgregando((a) => !a)} disabled={ocupado} aria-expanded={agregando}>
                {agregando ? "Listo" : "Agregar una foto"}
              </button>
              {agregando && (
                <div className="redes-fotos redes-tira" role="group" aria-label="Fotos para agregar">
                  {d.opciones
                    .filter((o) => !enVideo.has(o.url))
                    .map((o) => (
                      <button key={o.url} type="button" onClick={() => cambiar(agregarFoto(escenas, comoFoto(o)))} title={o.nombre} aria-label={`Agregar ${o.nombre}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={o.url} alt="" loading="lazy" />
                        {o.ilustrativa ? <span>Ilustrativa</span> : o.tipo === "mejorada" ? <span>Mejorada</span> : null}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="boton"
            disabled={ocupado}
            onClick={() => {
              cambiar(guionPorDefecto(reales.map(comoFoto), d.datosVideo));
              setTiempo(0);
              setAviso(null);
            }}
          >
            Empezar de nuevo
          </button>
        </div>
      </div>
    </div>
  );
}
