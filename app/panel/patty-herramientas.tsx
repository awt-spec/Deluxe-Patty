"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  NOMBRE_HERRAMIENTA,
  casaNombrada,
  filtrarCasas,
  rutaEstudio,
  rutaImagenRedes,
  type CasaHerramienta,
  type Herramienta,
} from "@/lib/panel/herramientas-patty";
import { casasParaPatty, fichaDeCasaPatty, fotosDeCasaPatty } from "./patty-herramientas-acciones";
import { mejorarFotoRedes } from "./propiedades/[id]/redes/acciones";
import { IconoCasa, IconoDocumento } from "./iconos";
import "./patty-herramientas.css";

// Tarjeta del chat de Patty para las herramientas que arma el código: elegir la casa (o la que nombró el mensaje) y
// ver el resultado ahí mismo: fotos para descargar o reenviar, post e historia con la marca, ficha PDF o el video.

type Resultado =
  | { tipo: "fotos"; fotos: string[] }
  | { tipo: "ficha"; url: string; nombre: string }
  | { tipo: "diseno" }
  | { tipo: "mejorar"; fotos: string[] }
  | null;

export type FinHerramienta = { texto: string };

export function TarjetaHerramienta({
  herramienta,
  texto,
  alTerminar,
}: {
  herramienta: Herramienta;
  /** Lo que escribió el corredor (para encontrar la casa que nombra). */
  texto: string;
  alTerminar: (f: FinHerramienta) => void;
}) {
  const [que, setQue] = useState<Herramienta>(herramienta);
  const [casas, setCasas] = useState<CasaHerramienta[] | null>(null);
  const [casa, setCasa] = useState<CasaHerramienta | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [resultado, setResultado] = useState<Resultado>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Mejorar con IA, foto por foto: la original → la mejorada (o "trabajando").
  const [mejoradas, setMejoradas] = useState<Record<string, string | "trabajando">>({});

  /** Elige casa y herramienta: lo de diseño se ve en el acto; fotos y ficha se piden al servidor. */
  function elegir(c: CasaHerramienta | null, q: Herramienta) {
    setCasa(c);
    setQue(q);
    setResultado(null);
    setAviso(null);
    if (!c) return;
    if (q === "post" || q === "historia" || q === "video") {
      setResultado({ tipo: "diseno" });
      return;
    }
    setTrabajando(true);
    const pedido = q === "fotos" ? fotosDeCasaPatty(c.id) : fichaDeCasaPatty(c.id);
    pedido
      .then((r) => {
        if (!r.ok) return setAviso(r.motivo);
        if ("fotos" in r) setResultado(q === "mejorar" ? { tipo: "mejorar", fotos: r.fotos } : { tipo: "fotos", fotos: r.fotos });
        else setResultado({ tipo: "ficha", url: r.url, nombre: r.nombre });
      })
      .catch(() => setAviso("No se pudo. Revisa la conexión e inténtalo de nuevo."))
      .finally(() => setTrabajando(false));
  }

  useEffect(() => {
    let vivo = true;
    casasParaPatty()
      .then((r) => {
        if (!vivo) return;
        if (!r.ok) return setAviso(r.motivo);
        setCasas(r.casas);
        const nombrada = casaNombrada(texto, r.casas);
        if (nombrada) elegir(nombrada, herramienta);
      })
      .catch(() => vivo && setAviso("No pude leer tus casas. Revisa la conexión."));
    return () => {
      vivo = false;
    };
    // Solo al abrir la tarjeta: la casa nombrada se elige una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lista = useMemo(() => (casas ? filtrarCasas(casas, busqueda).slice(0, 30) : []), [casas, busqueda]);

  function cerrar() {
    if (!casa) return alTerminar({ texto: "Listo, lo dejamos. Cuando quieras, pídemelo otra vez." });
    const ver = `[Abrir la casa](/panel/propiedades/${casa.id})`;
    const hecho =
      que === "fotos"
        ? `Te mostré las fotos de **${casa.titulo}** (${casa.codigo}).`
        : que === "mejorar"
          ? `Mejoré ${Object.values(mejoradas).filter((m) => m !== "trabajando").length} fotos de **${casa.titulo}**. Quedan junto a las originales: revísalas en la casa antes de publicarlas.`
          : que === "ficha"
          ? `Armé la ficha PDF de **${casa.titulo}** (${casa.codigo}).`
          : que === "video"
            ? `El video de **${casa.titulo}** está en el estudio. [Abrir el video](${rutaEstudio(casa.id, "video")})`
            : `Armé ${que === "post" ? "el post" : "la historia"} de **${casa.titulo}** (${casa.codigo}). [Abrir el estudio](${rutaEstudio(casa.id, "imagen")})`;
    alTerminar({ texto: `${hecho} ${ver}` });
  }

  /** La misma mejora de la casa (la original nunca se reemplaza); cada foto se paga una vez. */
  async function mejorarUna(url: string) {
    if (!casa || mejoradas[url]) return;
    setAviso(null);
    setMejoradas((m) => ({ ...m, [url]: "trabajando" }));
    try {
      const r = await mejorarFotoRedes(casa.id, url);
      if (r.ok) setMejoradas((m) => ({ ...m, [url]: r.url }));
      else {
        setAviso(r.motivo);
        setMejoradas(({ [url]: _, ...resto }) => resto);
      }
    } catch {
      setAviso("No pude mejorar la foto ahora. Inténtalo de nuevo en un rato.");
      setMejoradas(({ [url]: _, ...resto }) => resto);
    }
  }

  async function compartirFotos(urls: string[]) {
    setAviso(null);
    try {
      const archivos = await Promise.all(
        urls.map(async (u, i) => {
          const b = await (await fetch(u)).blob();
          return new File([b], `${casa?.codigo ?? "casa"}-${i + 1}.jpg`, { type: b.type || "image/jpeg" });
        }),
      );
      if (navigator.canShare?.({ files: archivos })) {
        await navigator.share({ files: archivos, title: casa?.titulo });
        return;
      }
      // Sin compartir (computadora): se descargan una por una.
      for (const f of archivos) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(f);
        a.download = f.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setAviso("No pude preparar las fotos para compartir. Ábrelas una por una.");
    }
  }

  return (
    <section className="ph-tarjeta" aria-label={NOMBRE_HERRAMIENTA[que]}>
      <header className="ph-cabeza">
        <strong>{NOMBRE_HERRAMIENTA[que]}</strong>
        {casa && <span>{casa.titulo}</span>}
        <button type="button" className="ph-cerrar" onClick={cerrar} aria-label="Cerrar">
          ×
        </button>
      </header>

      {!casa && (
        <div className="ph-elegir">
          <p>¿De qué casa?</p>
          {casas === null && !aviso && <p className="ph-suave">Buscando tus casas…</p>}
          {casas && casas.length > 6 && (
            <input type="search" placeholder="Busca por zona, título o código" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar casa" />
          )}
          {casas && casas.length === 0 && <p className="ph-suave">No tienes casas activas todavía.</p>}
          <ul className="ph-casas">
            {lista.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => elegir(c, que)}>
                  {c.portada ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura del Storage propio
                    <img src={c.portada} alt="" loading="lazy" />
                  ) : (
                    <span className="ph-sin-foto">
                      <IconoCasa tamano={20} />
                    </span>
                  )}
                  <span>
                    <strong>{c.titulo}</strong>
                    <small>
                      {c.codigo}
                      {c.zona ? ` · ${c.zona}` : ""} · {c.fotos} {c.fotos === 1 ? "foto" : "fotos"}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {casa && (
        <div className="ph-resultado">
          {trabajando && <p className="ph-suave">{que === "ficha" ? "Armando la ficha PDF…" : "Buscando las fotos…"}</p>}

          {resultado?.tipo === "fotos" &&
            (resultado.fotos.length === 0 ? (
              <p className="ph-suave">Esta casa no tiene fotos todavía. Súbelas en la casa.</p>
            ) : (
              <>
                <div className="ph-galeria">
                  {resultado.fotos.map((u, i) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" aria-label={`Abrir la foto ${i + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- foto del Storage propio */}
                      <img src={u} alt="" loading="lazy" />
                    </a>
                  ))}
                </div>
                <div className="ph-botones">
                  <button type="button" className="ph-principal" onClick={() => void compartirFotos(resultado.fotos)}>
                    Compartir o descargar las {resultado.fotos.length}
                  </button>
                </div>
              </>
            ))}

          {resultado?.tipo === "mejorar" &&
            (resultado.fotos.length === 0 ? (
              <p className="ph-suave">Esta casa no tiene fotos todavía. Súbelas en la casa.</p>
            ) : (
              <>
                <p className="ph-suave">Toca «Mejorar» en las que quieras: más luz y color, sin cambiar nada de la casa. Revisa cada una antes de publicarla.</p>
                <div className="ph-mejorar">
                  {resultado.fotos.map((u, i) => {
                    const m = mejoradas[u];
                    const lista = m && m !== "trabajando" ? m : null;
                    return (
                      <figure key={u} className={lista ? "lista" : ""}>
                        <a href={lista ?? u} target="_blank" rel="noreferrer" aria-label={`Abrir la foto ${i + 1}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- foto del Storage propio */}
                          <img src={lista ?? u} alt="" loading="lazy" />
                        </a>
                        <figcaption>
                          {lista ? (
                            <span className="ph-lista">Mejorada · revísala</span>
                          ) : (
                            <button type="button" onClick={() => void mejorarUna(u)} disabled={m === "trabajando"}>
                              {m === "trabajando" ? "Mejorando…" : "Mejorar"}
                            </button>
                          )}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              </>
            ))}

          {resultado?.tipo === "ficha" && (
            <div className="ph-ficha">
              <IconoDocumento tamano={28} />
              <span>{resultado.nombre}</span>
              <a className="ph-principal" href={resultado.url} target="_blank" rel="noreferrer">
                Abrir la ficha
              </a>
            </div>
          )}

          {resultado?.tipo === "diseno" && (que === "post" || que === "historia") && (
            <>
              {casa.fotos === 0 ? (
                <p className="ph-suave">Esta casa no tiene fotos: súbelas primero para armar el diseño.</p>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- la arma el servidor con next/og */}
                  <img className={`ph-diseno ${que}`} src={rutaImagenRedes(casa.id, que === "post" ? "cuadrado" : "historia")} alt={`${NOMBRE_HERRAMIENTA[que]} de ${casa.titulo}`} />
                  <div className="ph-botones">
                    <a className="ph-principal" href={rutaImagenRedes(casa.id, que === "post" ? "cuadrado" : "historia", true)}>
                      Descargar
                    </a>
                    <button type="button" onClick={() => elegir(casa, que === "post" ? "historia" : "post")}>
                      Ver {que === "post" ? "la historia" : "el post"}
                    </button>
                    <Link href={rutaEstudio(casa.id, "imagen")}>Cambiar foto o texto</Link>
                  </div>
                </>
              )}
            </>
          )}

          {resultado?.tipo === "diseno" && que === "video" && (
            <div className="ph-video">
              {casa.portada && (
                // eslint-disable-next-line @next/next/no-img-element -- portada del Storage propio
                <img src={casa.portada} alt="" />
              )}
              <p>
                {casa.fotos >= 2
                  ? `El video se arma con las ${casa.fotos} fotos de la casa, el precio y tu marca. Ábrelo, revísalo y descárgalo.`
                  : "Para el video hacen falta al menos 2 fotos de la casa."}
              </p>
              {casa.fotos >= 2 && (
                <Link className="ph-principal" href={rutaEstudio(casa.id, "video")}>
                  Ver y descargar el video
                </Link>
              )}
            </div>
          )}

          <button type="button" className="ph-otra" onClick={() => elegir(null, que)}>
            Otra casa
          </button>
        </div>
      )}

      {aviso && <p className="ph-aviso">{aviso}</p>}
    </section>
  );
}
