import type { Propiedad } from "../datos/tipos";
import { cifrasInventadas, cifrasPermitidas } from "./cifras";
import { datosCortos, etiquetaCasa, precioCasa } from "./texto";

// Video corto para redes armado con las fotos reales de la casa (sin IA que genere video: inventaría
// detalles). Aquí está la parte pura: las escenas, sus tiempos y la revisión del guion que propone la IA.
// El dibujo en el lienzo (canvas) y la grabación viven en el navegador. El precio y los datos de la casa
// los escribe siempre el código; la IA solo propone el orden de las fotos y un texto corto por foto.

export type FormatoVideo = "vertical" | "cuadrado";
export const FORMATOS_VIDEO: Record<FormatoVideo, { ancho: number; alto: number; nombre: string }> = {
  vertical: { ancho: 1080, alto: 1920, nombre: "Vertical (historias, reels y TikTok)" },
  cuadrado: { ancho: 1080, alto: 1080, nombre: "Cuadrado (publicación)" },
};

export const FPS = 30;
export const DURACION_MIN = 2;
export const DURACION_MAX = 6;
export const TOTAL_MAX = 45;
export const MAX_TEXTO_ESCENA = 60;
export const MAX_FOTOS_VIDEO = 12;

export type TipoEscena = "portada" | "foto" | "datos" | "cierre";

export interface FotoEscena {
  url: string;
  ilustrativa: boolean;
}

export interface Escena {
  id: string;
  tipo: TipoEscena;
  /** Portada y fotos llevan foto. */
  foto?: FotoEscena;
  /** Texto corto que se puede editar (en la portada, el título; en datos, el encabezado; en el cierre, la invitación). */
  texto: string;
  duracion: number;
}

/** Lo que sale de la ficha de la casa y del corredor: lo escribe el código, nunca el modelo. */
export interface DatosVideo {
  titulo: string;
  etiqueta: string;
  precio: string | null;
  operacion: string;
  /** "En venta" o "En alquiler". */
  operacionCorta: string;
  /** Zona o cantón, para la portada (con el ícono de ubicación). */
  lugar: string | null;
  datos: string[];
  /** Los mismos datos con su cifra, para la escena de datos (íconos y números que cuentan). Solo lo que trae la ficha. */
  cifras: DatoCifra[];
  extras: string[];
  codigo: string;
  contacto: string | null;
  nombreCorredor: string;
  /** Cifras que pueden salir en el video: las de la ficha, el contacto y el código. */
  permitidas: string[];
}

export type IconoDato = "cuartos" | "banos" | "construccion" | "terreno";

export interface DatoCifra {
  icono: IconoDato;
  valor: number;
  decimales: 0 | 1;
  /** "m²" o vacío. */
  unidad: string;
  etiqueta: string;
}

/** Cada dato con cifra que trae la ficha (y ninguno que no traiga). */
export function cifrasDeCasa(p: Pick<CasaVideo, "habitaciones" | "banos" | "m2_construccion" | "m2_terreno">): DatoCifra[] {
  const n = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v));
  const lista: (DatoCifra | null)[] = [
    n(p.habitaciones) ? { icono: "cuartos", valor: n(p.habitaciones)!, decimales: 0, unidad: "", etiqueta: n(p.habitaciones) === 1 ? "Habitación" : "Habitaciones" } : null,
    n(p.banos)
      ? { icono: "banos", valor: n(p.banos)!, decimales: Number.isInteger(n(p.banos)) ? 0 : 1, unidad: "", etiqueta: n(p.banos) === 1 ? "Baño" : "Baños" }
      : null,
    n(p.m2_construccion) ? { icono: "construccion", valor: n(p.m2_construccion)!, decimales: 0, unidad: "m²", etiqueta: "Construcción" } : null,
    n(p.m2_terreno) ? { icono: "terreno", valor: n(p.m2_terreno)!, decimales: 0, unidad: "m²", etiqueta: "Terreno" } : null,
  ];
  return lista.filter((x): x is DatoCifra => !!x);
}

type CasaVideo = Pick<
  Propiedad,
  "titulo" | "codigo" | "tipo" | "operacion" | "precio" | "moneda" | "zona" | "canton" | "habitaciones" | "banos" | "m2_construccion" | "m2_terreno" | "amenidades"
>;

export function datosDelVideo(p: CasaVideo, contacto: string | null, nombreCorredor: string): DatosVideo {
  const datos = datosCortos(p);
  if (p.m2_construccion && p.m2_terreno) datos.push(`${Number(p.m2_terreno).toLocaleString("es-CR")} m² de terreno`);
  const extras = (p.amenidades ?? []).slice(0, 4);
  const precio = precioCasa(p);
  const cifras = cifrasDeCasa(p);
  return {
    titulo: p.titulo,
    etiqueta: etiquetaCasa(p),
    precio,
    operacion: p.operacion === "alquiler" ? "EN ALQUILER" : "EN VENTA",
    operacionCorta: p.operacion === "alquiler" ? "En alquiler" : "En venta",
    lugar: p.zona ?? p.canton ?? null,
    datos,
    cifras,
    extras,
    codigo: p.codigo,
    contacto,
    nombreCorredor,
    permitidas: [
      ...cifrasPermitidas(
        p.titulo,
        precio,
        p.precio === null || p.precio === undefined ? null : String(p.precio),
        ...datos,
        ...cifras.map((c) => String(c.valor)),
        ...extras,
        p.codigo,
        contacto,
        nombreCorredor,
        p.zona,
        p.canton,
      ),
    ],
  };
}

