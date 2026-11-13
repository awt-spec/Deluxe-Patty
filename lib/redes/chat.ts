import { cifrasInventadas } from "./cifras";
import { ESTILOS_LISTA, ESTILOS_VIDEO, type EstiloVideo } from "./estilo-video";
import type { OpcionFoto, TipoOpcion } from "./fotos";
import {
  DURACION_MAX,
  DURACION_MIN,
  MAX_FOTOS_VIDEO,
  TOTAL_MAX,
  ajustar,
  duracionTotal,
  escenaDatos,
  escenaFoto,
  textoCorto,
  type Escena,
  type FormatoVideo,
  type FotoEscena,
} from "./video";

// "Pídeselo a Patty" del estudio de redes: el corredor pide un cambio con sus palabras y el modelo devuelve una
// lista de OPERACIONES (nunca edita nada por su cuenta). Aquí está la parte pura: qué operaciones existen, cómo se
// validan (ids que no existen, textos con cifras fuera de la ficha, duraciones fuera de rango) y cómo se aplican.
// Se usa en el servidor (para validar y contar lo que cambió) y en el navegador (para aplicarlas al estado de
// ahora, con "Deshacer"). Las fotos con IA solo pueden quitar cosas sueltas o poner muebles: `vetoImagen` es el
// respaldo en código de esa regla, antes de gastar en Claude o en OpenAI.

export type PestanaChat = "imagen" | "video" | "texto";

/** Lo más largo que se acepta de un pedido (lo demás se corta). */
export const MAX_PEDIDO = 500;
/** Operaciones que se aplican de un pedido como máximo. */
export const MAX_OPERACIONES = 20;
/** Turnos de la conversación que viajan al modelo como contexto. */
export const MAX_HISTORIAL = 6;

export const limpiarPedido = (t: unknown) =>
  String(t ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, MAX_PEDIDO);

export type TurnoChat = { autor: "corredor" | "asistente"; texto: string };

/** Historial que llega del navegador: solo turnos válidos, los últimos y recortados. */
export function historialValido(h: unknown): TurnoChat[] {
  return (Array.isArray(h) ? h : [])
    .filter((t): t is TurnoChat => (t?.autor === "corredor" || t?.autor === "asistente") && typeof t?.texto === "string")
    .slice(-MAX_HISTORIAL)
    .map((t) => ({ autor: t.autor, texto: t.texto.slice(0, MAX_PEDIDO) }));
}

// --- Fotos con id corto ----------------------------------------------------------------------------

/** Foto de la casa con el id corto que ve el modelo ("F1", "F2"…). */
export interface FotoChat {
  id: string;
  url: string;
  nombre: string;
  ilustrativa: boolean;
  tipo: TipoOpcion;
  /** La foto original de la que sale. */
  original: string;
}

/** Máximo de fotos que se le muestran al modelo en un pedido. */
export const MAX_FOTOS_CHAT = 20;

export function fotosParaChat(opciones: OpcionFoto[]): FotoChat[] {
  return opciones.slice(0, MAX_FOTOS_CHAT).map((o, i) => ({ id: `F${i + 1}`, url: o.url, nombre: o.nombre, ilustrativa: o.ilustrativa, tipo: o.tipo, original: o.original }));
}

const fotoPorId = (fotos: FotoChat[], id: unknown) => {
  const buscado = String(id ?? "").trim().toUpperCase();
  return fotos.find((f) => f.id === buscado) ?? null;
};

// --- Operaciones que devuelve el modelo --------------------------------------------------------------

export const OPS_VIDEO = [
  "mover_escena",
  "portada",
  "quitar_escena",
  "agregar_foto",
  "texto_escena",
  "duracion_escena",
  "duracion_total",
  "estilo",
  "formato",
  "quitar_datos",
  "poner_datos",
  "restaurar",
] as const;
export const OPS_IMAGEN = ["elegir_foto", "mejorar_foto", "quitar_objetos", "amueblar"] as const;

/** Lo que devuelve el modelo, plano: cada operación usa solo los campos que le tocan. */
export interface OperacionCruda {
  op: string;
  /** Escena por su id corto ("E3"). */
  escena?: string | null;
  /** Lugar en el video, desde 1. */
  posicion?: number | null;
  /** Foto por su id corto ("F2"). */
  foto?: string | null;
  texto?: string | null;
  segundos?: number | null;
  /** Estilo, formato o estilo de muebles. */
  valor?: string | null;
}

