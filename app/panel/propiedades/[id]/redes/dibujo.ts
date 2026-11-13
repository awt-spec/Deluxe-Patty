// Dibujo del video para redes en un <canvas> y su grabación con MediaRecorder, todo en el navegador (sin
// servidor ni librerías). Qué lleva cada escena, sus tiempos, curvas, transiciones, zonas seguras y cómo se
// trata cada foto según su proporción están en lib/redes/estilo-video.ts (funciones puras, con pruebas);
// aquí solo se pinta cada cuadro. Lo caro se prepara una vez: el fondo desenfocado de cada foto (achicando y
// agrandando la imagen en un lienzo aparte, sin `filter: blur` por cuadro), el logo recortado y el corte de
// los textos en líneas.

import {
  CUENTA,
  CURVAS,
  ESTILOS_VIDEO,
  SCRIM_ACENTO,
  SCRIM_TEXTO,
  acentoSobreFoto,
  cifraEn,
  duracionTransicion,
  encuadre,
  marcoFoto,
  movimientoFoto,
  recortar,
  textoEscena,
  textoSobre,
  tiempoTexto,
  transicionDe,
  tratamientoFoto,
  zonaSegura,
  type ColoresVideo,
  type DefEstilo,
  type EstiloVideo,
  type Rect,
  type Zonas,
} from "@/lib/redes/estilo-video";
import { FPS, escenaEn, type DatosVideo, type Escena, type IconoDato } from "@/lib/redes/video";

export type Colores = ColoresVideo;

export interface Recursos {
  fotos: Map<string, HTMLImageElement>;
  logo: HTMLImageElement | null;
  colores: Colores;
  fondoLogo: string;
  estilo: EstiloVideo;
}

const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';
const BLANCO = "#FFFFFF";

/** Todo lo que necesita un cuadro, calculado una vez por cuadro. */
interface Lienzo {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Escala respecto de 1080 px de ancho. */
  s: number;
  vertical: boolean;
  z: Zonas;
  estilo: EstiloVideo;
  est: DefEstilo;
  r: Recursos;
  d: DatosVideo;
  c: Colores;
  /** Color de acento que se lee sobre la foto oscurecida. */
  acento: string;
  /** Tamaño de letra relativo: en cuadrado, un poco más chica. */
  t: number;
}

// --- Fuentes ---------------------------------------------------------------------------------------

const CARAS = ['500 64px "Playfair Display"', "400 64px Inter", "500 64px Inter", "600 64px Inter", "700 64px Inter"];

/**
 * Carga las tipografías del panel (Playfair Display e Inter, que el layout ya declara con @fontsource) para
 * usarlas en el lienzo y espera a que estén. Si no cargan en 4 s, sigue con las del sistema.
 */
export async function prepararFuentes(): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts) return false;
  const espera = new Promise<false>((ok) => setTimeout(() => ok(false), 4000));
  const carga = Promise.all(CARAS.map((f) => document.fonts.load(f).catch(() => []))).then(() => document.fonts.ready.then(() => true as const));
  await Promise.race([carga, espera]);
  return CARAS.every((f) => document.fonts.check(f));
}

// --- Cachés (una vez por foto, logo o texto) -------------------------------------------------------

function lienzoAparte(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function cubrir(iw: number, ih: number, w: number, h: number): Rect {
  const s = Math.max(w / iw, h / ih);
  return { x: (w - iw * s) / 2, y: (h - ih * s) / 2, w: iw * s, h: ih * s };
}

type Fuente = HTMLImageElement | HTMLCanvasElement;
const escaladas = new WeakMap<Fuente, Map<number, HTMLCanvasElement>>();
const anchoDe = (f: Fuente) => (f instanceof HTMLImageElement ? f.naturalWidth : f.width);
const altoDe = (f: Fuente) => (f instanceof HTMLImageElement ? f.naturalHeight : f.height);

/**
 * La imagen lista para dibujarse a `escala` de su tamaño: si hay que achicarla mucho, se achica UNA vez con
 * calidad alta y se guarda; así cada cuadro dibuja con suavizado simple (lo caro es el suavizado alto por cuadro).
 */
function aEscala(img: Fuente, escala: number): Fuente {
  if (escala >= 0.8) return img;
  const paso = Math.max(0.05, Math.ceil(escala * 1.08 * 20) / 20);
  let porEscala = escaladas.get(img);
  if (!porEscala) escaladas.set(img, (porEscala = new Map()));
  const hecha = porEscala.get(paso);
  if (hecha) return hecha;
  let actual: Fuente = img;
  // Por mitades, para que el achicado no deje dientes.
  while (anchoDe(actual) * 0.5 > anchoDe(img) * paso) {
    const m = lienzoAparte(anchoDe(actual) / 2, altoDe(actual) / 2);
    const mx = m.getContext("2d")!;
    mx.imageSmoothingQuality = "high";
    mx.drawImage(actual, 0, 0, m.width, m.height);
    actual = m;
  }
  const fin = lienzoAparte(anchoDe(img) * paso, altoDe(img) * paso);
  const fx = fin.getContext("2d")!;
  fx.imageSmoothingQuality = "high";
  fx.drawImage(actual, 0, 0, fin.width, fin.height);
  if (porEscala.size > 4) porEscala.clear();
  porEscala.set(paso, fin);
  return fin;
}

const fondos = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();

/**
 * La foto desenfocada y oscurecida que va detrás de una foto enmarcada (y de los datos), a media resolución:
 * se achica a ~1/24 y se vuelve a agrandar en dos pasos (desenfoque barato que funciona también en Safari).
 * Si va con marco, lleva ya pintada la sombra de la foto. Se hace UNA vez por foto y tamaño.
 */
function fondoDesenfocado(img: HTMLImageElement, w: number, h: number, marco: Rect | null): HTMLCanvasElement {
  const clave = `${w}x${h}:${marco ? `${Math.round(marco.x)},${Math.round(marco.y)},${Math.round(marco.w)}` : "-"}`;
  let porTam = fondos.get(img);
  if (!porTam) fondos.set(img, (porTam = new Map()));
  const hecho = porTam.get(clave);
  if (hecho) return hecho;
  const W = Math.round(w / 2);
  const H = Math.round(h / 2);
  const chico = lienzoAparte(Math.max(8, W / 24), Math.max(8, H / 24));
  const cx = chico.getContext("2d")!;
  cx.imageSmoothingQuality = "high";
  const r = cubrir(img.naturalWidth, img.naturalHeight, chico.width, chico.height);
  cx.drawImage(img, r.x, r.y, r.w, r.h);
  const medio = lienzoAparte(chico.width * 4, chico.height * 4);
  const mx = medio.getContext("2d")!;
  mx.imageSmoothingQuality = "high";
  mx.drawImage(chico, 0, 0, medio.width, medio.height);
  const fondo = lienzoAparte(W, H);
  const f = fondo.getContext("2d")!;
  f.imageSmoothingQuality = "high";
  f.drawImage(medio, 0, 0, W, H);
  f.fillStyle = "rgba(0,0,0,0.42)";
  f.fillRect(0, 0, W, H);
  const v = f.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.45)");
  f.fillStyle = v;
  f.fillRect(0, 0, W, H);
  if (marco) {
    f.save();
    f.shadowColor = "rgba(0,0,0,0.6)";
    f.shadowBlur = 28 * (W / 540);
    f.shadowOffsetY = 12 * (W / 540);
    f.fillStyle = "#000";
    f.fillRect(marco.x / 2, marco.y / 2, marco.w / 2, marco.h / 2);
    f.restore();
  }
  if (porTam.size > 6) porTam.clear();
  porTam.set(clave, fondo);
  return fondo;
}

interface LogoListo {
  /** El logo recortado a su contenido (sin el margen vacío del archivo). */
  lienzo: HTMLCanvasElement;
  /** Si el fondo del archivo es oscuro: se mezcla en modo "aclarar" y el fondo desaparece. */
  oscuro: boolean;
}

const logos = new WeakMap<HTMLImageElement, LogoListo>();

