// Dibujo del video para redes en un <canvas> y su grabación con MediaRecorder, todo en el navegador (sin
// servidor ni librerías). Las escenas y sus tiempos vienen de lib/redes/video.ts; aquí solo se pinta cada
// cuadro: foto con zoom y paneo lento (Ken Burns), fundido entre escenas y textos que entran suaves.

import { FPS, FUNDIDO, escenaEn, type DatosVideo, type Escena } from "@/lib/redes/video";

export interface Colores {
  principal: string;
  soporte: string;
  profundo: string;
  base: string;
}

export interface Recursos {
  fotos: Map<string, HTMLImageElement>;
  logo: HTMLImageElement | null;
  colores: Colores;
  fondoLogo: string;
}

const SERIF = '"Playfair Display", Georgia, serif';
const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';

const recortar = (x: number) => Math.max(0, Math.min(1, x));
const suave = (x: number) => 1 - Math.pow(1 - recortar(x), 3);

/** Foto que llena el cuadro, con zoom de 1,06 a 1,16 y un paneo que cambia de lado en cada escena. */
function fotoKenBurns(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, avance: number, lado: number) {
  const escala = Math.max(w / img.naturalWidth, h / img.naturalHeight) * (1.06 + 0.1 * avance);
  const aw = img.naturalWidth * escala;
  const ah = img.naturalHeight * escala;
  const libreX = aw - w;
  const libreY = ah - h;
  const x = -libreX / 2 + lado * (avance - 0.5) * libreX * 0.8;
  const y = -libreY / 2 + (lado > 0 ? -1 : 1) * (avance - 0.5) * libreY * 0.5;
  ctx.drawImage(img, x, y, aw, ah);
}

/** Parte un texto en líneas que caben en `ancho` (como máximo `max` líneas, con "…" si sobra). */
function lineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number, max: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const res: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width <= ancho || !actual) actual = prueba;
    else {
      res.push(actual);
      actual = p;
    }
  }
  if (actual) res.push(actual);
  if (res.length > max) {
    const cortadas = res.slice(0, max);
    cortadas[max - 1] = `${cortadas[max - 1].replace(/[\s,.;:]+$/, "")}…`;
    return cortadas;
  }
  return res;
}