// --- Video ---------------------------------------------------------------------------------------

export interface EstadoVideo {
  escenas: Escena[];
  estilo: EstiloVideo;
  formato: FormatoVideo;
}

/** Ya validada: las escenas por su id real y las fotos por su dirección. */
export type OperacionVideo =
  | { op: "mover_escena"; escena: string; posicion: number }
  | { op: "portada"; foto: FotoEscena; nombre: string }
  | { op: "quitar_escena"; escena: string }
  | { op: "agregar_foto"; foto: FotoEscena; nombre: string; posicion: number | null }
  | { op: "texto_escena"; escena: string; texto: string }
  | { op: "duracion_escena"; escena: string; segundos: number }
  | { op: "duracion_total"; segundos: number }
  | { op: "estilo"; estilo: EstiloVideo }
  | { op: "formato"; formato: FormatoVideo }
  | { op: "quitar_datos" }
  | { op: "poner_datos" }
  | { op: "restaurar" };

const NOMBRE_ESCENA: Record<Escena["tipo"], string> = { portada: "Portada", foto: "Foto", datos: "Datos de la casa", cierre: "Cierre" };

/**
 * Lo que hay ahora en el video, para el modelo: una línea por escena con su id corto (E1…), el tipo, la foto
 * (por su id F…), el texto y los segundos. Lo arma el código; los textos van como dato.
 */
export function resumenVideo(estado: EstadoVideo, fotos: FotoChat[]): string {
  const idDe = new Map(fotos.map((f) => [f.url, f.id]));
  const lineas = estado.escenas.map((e, i) => {
    const foto = e.foto ? ` · foto ${idDe.get(e.foto.url) ?? "(otra)"}${e.foto.ilustrativa ? " (ilustrativa)" : ""}` : "";
    return `E${i + 1}: ${NOMBRE_ESCENA[e.tipo]}${foto} · ${String(e.duracion).replace(".", ",")} s · texto: «${e.texto.replace(/[«»<>]/g, "")}»`;
  });
  return [
    ...lineas,
    `Total: ${String(duracionTotal(estado.escenas)).replace(".", ",")} s (máximo ${TOTAL_MAX}). Estilo: ${ESTILOS_VIDEO[estado.estilo].nombre}. Formato: ${estado.formato}.`,
  ].join("\n");
}

const sinTildes = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const estiloDe = (v: unknown): EstiloVideo | null => {
  const t = sinTildes(String(v ?? "")).trim();
  return ESTILOS_LISTA.find((e) => t === e || t === sinTildes(ESTILOS_VIDEO[e].nombre)) ?? null;
};
const formatoDe = (v: unknown): FormatoVideo | null => {
  const t = sinTildes(String(v ?? "")).trim();
  if (t === "vertical" || t === "historia" || t === "reel") return "vertical";
  if (t === "cuadrado" || t === "cuadrada" || t === "post") return "cuadrado";
  return null;
};
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

export interface VideoNormalizado {
  ops: OperacionVideo[];
  /** Operaciones que no se pudieron usar (ids que no existen, campos que faltan). */
  ignoradas: number;
  /** Textos que traían cifras que no están en la ficha. */
  conCifras: number;
}

/**
 * Valida lo que devolvió el modelo contra el video de ahora: escenas por su id corto (E1…) y fotos por el suyo
 * (F1…), sin inventar ninguna. Los textos se recortan a 60 caracteres y si traen una cifra que no está en la ficha
 * se descartan. Lo que no cuadra se ignora y se cuenta.
 */
