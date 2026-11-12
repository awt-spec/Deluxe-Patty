"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { bloques, esRutaDelPanel, trozos, type Bloque } from "@/lib/panel/markdown";

// Lo que contesta Patty, ordenado: títulos, párrafos, listas, tablas, citas, código y diagramas
// (```mermaid, dibujados en el navegador). Nunca se interpreta HTML de la respuesta: solo estos bloques.

const BASE_FOTOS = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/fotos/`;
const esImagenPropia = (url: string) => !!process.env.NEXT_PUBLIC_SUPABASE_URL && url.startsWith(BASE_FOTOS) && !url.includes("..");

function Linea({ texto, alIr }: { texto: string; alIr: () => void }) {
  return (
    <>
      {trozos(texto).map((t, i) => {
        switch (t.tipo) {
          case "negrita":
            return <strong key={i}>{t.texto}</strong>;
          case "cursiva":
            return <em key={i}>{t.texto}</em>;
          case "codigo":
            return <code key={i}>{t.texto}</code>;
          case "enlace":
            return esRutaDelPanel(t.url) ? (
              <Link key={i} href={t.url} className="patty-enlace" onClick={alIr}>
                {t.texto}
              </Link>
            ) : (
              <span key={i}>{t.texto}</span>
            );
          case "imagen":
            // Imágenes que hizo Patty: solo del almacenamiento de fotos de la app, nunca de afuera.
            return esImagenPropia(t.url) ? (
              <span key={i} className="patty-imagen">
                <a href={t.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.url} alt={t.alt || "Imagen"} loading="lazy" />
                </a>
                <a href={t.url} download className="patty-enlace">
                  Descargar
                </a>
              </span>
            ) : null;
          default:
            return <span key={i}>{t.texto}</span>;
        }
      })}
    </>
  );
}

/** Texto con saltos de línea respetados. */
function Parrafo({ texto, alIr }: { texto: string; alIr: () => void }) {
  const partes = texto.split("\n");
  return (
    <p>
      {partes.map((p, i) => (
        <span key={i}>
          {i > 0 && <br />}
          <Linea texto={p} alIr={alIr} />
        </span>
      ))}
    </p>
  );
}

type Mermaid = (typeof import("mermaid"))["default"];
let mermaidListo: Promise<Mermaid> | null = null;

function cargarMermaid(): Promise<Mermaid> {
  mermaidListo ??= import("mermaid").then(({ default: m }) => {
    m.initialize({
      startOnLoad: false,
      // "strict": sin HTML ni scripts dentro de las etiquetas; el SVG sale limpio.
      securityLevel: "strict",
      // Sin foreignObject: el SVG se puede pasar a imagen para el PDF.
      htmlLabels: false,
      flowchart: { htmlLabels: false, curve: "basis" },
      theme: "base",
      fontFamily: "Inter, system-ui, sans-serif",
      themeVariables: {
        primaryColor: "#e7f8f0",
        primaryBorderColor: "#00a884",
        primaryTextColor: "#111b21",
        lineColor: "#54656f",
        secondaryColor: "#fff4e5",
        tertiaryColor: "#f0f2f5",
        fontSize: "15px",
      },
    });
    return m;
  });
  return mermaidListo;
}

/** Diagrama de Patty (flujo, línea de tiempo, gantt, torta…). Si no se puede dibujar, se muestra el texto. */
function Diagrama({ codigo }: { codigo: string }) {
  const id = `diagrama-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const caja = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"dibujando" | "listo" | "error">("dibujando");

  useEffect(() => {
    let vivo = true;
    cargarMermaid()
      .then((m) => m.render(id, codigo.slice(0, 8000)))
      .then(({ svg }) => {
        if (!vivo || !caja.current) return;
        // El SVG sale de mermaid en modo estricto (lo limpia con DOMPurify): no trae scripts ni HTML.
        caja.current.innerHTML = svg;
        setEstado("listo");
      })
      .catch(() => vivo && setEstado("error"));
    return () => {
      vivo = false;
    };
  }, [codigo, id]);

  function descargar() {
    const svg = caja.current?.querySelector("svg");
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagrama.svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (estado === "error") {
    return (
      <div className="patty-diagrama error">
        <small>No pude dibujar este diagrama; este es su contenido:</small>
        <pre>{codigo}</pre>
      </div>
    );
  }
  return (
    <figure className="patty-diagrama">
      {estado === "dibujando" && <small className="suave">Dibujando el diagrama…</small>}
      <div ref={caja} className="patty-diagrama-svg" />
      {estado === "listo" && (
        <figcaption>
          <button type="button" className="patty-mini" onClick={descargar}>
            Descargar diagrama
          </button>
        </figcaption>
      )}
    </figure>
  );
}