function logoListo(img: HTMLImageElement): LogoListo {
  const hecho = logos.get(img);
  if (hecho) return hecho;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const m = 160 / Math.max(iw, ih);
  const prueba = lienzoAparte(iw * m, ih * m);
  const px = prueba.getContext("2d", { willReadFrequently: true })!;
  px.drawImage(img, 0, 0, prueba.width, prueba.height);
  let caja = { x0: 0, y0: 0, x1: iw, y1: ih };
  let oscuro = false;
  try {
    const { data, width, height } = px.getImageData(0, 0, prueba.width, prueba.height);
    const en = (x: number, y: number) => (y * width + x) * 4;
    const f = [data[0], data[1], data[2]];
    oscuro = (0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]) / 255 < 0.3;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = en(x, y);
        if (Math.abs(data[i] - f[0]) + Math.abs(data[i + 1] - f[1]) + Math.abs(data[i + 2] - f[2]) > 60) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    if (x1 > x0 && y1 > y0) {
      const pad = 3;
      caja = {
        x0: Math.max(0, (x0 - pad) / m),
        y0: Math.max(0, (y0 - pad) / m),
        x1: Math.min(iw, (x1 + pad + 1) / m),
        y1: Math.min(ih, (y1 + pad + 1) / m),
      };
    }
  } catch {
    /* sin permiso de lectura: se usa entero */
  }
  const lienzo = lienzoAparte(caja.x1 - caja.x0, caja.y1 - caja.y0);
  lienzo.getContext("2d")!.drawImage(img, caja.x0, caja.y0, lienzo.width, lienzo.height, 0, 0, lienzo.width, lienzo.height);
  const listo = { lienzo, oscuro };
  logos.set(img, listo);
  return listo;
}

/** Dibuja el logo con `alto` px de alto (y como máximo `anchoMax`). Si su fondo es oscuro, el fondo desaparece; si es claro, sobre foto va en una placa. */
function dibujarLogo(L: Lienzo, x: number, y: number, alto: number, anchoMax: number, sobreFoto: boolean, alinear: "izq" | "centro" | "der" = "izq"): Rect | null {
  if (!L.r.logo) return null;
  const { lienzo, oscuro } = logoListo(L.r.logo);
  const s = Math.min(alto / lienzo.height, anchoMax / lienzo.width);
  const lw = lienzo.width * s;
  const lh = lienzo.height * s;
  const x0 = alinear === "centro" ? x - lw / 2 : alinear === "der" ? x - lw : x;
  const { ctx } = L;
  ctx.save();
  // Logo con fondo oscuro: en modo "aclarar" su fondo desaparece (sobre la foto y sobre el fondo con luz del cierre).
  if (oscuro) ctx.globalCompositeOperation = "lighten";
  else if (sobreFoto) {
    const pad = lh * 0.18;
    ctx.fillStyle = L.r.fondoLogo;
    ctx.beginPath();
    ctx.roundRect(x0 - pad, y - pad, lw + pad * 2, lh + pad * 2, pad);
    ctx.fill();
  }
  ctx.drawImage(aEscala(lienzo, s), x0, y, lw, lh);
  ctx.restore();
  return { x: x0, y, w: lw, h: lh };
}

const cortes = new Map<string, string[]>();

/** Parte un texto en líneas que caben en `ancho` (como máximo `max`, con "…" si sobra). Guarda el resultado. */
function lineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number, max: number): string[] {
  // La clave incluye si la tipografía ya cargó: un corte medido con la de respaldo (más angosta) no sirve con Playfair.
  let lista = true;
  try {
    lista = typeof document === "undefined" || !document.fonts || document.fonts.check(ctx.font);
  } catch {
    lista = false;
  }
  const clave = `${lista ? "f" : "r"}|${ctx.font}|${Math.round(ancho)}|${max}|${texto}`;
  const hecho = cortes.get(clave);
  if (hecho) return hecho;
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
  let fin = res;
  if (res.length > max) {
    fin = res.slice(0, max);
    fin[max - 1] = `${fin[max - 1].replace(/[\s,.;:]+$/, "")}…`;
  }
  if (cortes.size > 400) cortes.clear();
  cortes.set(clave, fin);
  return fin;
}

// --- Piezas de dibujo ------------------------------------------------------------------------------

const fuente = (peso: number, tam: number, serif = false) => `${peso} ${Math.round(tam)}px ${serif ? SERIF : SANS}`;

/** Texto con espacio entre letras (etiquetas en mayúscula). Devuelve el ancho. */
function espaciado(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, sep: number, alinear: "izq" | "centro" = "izq"): number {
  const letras = [...texto];
  const anchos = letras.map((l) => ctx.measureText(l).width);
  const total = anchos.reduce((a, b) => a + b, 0) + sep * (letras.length - 1);
  let cx = alinear === "centro" ? x - total / 2 : x;
  const alin = ctx.textAlign;
  ctx.textAlign = "left";
  letras.forEach((l, i) => {
    ctx.fillText(l, cx, y);
    cx += anchos[i] + sep;
  });
  ctx.textAlign = alin;
  return total;
}

/** Degradado oscuro de abajo hacia arriba, con la opacidad que pide el texto donde va el texto. */
function scrimAbajo(L: Lienzo, desde: number, texto: number, acento: number) {
  const { ctx, w, h } = L;
  const g = ctx.createLinearGradient(0, desde, 0, h);
  const pos = (y: number) => recortar((y - desde) / (h - desde));
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(pos(desde + (texto - desde) * 0.45), "rgba(0,0,0,0.22)");
  g.addColorStop(pos(texto), `rgba(0,0,0,${SCRIM_TEXTO})`);
  g.addColorStop(Math.max(pos(texto) + 0.001, pos(acento)), `rgba(0,0,0,${SCRIM_ACENTO})`);
  g.addColorStop(1, "rgba(0,0,0,0.86)");
  ctx.fillStyle = g;
  ctx.fillRect(0, desde, w, h - desde);
}