export function normalizarVideo(crudas: unknown, estado: EstadoVideo, fotos: FotoChat[], permitidas: Set<string>): VideoNormalizado {
  const lista = (Array.isArray(crudas) ? crudas : []).slice(0, MAX_OPERACIONES) as OperacionCruda[];
  const ops: OperacionVideo[] = [];
  let ignoradas = 0;
  let conCifras = 0;
  const escenaDe = (ref: unknown): Escena | null => {
    const m = /^E?(\d{1,2})$/i.exec(String(ref ?? "").trim());
    return m ? (estado.escenas[Number(m[1]) - 1] ?? null) : null;
  };
  for (const c of lista) {
    const op = String(c?.op ?? "");
    const escena = escenaDe(c?.escena);
    const foto = fotoPorId(fotos, c?.foto);
    let nueva: OperacionVideo | null = null;
    switch (op) {
      case "mover_escena": {
        const pos = numero(c.posicion);
        if (escena && pos !== null && pos >= 1) {
          // "Pon la piscina de primera": la primera es la portada, así que esa foto pasa a la portada.
          if (pos <= 1 && escena.tipo === "foto" && escena.foto) {
            const f = fotos.find((x) => x.url === escena.foto!.url);
            nueva = { op: "portada", foto: escena.foto, nombre: f?.nombre ?? "esa foto" };
          } else if (escena.tipo === "foto" || escena.tipo === "datos") nueva = { op, escena: escena.id, posicion: Math.round(pos) };
        }
        break;
      }
      case "portada":
        if (foto) nueva = { op, foto: { url: foto.url, ilustrativa: foto.ilustrativa }, nombre: foto.nombre };
        else if (escena?.tipo === "foto" && escena.foto) nueva = { op, foto: escena.foto, nombre: "esa foto" };
        break;
      case "quitar_escena":
        if (escena?.tipo === "foto") nueva = { op, escena: escena.id };
        else if (escena?.tipo === "datos") nueva = { op: "quitar_datos" };
        else if (foto) {
          const conEsa = estado.escenas.find((e) => e.tipo === "foto" && e.foto?.url === foto.url);
          if (conEsa) nueva = { op, escena: conEsa.id };
        }
        break;
      case "agregar_foto": {
        const pos = numero(c.posicion);
        if (foto) nueva = { op, foto: { url: foto.url, ilustrativa: foto.ilustrativa }, nombre: foto.nombre, posicion: pos !== null && pos >= 1 ? Math.round(pos) : null };
        break;
      }
      case "texto_escena": {
        if (!escena || typeof c.texto !== "string") break;
        const texto = textoCorto(c.texto);
        if (texto && cifrasInventadas(texto, permitidas).length > 0) {
          conCifras++;
          continue;
        }
        nueva = { op, escena: escena.id, texto };
        break;
      }
      case "duracion_escena": {
        const s = numero(c.segundos);
        if (escena && s !== null && s > 0) nueva = { op, escena: escena.id, segundos: Math.min(DURACION_MAX, Math.max(DURACION_MIN, Math.round(s * 2) / 2)) };
        break;
      }
      case "duracion_total": {
        const s = numero(c.segundos);
        if (s !== null && s > 0) nueva = { op, segundos: Math.min(TOTAL_MAX, Math.round(s * 2) / 2) };
        break;
      }
      case "estilo": {
        const e = estiloDe(c.valor);
        if (e) nueva = { op, estilo: e };
        break;
      }
      case "formato": {
        const f = formatoDe(c.valor);
        if (f) nueva = { op, formato: f };
        break;
      }
      case "quitar_datos":
      case "poner_datos":
      case "restaurar":
        nueva = { op };
        break;
    }
    if (nueva) ops.push(nueva);
    else ignoradas++;
  }
  return { ops, ignoradas, conCifras };
}

/**
 * Reparte un largo total entre las escenas (de 2 a 6 s cada una, hasta 45 s). Si no caben, quita fotos del final;
 * si con todas al máximo no se llega, las deja en 6 s.
 */
export function repartirDuracion(escenas: Escena[], objetivo: number): { escenas: Escena[]; quitadas: number } {
  const meta = Math.min(TOTAL_MAX, Math.max(DURACION_MIN, Math.round(objetivo * 2) / 2));
  let lista = escenas.map((e) => ({ ...e }));
  let quitadas = 0;
  while (lista.length * DURACION_MIN > meta) {
    const fotos = lista.filter((e) => e.tipo === "foto");
    const ultima = fotos[fotos.length - 1];
    if (!ultima) break;
    lista = lista.filter((e) => e !== ultima);
    quitadas++;
  }
  if (lista.length === 0) return { escenas: lista, quitadas };
  const base = Math.min(DURACION_MAX, Math.max(DURACION_MIN, Math.floor((meta / lista.length) * 2) / 2));
  lista.forEach((e) => (e.duracion = base));
  // Lo que sobra va de a medio segundo: primero portada, datos y cierre (llevan texto), luego las fotos.
  const orden = [...lista].sort((a, b) => Number(a.tipo === "foto") - Number(b.tipo === "foto"));
  let resto = Math.round((meta - base * lista.length) * 2) / 2;
  let vueltas = 0;
  while (resto >= 0.5 && vueltas++ < 200) {
    const e = orden.find((x) => x.duracion < DURACION_MAX && x.duracion <= Math.min(...orden.map((y) => y.duracion)));
    if (!e) break;
    e.duracion += 0.5;
    resto -= 0.5;
  }
  return { escenas: lista, quitadas };
}

