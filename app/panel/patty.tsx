"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { separarPasos, useGuia, type Paso } from "./guia";
import { IconoClip, IconoDobleCheck, IconoDocumento, IconoEnviar } from "./iconos";
import { preguntarAPatty } from "./patty-acciones";

// Chat del corredor con su asistente (Patty), como WhatsApp: burbujas con la hora, fondo de chat, caja
// para escribir con botón para adjuntar fotos o PDF. Se usa en el botón flotante de cada página y en su
// propia pantalla (/panel/patty). La conversación se guarda en este navegador (las fotos, solo en
// miniatura); Patty lee los datos del negocio en cada pregunta.

type Adjunto = { tipo: "imagen" | "pdf"; nombre: string; miniatura?: string };
type Turno = { autor: "corredor" | "asistente"; texto: string; hora?: string; adjuntos?: Adjunto[] };
type ArchivoListo = Adjunto & { mediaType: string; datos: string; tamano: number };

const CLAVE = "chat-patty";
const MAX_ARCHIVOS = 4;
const MAX_TOTAL = 3_900_000; // en base64, para no pasar los 4,5 MB de Vercel

// Lo que se le puede pedir en cada pantalla (la primera que calce).
const SUGERENCIAS: [RegExp, string, string[]][] = [
  [/^\/panel\/clientes\/[0-9a-f-]{36}/, "Estás en la ficha de un cliente.", ["¿Qué le digo a este cliente?", "¿Qué casa le ofrezco?", "Escríbele un mensaje de seguimiento", "¿Cómo le pongo un recordatorio?"]],
  [/^\/panel\/clientes/, "Estás en Clientes.", ["¿A quién debería llamar?", "¿Cómo muevo un cliente de etapa?", "¿Cómo agrego un cliente?", "¿Cómo va el mes?"]],
  [/^\/panel\/agenda\/visita/, "Estás en una visita.", ["¿Qué le digo al confirmar?", "¿Cómo la muevo a otro día?", "Prepárame para esta visita"]],
  [/^\/panel\/agenda\/horario/, "Estás en Mi horario.", ["¿Cómo bloqueo un día?", "¿Para qué sirve desde dónde salgo?"]],
  [/^\/panel\/agenda/, "Estás en la Agenda.", ["¿Qué visitas tengo esta semana?", "¿Cómo agendo una visita?", "¿Cómo cancelo una visita?"]],
  [/^\/panel\/propiedades\/[0-9a-f-]{36}/, "Estás en la ficha de una casa.", ["¿A qué clientes les sirve esta casa?", "¿Cómo hago la ficha en PDF?", "Escríbeme un texto para ofrecerla"]],
  [/^\/panel\/propiedades/, "Estás en Mis casas.", ["¿Cómo agrego una casa?", "¿Qué casa se mueve más?", "¿Cómo mejoro las fotos?"]],
  [/^\/panel\/cerebro/, "Estás en el Cerebro de la asistente.", ["¿Cómo le enseño algo?", "¿Qué preguntas no supo contestar?"]],
  [/^\/panel\/duenos/, "Estás en Dueños directos.", ["¿Cómo funciona la búsqueda de dueños?", "¿Cómo instalo la extensión?"]],
  [/^\/panel\/ajustes/, "Estás en Ajustes.", ["¿Qué hace cada ajuste?", "¿Cómo conecto mi Gmail?"]],
  [/^\/panel\/revisar/, "Estás revisando respuestas.", ["¿Cómo corrijo una respuesta?", "¿Qué pasa si le doy No enviar?"]],
  [/.*/, "", ["¿Qué tengo hoy?", "¿A quién debería llamar?", "Analiza esta casa (adjunta fotos o un PDF)", "¿Cómo va el mes?"]],
];

/** Abre el chat de Patty desde cualquier botón de la página, con una pregunta lista. */
export function abrirPatty(pregunta?: string) {
  window.dispatchEvent(new CustomEvent("abrir-patty", { detail: pregunta ?? null }));
}

/**
 * Negritas (**así**), cursivas, enlaces del panel ([Agenda](/panel/agenda)) y sin separadores (---).
 * Solo se vuelven enlace las rutas del propio panel; lo demás queda como texto. Nunca se interpreta HTML.
 */