function scrimArriba(L: Lienzo, hasta: number, opacidad: number) {
  const { ctx, w } = L;
  const g = ctx.createLinearGradient(0, 0, 0, hasta);
  g.addColorStop(0, `rgba(0,0,0,${opacidad})`);
  g.addColorStop(0.6, `rgba(0,0,0,${opacidad * 0.35})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, hasta);
}

type Tiempo = { local: number; dur: number; ultima: boolean };

/**
 * Escribe líneas que entran según el estilo: Elegante por líneas con máscara (suben desde abajo de su
 * renglón), Moderno palabra por palabra, Limpio con un fundido corto. Antes del corte salen hacia arriba.
 * Devuelve el siguiente número de orden (para escalonar lo que venga después).
 */
function textoAnimado(L: Lienzo, lista: string[], x: number, y0: number, paso: number, tam: number, orden: number, T: Tiempo, alinear: "izq" | "centro" = "izq"): number {
  const { ctx, est, estilo } = L;
  ctx.textAlign = alinear === "centro" ? "center" : "left";
  for (let i = 0; i < lista.length; i++) {
    const y = y0 + i * paso;
    const linea = lista[i];
    if (est.entradaTexto === "palabras") {
      const palabras = linea.split(" ");
      const anchos = palabras.map((p) => ctx.measureText(p).width);
      const esp = ctx.measureText(" ").width;
      const total = anchos.reduce((a, b) => a + b, 0) + esp * (palabras.length - 1);
      let cx = alinear === "centro" ? x - total / 2 : x;
      const alin: CanvasTextAlign = ctx.textAlign;
      ctx.textAlign = "left";
      palabras.forEach((p, j) => {
        const { entrada, salida } = tiempoTexto(estilo, T.local, T.dur, orden++, { ultima: T.ultima });
        if (entrada > 0 && salida < 1) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx - tam * 0.1, y - tam * 1.05, anchos[j] + tam * 0.2, tam * 1.4);
          ctx.clip();
          ctx.globalAlpha *= recortar(entrada * 2) * (1 - salida);
          ctx.fillText(p, cx, y + (1 - entrada) * tam * 1.1 - salida * tam * 0.5);
          ctx.restore();
        }
        cx += anchos[j] + esp;
      });
      ctx.textAlign = alin;
      continue;
    }
    const { entrada, salida } = tiempoTexto(estilo, T.local, T.dur, orden++, { ultima: T.ultima });
    if (entrada <= 0 || salida >= 1) continue;
    ctx.save();
    if (est.entradaTexto === "lineas") {
      const ancho = ctx.measureText(linea).width;
      const x0 = alinear === "centro" ? x - ancho / 2 : x;
      ctx.beginPath();
      ctx.rect(x0 - tam * 0.15, y - tam * 1.1, ancho + tam * 0.3, tam * 1.5);
      ctx.clip();
      ctx.globalAlpha *= recortar(entrada * 1.6) * (1 - salida);
      ctx.fillText(linea, x, y + (1 - entrada) * tam * 1.15 - salida * tam * 0.6);
    } else {
      ctx.globalAlpha *= entrada * (1 - salida);
      ctx.fillText(linea, x, y + (1 - entrada) * tam * 0.3 - salida * tam * 0.2);
    }
    ctx.restore();
  }
  ctx.textAlign = "left";
  return orden;
}

/** Aparición simple (para íconos, líneas y bloques) con el tiempo del orden dado. */
function aparece(L: Lienzo, orden: number, T: Tiempo): { e: number; s: number; a: number } {
  const { entrada, salida } = tiempoTexto(L.estilo, T.local, T.dur, orden, { ultima: T.ultima });
  return { e: entrada, s: salida, a: entrada * (1 - salida) };
}

/** Íconos de línea dibujados en el lienzo (en una cuadrícula de 24). */
function icono(ctx: CanvasRenderingContext2D, tipo: IconoDato | "pin" | "chat", x: number, y: number, tam: number, color: string, grosor: number) {
  const k = tam / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = grosor / k;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (tipo) {
    case "pin":
      ctx.moveTo(12, 22);
      ctx.bezierCurveTo(12, 22, 4, 14.5, 4, 9.5);
      ctx.arc(12, 9.5, 8, Math.PI, 0);
      ctx.bezierCurveTo(20, 14.5, 12, 22, 12, 22);
      ctx.closePath();
      ctx.moveTo(15, 9.5);
      ctx.arc(12, 9.5, 3, 0, Math.PI * 2);
      break;
    case "cuartos":
      ctx.moveTo(2, 19);
      ctx.lineTo(2, 5);
      ctx.moveTo(2, 14);
      ctx.lineTo(22, 14);
      ctx.lineTo(22, 19);
      ctx.moveTo(2, 17);
      ctx.lineTo(22, 17);
      ctx.moveTo(10, 14);
      ctx.lineTo(10, 10);
      ctx.quadraticCurveTo(10, 9, 11, 9);
      ctx.lineTo(19, 9);
      ctx.quadraticCurveTo(22, 9, 22, 12);
      ctx.lineTo(22, 14);
      ctx.moveTo(8, 11);
      ctx.arc(6, 11, 2, 0, Math.PI * 2);
      break;
    case "banos":
      ctx.moveTo(2, 12);
      ctx.lineTo(22, 12);
      ctx.moveTo(3, 12);
      ctx.lineTo(4, 16);
      ctx.quadraticCurveTo(5, 19, 8, 19);
      ctx.lineTo(16, 19);
      ctx.quadraticCurveTo(19, 19, 20, 16);
      ctx.lineTo(21, 12);
      ctx.moveTo(7, 19);
      ctx.lineTo(6, 22);
      ctx.moveTo(17, 19);
      ctx.lineTo(18, 22);
      ctx.moveTo(5, 12);
      ctx.lineTo(5, 5);
      ctx.quadraticCurveTo(5, 2.5, 7.5, 2.5);
      ctx.quadraticCurveTo(10, 2.5, 10, 5);
      ctx.moveTo(8.5, 6);
      ctx.lineTo(11.5, 6);
      break;
    case "construccion":
      ctx.moveTo(3, 11);
      ctx.lineTo(12, 3);
      ctx.lineTo(21, 11);
      ctx.moveTo(5, 9.5);
      ctx.lineTo(5, 21);
      ctx.lineTo(19, 21);
      ctx.lineTo(19, 9.5);
      ctx.moveTo(10, 21);
      ctx.lineTo(10, 15);
      ctx.lineTo(14, 15);
      ctx.lineTo(14, 21);
      break;
    case "terreno":
      ctx.moveTo(3, 7);
      ctx.lineTo(3, 3);
      ctx.lineTo(7, 3);
      ctx.moveTo(17, 3);
      ctx.lineTo(21, 3);
      ctx.lineTo(21, 7);
      ctx.moveTo(21, 17);
      ctx.lineTo(21, 21);
      ctx.lineTo(17, 21);
      ctx.moveTo(7, 21);
      ctx.lineTo(3, 21);
      ctx.lineTo(3, 17);
      ctx.moveTo(12, 17);
      ctx.lineTo(12, 13);
      ctx.moveTo(15, 10.5);
      ctx.arc(12, 10.5, 3, 0, Math.PI * 2);
      break;
    case "chat":
      ctx.moveTo(4.5, 19.5);
      ctx.lineTo(5.6, 15.6);
      ctx.arc(12, 11.5, 8.5, Math.PI * 0.82, Math.PI * 0.62 + Math.PI * 2 - 0.0001, false);
      ctx.closePath();
      ctx.moveTo(9, 8.5);
      ctx.quadraticCurveTo(9, 12, 12.5, 14.5);
      ctx.quadraticCurveTo(14.5, 15.5, 15.5, 14);
      break;
  }
  ctx.stroke();
  ctx.restore();
}

/** Pastilla con texto (Moderno). Devuelve su ancho. */
function pastilla(L: Lienzo, texto: string, x: number, y: number, tam: number, fondo: string, color: string, avance: number, conIcono?: "pin"): number {
  const { ctx } = L;
  ctx.font = fuente(700, tam);
  const pad = tam * 0.75;
  const ic = conIcono ? tam * 1.1 : 0;
  const ancho = ctx.measureText(texto).width + pad * 2 + ic + (conIcono ? tam * 0.3 : 0);
  const alto = tam * 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y - 2, ancho * CURVAS.expo(avance) + 2, alto + 4);
  ctx.clip();
  ctx.fillStyle = fondo;
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, alto / 2);
  ctx.fill();
  if (conIcono) icono(ctx, conIcono, x + pad * 0.8, y + (alto - ic) / 2, ic, color, tam * 0.13);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(texto, x + pad + ic + (conIcono ? tam * 0.15 : 0), y + alto / 2 + tam * 0.04);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
  return ancho;
}

/** El precio con énfasis: subrayado que se dibuja (Elegante), placa de color (Moderno) o limpio. Devuelve el alto usado. */
function precio(L: Lienzo, texto: string, x: number, y: number, tam: number, orden: number, T: Tiempo, alinear: "izq" | "centro" = "izq", sobreFoto = true) {
  const { ctx, estilo, c } = L;
  const ap = aparece(L, orden, T);
  if (ap.a <= 0) return;
  ctx.save();
  if (estilo === "moderno") {
    ctx.font = fuente(700, tam);
    const ancho = ctx.measureText(texto).width;
    const padX = tam * 0.45;
    const alto = tam * 1.45;
    const x0 = alinear === "centro" ? x - ancho / 2 - padX : x;
    const top = y - tam * 1.06;
    ctx.globalAlpha *= 1 - ap.s;
    ctx.beginPath();
    ctx.rect(x0, top, (ancho + padX * 2) * CURVAS.expo(ap.e * 1.4), alto);
    ctx.clip();
    ctx.fillStyle = c.principal;
    ctx.fillRect(x0, top, ancho + padX * 2, alto);
    ctx.fillStyle = textoSobre(c.principal, c.profundo);
    ctx.globalAlpha *= recortar((ap.e - 0.35) * 2.5);
    ctx.fillText(texto, x0 + padX, y);
  } else if (estilo === "elegante") {
    ctx.font = fuente(500, tam, true);
    ctx.textAlign = alinear === "centro" ? "center" : "left";
    const ancho = ctx.measureText(texto).width;
    const x0 = alinear === "centro" ? x - ancho / 2 : x;
    ctx.globalAlpha *= recortar(ap.e * 1.5) * (1 - ap.s);
    ctx.fillStyle = sobreFoto ? L.acento : c.principal;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - tam * 0.2, y - tam * 1.1, ancho + tam * 0.4, tam * 1.45);
    ctx.clip();
    ctx.fillText(texto, x, y + (1 - ap.e) * tam * 1.1);
    ctx.restore();
    // Subrayado que se dibuja de izquierda a derecha, un poco después del número.
    const sub = CURVAS.suave((T.local - 0.55 - orden * L.est.escalonado) / 0.9);
    ctx.fillRect(x0, y + tam * 0.24, ancho * sub, Math.max(1.5, 2.5 * L.s));
  } else {
    ctx.font = fuente(600, tam);
    ctx.textAlign = alinear === "centro" ? "center" : "left";
    ctx.globalAlpha *= ap.a;
    ctx.fillStyle = sobreFoto ? BLANCO : c.profundo;
    ctx.fillText(texto, x, y + (1 - ap.e) * tam * 0.3);
  }
  ctx.restore();
}

/** Etiqueta "EN VENTA" con un filete fino antes (Elegante) o sin él. */
function etiqueta(L: Lienzo, texto: string, x: number, y: number, tam: number, color: string, orden: number, T: Tiempo, filete = true, alinear: "izq" | "centro" = "izq") {
  const { ctx } = L;
  const ap = aparece(L, orden, T);
  if (ap.a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= ap.a;
  ctx.fillStyle = color;
  ctx.font = fuente(600, tam);
  const largo = filete ? tam * 2.4 * CURVAS.suave(ap.e) : 0;
  if (alinear === "centro") {
    espaciado(ctx, texto, x, y, tam * 0.32, "centro");
  } else {
    if (filete) ctx.fillRect(x, y - tam * 0.36, largo, Math.max(1.5, 2 * L.s));
    espaciado(ctx, texto, x + (filete ? tam * 3 : 0), y, tam * 0.32);
  }
  ctx.restore();
}

/** Rótulo obligatorio sobre las variantes con IA. */
function rotuloIlustrativa(L: Lienzo, x: number, y: number, derecha: boolean) {
  const { ctx, s } = L;
  const tam = 25 * s * L.t;
  ctx.save();
  ctx.font = fuente(600, tam);
  const texto = "Imagen ilustrativa";
  const pad = tam * 0.8;
  const punto = tam * 0.32;
  const ancho = ctx.measureText(texto).width + pad * 2 + punto * 2 + tam * 0.45;
  const alto = tam * 2;
  const x0 = derecha ? x - ancho : x;
  ctx.fillStyle = "rgba(10,10,10,0.62)";
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.beginPath();
  ctx.roundRect(x0, y, ancho, alto, alto / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = L.acento;
  ctx.beginPath();
  ctx.arc(x0 + pad + punto, y + alto / 2, punto, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BLANCO;
  ctx.textBaseline = "middle";
  ctx.fillText(texto, x0 + pad + punto * 2 + tam * 0.45, y + alto / 2 + tam * 0.05);
  ctx.restore();
}

/** Sombra suave para el texto sobre fotos (se apaga después). */
function conSombra(L: Lienzo, f: () => void) {
  const { ctx } = L;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 14 * L.s;
  ctx.shadowOffsetY = 2 * L.s;
  f();
  ctx.restore();
}

// --- Escenas ---------------------------------------------------------------------------------------

/** La foto de la escena: llena el cuadro con su movimiento o, si es muy distinta del cuadro, completa sobre su fondo desenfocado. */
function pintarFoto(L: Lienzo, img: HTMLImageElement, e: Escena, indice: number, local: number) {
  const { ctx, w, h } = L;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const trat = tratamientoFoto(iw, ih, w, h, e.tipo);
  const mov = movimientoFoto(indice, trat, iw, ih, w, h);
  // El movimiento sigue durante las transiciones (no se congela al final de la escena).
  const avance = recortar((local + 0.6) / (e.duracion + 1.2));
  if (trat === "enmarcada") {
    const marco = marcoFoto(iw, ih, w, h, L.estilo);
    const fondo = fondoDesenfocado(img, w, h, marco);
    const k = 1 + 0.035 * (mov === "acercar" ? CURVAS.suave(avance) : 1 - CURVAS.suave(avance));
    ctx.drawImage(fondo, (w - w * k) / 2, (h - h * k) / 2, w * k, h * k);
    const cx = marco.x + marco.w / 2;
    const cy = marco.y + marco.h / 2;
    ctx.drawImage(aEscala(img, (marco.w * 1.04) / iw), cx - (marco.w * k) / 2, cy - (marco.h * k) / 2, marco.w * k, marco.h * k);
    if (L.estilo === "elegante") {
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = Math.max(1, 1.5 * L.s);
      ctx.strokeRect(cx - (marco.w * k) / 2, cy - (marco.h * k) / 2, marco.w * k, marco.h * k);
    }
    return;
  }
  const r = encuadre(mov, avance, iw, ih, w, h, L.est.amplitud);
  ctx.drawImage(aEscala(img, (Math.max(w / iw, h / ih) * (1 + L.est.amplitud))), r.x, r.y, r.w, r.h);
}

function fondoLiso(L: Lienzo, color: string) {
  L.ctx.fillStyle = color;
  L.ctx.fillRect(0, 0, L.w, L.h);
}

function portada(L: Lienzo, e: Escena, indice: number, T: Tiempo) {
  const { ctx, w, h, s, z, d, c, estilo } = L;
  const img = e.foto ? L.r.fotos.get(e.foto.url) : undefined;
  if (img) pintarFoto(L, img, e, indice, T.local);
  else fondoLiso(L, c.profundo);
  const x = z.izquierda;
  const ancho = w - z.izquierda - z.derecha;
  const abajo = h - z.abajo;
  const titulo = textoEscena(e, d);
  const t = L.t;

  if (estilo === "elegante") {
    const tamT = 74 * s * t;
    const pasoT = tamT * 1.16;
    const tamP = 86 * s * t;
    const yPrecio = abajo - 26 * s;
    const yLugar = d.precio ? yPrecio - tamP - 50 * s : abajo - 10 * s;
    ctx.font = fuente(500, tamT, true);
    const lt = lineas(ctx, titulo, ancho, L.vertical ? 3 : 2);
    const yTitulo = yLugar - 34 * s * t - 40 * s - (lt.length - 1) * pasoT;
    const yEtiqueta = yTitulo - tamT - 34 * s;
    scrimAbajo(L, yEtiqueta - 520 * s, yEtiqueta - 170 * s, yLugar - 40 * s);
    scrimArriba(L, z.arriba, 0.35);
    // El logo va sobre el bloque oscuro del texto (arriba, sobre una pared clara, no se leería).
    const altoLogo = 104 * s * t;
    const ap0 = aparece(L, 0, T);
    ctx.save();
    ctx.globalAlpha *= ap0.a;
    dibujarLogo(L, x, Math.max(z.arriba, yEtiqueta - 44 * s - altoLogo), altoLogo, 300 * s, true);
    ctx.restore();
    if (e.foto?.ilustrativa) rotuloIlustrativa(L, w - z.derecha, z.arriba, true);
    etiqueta(L, d.operacionCorta.toUpperCase(), x, yEtiqueta, 25 * s * t, L.acento, 0, T);
    conSombra(L, () => {
      ctx.fillStyle = BLANCO;
      ctx.font = fuente(500, tamT, true);
      const o = textoAnimado(L, lt, x, yTitulo, pasoT, tamT, 1, T);
      if (d.lugar) lugar(L, d.lugar, x, yLugar, 32 * s * t, o, T);
    });
    if (d.precio) precio(L, d.precio, x, yPrecio, tamP, lt.length + 2, T);
  } else if (estilo === "moderno") {
    const tamT = 84 * s * t;
    const pasoT = tamT * 1.08;
    const tamP = 64 * s * t;
    const yPrecio = abajo - 30 * s;
    const yLugar = (d.precio ? yPrecio - tamP * 1.06 - 46 * s : abajo) - 64 * s * t;
    ctx.font = fuente(700, tamT);
    const lt = lineas(ctx, titulo, ancho, 3);
    const yTitulo = yLugar - 40 * s - (lt.length - 1) * pasoT;
    const yPastilla = yTitulo - tamT - 86 * s * t;
    scrimAbajo(L, yPastilla - 300 * s, yPastilla + 20 * s, yLugar);
    scrimArriba(L, z.arriba + 200 * s, 0.4);
    dibujarLogo(L, x, z.arriba, 76 * s * t, 260 * s, true);
    if (e.foto?.ilustrativa) rotuloIlustrativa(L, w - z.derecha, z.arriba, true);
    const ap = aparece(L, 0, T);
    if (ap.a > 0) {
      ctx.save();
      ctx.globalAlpha *= 1 - ap.s;
      pastilla(L, d.operacionCorta.toUpperCase(), x, yPastilla, 26 * s * t, c.principal, textoSobre(c.principal, c.profundo), ap.e);
      ctx.restore();
    }
    ctx.fillStyle = BLANCO;
    ctx.font = fuente(700, tamT);
    const o = textoAnimado(L, lt, x, yTitulo, pasoT, tamT, 1, T);
    if (d.lugar) {
      const a = aparece(L, o, T);
      if (a.a > 0) {
        ctx.save();
        ctx.globalAlpha *= 1 - a.s;
        pastilla(L, d.lugar, x, yLugar, 28 * s * t, "rgba(255,255,255,0.16)", BLANCO, a.e, "pin");
        ctx.restore();
      }
    }
    if (d.precio) precio(L, d.precio, x, yPrecio, tamP, o + 1, T);
  } else {
    const tamT = 46 * s * t;
    const pasoT = tamT * 1.25;
    const tamP = 42 * s * t;
    const yPrecio = abajo - 16 * s;
    ctx.font = fuente(600, tamT);
    const lt = lineas(ctx, titulo, ancho, 2);
    const yTitulo = (d.precio ? yPrecio - tamP - 26 * s : abajo) - (lt.length - 1) * pasoT;
    const yEtiqueta = yTitulo - tamT - 18 * s;
    scrimAbajo(L, yEtiqueta - 260 * s, yEtiqueta - 20 * s, yPrecio - 30 * s);
    dibujarLogo(L, x, z.arriba, 60 * s * t, 200 * s, true);
    if (e.foto?.ilustrativa) rotuloIlustrativa(L, w - z.derecha, z.arriba, true);
    const ap = aparece(L, 0, T);
    if (ap.a > 0) {
      ctx.save();
      ctx.globalAlpha *= ap.a;
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.font = fuente(500, 26 * s * t);
      ctx.fillText(`${d.operacionCorta}${d.lugar ? ` · ${d.lugar}` : ""}`, x, yEtiqueta + (1 - ap.e) * 8 * s);
      ctx.restore();
    }
    ctx.fillStyle = BLANCO;
    ctx.font = fuente(600, tamT);
    const o = textoAnimado(L, lt, x, yTitulo, pasoT, tamT, 1, T);
    if (d.precio) precio(L, d.precio, x, yPrecio, tamP, o, T);
  }
}

/** Ícono de ubicación + zona (Elegante). */
function lugar(L: Lienzo, texto: string, x: number, y: number, tam: number, orden: number, T: Tiempo) {
  const { ctx } = L;
  const ap = aparece(L, orden, T);
  if (ap.a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= ap.a;
  const dy = (1 - ap.e) * tam * 0.4;
  icono(ctx, "pin", x - tam * 0.1, y - tam * 1.02 + dy, tam * 1.12, L.acento, Math.max(1.5, tam * 0.075));
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = fuente(500, tam);
  ctx.fillText(texto, x + tam * 1.3, y + dy);
  ctx.restore();
}

function escenaFoto(L: Lienzo, e: Escena, indice: number, T: Tiempo) {
  const { ctx, w, h, s, z, d, estilo, c } = L;
  const img = e.foto ? L.r.fotos.get(e.foto.url) : undefined;
  if (img) pintarFoto(L, img, e, indice, T.local);
  else fondoLiso(L, c.profundo);
  if (L.est.barra || L.est.marcaAgua) scrimArriba(L, z.arriba + 160 * L.s, 0.32);
  const texto = textoEscena(e, d);
  const x = z.izquierda;
  const ancho = w - z.izquierda - z.derecha;
  const abajo = h - z.abajo - 10 * s;
  if (texto) {
    const t = L.t;
    if (estilo === "elegante") {
      const tam = 58 * s * t;
      const paso = tam * 1.2;
      ctx.font = fuente(500, tam, true);
      const l = lineas(ctx, texto, ancho, 2);
      const y0 = abajo - (l.length - 1) * paso;
      scrimAbajo(L, y0 - tam - 320 * s, y0 - tam - 40 * s, abajo);
      const ap = aparece(L, 0, T);
      ctx.save();
      ctx.globalAlpha *= ap.a;
      ctx.fillStyle = L.acento;
      ctx.fillRect(x, y0 - tam - 34 * s, 64 * s * CURVAS.suave(ap.e), Math.max(1.5, 2 * s));
      ctx.restore();
      conSombra(L, () => {
        ctx.fillStyle = BLANCO;
        ctx.font = fuente(500, tam, true);
        textoAnimado(L, l, x, y0, paso, tam, 1, T);
      });
    } else if (estilo === "moderno") {
      const tam = 66 * s * t;
      const paso = tam * 1.1;
      ctx.font = fuente(700, tam);
      const l = lineas(ctx, texto, ancho - 34 * s, 2);
      const y0 = abajo - (l.length - 1) * paso;
      scrimAbajo(L, y0 - tam - 300 * s, y0 - tam, abajo);
      const ap = aparece(L, 0, T);
      ctx.save();
      ctx.globalAlpha *= 1 - ap.s;
      const altoBarra = (l.length - 1) * paso + tam * 1.05;
      ctx.fillStyle = c.principal;
      ctx.fillRect(x, y0 - tam * 0.86, 10 * s, altoBarra * CURVAS.expo(ap.e));
      ctx.restore();
      ctx.fillStyle = BLANCO;
      ctx.font = fuente(700, tam);
      textoAnimado(L, l, x + 34 * s, y0, paso, tam, 1, T);
    } else {
      const tam = 36 * s * t;
      const paso = tam * 1.3;
      ctx.font = fuente(500, tam);
      const l = lineas(ctx, texto, ancho, 2);
      const y0 = abajo - (l.length - 1) * paso;
      scrimAbajo(L, y0 - tam - 200 * s, y0 - tam, abajo);
      ctx.fillStyle = BLANCO;
      ctx.font = fuente(500, tam);
      textoAnimado(L, l, x, y0, paso, tam, 0, T);
    }
  }
  if (e.foto?.ilustrativa) rotuloIlustrativa(L, x, z.arriba, false);
}

function escenaDatos(L: Lienzo, e: Escena, escenas: Escena[], T: Tiempo) {
  const { ctx, w, h, s, z, d, c, estilo } = L;
  const t = L.t;
  const claro = estilo === "limpio";
  const tinta = claro ? c.profundo : c.base;
  const acento = claro ? c.profundo : c.principal;
  // Fondo: el de la marca con la foto de portada desenfocada detrás (Elegante), liso (Moderno) o claro (Limpio).
  fondoLiso(L, claro ? c.base : c.profundo);
  const portadaImg = escenas[0]?.foto ? L.r.fotos.get(escenas[0].foto.url) : undefined;
  if (estilo === "elegante" && portadaImg) {
    ctx.save();
    ctx.globalAlpha *= 0.55;
    const k = 1.04 + 0.03 * recortar(T.local / T.dur);
    ctx.drawImage(fondoDesenfocado(portadaImg, w, h, null), (w - w * k) / 2, (h - h * k) / 2, w * k, h * k);
    ctx.restore();
    ctx.fillStyle = hexAlfa(c.profundo, 0.6);
    ctx.fillRect(0, 0, w, h);
  }
  const x = z.izquierda;
  const ancho = w - z.izquierda - z.derecha;
  const titulo = textoEscena(e, d) || "Lo que tiene";
  const cifras = d.cifras;
  const columnas = 2;
  const filas = Math.ceil(cifras.length / columnas);
  const libre = h - z.arriba - z.abajo;
  // Tamaños con un factor `f`: si no cabe entre las zonas seguras (cuadrado, muchas amenidades), se achica todo.
  const medidas = (f: number) => {
    const u = s * t * f * (L.vertical ? 1 : 0.88);
    const tamIc = 58 * u;
    const lado = estilo === "moderno" ? tamIc * 1.45 : tamIc;
    const tamN = (estilo === "moderno" ? 96 : 90) * u;
    const tamEt = 22 * u;
    const altoCelda = estilo === "limpio" ? 112 * u : lado + 22 * u + tamN * 0.95 + 18 * u + tamEt + 46 * u;
    const tamTit = (estilo === "moderno" ? 72 : estilo === "elegante" ? 66 : 42) * u;
    const tamExtra = 30 * u;
    const tamP = (estilo === "moderno" ? 60 : estilo === "elegante" ? 78 : 46) * u;
    return { u, tamIc, lado, tamN, tamEt, altoCelda, tamTit, tamExtra, tamP };
  };
  const extrasDe = (tam: number) => {
    ctx.font = fuente(400, tam);
    return d.extras.length ? lineas(ctx, d.extras.join("  ·  "), ancho, 2) : [];
  };
  const altoDe = (m: ReturnType<typeof medidas>) => {
    const ex = extrasDe(m.tamExtra);
    const filasLista = estilo === "limpio" ? cifras.length : filas;
    return m.tamTit + 70 * m.u + filasLista * m.altoCelda + (ex.length ? ex.length * m.tamExtra * 1.5 + 40 * m.u : 0) + (d.precio ? m.tamP + 70 * m.u : 0);
  };
  let m = medidas(1);
  const alto0 = altoDe(m);
  if (alto0 > libre) m = medidas(libre / alto0);
  const { u, tamIc, lado, tamN, tamEt, altoCelda, tamTit, tamExtra, tamP } = m;
  const extras = extrasDe(tamExtra);
  const alto = altoDe(m);
  let y = z.arriba + Math.max(0, (libre - alto) / 2) + tamTit;
  let orden = 0;

  // Encabezado
  ctx.fillStyle = estilo === "elegante" ? c.principal : tinta;
  ctx.font = estilo === "elegante" ? fuente(500, tamTit, true) : fuente(estilo === "moderno" ? 700 : 600, tamTit);
  orden = textoAnimado(L, lineas(ctx, titulo, ancho, 1), x, y, 0, tamTit, orden, T);
  if (estilo === "elegante") {
    const ap = aparece(L, orden, T);
    ctx.save();
    ctx.globalAlpha *= ap.a * 0.8;
    ctx.fillStyle = c.principal;
    ctx.fillRect(x, y + 30 * u, ancho * CURVAS.suave(ap.e), Math.max(1, 1.5 * s));
    ctx.restore();
  }
  y += 70 * u;

  // Cifras
  if (estilo === "limpio") {
    cifras.forEach((cf, i) => {
      const ap = aparece(L, orden + i, T);
      if (ap.a <= 0) return;
      const yc = y + i * altoCelda;
      ctx.save();
      ctx.globalAlpha *= ap.a;
      const dy = (1 - ap.e) * 10 * s;
      icono(ctx, cf.icono, x, yc + altoCelda * 0.5 - 22 * u + dy, 44 * u, acento, 2.4 * s);
      const avance = recortar((T.local - RET(L, orden + i)) / CUENTA);
      ctx.fillStyle = tinta;
      ctx.font = fuente(600, 46 * u);
      const num = `${cifraEn(cf.valor, cf.decimales, avance)}${cf.unidad ? ` ${cf.unidad}` : ""}`;
      ctx.fillText(num, x + 76 * u, yc + altoCelda * 0.5 + 16 * u + dy);
      const nw = ctx.measureText(num).width;
      ctx.font = fuente(400, 32 * u);
      ctx.fillStyle = hexAlfa(tinta, 0.7);
      ctx.fillText(cf.etiqueta.toLowerCase(), x + 76 * u + nw + 16 * u, yc + altoCelda * 0.5 + 16 * u + dy);
      ctx.fillStyle = hexAlfa(tinta, 0.14);
      ctx.fillRect(x, yc + altoCelda - 1, ancho * CURVAS.suave(ap.e), Math.max(1, 1.5 * s));
      ctx.restore();
    });
    orden += cifras.length;
    y += cifras.length * altoCelda;
  } else {
    const anchoCol = ancho / columnas;
    cifras.forEach((cf, i) => {
      const col = i % columnas;
      const fila = Math.floor(i / columnas);
      const cx = x + col * anchoCol + (col ? 44 * s : 0);
      const top = y + fila * altoCelda;
      const ap = aparece(L, orden + i, T);
      if (ap.a <= 0) return;
      ctx.save();
      ctx.globalAlpha *= ap.a;
      const dy = (1 - ap.e) * 24 * s;
      const yIc = top + 16 * u + dy;
      if (estilo === "moderno") {
        ctx.fillStyle = c.principal;
        ctx.beginPath();
        ctx.roundRect(cx, yIc, lado, lado, lado * 0.26);
        ctx.fill();
        icono(ctx, cf.icono, cx + (lado - tamIc * 0.8) / 2, yIc + (lado - tamIc * 0.8) / 2, tamIc * 0.8, textoSobre(c.principal, c.profundo), 2.6 * s);
      } else icono(ctx, cf.icono, cx, yIc, tamIc, c.principal, 2.2 * s);
      const avance = recortar((T.local - RET(L, orden + i)) / CUENTA);
      const yN = yIc + lado + 22 * u + tamN * 0.95;
      ctx.fillStyle = tinta;
      ctx.font = estilo === "elegante" ? fuente(500, tamN, true) : fuente(700, tamN);
      const num = cifraEn(cf.valor, cf.decimales, avance);
      ctx.fillText(num, cx, yN);
      if (cf.unidad) {
        const nw = ctx.measureText(num).width;
        ctx.font = fuente(500, tamN * 0.38);
        ctx.fillText(cf.unidad, cx + nw + 10 * u, yN);
      }
      ctx.font = fuente(600, tamEt);
      ctx.fillStyle = estilo === "elegante" ? c.soporte : hexAlfa(tinta, 0.72);
      espaciado(ctx, cf.etiqueta.toUpperCase(), cx, yN + 18 * u + tamEt, 3.5 * u);
      ctx.restore();
    });
    // Filetes entre columnas y filas (Elegante).
    if (estilo === "elegante" && cifras.length > 1) {
      const ap = aparece(L, orden, T);
      ctx.save();
      ctx.globalAlpha *= ap.a * 0.35;
      ctx.fillStyle = c.principal;
      const g = Math.max(1, 1.5 * s);
      ctx.fillRect(x + anchoCol + 6 * s, y + 12 * u, g, (filas * altoCelda - 40 * u) * CURVAS.suave(ap.e));
      for (let f = 1; f < filas; f++) ctx.fillRect(x, y + f * altoCelda - 14 * u, ancho * CURVAS.suave(ap.e), g);
      ctx.restore();
    }
    orden += cifras.length;
    y += filas * altoCelda;
  }

  // Lo que tiene (amenidades de la ficha)
  if (extras.length) {
    y += 24 * u + tamExtra;
    const ap = aparece(L, orden++, T);
    ctx.save();
    ctx.globalAlpha *= ap.a;
    ctx.fillStyle = hexAlfa(tinta, 0.82);
    ctx.font = fuente(400, tamExtra);
    extras.forEach((l, i) => ctx.fillText(l, x, y + i * tamExtra * 1.5 + (1 - ap.e) * 10 * s));
    ctx.restore();
    y += (extras.length - 1) * tamExtra * 1.5 + 16 * u;
  }

  if (d.precio) {
    y += 50 * u + tamP;
    precio(L, d.precio, x, y, tamP, orden + 1, T, "izq", false);
  }
}

/** Segundo en que empieza a contar la cifra de ese orden. */
const RET = (L: Lienzo, orden: number) => 0.25 + orden * L.est.escalonado;

function hexAlfa(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`;
}

function cierre(L: Lienzo, e: Escena, T: Tiempo) {
  const { ctx, w, h, s, z, d, c, estilo } = L;
  const t = L.t;
  fondoLiso(L, L.r.fondoLogo);
  const luz = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.6);
  luz.addColorStop(0, "rgba(255,255,255,0.06)");
  luz.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = luz;
  ctx.fillRect(0, 0, w, h);
  // Movimiento final: todo se acerca muy despacio.
  const k = 1 + 0.035 * CURVAS.suave(T.local / T.dur);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(k, k);
  ctx.translate(-w / 2, -h / 2);
  const centro = w / 2;
  const libre = h - z.arriba - z.abajo;
  const altoLogo = (estilo === "limpio" ? 0.24 : estilo === "moderno" ? 0.22 : 0.3) * libre * (L.vertical ? 1 : 1.05);
  const invit = textoEscena(e, d) || "Escríbeme";
  const tamI = (estilo === "moderno" ? 96 : estilo === "elegante" ? 70 : 46) * s * t;
  const tamC = (estilo === "limpio" ? 34 : 44) * s * t;
  const alto = (L.r.logo ? altoLogo : 120 * s) + 90 * s + tamI + 60 * s + tamC * 2 + 70 * s;
  let y = z.arriba + Math.max(0, (libre - alto) / 2);
  const T0 = { ...T };
  let orden = 0;
  const ap = aparece(L, orden++, T0);
  if (L.r.logo) {
    ctx.save();
    ctx.globalAlpha *= ap.a;
    const kl = 0.94 + 0.06 * ap.e;
    ctx.translate(centro, y + altoLogo / 2);
    ctx.scale(kl, kl);
    ctx.translate(-centro, -(y + altoLogo / 2));
    dibujarLogo(L, centro, y, altoLogo, w - z.izquierda - z.derecha, false, "centro");
    ctx.restore();
    y += altoLogo;
  } else {
    ctx.font = fuente(500, 72 * s * t, true);
    ctx.fillStyle = c.base;
    const l = lineas(ctx, d.nombreCorredor, w - z.izquierda * 2, 2);
    textoAnimado(L, l, centro, y + 72 * s, 84 * s, 72 * s, 0, T0, "centro");
    y += 72 * s + (l.length - 1) * 84 * s + 30 * s;
  }
  // Filetes que se abren desde el centro.
  const ap2 = aparece(L, orden, T0);
  y += 56 * s;
  if (estilo !== "moderno") {
    ctx.save();
    ctx.globalAlpha *= ap2.a;
    ctx.fillStyle = c.principal;
    const largo = 220 * s * CURVAS.suave((T.local - 0.5) / 1.4);
    ctx.fillRect(centro - largo, y, largo * 2, Math.max(1, 1.5 * s));
    ctx.restore();
  }
  y += 40 * s + tamI;
  ctx.fillStyle = estilo === "moderno" ? c.base : c.base;
  ctx.font = estilo === "elegante" ? fuente(500, tamI, true) : fuente(estilo === "moderno" ? 700 : 500, tamI);
  orden = textoAnimado(L, lineas(ctx, invit, w - z.izquierda * 2, 1), centro, y, 0, tamI, orden + 1, T0, "centro");
  y += 50 * s + tamC;
  if (d.contacto) {
    const a = aparece(L, orden++, T0);
    if (a.a > 0) {
      ctx.save();
      ctx.globalAlpha *= a.a;
      ctx.font = fuente(600, tamC);
      const ancho = ctx.measureText(d.contacto).width;
      const ic = tamC * 1.15;
      const total = ic + tamC * 0.45 + ancho;
      const dy = (1 - a.e) * 16 * s;
      if (estilo === "moderno") {
        const padX = tamC * 0.8;
        const altoP = tamC * 2;
        ctx.fillStyle = c.principal;
        ctx.beginPath();
        ctx.roundRect(centro - total / 2 - padX, y - tamC * 1.35 + dy, (total + padX * 2) * CURVAS.expo(a.e), altoP, altoP / 2);
        ctx.fill();
      }
      const color = estilo === "moderno" ? textoSobre(c.principal, c.profundo) : c.principal;
      icono(ctx, "chat", centro - total / 2, y - tamC * 0.9 + dy, ic, color, Math.max(1.5, tamC * 0.07));
      ctx.fillStyle = color;
      ctx.fillText(d.contacto, centro - total / 2 + ic + tamC * 0.45, y + dy);
      ctx.restore();
    }
    y += 70 * s + (estilo === "moderno" ? 20 * s : 0);
  }
  const a = aparece(L, orden++, T0);
  ctx.save();
  ctx.globalAlpha *= a.a;
  ctx.fillStyle = c.soporte;
  ctx.font = fuente(500, 23 * s * t);
  espaciado(ctx, `CÓDIGO ${d.codigo}`, centro, y + (1 - a.e) * 10 * s, 4 * s, "centro");
  ctx.restore();
  ctx.restore();
}