export interface ContextoVideo {
  /** El guion sin IA (para "déjalo como estaba"). */
  porDefecto: () => Escena[];
}

const segundosTexto = (n: number) => `${String(n).replace(".", ",")} s`;

/** Aplica las operaciones ya validadas, en orden, y dice en palabras simples qué cambió. */
export function aplicarVideo(estado: EstadoVideo, ops: OperacionVideo[], ctx: ContextoVideo): { estado: EstadoVideo; hechos: string[] } {
  let escenas = estado.escenas.map((e) => ({ ...e }));
  let { estilo, formato } = estado;
  const hechos: string[] = [];
  const lugar = (id: string) => escenas.findIndex((e) => e.id === id);
  const nombre = (i: number) => `la escena ${i + 1}`;
  for (const o of ops) {
    switch (o.op) {
      case "mover_escena": {
        const i = lugar(o.escena);
        if (i < 0) break;
        const [e] = escenas.splice(i, 1);
        const conCierre = escenas[escenas.length - 1]?.tipo === "cierre" ? 1 : 0;
        const destino = Math.min(Math.max(o.posicion - 1, 1), escenas.length - conCierre);
        escenas.splice(destino, 0, e);
        escenas = ajustar(escenas);
        hechos.push(`moví ${e.tipo === "foto" ? "esa foto" : "los datos"} al lugar ${lugar(e.id) + 1}`);
        break;
      }
      case "portada": {
        const portada = escenas.find((e) => e.tipo === "portada");
        if (!portada || portada.foto?.url === o.foto.url) break;
        const anterior = portada.foto;
        const conEsa = escenas.find((e) => e.tipo === "foto" && e.foto?.url === o.foto.url);
        portada.foto = o.foto;
        if (conEsa && anterior) conEsa.foto = anterior;
        else if (anterior && escenas.filter((e) => e.tipo === "foto").length < MAX_FOTOS_VIDEO) escenas.splice(1, 0, escenaFoto(anterior));
        escenas = ajustar(escenas);
        hechos.push(`puse ${o.nombre === "esa foto" ? "esa foto" : `la ${o.nombre.toLowerCase()}`} de portada`);
        break;
      }
      case "quitar_escena": {
        const i = lugar(o.escena);
        if (i < 0 || escenas[i].tipo !== "foto") break;
        escenas.splice(i, 1);
        escenas = ajustar(escenas);
        hechos.push(`quité ${nombre(i)}`);
        break;
      }
      case "agregar_foto": {
        if (escenas.filter((e) => e.tipo === "foto").length >= MAX_FOTOS_VIDEO) {
          hechos.push(`no agregué la ${o.nombre.toLowerCase()}: ya hay ${MAX_FOTOS_VIDEO} fotos`);
          break;
        }
        const nueva = escenaFoto(o.foto);
        const datosOCierre = escenas.findIndex((e) => e.tipo === "datos" || e.tipo === "cierre");
        const conCierre = escenas[escenas.length - 1]?.tipo === "cierre" ? 1 : 0;
        const destino = o.posicion ? Math.min(Math.max(o.posicion - 1, 1), escenas.length - conCierre) : datosOCierre < 0 ? escenas.length : datosOCierre;
        escenas.splice(destino, 0, nueva);
        escenas = ajustar(escenas);
        hechos.push(`agregué la ${o.nombre.toLowerCase()}`);
        break;
      }
      case "texto_escena": {
        const i = lugar(o.escena);
        if (i < 0) break;
        escenas[i] = { ...escenas[i], texto: o.texto };
        hechos.push(o.texto ? `cambié el texto de ${nombre(i)}` : `le quité el texto a ${nombre(i)}`);
        break;
      }
      case "duracion_escena": {
        const i = lugar(o.escena);
        if (i < 0) break;
        escenas[i] = { ...escenas[i], duracion: o.segundos };
        escenas = ajustar(escenas);
        hechos.push(`${nombre(i)} dura ${segundosTexto(escenas[i]?.duracion ?? o.segundos)}`);
        break;
      }
      case "duracion_total": {
        const r = repartirDuracion(escenas, o.segundos);
        escenas = ajustar(r.escenas);
        const total = duracionTotal(escenas);
        hechos.push(`ahora dura ${segundosTexto(total)}`);
        if (r.quitadas) hechos.push(`para que cupiera quité ${r.quitadas === 1 ? "la última foto" : `las últimas ${r.quitadas} fotos`}`);
        if (total < o.segundos) hechos.push(`con estas escenas llega hasta ${segundosTexto(total)} (cada una dura como mucho ${DURACION_MAX} s)`);
        break;
      }
      case "estilo":
        estilo = o.estilo;
        hechos.push(`estilo ${ESTILOS_VIDEO[o.estilo].nombre}`);
        break;
      case "formato":
        formato = o.formato;
        hechos.push(o.formato === "vertical" ? "formato vertical (historias y reels)" : "formato cuadrado (publicación)");
        break;
      case "quitar_datos":
        if (!escenas.some((e) => e.tipo === "datos")) break;
        escenas = ajustar(escenas.filter((e) => e.tipo !== "datos"));
        hechos.push("quité la escena de datos");
        break;
      case "poner_datos": {
        if (escenas.some((e) => e.tipo === "datos")) break;
        const cierre = escenas.findIndex((e) => e.tipo === "cierre");
        escenas.splice(cierre < 0 ? escenas.length : cierre, 0, escenaDatos());
        escenas = ajustar(escenas);
        hechos.push("puse la escena de datos");
        break;
      }
      case "restaurar":
        escenas = ctx.porDefecto();
        hechos.push("lo dejé como al principio");
        break;
    }
  }
  return { estado: { escenas, estilo, formato }, hechos };
}