function Bloques({ lista, alIr }: { lista: Bloque[]; alIr: () => void }) {
  return (
    <>
      {lista.map((b, i) => {
        switch (b.tipo) {
          case "titulo": {
            const Etiqueta = b.nivel === 1 ? "h3" : b.nivel === 2 ? "h4" : "h5";
            return (
              <Etiqueta key={i} className="patty-titulo-bloque">
                <Linea texto={b.texto} alIr={alIr} />
              </Etiqueta>
            );
          }
          case "parrafo":
            return <Parrafo key={i} texto={b.texto} alIr={alIr} />;
          case "lista": {
            const Etiqueta = b.ordenada ? "ol" : "ul";
            return (
              <Etiqueta key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Linea texto={it} alIr={alIr} />
                  </li>
                ))}
              </Etiqueta>
            );
          }
          case "tabla":
            return (
              <div key={i} className="patty-tabla">
                <table>
                  <thead>
                    <tr>
                      {b.cabecera.map((c, j) => (
                        <th key={j}>
                          <Linea texto={c} alIr={alIr} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.filas.map((f, j) => (
                      <tr key={j}>
                        {f.map((c, k) => (
                          <td key={k}>
                            <Linea texto={c} alIr={alIr} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "cita":
            return (
              <blockquote key={i}>
                <Parrafo texto={b.texto} alIr={alIr} />
              </blockquote>
            );
          case "codigo":
            return b.lenguaje === "mermaid" ? <Diagrama key={i} codigo={b.texto} /> : <pre key={i}>{b.texto}</pre>;
        }
      })}
    </>
  );
}

/** La respuesta de Patty ya ordenada. */
export function Contenido({ texto, alIr }: { texto: string; alIr: () => void }) {
  return (
    <div className="patty-contenido">
      <Bloques lista={bloques(texto)} alIr={alIr} />
    </div>
  );
}

/** Los diagramas ya dibujados dentro de un mensaje, como PNG (para meterlos en el PDF), en orden. */
export async function diagramasComoPng(dentro: HTMLElement | null): Promise<string[]> {
  if (!dentro) return [];
  const svgs = [...dentro.querySelectorAll<SVGSVGElement>(".patty-diagrama-svg svg")].slice(0, 6);
  const salida: string[] = [];
  for (const svg of svgs) {
    try {
      const caja = svg.viewBox.baseVal?.width ? svg.viewBox.baseVal : svg.getBBox();
      const escala = Math.min(2, 1600 / Math.max(1, caja.width));
      const ancho = Math.round(caja.width * escala);
      const alto = Math.round(caja.height * escala);
      const copia = svg.cloneNode(true) as SVGSVGElement;
      copia.setAttribute("width", String(ancho));
      copia.setAttribute("height", String(alto));
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copia)], { type: "image/svg+xml" }));
      const img = new Image();
      await new Promise<void>((ok, mal) => {
        img.onload = () => ok();
        img.onerror = () => mal(new Error("svg"));
        img.src = url;
      });
      const lienzo = document.createElement("canvas");
      lienzo.width = ancho;
      lienzo.height = alto;
      const ctx = lienzo.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, ancho, alto);
      ctx.drawImage(img, 0, 0, ancho, alto);
      URL.revokeObjectURL(url);
      salida.push(lienzo.toDataURL("image/png"));
    } catch {
      // Si un diagrama no se puede pasar a imagen, el PDF lo deja fuera y sigue con lo demás.
    }
  }
  return salida;
}