function pintarEscena(L: Lienzo, escenas: Escena[], indice: number, local: number, ultima: boolean) {
  const e = escenas[indice];
  const T: Tiempo = { local, dur: e.duracion, ultima };
  const { ctx } = L;
  ctx.save();
  if (e.tipo === "portada") portada(L, e, indice, T);
  else if (e.tipo === "foto") escenaFoto(L, e, indice, T);
  else if (e.tipo === "datos") escenaDatos(L, e, escenas, T);
  else cierre(L, e, T);
  ctx.restore();
}

/** Barra de avance por segmentos (como en las historias). */
function barra(L: Lienzo, escenas: Escena[], indice: number, local: number) {
  const { ctx, w, s, h } = L;
  const n = escenas.length;
  const margen = 28 * s;
  const sep = 8 * s;
  const alto = (L.estilo === "moderno" ? 6 : 3.5) * s;
  const y = (L.vertical ? 0.035 : 0.03) * h;
  const ancho = (w - margen * 2 - sep * (n - 1)) / n;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = margen + i * (ancho + sep);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.roundRect(x, y, ancho, alto, alto / 2);
    ctx.fill();
    const lleno = i < indice ? 1 : i === indice ? recortar(local / escenas[i].duracion) : 0;
    if (lleno > 0) {
      ctx.fillStyle = L.estilo === "moderno" ? L.c.principal : "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(alto, ancho * lleno), alto, alto / 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function lienzo(ctx: CanvasRenderingContext2D, d: DatosVideo, r: Recursos): Lienzo {
  const { width: w, height: h } = ctx.canvas;
  const vertical = h / w > 1.3;
  return {
    ctx,
    w,
    h,
    s: w / 1080,
    vertical,
    z: zonaSegura(w, h),
    estilo: r.estilo,
    est: ESTILOS_VIDEO[r.estilo],
    r,
    d,
    c: r.colores,
    acento: acentoSobreFoto(r.colores.principal),
    t: vertical ? 1 : 0.86,
  };
}

/** Pinta el cuadro del segundo `t`: la escena, la transición desde la anterior al empezar, la marca de agua y la barra. */
export function dibujarCuadro(ctx: CanvasRenderingContext2D, escenas: Escena[], datos: DatosVideo, recursos: Recursos, t: number) {
  if (escenas.length === 0) return;
  const L = lienzo(ctx, datos, recursos);
  const { w, h } = L;
  const { indice, local } = escenaEn(escenas, t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  // Suavizado simple por cuadro: las fotos que se achican ya vienen achicadas con calidad alta (aEscala).
  ctx.imageSmoothingQuality = "low";
  const ultima = indice === escenas.length - 1;
  const tr = transicionDe(recursos.estilo, escenas, indice);
  const dt = indice > 0 ? duracionTransicion(recursos.estilo, escenas[indice - 1].duracion, escenas[indice].duracion) : 0;
  const enTransicion = !!tr && local < dt;
  const p = enTransicion ? CURVAS.suave(local / dt) : 1;
  const anterior = () => pintarEscena(L, escenas, indice - 1, escenas[indice - 1].duracion + local, false);
  const actual = () => pintarEscena(L, escenas, indice, local, ultima);

  if (!enTransicion) actual();
  else if (tr === "deslizar") {
    ctx.save();
    ctx.translate(-w * 0.35 * p, 0);
    anterior();
    ctx.restore();
    ctx.save();
    ctx.translate(w * (1 - p), 0);
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 14 * L.s;
    actual();
    ctx.restore();
  } else if (tr === "barrido") {
    anterior();
    const borde = w * 1.15 * p;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(borde, 0);
    ctx.lineTo(borde - w * 0.15, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.clip();
    actual();
    ctx.restore();
    // Filete del color de la marca en el borde del barrido.
    ctx.save();
    ctx.globalAlpha = Math.sin(Math.PI * p) * 0.9;
    ctx.strokeStyle = L.c.principal;
    ctx.lineWidth = (L.estilo === "moderno" ? 16 : 3) * L.s;
    ctx.beginPath();
    ctx.moveTo(borde, 0);
    ctx.lineTo(borde - w * 0.15, h);
    ctx.stroke();
    ctx.restore();
  } else if (tr === "zoom") {
    ctx.save();
    const k1 = 1 + 0.16 * p;
    ctx.translate(w / 2, h / 2);
    ctx.scale(k1, k1);
    ctx.translate(-w / 2, -h / 2);
    anterior();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = p;
    const k2 = 1.1 - 0.1 * p;
    ctx.translate(w / 2, h / 2);
    ctx.scale(k2, k2);
    ctx.translate(-w / 2, -h / 2);
    actual();
    ctx.restore();
  } else {
    anterior();
    ctx.save();
    ctx.globalAlpha = p;
    actual();
    ctx.restore();
  }

  // Marca de agua: el logo pequeño arriba a la derecha mientras pasan las fotos (no en portada, datos ni cierre).
  if (L.est.marcaAgua && recursos.logo) {
    const esFoto = (i: number) => escenas[i]?.tipo === "foto";
    const a = enTransicion ? (esFoto(indice) ? p : 0) + (esFoto(indice - 1) ? 1 - p : 0) : esFoto(indice) ? 1 : 0;
    if (a > 0) {
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      dibujarLogo(L, w - L.z.derecha, L.z.arriba, 64 * L.s * L.t, 220 * L.s, true, "der");
      ctx.restore();
    }
  }
  if (L.est.barra) barra(L, escenas, indice, local);
  ctx.globalAlpha = 1;
}

// --- Grabación -------------------------------------------------------------------------------------

/** El formato de video que este navegador sabe grabar: primero MP4 (Safari y Chrome recientes), si no WebM. Con música, uno que lleve audio. */
export function formatoDeGrabacion(conAudio = false): { mime: string; extension: "mp4" | "webm"; h264: boolean } | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)) return null;
  const candidatos: [string, "mp4" | "webm"][] = conAudio
    ? [
        ["video/mp4;codecs=avc1.42E01F,mp4a.40.2", "mp4"],
        ["video/mp4;codecs=avc1,mp4a.40.2", "mp4"],
        ["video/mp4", "mp4"],
        ["video/webm;codecs=vp9,opus", "webm"],
        ["video/webm;codecs=vp8,opus", "webm"],
        ["video/webm", "webm"],
      ]
    : [
        ["video/mp4;codecs=avc1.42E01F", "mp4"],
        ["video/mp4;codecs=avc1", "mp4"],
        ["video/mp4", "mp4"],
        ["video/webm;codecs=vp9", "webm"],
        ["video/webm;codecs=vp8", "webm"],
        ["video/webm", "webm"],
      ];
  // Un "video/mp4" sin avc1 puede salir con VP9 adentro (Chromium sin H.264): sirve, pero no siempre lo aceptan.
  for (const [mime, extension] of candidatos) if (MediaRecorder.isTypeSupported(mime)) return { mime, extension, h264: mime.includes("avc1") };
  return null;
}