// --- Imagen --------------------------------------------------------------------------------------

export const ESTILOS_MUEBLES = ["moderno", "clasico", "minimalista", "tropical"] as const;
export type EstiloMuebles = (typeof ESTILOS_MUEBLES)[number];

export type OperacionImagen =
  | { op: "elegir_foto"; url: string; nombre: string }
  | { op: "mejorar_foto"; url: string; nombre: string }
  | { op: "quitar_objetos"; url: string; nombre: string; que: string }
  | { op: "amueblar"; url: string; nombre: string; estilo: EstiloMuebles; cuarto: string | null };

/** Las operaciones que gastan en IA de imágenes (piden confirmación antes). */
export const esCostosa = (o: OperacionImagen) => o.op !== "elegir_foto";

export interface ImagenNormalizada {
  ops: OperacionImagen[];
  ignoradas: number;
  /** Si el modelo o el código negaron una edición: la frase para el corredor. */
  negada: string | null;
}

/**
 * Valida lo que devolvió el modelo para la pestaña Imagen. Las ediciones con IA salen de la foto ORIGINAL (la
 * ilustrativa o la mejorada se resuelven a su original) y solo se hace una por pedido. Cada una pasa por
 * `vetoImagen` aunque el modelo la haya dado por buena.
 */
export function normalizarImagen(crudas: unknown, fotos: FotoChat[], elegida: string | null, pedido: string): ImagenNormalizada {
  const lista = (Array.isArray(crudas) ? crudas : []).slice(0, MAX_OPERACIONES) as OperacionCruda[];
  const ops: OperacionImagen[] = [];
  let ignoradas = 0;
  let negada: string | null = null;
  const actual = fotos.find((f) => f.url === elegida) ?? fotos[0] ?? null;
  const originalDe = (f: FotoChat) => fotos.find((x) => x.url === f.original) ?? f;
  for (const c of lista) {
    const op = String(c?.op ?? "");
    const foto = fotoPorId(fotos, c?.foto) ?? (op === "elegir_foto" ? null : actual);
    if (!foto) {
      ignoradas++;
      continue;
    }
    if (op === "elegir_foto") {
      ops.push({ op, url: foto.url, nombre: foto.nombre });
      continue;
    }
    if (!(OPS_IMAGEN as readonly string[]).includes(op)) {
      ignoradas++;
      continue;
    }
    if (ops.some(esCostosa)) {
      // Una imagen con IA por pedido (y una confirmación por imagen).
      ignoradas++;
      continue;
    }
    const base = originalDe(foto);
    if (op === "mejorar_foto") {
      ops.push({ op, url: base.url, nombre: base.nombre });
      continue;
    }
    const detalle = typeof c.texto === "string" ? c.texto.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    const veto = vetoImagen(pedido) ?? vetoImagen(op === "quitar_objetos" ? `quita ${detalle}` : detalle);
    if (veto) {
      negada = veto;
      continue;
    }
    if (op === "quitar_objetos") {
      if (!detalle) {
        ignoradas++;
        continue;
      }
      ops.push({ op, url: base.url, nombre: base.nombre, que: detalle });
    } else {
      const v = sinTildes(String(c.valor ?? "")).trim();
      const estilo = (ESTILOS_MUEBLES as readonly string[]).includes(v) ? (v as EstiloMuebles) : "moderno";
      ops.push({ op: "amueblar", url: base.url, nombre: base.nombre, estilo, cuarto: detalle ? detalle.slice(0, 60) : null });
    }
  }
  return { ops, ignoradas, negada };
}

