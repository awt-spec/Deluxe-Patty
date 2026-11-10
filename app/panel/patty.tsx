"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { separarPasos, useGuia, type Paso } from "./guia";
import { IconoCamara, IconoClip, IconoDobleCheck, IconoDocumento, IconoEnviar, IconoMicrofono } from "./iconos";
import { leerDocumento, preguntarAPatty, transcribirNota } from "./patty-acciones";

// Chat del corredor con su asistente (Patty), como WhatsApp: burbujas con la hora, fondo de chat, caja
// para escribir con botón para adjuntar fotos o PDF. Se usa en el botón flotante de cada página y en su
// propia pantalla (/panel/patty). La conversación se guarda en este navegador (las fotos, solo en
// miniatura); Patty lee los datos del negocio en cada pregunta.

type Adjunto = { tipo: "imagen" | "pdf" | "texto"; nombre: string; miniatura?: string };
type Turno = { autor: "corredor" | "asistente"; texto: string; hora?: string; adjuntos?: Adjunto[] };
/** `grupo` junta los fotogramas de un mismo video: se ven y se quitan como uno solo. */
type ArchivoListo = Adjunto & { mediaType: string; datos: string; tamano: number; grupo?: string };

const CLAVE = "chat-patty";
const MAX_ARCHIVOS = 10;
const MAX_TOTAL = 3_900_000; // en base64 o texto, para no pasar los 4,5 MB de Vercel
const FOTOGRAMAS = 6; // de un video
const MAX_VIDEO_SEG = 300;
const MAX_GRABACION_SEG = 180;
const EXTENSIONES_DOCUMENTO = /\.(docx|xlsx|txt|csv|tsv|md)$/i;