type ConAudio = typeof window & { webkitAudioContext?: typeof AudioContext };

/** Máximo para la canción del corredor (se lee en el teléfono; no se sube). */
export const MUSICA_MAX_MB = 25;

/** Lee la canción y dice cuánto dura, o null si el navegador no la entiende. */
export async function revisarMusica(archivo: Blob): Promise<number | null> {
  const AC = window.AudioContext ?? (window as ConAudio).webkitAudioContext;
  if (!AC || archivo.size > MUSICA_MAX_MB * 1024 * 1024) return null;
  const actx = new AC();
  try {
    const b = await actx.decodeAudioData(await archivo.arrayBuffer());
    return b.duration;
  } catch {
    return null;
  } finally {
    actx.close().catch(() => null);
  }
}

/** Fundido de la música: 1,2 s de entrada y 1,8 s de salida, recortada a lo que dura el video. */
export const FUNDIDO_MUSICA = { entrada: 1.2, salida: 1.8, volumen: 0.9 };

/**
 * Graba el video en tiempo real (dura lo que dura el video). Devuelve el archivo. `pintar` dibuja el cuadro
 * del segundo que se le pasa; `alAvanzar` recibe de 0 a 1. Con `musica` (un archivo del corredor), la mezcla
 * en el teléfono con fundido de entrada y salida; no se sube a ningún lado.
 */