export const NO_CAMBIA_CASA =
  "Eso cambiaría la casa de verdad, así que no lo hago. Con IA solo puedo quitar cosas sueltas (carros, personas, basureros, cables, cosas tiradas) o poner muebles y decoración.";
export const NO_TAPA_DANOS =
  "Eso taparía un daño o defecto de la casa (humedad, grietas, manchas), y quien la compra o alquila tiene que verlo como es. Puedo quitar cosas sueltas o poner muebles.";

// Defectos: nunca se tapan, se pida como se pida.
const DEFECTOS = /\b(humed\w*|grietas?|fisuras?|rajad\w*|moho|hongos?|goteras?|filtracion\w*|manchas?|manchad\w*|oxid\w*|herrumbre|danos?|danad\w*|deterior\w*|despintad\w*|descascar\w*|podrid\w*|quebrad\w*|rot[oa]s?|desgastad\w*|salitre|comejen|termitas?)\b/;
// Lo que es de la casa (o de su entorno) y no se agrega, quita ni cambia.
const ESTRUCTURA =
  /\b(piscinas?|albercas?|jacuzzis?|ventan\w*|vidrios?|pisos?|vistas?|paisaje|jardin\w*|cesped|zacate|grama|arbol\w*|palmeras?|pared|paredes|muros?|tapias?|techos?|cielos?|cielorraso|cuartos?|habitacion\w*|dormitorios?|banos?|cocinas?|terrazas?|balcon\w*|puertas?|porton\w*|escaleras?|metros?|m2|m²|columnas?|chimeneas?|ranchos?|garajes?|cocheras?|fachadas?|montan\w*|mar|playas?|lagos?|rios?|volcan\w*|edificios?|construccion\w*|verjas?|rejas?|portones?|aceras?|calles?|postes?|tendido|lote|terreno|patio|azotea|planta alta|segundo piso|piso de arriba)\b/;
const VERBOS =
  /\b(agrega\w*|anad\w*|pon|pone\w*|ponle\w*|ponga\w*|coloca\w*|mete\w*|incluy\w*|suma\w*|crea\w*|construy\w*|haz|hazl\w*|hacer|cambia\w*|reemplaza\w*|sustituy\w*|pinta\w*|agranda\w*|amplia\w*|alarga\w*|arregla\w*|repara\w*|mejora\w*|quita\w*|borra\w*|elimina\w*|saca\w*|desaparec\w*|oculta\w*|tapa\w*|cubr\w*|escond\w*|disimula\w*|retoca\w*|corrig\w*|limpia\w*)\b/;
const AGRANDAR = /\b(mas|menos) (grande|amplio|amplia|alto|alta|ancho|ancha|largo|larga|chico|chica|pequeno|pequena)\b/;
// "en la sala", "del garaje", "al cuarto": el lugar donde se hace algo no es lo que se cambia.
const LUGAR = /\b(en|al|a|del|de|desde|dentro de|sobre|frente a|junto a|cerca de|para|hacia|por)\s+(el|la|los|las|un|una|mi|su|este|esta)?\s*[a-z0-9²]+/g;