function conFormato(texto: string, alIr: () => void) {
  return texto
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .split(/(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|\[[^\]\n]+\]\([^)\s]+\))/g)
    .map((parte, i) => {
      if (/^\*\*[^*]+\*\*$/.test(parte)) return <strong key={i}>{parte.slice(2, -2)}</strong>;
      if (/^\*[^*]+\*$/.test(parte)) return <em key={i}>{parte.slice(1, -1)}</em>;
      const enlace = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(parte);
      if (enlace) {
        return /^\/panel(\/[\w\-/?=&.]*)?$/.test(enlace[2]) ? (
          <Link key={i} href={enlace[2]} className="patty-enlace" onClick={alIr}>
            {enlace[1]}
          </Link>
        ) : (
          enlace[1]
        );
      }
      return parte;
    });
}

const horaDe = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit" }).replace(/[  ]/g, " ") : "";

/** Foto achicada a JPEG (máximo `lado` px) en base64; sirve para mandar y para la miniatura. */
async function achicar(archivo: File, lado: number, calidad: number): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = mal;
      i.src = url;
    });
    const escala = Math.min(1, lado / Math.max(img.width, img.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext("2d")!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return lienzo.toDataURL("image/jpeg", calidad);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const aBase64 = (archivo: File) =>
  new Promise<string>((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = mal;
    r.readAsDataURL(archivo);
  });

export function ChatPatty({
  nombre,
  corredor,
  modo,
  ruta,
  alCerrar,
  guiar,
  terminar,
  preguntaInicial,
  alUsarPregunta,
}: {
  nombre: string;
  corredor: string;
  modo: "flotante" | "pagina";
  ruta: string;
  alCerrar?: () => void;
  guiar: (pasos: Paso[]) => void;
  terminar: () => void;
  preguntaInicial?: string | null;
  alUsarPregunta?: () => void;
}) {
  const busqueda = useSearchParams();
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<ArchivoListo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [pensando, empezar] = useTransition();
  const fin = useRef<HTMLDivElement>(null);
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const clave = `${CLAVE}:${corredor}`;
  const [, aviso, sugerencias] = SUGERENCIAS.find(([r]) => r.test(ruta))!;

  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(clave) ?? "[]");
      if (Array.isArray(g)) setTurnos(g.slice(-40));
    } catch {}
  }, [clave]);
  useEffect(() => {
    try {
      localStorage.setItem(clave, JSON.stringify(turnos.slice(-40)));
    } catch {
      // Si no cabe (miniaturas), se guarda sin ellas.
      try {
        localStorage.setItem(clave, JSON.stringify(turnos.slice(-40).map((t) => ({ ...t, adjuntos: t.adjuntos?.map(({ miniatura: _, ...a }) => a) }))));
      } catch {}
    }
    fin.current?.scrollIntoView({ block: "end" });
  }, [turnos, clave]);
  useEffect(() => {
    if (preguntaInicial) {
      enviar(preguntaInicial);
      alUsarPregunta?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preguntaInicial]);

  async function elegirArchivos(lista: FileList | null) {
    if (!lista?.length) return;
    setError(null);
    setPreparando(true);
    const nuevos: ArchivoListo[] = [];
    try {
      for (const f of Array.from(lista).slice(0, MAX_ARCHIVOS - archivos.length)) {
        if (f.type.startsWith("image/")) {
          const grande = await achicar(f, 1600, 0.85);
          const mini = await achicar(f, 220, 0.7);
          const datos = grande.split(",")[1] ?? "";
          nuevos.push({ tipo: "imagen", nombre: f.name, miniatura: mini, mediaType: "image/jpeg", datos, tamano: datos.length });
        } else if (f.type === "application/pdf") {
          if (f.size > 2_800_000) {
            setError(`"${f.name}" pesa más de 2,8 MB. Manda uno más liviano o solo las páginas que importan.`);
            continue;
          }
          const datos = await aBase64(f);
          nuevos.push({ tipo: "pdf", nombre: f.name, mediaType: "application/pdf", datos, tamano: datos.length });
        } else {
          setError("Solo se pueden adjuntar fotos y PDF.");
        }
      }
    } catch {
      setError("No pude leer uno de los archivos.");
    }
    const todos = [...archivos, ...nuevos];
    if (todos.reduce((s, a) => s + a.tamano, 0) > MAX_TOTAL) {
      setError("Entre todos pesan demasiado. Manda menos archivos o más livianos.");
    } else {
      setArchivos(todos);
    }
    setPreparando(false);
    if (entradaArchivo.current) entradaArchivo.current.value = "";
  }

  function enviar(mensaje: string) {
    const limpio = mensaje.trim();
    if ((!limpio && archivos.length === 0) || pensando) return;
    terminar();
    const previos = turnos;
    const adjuntos = archivos;
    setTurnos([
      ...previos,
      { autor: "corredor", texto: limpio, hora: new Date().toISOString(), adjuntos: adjuntos.map(({ tipo, nombre, miniatura }) => ({ tipo, nombre, miniatura })) },
    ]);
    setTexto("");
    setArchivos([]);
    setError(null);
    const dondeEsta = `${ruta}${busqueda.toString() ? `?${busqueda}` : ""}`;
    empezar(async () => {
      try {
        const r = await preguntarAPatty(
          // Los archivos solo viajan en su mensaje; en los anteriores queda la nota de qué se mandó.
          previos.map(({ autor, texto: t, adjuntos: a }) => ({
            autor,
            texto: a?.length ? `${t}\n[Adjuntó: ${a.map((x) => (x.tipo === "pdf" ? `PDF "${x.nombre}"` : "una foto")).join(", ")}]`.trim() : t,
          })),
          limpio,
          dondeEsta,
          adjuntos.map(({ mediaType, datos, nombre: n }) => ({ mediaType, datos, nombre: n })),
        );
        if (r.ok) {
          const { texto: leible, pasos } = separarPasos(r.texto);
          setTurnos((t) => [...t, { autor: "asistente", texto: leible, hora: new Date().toISOString() }]);
          if (pasos.length) void guiar(pasos);
        } else setError(r.motivo);
      } catch {
        setError("No se pudo mandar. Si adjuntaste archivos, prueba con menos o más livianos.");
      }
    });
  }

  const alIr = () => {
    if (modo === "flotante" && window.innerWidth < 900) alCerrar?.();
  };

  return (
    <section className={`patty-chat ${modo}`} aria-label={`Chat con ${nombre}`}>
      <header className="patty-cabecera">
        {modo === "pagina" && (
          <Link href="/panel" className="patty-volver" aria-label="Volver">
            ‹
          </Link>
        )}
        <span className="patty-avatar" aria-hidden>
          {nombre.charAt(0).toUpperCase()}
        </span>
        <span className="patty-titulo">
          <strong>{nombre} · IA</strong>
          <small>{pensando ? "escribiendo…" : "en línea · conoce tu agenda, tus clientes y tus casas"}</small>
        </span>
        {turnos.length > 0 && (
          <button type="button" className="patty-limpiar" onClick={() => setTurnos([])} title="Empezar una conversación nueva">
            Nueva
          </button>
        )}
        {modo === "flotante" && (
          <>
            <Link href="/panel/patty" className="patty-limpiar" title="Abrir en grande" onClick={alCerrar}>
              Abrir
            </Link>
            <button type="button" className="patty-cerrar" onClick={alCerrar} aria-label="Cerrar">
              ×
            </button>
          </>
        )}
      </header>

      <div className="patty-mensajes">
        {turnos.length === 0 && (
          <div className="patty-bienvenida">
            <p className="patty-burbuja suya">
              Hola, soy <strong>{nombre}</strong>. {aviso} ¿En qué te ayudo? Puedes mandarme fotos o un PDF de una casa
              para analizarla, y si no sabes dónde está algo en el panel, te llevo.
            </p>
            <div className="patty-sugerencias">
              {sugerencias.map((s) => (
                <button key={s} type="button" onClick={() => (s.includes("adjunta") ? entradaArchivo.current?.click() : enviar(s))}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turnos.map((t, i) => (
          <div key={i} className={`patty-burbuja ${t.autor === "corredor" ? "mia" : "suya"}`}>
            {t.adjuntos && t.adjuntos.length > 0 && (
              <div className="patty-adjuntos-enviados">
                {t.adjuntos.map((a, j) =>
                  a.tipo === "imagen" && a.miniatura ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={j} src={a.miniatura} alt={a.nombre} />
                  ) : (
                    <span key={j} className="patty-archivo">
                      <IconoDocumento tamano={18} /> {a.nombre}
                    </span>
                  ),
                )}
              </div>
            )}
            {t.texto && <span className="patty-texto">{t.autor === "asistente" ? conFormato(t.texto, alIr) : t.texto}</span>}
            <span className="patty-hora">
              {horaDe(t.hora)}
              {t.autor === "corredor" && <IconoDobleCheck tamano={16} />}
            </span>
          </div>
        ))}
        {pensando && (
          <div className="patty-burbuja suya pensando" aria-label={`${nombre} está escribiendo`}>
            <span className="puntos">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        {error && <p className="aviso">{error}</p>}
        <div ref={fin} />
      </div>

      {turnos.length > 0 && !pensando && archivos.length === 0 && (
        <div className="patty-atajos">
          {sugerencias.slice(0, 3).map((s) => (
            <button key={s} type="button" onClick={() => (s.includes("adjunta") ? entradaArchivo.current?.click() : enviar(s))}>
              {s}
            </button>
          ))}
        </div>
      )}

      {archivos.length > 0 && (
        <div className="patty-por-enviar">
          {archivos.map((a, i) => (
            <span key={i} className="patty-por-enviar-item">
              {a.miniatura ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.miniatura} alt={a.nombre} />
              ) : (
                <span className="patty-archivo">
                  <IconoDocumento tamano={18} /> {a.nombre}
                </span>
              )}
              <button type="button" aria-label={`Quitar ${a.nombre}`} onClick={() => setArchivos((l) => l.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <form
        className="patty-escribir"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
      >
        <input
          ref={entradaArchivo}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={(e) => void elegirArchivos(e.target.files)}
        />
        <div className="patty-caja">
          <button
            type="button"
            className="patty-adjuntar"
            onClick={() => entradaArchivo.current?.click()}
            disabled={preparando || archivos.length >= MAX_ARCHIVOS}
            aria-label="Adjuntar fotos o PDF"
            title="Adjuntar fotos o PDF"
          >
            <IconoClip tamano={22} />
          </button>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar(texto);
              }
            }}
            placeholder={preparando ? "Preparando los archivos…" : "Mensaje"}
            rows={1}
            aria-label={`Mensaje para ${nombre}`}
          />
        </div>
        <button type="submit" className="patty-enviar" disabled={pensando || preparando || (!texto.trim() && archivos.length === 0)} aria-label="Enviar">
          <IconoEnviar tamano={22} />
        </button>
      </form>
    </section>
  );
}

/** Botón flotante con el chat, en cada página del panel (menos donde ya hay otra caja de texto). */
export function Patty({ nombre, corredor }: { nombre: string; corredor: string }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, setPendiente] = useState<string | null>(null);
  // En el teléfono el chat tapa la pantalla: mientras Patty guía, se cierra y queda el botón.
  const { guiar, terminar, capa } = useGuia(nombre, () => {
    if (window.innerWidth < 900) setAbierto(false);
  });

  useEffect(() => {
    const abrir = (e: Event) => {
      setAbierto(true);
      const pregunta = (e as CustomEvent<string | null>).detail;
      if (pregunta) setPendiente(pregunta);
    };
    window.addEventListener("abrir-patty", abrir);
    return () => window.removeEventListener("abrir-patty", abrir);
  }, []);
  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, []);

  // En su propia pantalla, en un chat con un cliente y en "Probar la asistente" no va el botón flotante.
  if (ruta.startsWith("/panel/patty") || ruta.startsWith("/panel/conversaciones/") || ruta.startsWith("/panel/probar")) return <>{capa}</>;

  return (
    <>
      {capa}
      {!abierto && (
        <button type="button" className="patty-boton" onClick={() => setAbierto(true)} aria-label={`Hablar con ${nombre}`}>
          <span className="patty-avatar" aria-hidden>
            {nombre.charAt(0).toUpperCase()}
          </span>
          <span className="patty-boton-texto">{nombre} · IA</span>
        </button>
      )}
      {abierto && (
        <div className="patty-panel" role="dialog" aria-label={`Chat con ${nombre}`}>
          <ChatPatty
            nombre={nombre}
            corredor={corredor}
            modo="flotante"
            ruta={ruta}
            alCerrar={() => setAbierto(false)}
            guiar={guiar}
            terminar={terminar}
            preguntaInicial={pendiente}
            alUsarPregunta={() => setPendiente(null)}
          />
        </div>
      )}
    </>
  );
}

/** Patty en su propia pantalla, a todo lo alto (como abrir un chat en WhatsApp). */
export function PattyPagina({ nombre, corredor }: { nombre: string; corredor: string }) {
  const ruta = usePathname();
  const { guiar, terminar, capa } = useGuia(nombre, () => {});
  return (
    <>
      {capa}
      <ChatPatty nombre={nombre} corredor={corredor} modo="pagina" ruta={ruta} guiar={guiar} terminar={terminar} />
    </>
  );
}