export async function grabarVideo(
  canvas: HTMLCanvasElement,
  duracion: number,
  pintar: (t: number) => void,
  o: { alAvanzar?: (x: number) => void; cancelado?: () => boolean; musica?: Blob | null } = {},
): Promise<{ archivo: Blob; mime: string; extension: "mp4" | "webm"; h264: boolean; conMusica: boolean }> {
  // El AudioContext se crea antes de cualquier espera, todavía dentro del toque del botón (Safari lo pide).
  const AC = o.musica ? (window.AudioContext ?? (window as ConAudio).webkitAudioContext) : undefined;
  const actx = AC ? new AC() : null;
  await prepararFuentes();
  let audio: { fuente: AudioBufferSourceNode; ganancia: GainNode; destino: MediaStreamAudioDestinationNode } | null = null;
  if (actx && o.musica) {
    try {
      await actx.resume();
      const buffer = await actx.decodeAudioData(await o.musica.arrayBuffer());
      const fuente = actx.createBufferSource();
      fuente.buffer = buffer;
      fuente.loop = buffer.duration < duracion;
      const ganancia = actx.createGain();
      const destino = actx.createMediaStreamDestination();
      fuente.connect(ganancia).connect(destino);
      audio = { fuente, ganancia, destino };
    } catch {
      actx.close().catch(() => null);
      throw new Error("musica_invalida");
    }
  }
  const formato = formatoDeGrabacion(!!audio) ?? formatoDeGrabacion(false);
  if (!formato) {
    actx?.close().catch(() => null);
    throw new Error("sin_grabacion");
  }
  // Se pinta una vez cada medio segundo antes de grabar: así los fondos desenfocados y las fotos achicadas ya
  // están hechos y la grabación no se traba en el primer cuadro de cada escena.
  for (let t = 0; t < duracion; t += 0.5) pintar(t);
  pintar(0);
  const video = canvas.captureStream(FPS);
  const flujo = audio ? new MediaStream([...video.getVideoTracks(), ...audio.destino.stream.getAudioTracks()]) : video;
  const grabador = new MediaRecorder(flujo, { mimeType: formato.mime, videoBitsPerSecond: 10_000_000, ...(audio ? { audioBitsPerSecond: 160_000 } : {}) });
  const partes: Blob[] = [];
  grabador.ondataavailable = (ev) => ev.data.size && partes.push(ev.data);
  const terminado = new Promise<void>((ok, mal) => {
    grabador.onstop = () => ok();
    grabador.onerror = () => mal(new Error("error_grabacion"));
  });
  grabador.start(500);
  if (audio && actx) {
    const t0 = actx.currentTime;
    const g = audio.ganancia.gain;
    const { entrada, salida, volumen } = FUNDIDO_MUSICA;
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(volumen, t0 + Math.min(entrada, duracion / 3));
    g.setValueAtTime(volumen, t0 + Math.max(duracion / 3, duracion - salida));
    g.linearRampToValueAtTime(0, t0 + duracion);
    audio.fuente.start(t0);
    audio.fuente.stop(t0 + duracion + 0.2);
  }
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
  actx?.close().catch(() => null);
  if (o.cancelado?.()) throw new Error("cancelado");
  const mime = formato.mime.split(";")[0];
  return { archivo: new Blob(partes, { type: mime }), mime, extension: formato.extension, h264: formato.h264, conMusica: !!audio };
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