function pastilla(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, fondo: string, color: string, tam: number, derecha = false) {
  ctx.font = `600 ${tam}px ${SANS}`;
  const pad = tam * 0.7;
  const ancho = ctx.measureText(texto).width + pad * 2;
  const alto = tam * 1.9;
  const x0 = derecha ? x - ancho : x;
  ctx.fillStyle = fondo;
  ctx.beginPath();
  ctx.roundRect(x0, y, ancho, alto, alto / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(texto, x0 + pad, y + alto / 2 + 1);
  ctx.textBaseline = "alphabetic";
}

/** Entrada suave del texto: aparece y sube un poco al empezar la escena. */
function entrada(ctx: CanvasRenderingContext2D, local: number, retraso: number, alto: number) {
  const a = suave((local - 0.2 - retraso) / 0.7);
  ctx.globalAlpha *= a;
  ctx.translate(0, (1 - a) * alto * 0.025);
}

function degradado(ctx: CanvasRenderingContext2D, w: number, h: number, desde: number) {
  const g = ctx.createLinearGradient(0, h * desde, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h * desde, w, h * (1 - desde));
}

function escena(ctx: CanvasRenderingContext2D, w: number, h: number, e: Escena, indice: number, local: number, d: DatosVideo, r: Recursos) {
  const c = r.colores;
  const vertical = h > w * 1.2;
  const m = w * 0.07;
  const avance = recortar(local / e.duracion);
  ctx.save();
  if (e.tipo === "portada" || e.tipo === "foto") {
    const img = e.foto ? r.fotos.get(e.foto.url) : undefined;
    if (img) fotoKenBurns(ctx, img, w, h, avance, indice % 2 === 0 ? 1 : -1);
    else {
      ctx.fillStyle = c.profundo;
      ctx.fillRect(0, 0, w, h);
    }
    if (e.tipo === "portada") {
      degradado(ctx, w, h, vertical ? 0.4 : 0.3);
      ctx.save();
      entrada(ctx, local, 0, h);
      pastilla(ctx, d.operacion, m, m, c.principal, c.profundo, w * 0.03);
      ctx.restore();
      // Desde abajo: precio, título y etiqueta.
      let y = h - m * (vertical ? 1.6 : 1);
      ctx.save();
      entrada(ctx, local, 0.25, h);
      if (d.precio) {
        ctx.font = `700 ${w * (vertical ? 0.085 : 0.075)}px ${SANS}`;
        ctx.fillStyle = c.principal;
        ctx.fillText(d.precio, m, y);
        y -= w * (vertical ? 0.11 : 0.095);
      }
      ctx.restore();
      ctx.save();
      entrada(ctx, local, 0.1, h);
      ctx.font = `500 ${w * (vertical ? 0.072 : 0.06)}px ${SERIF}`;
      ctx.fillStyle = "#fff";
      const titulo = lineas(ctx, e.texto || d.titulo, w - m * 2, 3);
      const paso = w * (vertical ? 0.085 : 0.072);
      for (let i = titulo.length - 1; i >= 0; i--) {
        ctx.fillText(titulo[i], m, y);
        y -= paso;
      }
      ctx.font = `600 ${w * 0.03}px ${SANS}`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(d.etiqueta.toUpperCase(), m, y + paso * 0.25);
      ctx.restore();
    } else if (e.texto) {
      degradado(ctx, w, h, 0.62);
      ctx.save();
      entrada(ctx, local, 0, h);
      ctx.font = `600 ${w * 0.055}px ${SANS}`;
      ctx.fillStyle = "#fff";
      const t = lineas(ctx, e.texto, w - m * 2, 2);
      const paso = w * 0.068;
      t.forEach((l, i) => ctx.fillText(l, m, h - m * (vertical ? 2 : 1.1) - (t.length - 1 - i) * paso));
      ctx.restore();
    }
    if (e.foto?.ilustrativa) pastilla(ctx, "Imagen ilustrativa", w - m * 0.6, e.tipo === "portada" ? m : m * 0.6, "rgba(0,0,0,0.62)", "#fff", w * 0.026, true);
  } else if (e.tipo === "datos") {
    ctx.fillStyle = c.profundo;
    ctx.fillRect(0, 0, w, h);
    const filas = [...d.datos];
    const alto = (filas.length + (d.extras.length ? 1 : 0)) * w * 0.11 + w * 0.32;
    let y = (h - alto) / 2 + w * 0.08;
    ctx.save();
    entrada(ctx, local, 0, h);
    ctx.font = `500 ${w * 0.07}px ${SERIF}`;
    ctx.fillStyle = c.principal;
    ctx.fillText(lineas(ctx, e.texto || "Lo que tiene", w - m * 2, 1)[0] ?? "", m, y);
    ctx.restore();
    y += w * 0.13;
    filas.forEach((f, i) => {
      ctx.save();
      entrada(ctx, local, 0.15 + i * 0.15, h);
      ctx.fillStyle = c.principal;
      ctx.beginPath();
      ctx.arc(m + w * 0.015, y - w * 0.018, w * 0.012, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `500 ${w * 0.058}px ${SANS}`;
      ctx.fillStyle = c.base;
      ctx.fillText(lineas(ctx, f, w - m * 2.6, 1)[0] ?? "", m + w * 0.05, y);
      ctx.restore();
      y += w * 0.11;
    });
    if (d.extras.length) {
      ctx.save();
      entrada(ctx, local, 0.15 + filas.length * 0.15, h);
      ctx.font = `400 ${w * 0.036}px ${SANS}`;
      ctx.fillStyle = c.soporte;
      lineas(ctx, d.extras.join(" · "), w - m * 2, 2).forEach((l, i) => ctx.fillText(l, m, y + i * w * 0.05));
      ctx.restore();
      y += w * 0.12;
    }
    if (d.precio) {
      ctx.save();
      entrada(ctx, local, 0.4 + filas.length * 0.15, h);
      ctx.font = `700 ${w * 0.07}px ${SANS}`;
      ctx.fillStyle = c.principal;
      ctx.fillText(d.precio, m, y + w * 0.04);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = r.fondoLogo;
    ctx.fillRect(0, 0, w, h);
    const centro = w / 2;
    ctx.textAlign = "center";
    let y = h * (vertical ? 0.34 : 0.26);
    ctx.save();
    entrada(ctx, local, 0, h);
    if (r.logo) {
      const cajaW = w * 0.62;
      const cajaH = h * (vertical ? 0.16 : 0.22);
      const s = Math.min(cajaW / r.logo.naturalWidth, cajaH / r.logo.naturalHeight);
      const lw = r.logo.naturalWidth * s;
      const lh = r.logo.naturalHeight * s;
      ctx.drawImage(r.logo, centro - lw / 2, y - lh / 2, lw, lh);
      y += lh / 2 + w * 0.14;
    } else {
      ctx.font = `500 ${w * 0.075}px ${SERIF}`;
      ctx.fillStyle = c.base;
      lineas(ctx, d.nombreCorredor, w - m * 2, 2).forEach((l, i) => ctx.fillText(l, centro, y + i * w * 0.09));
      y += w * 0.22;
    }
    ctx.restore();
    ctx.save();
    entrada(ctx, local, 0.25, h);
    ctx.font = `500 ${w * 0.08}px ${SERIF}`;
    ctx.fillStyle = c.base;
    ctx.fillText(lineas(ctx, e.texto || "Escríbeme", w - m * 2, 1)[0] ?? "", centro, y);
    y += w * 0.1;
    if (d.contacto) {
      ctx.font = `600 ${w * 0.055}px ${SANS}`;
      ctx.fillStyle = c.principal;
      ctx.fillText(`WhatsApp ${d.contacto}`, centro, y);
      y += w * 0.075;
    }
    ctx.font = `400 ${w * 0.034}px ${SANS}`;
    ctx.fillStyle = c.soporte;
    ctx.fillText(`Código ${d.codigo}`, centro, y);
    ctx.restore();
  }
  ctx.restore();
}

/** Pinta el cuadro del segundo `t`, con el fundido desde la escena anterior al empezar cada una. */
export function dibujarCuadro(ctx: CanvasRenderingContext2D, escenas: Escena[], datos: DatosVideo, recursos: Recursos, t: number) {
  const { width: w, height: h } = ctx.canvas;
  if (escenas.length === 0) return;
  const { indice, local } = escenaEn(escenas, t);
  ctx.globalAlpha = 1;
  if (indice > 0 && local < FUNDIDO) {
    const previa = escenas[indice - 1];
    escena(ctx, w, h, previa, indice - 1, previa.duracion + local, datos, recursos);
    ctx.globalAlpha = suave(local / FUNDIDO);
  }
  escena(ctx, w, h, escenas[indice], indice, local, datos, recursos);
  ctx.globalAlpha = 1;
}

/** El formato de video que este navegador sabe grabar: primero MP4 (Safari y Chrome recientes), si no WebM. */
export function formatoDeGrabacion(): { mime: string; extension: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)) return null;
  const candidatos: [string, "mp4" | "webm"][] = [
    ["video/mp4;codecs=avc1.42E01F", "mp4"],
    ["video/mp4;codecs=avc1", "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9", "webm"],
    ["video/webm;codecs=vp8", "webm"],
    ["video/webm", "webm"],
  ];
  for (const [mime, extension] of candidatos) if (MediaRecorder.isTypeSupported(mime)) return { mime, extension };
  return null;
}

/**
 * Graba el video en tiempo real (dura lo que dura el video). Devuelve el archivo. `pintar` dibuja el cuadro
 * del segundo que se le pasa; `alAvanzar` recibe de 0 a 1.
 */
export async function grabarVideo(
  canvas: HTMLCanvasElement,
  duracion: number,
  pintar: (t: number) => void,
  o: { alAvanzar?: (x: number) => void; cancelado?: () => boolean } = {},
): Promise<{ archivo: Blob; mime: string; extension: "mp4" | "webm" }> {
  const formato = formatoDeGrabacion();
  if (!formato) throw new Error("sin_grabacion");
  pintar(0);
  const flujo = canvas.captureStream(FPS);
  const grabador = new MediaRecorder(flujo, { mimeType: formato.mime, videoBitsPerSecond: 8_000_000 });
  const partes: Blob[] = [];
  grabador.ondataavailable = (ev) => ev.data.size && partes.push(ev.data);
  const terminado = new Promise<void>((ok, mal) => {
    grabador.onstop = () => ok();
    grabador.onerror = () => mal(new Error("error_grabacion"));
  });
  grabador.start(500);
  const inicio = performance.now();
  await new Promise<void>((ok) => {
    const paso = () => {
      const t = (performance.now() - inicio) / 1000;
      if (o.cancelado?.()) return ok();
      pintar(Math.min(t, duracion));
      o.alAvanzar?.(Math.min(1, t / duracion));
      if (t >= duracion) return ok();
      setTimeout(paso, 1000 / FPS / 2);
    };
    paso();
  });
  grabador.stop();
  flujo.getTracks().forEach((p) => p.stop());
  await terminado;
  if (o.cancelado?.()) throw new Error("cancelado");
  const mime = formato.mime.split(";")[0];
  return { archivo: new Blob(partes, { type: mime }), mime, extension: formato.extension };
}

/** Si una imagen ya cargada se puede leer desde el lienzo (si no, el canvas quedaría "manchado" y no se graba). */
function sePuedeLeer(img: HTMLImageElement): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0, 1, 1);
    x.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

function cargar(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error("no_carga"));
    img.src = src;
  });
}

/**
 * Carga una foto para el lienzo: primero directo del bucket (con CORS) y, si el navegador no deja leerla,
 * por la ruta propia del panel (mismo origen), que solo sirve fotos de la casa del corredor.
 */
export async function cargarFoto(url: string, alterna: string | null): Promise<HTMLImageElement> {
  try {
    const img = await cargar(url);
    if (sePuedeLeer(img)) return img;
  } catch {
    /* sin CORS o sin red: se prueba la alterna */
  }
  if (!alterna) throw new Error("no_carga");
  const img = await cargar(alterna);
  if (!sePuedeLeer(img)) throw new Error("manchada");
  return img;
}