// Lo que se le puede pedir en cada pantalla (la primera que calce).
const SUGERENCIAS: [RegExp, string, string[]][] = [
  [/^\/panel\/clientes\/[0-9a-f-]{36}/, "Estás en la ficha de un cliente.", ["¿Qué le digo a este cliente?", "¿Qué casa le ofrezco?", "Escríbele un mensaje de seguimiento", "¿Cómo le pongo un recordatorio?"]],
  [/^\/panel\/clientes/, "Estás en Clientes.", ["¿A quién debería llamar?", "¿Cómo muevo un cliente de etapa?", "¿Cómo agrego un cliente?", "¿Cómo va el mes?"]],
  [/^\/panel\/agenda\/visita/, "Estás en una visita.", ["¿Qué le digo al confirmar?", "¿Cómo la muevo a otro día?", "Prepárame para esta visita"]],
  [/^\/panel\/agenda\/horario/, "Estás en Mi horario.", ["¿Cómo bloqueo un día?", "¿Para qué sirve desde dónde salgo?"]],
  [/^\/panel\/agenda\/bloquear/, "Estás bloqueando un rato.", ["Bloquear mañana en la tarde", "Bloquear el viernes todo el día", "¿Las visitas que ya tengo se cancelan?"]],
  [/^\/panel\/agenda/, "Estás en la Agenda.", ["¿Qué visitas tengo esta semana?", "Bloquear mañana en la tarde", "¿Cómo agendo una visita?"]],
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
const BASE_FOTOS = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/fotos/`;
const esImagenPropia = (url: string) => !!process.env.NEXT_PUBLIC_SUPABASE_URL && url.startsWith(BASE_FOTOS) && !url.includes("..");

function conFormato(texto: string, alIr: () => void) {
  return texto
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .split(/(!\[[^\]\n]*\]\([^)\s]+\)|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|\[[^\]\n]+\]\([^)\s]+\))/g)
    .map((parte, i) => {
      // Imágenes que hizo Patty: solo del almacenamiento de fotos de la app, nunca de afuera.
      const imagen = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(parte);
      if (imagen) {
        return esImagenPropia(imagen[2]) ? (
          <span key={i} className="patty-imagen">
            <a href={imagen[2]} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagen[2]} alt={imagen[1] || "Imagen"} loading="lazy" />
            </a>
            <a href={imagen[2]} download className="patty-enlace">
              Descargar
            </a>
          </span>
        ) : null;
      }
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

const esperar = (el: HTMLVideoElement, evento: "loadedmetadata" | "seeked", ms: number) =>
  new Promise<void>((ok, mal) => {
    const t = setTimeout(() => mal(new Error("tiempo")), ms);
    el.addEventListener(
      evento,
      () => {
        clearTimeout(t);
        ok();
      },
      { once: true },
    );
    el.addEventListener("error", () => mal(new Error("video")), { once: true });
  });

const minSeg = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Fotogramas repartidos a lo largo de un video (no se manda el video: Claude lee fotos). Todo pasa en el teléfono. */
async function fotogramasDeVideo(archivo: File, cuantos: number): Promise<{ datos: string; mini: string; segundo: number }[]> {
  const url = URL.createObjectURL(archivo);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await esperar(v, "loadedmetadata", 20_000);
    // Algunos videos (grabaciones de pantalla, webm) no declaran su duración: saltando al final el navegador la calcula.
    if (!Number.isFinite(v.duration)) {
      await new Promise<void>((ok) => {
        const t = setTimeout(ok, 5000);
        v.addEventListener("timeupdate", () => (clearTimeout(t), ok()), { once: true });
        v.currentTime = 1e9;
      });
      v.currentTime = 0;
    }
    if (!Number.isFinite(v.duration) || v.duration <= 0) throw new Error("duracion");
    if (v.duration > MAX_VIDEO_SEG) throw new Error("largo");
    const salida: { datos: string; mini: string; segundo: number }[] = [];
    const lienzo = document.createElement("canvas");
    for (let i = 0; i < cuantos; i++) {
      const segundo = (v.duration * (i + 0.5)) / cuantos;
      v.currentTime = segundo;
      await esperar(v, "seeked", 15_000);
      const escala = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
      lienzo.width = Math.round(v.videoWidth * escala);
      lienzo.height = Math.round(v.videoHeight * escala);
      lienzo.getContext("2d")!.drawImage(v, 0, 0, lienzo.width, lienzo.height);
      const grande = lienzo.toDataURL("image/jpeg", 0.72);
      const chica = document.createElement("canvas");
      chica.width = 220;
      chica.height = Math.max(1, Math.round((220 * lienzo.height) / lienzo.width));
      chica.getContext("2d")!.drawImage(lienzo, 0, 0, chica.width, chica.height);
      salida.push({ datos: grande.split(",")[1] ?? "", mini: chica.toDataURL("image/jpeg", 0.6), segundo });
    }
    return salida;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Lo que se anota en los mensajes anteriores sobre lo que se adjuntó (los archivos solo viajan una vez). */
function notaDeAdjuntos(a: { tipo: Adjunto["tipo"]; nombre: string }[]): string {
  const fotos = a.filter((x) => x.tipo === "imagen" && !x.nombre.includes(" · ")).length;
  const video = a.filter((x) => x.tipo === "imagen" && x.nombre.includes(" · ")).length;
  return [
    fotos ? (fotos === 1 ? "una foto" : `${fotos} fotos`) : null,
    video ? `fotogramas de un video (${video})` : null,
    ...a.filter((x) => x.tipo === "pdf").map((x) => `PDF "${x.nombre}"`),
    ...a.filter((x) => x.tipo === "texto").map((x) => `archivo "${x.nombre}"`),
  ]
    .filter(Boolean)
    .join(", ");
}

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
  const router = useRouter();
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<ArchivoListo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [pensando, empezar] = useTransition();
  const fin = useRef<HTMLDivElement>(null);
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const entradaCamara = useRef<HTMLInputElement>(null);
  const grabadora = useRef<{ rec: MediaRecorder; trozos: Blob[]; flujo: MediaStream; reloj: ReturnType<typeof setInterval>; cancelado: boolean } | null>(null);
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

  /** Fotos, PDF, Word, Excel, texto y videos cortos. Entran del clip, la cámara, pegando o arrastrando. */
  async function elegirArchivos(lista: ArrayLike<File> | null) {
    if (!lista?.length) return;
    setError(null);
    setPreparando(true);
    const nuevos: ArchivoListo[] = [];
    const cupo = () => MAX_ARCHIVOS - archivos.length - nuevos.length;
    let aviso: string | null = null;
    try {
      for (const f of Array.from(lista)) {
        if (cupo() <= 0) {
          aviso = `Solo caben ${MAX_ARCHIVOS} archivos por mensaje.`;
          break;
        }
        if (f.type.startsWith("image/")) {
          // Más fotos, más chicas: 10 caben en un mensaje.
          const grande = await achicar(f, 1400, 0.78);
          const mini = await achicar(f, 220, 0.7);
          const datos = grande.split(",")[1] ?? "";
          nuevos.push({ tipo: "imagen", nombre: f.name || "foto.jpg", miniatura: mini, mediaType: "image/jpeg", datos, tamano: datos.length });
        } else if (f.type.startsWith("video/")) {
          const n = Math.min(FOTOGRAMAS, cupo());
          try {
            const cuadros = await fotogramasDeVideo(f, n);
            const grupo = `v${Date.now()}${nuevos.length}`;
            for (const c of cuadros)
              nuevos.push({ tipo: "imagen", nombre: `${f.name} · ${minSeg(c.segundo)}`, miniatura: c.mini, mediaType: "image/jpeg", datos: c.datos, tamano: c.datos.length, grupo });
          } catch (e) {
            aviso =
              e instanceof Error && e.message === "largo"
                ? `"${f.name}" dura más de ${MAX_VIDEO_SEG / 60} minutos. Manda uno más corto.`
                : `No pude abrir el video "${f.name}". Prueba con otro, o mándame algunas fotos de la casa.`;
          }
        } else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
          if (f.size > 2_800_000) {
            aviso = `"${f.name}" pesa más de 2,8 MB. Manda uno más liviano o solo las páginas que importan.`;
            continue;
          }
          const datos = await aBase64(f);
          nuevos.push({ tipo: "pdf", nombre: f.name, mediaType: "application/pdf", datos, tamano: datos.length });
        } else if (EXTENSIONES_DOCUMENTO.test(f.name)) {
          // Word, Excel y texto se convierten a texto en el servidor.
          const fd = new FormData();
          fd.append("archivo", f);
          const r = await leerDocumento(fd);
          if (r.ok) nuevos.push({ tipo: "texto", nombre: r.nombre, mediaType: "text/plain", datos: r.texto, tamano: r.texto.length });
          else aviso = r.motivo;
        } else {
          aviso = "Puedo leer fotos, videos cortos, PDF, Word (.docx), Excel (.xlsx) y texto (.txt, .csv).";
        }
      }
    } catch {
      aviso = "No pude leer uno de los archivos.";
    }
    const todos = [...archivos, ...nuevos];
    if (todos.reduce((s, a) => s + a.tamano, 0) > MAX_TOTAL) {
      setError("Entre todos pesan demasiado. Manda menos archivos o más livianos.");
    } else {
      setArchivos(todos);
      if (aviso) setError(aviso);
    }
    setPreparando(false);
    for (const r of [entradaArchivo, entradaCamara]) if (r.current) r.current.value = "";
  }

  /** Nota de voz: se graba en el teléfono, se pasa a texto y queda en la caja para revisarla antes de enviar. */
  async function empezarGrabacion() {
    if (grabadora.current || grabando) return;
    setError(null);
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(flujo, tipo ? { mimeType: tipo, audioBitsPerSecond: 32_000 } : { audioBitsPerSecond: 32_000 });
      const trozos: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && trozos.push(e.data);
      rec.onstop = () => void terminarGrabacion();
      let seg = 0;
      const reloj = setInterval(() => {
        seg += 1;
        setSegundos(seg);
        if (seg >= MAX_GRABACION_SEG) pararGrabacion(false);
      }, 1000);
      grabadora.current = { rec, trozos, flujo, reloj, cancelado: false };
      setSegundos(0);
      setGrabando(true);
      rec.start();
    } catch {
      setError("No pude usar el micrófono. Revisa que el navegador tenga permiso para usarlo.");
    }
  }

  function pararGrabacion(cancelar: boolean) {
    const g = grabadora.current;
    if (!g) return;
    g.cancelado = cancelar;
    clearInterval(g.reloj);
    g.flujo.getTracks().forEach((t) => t.stop());
    if (g.rec.state !== "inactive") g.rec.stop();
    else void terminarGrabacion();
    setGrabando(false);
  }

  async function terminarGrabacion() {
    const g = grabadora.current;
    grabadora.current = null;
    if (!g || g.cancelado || g.trozos.length === 0) return;
    const tipo = g.rec.mimeType || g.trozos[0].type || "audio/webm";
    const blob = new Blob(g.trozos, { type: tipo });
    setTranscribiendo(true);
    try {
      const fd = new FormData();
      fd.append("audio", new File([blob], `nota.${tipo.includes("mp4") ? "m4a" : tipo.includes("ogg") ? "ogg" : "webm"}`, { type: tipo }));
      const r = await transcribirNota(fd);
      if (r.ok) {
        setTexto((t) => (t.trim() ? `${t.trim()} ${r.texto}` : r.texto));
      } else setError(r.motivo);
    } catch {
      setError("No se pudo mandar el audio. Inténtalo de nuevo.");
    }
    setTranscribiendo(false);
  }

  // Si se cierra el chat grabando, se suelta el micrófono.
  useEffect(
    () => () => {
      const g = grabadora.current;
      if (g) {
        g.cancelado = true;
        clearInterval(g.reloj);
        g.flujo.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );

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
            texto: a?.length ? `${t}\n[Adjuntó: ${notaDeAdjuntos(a)}]`.trim() : t,
          })),
          limpio,
          dondeEsta,
          adjuntos.map(({ mediaType, datos, nombre: n }) => ({ mediaType, datos, nombre: n })),
        );
        if (r.ok) {
          const { texto: leible, pasos } = separarPasos(r.texto);
          setTurnos((t) => [...t, { autor: "asistente", texto: leible, hora: new Date().toISOString() }]);
          if (pasos.length) void guiar(pasos);
          if ("cambio" in r && r.cambio) router.refresh();
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
    <section
      className={`patty-chat ${modo}${arrastrando ? " arrastrando" : ""}`}
      aria-label={`Chat con ${nombre}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setArrastrando(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setArrastrando(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setArrastrando(false);
        void elegirArchivos(e.dataTransfer.files);
      }}
    >
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
              <span className="patty-texto">
                Hola, soy <strong>{nombre}</strong>. {aviso} ¿En qué te ayudo? Puedes escribirme, mandarme una nota de voz (el micrófono), fotos, un video
                corto, un PDF, un Word o un Excel de una casa para analizarla. Si no sabes dónde está algo en el panel, te llevo.
              </span>
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
          {archivos
            .map((a, i) => ({ a, i }))
            // Los fotogramas de un video se ven como uno solo.
            .filter(({ a, i }) => !a.grupo || archivos.findIndex((x) => x.grupo === a.grupo) === i)
            .map(({ a, i }) => {
              const miembros = a.grupo ? archivos.filter((x) => x.grupo === a.grupo).length : 1;
              return (
                <span key={i} className="patty-por-enviar-item">
                  {a.miniatura ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.miniatura} alt={a.nombre} />
                  ) : (
                    <span className="patty-archivo">
                      <IconoDocumento tamano={18} /> {a.nombre}
                    </span>
                  )}
                  {a.grupo && <small className="patty-insignia">Video · {miembros}</small>}
                  <button
                    type="button"
                    aria-label={`Quitar ${a.grupo ? "el video" : a.nombre}`}
                    onClick={() => setArchivos((l) => (a.grupo ? l.filter((x) => x.grupo !== a.grupo) : l.filter((_, j) => j !== i)))}
                  >
                    ×
                  </button>
                </span>
              );
            })}
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
          accept="image/*,video/*,application/pdf,.pdf,.docx,.xlsx,.txt,.csv,.tsv,.md"
          multiple
          hidden
          onChange={(e) => void elegirArchivos(e.target.files)}
        />
        <input ref={entradaCamara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void elegirArchivos(e.target.files)} />
        {grabando ? (
          <div className="patty-grabando" role="status" aria-live="polite">
            <button type="button" className="patty-grabar-cancelar" onClick={() => pararGrabacion(true)} aria-label="Cancelar la grabación">
              Cancelar
            </button>
            <span className="patty-grabar-reloj">
              <i aria-hidden /> Grabando {minSeg(segundos)}
            </span>
            <button type="button" className="patty-grabar-listo" onClick={() => pararGrabacion(false)} aria-label="Terminar y pasar a texto">
              Listo
            </button>
          </div>
        ) : (
          <div className="patty-caja">
            <button
              type="button"
              className="patty-adjuntar"
              onClick={() => entradaArchivo.current?.click()}
              disabled={preparando || archivos.length >= MAX_ARCHIVOS}
              aria-label="Adjuntar fotos, video, PDF, Word o Excel"
              title="Adjuntar fotos, video, PDF, Word o Excel"
            >
              <IconoClip tamano={22} />
            </button>
            <button
              type="button"
              className="patty-adjuntar sin-giro"
              onClick={() => entradaCamara.current?.click()}
              disabled={preparando || archivos.length >= MAX_ARCHIVOS}
              aria-label="Tomar una foto"
              title="Tomar una foto"
            >
              <IconoCamara tamano={22} />
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
              onPaste={(e) => {
                // Pegar una captura o un archivo copiado lo adjunta.
                if (e.clipboardData.files.length) {
                  e.preventDefault();
                  void elegirArchivos(e.clipboardData.files);
                }
              }}
              placeholder={transcribiendo ? "Pasando tu nota de voz a texto…" : preparando ? "Preparando los archivos…" : "Mensaje"}
              rows={1}
              aria-label={`Mensaje para ${nombre}`}
            />
          </div>
        )}
        {!grabando && !texto.trim() && archivos.length === 0 ? (
          <button
            type="button"
            className="patty-enviar patty-microfono"
            onClick={() => void empezarGrabacion()}
            disabled={pensando || preparando || transcribiendo}
            aria-label="Grabar una nota de voz"
            title="Grabar una nota de voz"
          >
            <IconoMicrofono tamano={22} />
          </button>
        ) : (
          <button type="submit" className="patty-enviar" disabled={grabando || pensando || preparando || transcribiendo || (!texto.trim() && archivos.length === 0)} aria-label="Enviar">
            <IconoEnviar tamano={22} />
          </button>
        )}
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