/**
 * Respaldo en código de las reglas de las fotos con IA, antes de llamar a Claude o a OpenAI: ningún pedido que
 * tape un defecto, ni que agregue, quite o cambie algo de la casa (piscina, ventanas, pisos, vista, jardín,
 * cuartos, metros). Devuelve la frase para el corredor, o null si se puede.
 */
export function vetoImagen(texto: string): string | null {
  const t = sinTildes(texto);
  if (DEFECTOS.test(t)) return NO_TAPA_DANOS;
  if (!VERBOS.test(t)) return null;
  const objeto = t.replace(LUGAR, " ");
  if (ESTRUCTURA.test(objeto) || AGRANDAR.test(objeto)) return NO_CAMBIA_CASA;
  return null;
}

// --- Demo (sin IA) ---------------------------------------------------------------------------------

/**
 * En la demo no se gasta IA: el código entiende pedidos simples y devuelve las mismas operaciones que daría el
 * modelo (y pasan por la misma validación).
 */
export function interpretarDemo(pestana: "video" | "imagen", pedido: string, estado: { escenas?: Escena[] }): { respuesta: string; operaciones: OperacionCruda[] } {
  const t = sinTildes(pedido);
  const ops: OperacionCruda[] = [];
  if (pestana === "imagen") {
    const foto = /\bfoto\s*(\d{1,2})\b/.exec(t);
    const ref = foto ? `F${foto[1]}` : null;
    if (/\bmejora/.test(t)) ops.push({ op: "mejorar_foto", foto: ref });
    else if (/\bamuebl|\bmuebles?\b|\bdecora/.test(t)) ops.push({ op: "amueblar", foto: ref, valor: ESTILOS_MUEBLES.find((e) => t.includes(e)) ?? "moderno" });
    else if (/\b(quita|borra|elimina|saca)\w*\s+(.+)/.test(t)) ops.push({ op: "quitar_objetos", foto: ref, texto: /\b(?:quita|borra|elimina|saca)\w*\s+(.+)/.exec(t)![1] });
    else if (ref) ops.push({ op: "elegir_foto", foto: ref });
    return { respuesta: ops.length ? "(Demostración) Listo, eso haría." : "(Demostración) Aquí entiendo pedidos como «usa la foto 2», «mejora la foto», «quita el carro» o «amuebla la sala»." , operaciones: ops };
  }
  const total = duracionTotal(estado.escenas ?? []);
  const seg = /(\d{1,2})\s*(s\b|seg)/.exec(t);
  if (seg) ops.push({ op: "duracion_total", segundos: Number(seg[1]) });
  else if (/mas corto|mas rapido|acorta/.test(t)) ops.push({ op: "duracion_total", segundos: Math.max(10, total - 8) });
  else if (/mas largo|alarga|mas lento/.test(t)) ops.push({ op: "duracion_total", segundos: total + 8 });
  const estilo = ESTILOS_LISTA.find((e) => t.includes(e));
  if (estilo) ops.push({ op: "estilo", valor: estilo });
  if (/cuadrad/.test(t)) ops.push({ op: "formato", valor: "cuadrado" });
  else if (/vertical|historia|reel/.test(t)) ops.push({ op: "formato", valor: "vertical" });
  const quitar = /(?:quita|borra|elimina|saca)\w*\s+(?:la\s+)?(?:escena|foto)\s*(\d{1,2})/.exec(t);
  if (quitar) ops.push({ op: "quitar_escena", escena: `E${quitar[1]}` });
  if (/sin (los )?datos|quita (los )?datos/.test(t)) ops.push({ op: "quitar_datos" });
  else if (/(pon|agrega)\w* (los )?datos/.test(t)) ops.push({ op: "poner_datos" });
  if (/como estaba|de nuevo|desde cero|original/.test(t)) ops.push({ op: "restaurar" });
  return {
    respuesta: ops.length
      ? "(Demostración) Listo."
      : "(Demostración) Aquí entiendo pedidos simples como «hazlo de 15 segundos», «estilo moderno», «cuadrado» o «quita la escena 3».",
    operaciones: ops,
  };
}

