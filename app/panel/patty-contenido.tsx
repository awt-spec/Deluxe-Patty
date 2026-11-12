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
        lineColor: "#8696a0",
        secondaryColor: "#fff4e5",
        secondaryBorderColor: "#f0a868",
        tertiaryColor: "#f0f2f5",
        tertiaryBorderColor: "#c4cdd3",
        fontSize: "15px",
        edgeLabelBackground: "#ffffff",
        // Torta: colores que se distinguen bien entre sí y con el texto encima.
        pie1: "#00a884",
        pie2: "#53bdeb",
        pie3: "#f5a623",
        pie4: "#e5484d",
        pie5: "#8b5cf6",
        pie6: "#14b8a6",
        pie7: "#f97316",
        pie8: "#64748b",
        pieStrokeColor: "#ffffff",
        pieStrokeWidth: "2px",
        pieOuterStrokeWidth: "0px",
        pieSectionTextColor: "#ffffff",
        pieSectionTextSize: "15px",
        pieTitleTextSize: "18px",
        pieLegendTextSize: "14px",
        // Línea de tiempo y gantt en los mismos tonos.
        cScale0: "#00a884",
        cScale1: "#53bdeb",
        cScale2: "#f5a623",
        cScale3: "#8b5cf6",
        cScaleLabel0: "#ffffff",
        cScaleLabel1: "#ffffff",
        cScaleLabel2: "#ffffff",
        cScaleLabel3: "#ffffff",
      },
      // Cajas redondeadas y algo de aire, como el resto del panel.
      themeCSS:
        ".node rect, .node polygon, .node circle { rx: 10px; ry: 10px; stroke-width: 1.6px; } .edgePath .path, .flowchart-link { stroke-width: 1.6px; } .nodeLabel, .label { font-weight: 500; }",
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

  async function descargar() {
    const svg = caja.current?.querySelector("svg");
    if (!svg) return;
    const png = await svgAPng(svg, 2000).catch(() => null);
    if (!png) return;
    const a = document.createElement("a");
    a.href = png;
    a.download = "diagrama.png";
    a.click();
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
          <button type="button" className="patty-mini" onClick={() => void descargar()}>
            Descargar PNG
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

/** Un SVG dibujado, como PNG con fondo blanco (máximo `ancho` px de ancho). */
export async function svgAPng(svg: SVGSVGElement, ancho = 1600): Promise<string> {
  const caja = svg.viewBox.baseVal?.width ? svg.viewBox.baseVal : svg.getBBox();
  const escala = Math.min(3, ancho / Math.max(1, caja.width));
  const w = Math.round(caja.width * escala);
  const h = Math.round(caja.height * escala);
  const copia = svg.cloneNode(true) as SVGSVGElement;
  copia.setAttribute("width", String(w));
  copia.setAttribute("height", String(h));
  copia.style.maxWidth = "none";
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copia)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, mal) => {
      img.onload = () => ok();
      img.onerror = () => mal(new Error("svg"));
      img.src = url;
    });
    const lienzo = document.createElement("canvas");
    lienzo.width = w;
    lienzo.height = h;
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return lienzo.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Los diagramas ya dibujados dentro de un mensaje, como PNG (para meterlos en el PDF), en orden. */
export async function diagramasComoPng(dentro: HTMLElement | null): Promise<string[]> {
  if (!dentro) return [];
  const salida: string[] = [];
  for (const svg of [...dentro.querySelectorAll<SVGSVGElement>(".patty-diagrama-svg svg")].slice(0, 6)) {
    // Si un diagrama no se puede pasar a imagen, el PDF lo deja fuera y sigue con lo demás.
    const png = await svgAPng(svg).catch(() => null);
    if (png) salida.push(png);
  }
  return salida;
}

export type MarcaLamina = {
  nombre: string;
  logo: string | null;
  fondoLogo: string | null;
  colores: { principal: string; soporte: string; profundo: string; base: string };
  firma: string | null;
};

/**
 * Lámina PNG de una respuesta (para mandarla por WhatsApp o subirla a redes): franja con la marca, título, el
 * contenido tal como se ve en el chat (tablas y diagramas incluidos) y pie. Se arma en el navegador.
 */
export async function laminaPng(contenido: HTMLElement, titulo: string, marca: MarcaLamina, fecha: string): Promise<string> {
  const { toPng } = await import("html-to-image");
  const c = marca.colores;
  const hoja = document.createElement("div");
  hoja.className = "patty-lamina";
  hoja.style.setProperty("--lamina-principal", c.principal);
  hoja.style.setProperty("--lamina-profundo", c.profundo);
  hoja.style.setProperty("--lamina-soporte", c.soporte);

  const franja = document.createElement("div");
  franja.className = "patty-lamina-franja";
  if (marca.logo) {
    const logo = document.createElement("img");
    logo.src = marca.logo;
    logo.alt = "";
    logo.style.background = marca.fondoLogo ?? c.profundo;
    franja.append(logo);
  }
  const nombre = document.createElement("strong");
  nombre.textContent = marca.nombre;
  const dia = document.createElement("small");
  dia.textContent = fecha;
  franja.append(nombre, dia);

  const cuerpo = document.createElement("div");
  cuerpo.className = "patty-lamina-cuerpo";
  const h = document.createElement("h1");
  h.textContent = titulo;
  const copia = contenido.cloneNode(true) as HTMLElement;
  // Fuera los botones (Descargar PNG): en la imagen solo va el contenido.
  copia.querySelectorAll("button, figcaption, .patty-acciones-mensaje").forEach((b) => b.remove());
  // Si el contenido ya empieza con el mismo título, no se repite.
  const primero = copia.firstElementChild;
  if (primero && /^H[3-5]$/.test(primero.tagName) && primero.textContent?.trim() === titulo.trim()) primero.remove();
  cuerpo.append(h, copia);

  const pie = document.createElement("div");
  pie.className = "patty-lamina-pie";
  pie.textContent = marca.firma ?? marca.nombre;

  hoja.append(franja, cuerpo, pie);
  document.body.append(hoja);
  try {
    // Que cargue el logo antes de la foto.
    await Promise.all(
      [...hoja.querySelectorAll("img")].map((im) => (im.complete ? Promise.resolve() : new Promise((ok) => ((im.onload = ok), (im.onerror = ok))))),
    );
    // La hoja está fuera de la pantalla para que no se vea; en la foto va en su lugar (si no, sale en blanco).
    return await toPng(hoja, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      width: hoja.offsetWidth,
      height: hoja.offsetHeight,
      style: { position: "static", left: "0", top: "0", margin: "0" },
    });
  } finally {
    hoja.remove();
  }
}