let siguienteId = 0;
const nuevoId = (tipo: TipoEscena) => `${tipo}-${++siguienteId}`;

const limitar = (n: number) => Math.min(DURACION_MAX, Math.max(DURACION_MIN, Math.round(n * 2) / 2));

/** Recorta un texto a `max` caracteres sin cortar una palabra a la mitad. */
export function textoCorto(t: string, max = MAX_TEXTO_ESCENA): string {
  const limpio = t.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max + 1).lastIndexOf(" ");
  return limpio.slice(0, corte > max * 0.5 ? corte : max).replace(/[\s,.;:–-]+$/, "");
}

export function escenaFoto(foto: FotoEscena, texto = "", duracion = 3): Escena {
  return { id: nuevoId("foto"), tipo: "foto", foto, texto: textoCorto(texto), duracion: limitar(duracion) };
}

/** Escena de datos nueva (el encabezado se puede cambiar; los datos los pone la ficha). */
export const escenaDatos = (): Escena => ({ id: nuevoId("datos"), tipo: "datos", texto: "Lo que tiene", duracion: 4 });

/** Guion sin IA: portada con la primera foto, una escena por cada otra foto, los datos y el cierre. */
export function guionPorDefecto(fotos: FotoEscena[], datos: Pick<DatosVideo, "titulo">, max = 7): Escena[] {
  if (fotos.length === 0) return [];
  const [portada, ...resto] = fotos;
  return ajustar([
    { id: nuevoId("portada"), tipo: "portada", foto: portada, texto: textoCorto(datos.titulo), duracion: 4 },
    ...resto.slice(0, max).map((f) => escenaFoto(f)),
    { id: nuevoId("datos"), tipo: "datos", texto: "Lo que tiene", duracion: 4 },
    { id: nuevoId("cierre"), tipo: "cierre", texto: "Escríbeme", duracion: 4 },
  ]);
}

export const duracionTotal = (escenas: Escena[]) => escenas.reduce((s, e) => s + e.duracion, 0);

/**
 * Deja el guion en regla: portada primero y cierre al final, duraciones de 2 a 6 s, textos cortos, hasta 12
 * fotos y no más de 45 s (primero se acortan las fotos y, si no alcanza, se quitan las últimas).
 */
export function ajustar(escenas: Escena[]): Escena[] {
  const portada = escenas.find((e) => e.tipo === "portada");
  const cierre = escenas.find((e) => e.tipo === "cierre");
  let conDatos = false;
  let cuantas = 0;
  const medio = escenas.filter((e) => {
    if (e.tipo === "datos") return conDatos ? false : (conDatos = true);
    return e.tipo === "foto" && ++cuantas <= MAX_FOTOS_VIDEO;
  });
  let lista = [portada, ...medio, cierre]
    .filter((e): e is Escena => !!e)
    .map((e) => ({ ...e, duracion: limitar(e.duracion), texto: textoCorto(e.texto) }));
  const sobra = () => duracionTotal(lista) - TOTAL_MAX;
  // Primero se acortan las fotos más largas, medio segundo por vez.
  while (sobra() > 0) {
    const larga = lista.filter((e) => e.tipo === "foto" && e.duracion > DURACION_MIN).sort((a, b) => b.duracion - a.duracion)[0];
    if (!larga) break;
    larga.duracion -= 0.5;
  }
  // Si aún sobra, se quitan las últimas fotos.
  while (sobra() > 0) {
    const fotos = lista.filter((e) => e.tipo === "foto");
    const ultima = fotos[fotos.length - 1];
    if (!ultima) break;
    lista = lista.filter((e) => e !== ultima);
  }
  // Y si aún sobra (solo portada, datos y cierre), se acortan esas.
  while (sobra() > 0) {
    const larga = lista.filter((e) => e.duracion > DURACION_MIN).sort((a, b) => b.duracion - a.duracion)[0];
    if (!larga) break;
    larga.duracion -= 0.5;
  }
  return lista;
}

/** Sube (-1) o baja (+1) una escena del medio; la portada y el cierre no se mueven. */
export function mover(escenas: Escena[], indice: number, delta: -1 | 1): Escena[] {
  const destino = indice + delta;
  const fija = (e?: Escena) => !e || e.tipo === "portada" || e.tipo === "cierre";
  if (fija(escenas[indice]) || fija(escenas[destino])) return escenas;
  const copia = [...escenas];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
}

/** Quita una escena de foto (portada, datos y cierre siempre van). */
export function quitar(escenas: Escena[], indice: number): Escena[] {
  return escenas[indice]?.tipo === "foto" ? escenas.filter((_, i) => i !== indice) : escenas;
}

/** Agrega una foto antes de los datos (o del cierre). */
export function agregarFoto(escenas: Escena[], foto: FotoEscena): Escena[] {
  if (escenas.filter((e) => e.tipo === "foto").length >= MAX_FOTOS_VIDEO) return escenas;
  const antes = escenas.findIndex((e) => e.tipo === "datos" || e.tipo === "cierre");
  const copia = [...escenas];
  copia.splice(antes < 0 ? copia.length : antes, 0, escenaFoto(foto));
  return ajustar(copia);
}

/** Qué escena se ve en el segundo `t` y cuánto lleva de ella. */
export function escenaEn(escenas: Escena[], t: number): { indice: number; local: number } {
  let inicio = 0;
  for (let i = 0; i < escenas.length; i++) {
    if (t < inicio + escenas[i].duracion || i === escenas.length - 1) return { indice: i, local: Math.max(0, Math.min(t - inicio, escenas[i].duracion)) };
    inicio += escenas[i].duracion;
  }
  return { indice: 0, local: 0 };
}

// --- Guion propuesto por la IA ---------------------------------------------------------------------

export interface FotoParaGuion {
  /** Id corto que ve el modelo ("F1", "F2"…). */
  id: string;
  url: string;
  nombre: string;
  ilustrativa: boolean;
}

export type GuionRevisado =
  | { ok: true; escenas: { url: string; texto: string }[]; quitados: number }
  | { ok: false; motivo: string };

/**
 * Revisa lo que devolvió el modelo: solo fotos de la lista (por id, sin repetir), textos de hasta 60
 * caracteres y sin cifras que no estén en la ficha (ese texto se deja vacío). Nunca trae precio ni datos:
 * esas escenas las escribe el código.
 */
export function revisarGuion(crudo: unknown, fotos: FotoParaGuion[], permitidas: Set<string>): GuionRevisado {
  const lista = Array.isArray((crudo as { escenas?: unknown })?.escenas) ? (crudo as { escenas: unknown[] }).escenas : null;
  if (!lista) return { ok: false, motivo: "La IA no devolvió un guion. Inténtalo de nuevo." };
  const porId = new Map(fotos.map((f) => [f.id.toUpperCase(), f]));
  const usadas = new Set<string>();
  let quitados = 0;
  const escenas: { url: string; texto: string }[] = [];
  for (const e of lista) {
    const id = String((e as { foto?: unknown })?.foto ?? "").trim().toUpperCase();
    const foto = porId.get(id);
    if (!foto || usadas.has(id)) continue;
    usadas.add(id);
    let texto = textoCorto(String((e as { texto?: unknown })?.texto ?? ""));
    if (texto && cifrasInventadas(texto, permitidas).length > 0) {
      texto = "";
      quitados++;
    }
    escenas.push({ url: foto.url, texto });
  }
  if (escenas.length === 0) return { ok: false, motivo: "La IA no eligió ninguna foto de la casa. Inténtalo de nuevo." };
  return { ok: true, escenas: escenas.slice(0, MAX_FOTOS_VIDEO), quitados };
}

/** Aplica un guion revisado: la primera foto va a la portada y el resto como escenas, en ese orden. */
export function aplicarGuion(escenas: Escena[], guion: { url: string; texto: string }[], fotos: FotoEscena[]): Escena[] {
  const porUrl = new Map(fotos.map((f) => [f.url, f]));
  const elegidas = guion.filter((g) => porUrl.has(g.url));
  if (elegidas.length === 0) return escenas;
  const portada = escenas.find((e) => e.tipo === "portada");
  const datos = escenas.find((e) => e.tipo === "datos") ?? { id: nuevoId("datos"), tipo: "datos" as const, texto: "Lo que tiene", duracion: 4 };
  const cierre = escenas.find((e) => e.tipo === "cierre") ?? { id: nuevoId("cierre"), tipo: "cierre" as const, texto: "Escríbeme", duracion: 4 };
  const [primera, ...resto] = elegidas;
  return ajustar([
    { id: portada?.id ?? nuevoId("portada"), tipo: "portada", foto: porUrl.get(primera.url)!, texto: portada?.texto ?? "", duracion: portada?.duracion ?? 4 },
    ...resto.map((g) => escenaFoto(porUrl.get(g.url)!, g.texto)),
    datos,
    cierre,
  ]);
}

/** Guion simulado para la demo (no gasta IA): las fotos en su orden con frases sin cifras. */
export function guionDemo(fotos: FotoParaGuion[]): { url: string; texto: string }[] {
  const frases = ["Así te recibe", "Espacios llenos de luz", "Para disfrutar en familia", "Cada detalle cuenta", "Imagínate aquí"];
  return fotos.slice(0, MAX_FOTOS_VIDEO).map((f, i) => ({ url: f.url, texto: i === 0 ? "" : frases[(i - 1) % frases.length] }));
}
