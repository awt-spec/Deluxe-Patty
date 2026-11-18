// La tarjeta de arriba de Dueños directos: cómo está la extensión (instalada, al día, conectada, busca sola cada
// semana), la última y la próxima búsqueda y UNA acción que sigue. Y la línea de pasos de la búsqueda en vivo.
// Reglas puras (sin navegador), para probarlas; la forma está en app/panel/duenos/hero.tsx.

import type { EstadoBusquedaExt, EstadoExtension, Lugar } from "./extension-instalar";

export type AccionHero =
  | { tipo: "instalar"; texto: string }
  | { tipo: "actualizar"; texto: string }
  | { tipo: "conectar"; texto: string }
  | { tipo: "buscar"; texto: string }
  | { tipo: "abrir_e24"; texto: string }
  | { tipo: "demo"; texto: string }
  | { tipo: "en_computadora"; texto: string }
  | { tipo: "ninguna" };

export interface EntradaHero {
  demo: boolean;
  /** Dónde se está mirando el panel (null mientras no se sabe: primer dibujo). */
  lugar: Lugar | null;
  estado: EstadoExtension;
  /** La conexión sola está en curso. */
  conectando: boolean;
  /** Hay una búsqueda viva en este navegador (la tarjeta en vivo tiene sus botones). */
  enCurso: boolean;
  /** La versión que trae el panel. */
  version: string;
  /** La página vio la extensión en este navegador (puede darle órdenes). */
  vista: boolean;
}

/** La única acción que se ofrece, en orden: demo, teléfono, instalar, actualizar, conectar y buscar. */
export function accionHero(e: EntradaHero): AccionHero {
  if (e.demo) return { tipo: "demo", texto: "Ver cómo se instala" };
  if (e.enCurso || e.conectando || e.estado.tipo === "buscando") return { tipo: "ninguna" };
  const conectadaServidor = e.estado.tipo === "conectada";
  if (e.lugar && e.lugar !== "aqui") {
    // En el teléfono (o Safari) no hay extensión: si ya está conectada en la computadora, nada que hacer aquí.
    return conectadaServidor ? { tipo: "ninguna" } : { tipo: "en_computadora", texto: "Cómo instalarla en tu computadora" };
  }
  switch (e.estado.tipo) {
    case "no_instalada":
    case "sin_conectar_servidor":
      return { tipo: "instalar", texto: "Instalar la extensión" };
    case "vieja":
    case "nueva_version":
      return { tipo: "actualizar", texto: `Actualizar a ${e.version}` };
    case "sin_conectar":
      return { tipo: "conectar", texto: "Conectar" };
    case "conectada":
      // Sin verla en esta carga (se llegó navegando): está conectada en el servidor, pero esta página no puede
      // darle órdenes. Abrir Encuentra24 deja usar el panel lateral de la extensión.
      return e.vista ? { tipo: "buscar", texto: "Buscar dueños ahora" } : { tipo: "abrir_e24", texto: "Abrir Encuentra24" };
  }
}

export type Marca = "ok" | "falta" | "no_se";

export interface PasoHero {
  clave: "instalada" | "al_dia" | "conectada" | "semanal";
  texto: string;
  marca: Marca;
}

/**
 * Los cuatro puntos que se miran: instalada, al día, conectada y la búsqueda sola de cada semana. `vista`: la página
 * vio la extensión en este navegador (si no, de la versión no se sabe nada).
 */
export function pasosHero(e: { estado: EstadoExtension; version: string; semanal: boolean | null; vista: boolean }): PasoHero[] {
  const t = e.estado.tipo;
  const instalada: Marca =
    t === "sin_conectar" || t === "nueva_version" || t === "vieja" || (t === "conectada" && e.vista) ? "ok" : t === "no_instalada" ? "falta" : "no_se";
  const alDia: Marca = t === "nueva_version" || t === "vieja" ? "falta" : t === "sin_conectar" || (t === "conectada" && e.vista) ? "ok" : t === "no_instalada" ? "falta" : "no_se";
  const conectada: Marca =
    t === "conectada" || t === "vieja" || (e.estado.tipo === "nueva_version" && e.estado.conectada) ? "ok" : t === "buscando" ? "no_se" : "falta";
  const semanal: Marca = conectada !== "ok" ? "no_se" : e.semanal === true ? "ok" : e.semanal === false ? "falta" : "no_se";
  return [
    { clave: "instalada", texto: "Instalada en Chrome", marca: instalada },
    { clave: "al_dia", texto: alDia === "falta" && instalada !== "falta" ? `Falta la ${e.version}` : `Al día · ${e.version}`, marca: alDia },
    { clave: "conectada", texto: "Conectada a tu panel", marca: conectada },
    { clave: "semanal", texto: e.semanal === false ? "Búsqueda semanal apagada" : "Busca sola cada semana", marca: semanal },
  ];
}

export const DIAS_ENTRE_BUSQUEDAS = 7;
const DIA = 86_400_000;

/** "Hoy", "Ayer", "Hace 3 días" o "Todavía no ha buscado". */
export function textoUltimaBusqueda(ultima: string | null, ahora: number): string {
  const t = ultima ? Date.parse(ultima) : NaN;
  if (!Number.isFinite(t)) return "Todavía no ha buscado";
  const dias = Math.max(0, Math.floor((ahora - t) / DIA));
  return dias === 0 ? "Hoy" : dias === 1 ? "Ayer" : `Hace ${dias} días`;
}

/**
 * Cuándo toca la próxima búsqueda sola: 7 días después de la última terminada, mientras Chrome esté abierto (la
 * extensión despierta cada ~6 horas). Apagada o sin conectar, lo dice.
 */
export function textoProximaBusqueda(o: { ultima: string | null; ahora: number; conectada: boolean; semanal: boolean | null }): string {
  if (!o.conectada) return "Cuando la conectes";
  if (o.semanal === false) return "Apagada, enciéndela en el panel de la extensión";
  const t = o.ultima ? Date.parse(o.ultima) : NaN;
  if (!Number.isFinite(t)) return "Hoy, con Chrome abierto";
  const faltan = Math.ceil((t + DIAS_ENTRE_BUSQUEDAS * DIA - o.ahora) / DIA);
  if (faltan <= 0) return "Hoy, con Chrome abierto";
  if (faltan === 1) return "Mañana, con Chrome abierto";
  return `En ${faltan} días, con Chrome abierto`;
}

/** Cuántos dueños trajo la última búsqueda: los guardados en las 12 horas antes de que terminara. */
export function duenosDeLaUltima(creados: readonly string[], ultima: string | null): number {
  const fin = ultima ? Date.parse(ultima) : NaN;
  if (!Number.isFinite(fin)) return 0;
  return creados.filter((c) => {
    const t = Date.parse(c);
    return Number.isFinite(t) && t <= fin + 3_600_000 && t >= fin - 12 * 3_600_000;
  }).length;
}

// --- La búsqueda en vivo ----------------------------------------------------------------------------------

/** El avance del anillo (0–100) y su texto "3/12". Sin total, null (el anillo gira). */
export function avanceBusqueda(e: Pick<EstadoBusquedaExt, "pagina" | "total">): { pct: number; texto: string } | null {
  if (!e.total || e.total <= 0) return null;
  const pagina = Math.min(Math.max(0, e.pagina), e.total);
  return { pct: Math.round((pagina / e.total) * 100), texto: `${pagina}/${e.total}` };
}

export interface PasoVivo {
  texto: string;
  /** Hora (ms) en que se vio por primera vez. */
  en: number;
}

export const PASOS_VIVOS = 5;

/**
 * Suma a la línea de pasos lo que la extensión dice que está haciendo, si cambió (los más nuevos primero, hasta 5).
 * Solo texto corto y de una línea (lo valida leerMensajeDeExtension; aquí se recorta de nuevo por si acaso).
 */
export function sumarPaso(pasos: readonly PasoVivo[], haciendo: string, en: number, max = PASOS_VIVOS): PasoVivo[] {
  const texto = haciendo.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!texto || pasos[0]?.texto === texto) return [...pasos];
  return [{ texto, en }, ...pasos].slice(0, max);
}

export type TonoHero = "verde" | "ambar" | "gris" | "azul";

/** La palabra de estado (como en el panel lateral), el título y una línea, en palabras de todos los días. */
export function encabezadoHero(o: {
  estado: EstadoExtension;
  demo: boolean;
  conectando: boolean;
  enCurso: boolean;
  lugar: Lugar | null;
  asistente: string;
  version: string;
}): { palabra: string; tono: TonoHero; titulo: string; detalle: string } {
  const a = o.asistente.trim() || "Patty";
  if (o.demo) return { palabra: "Demo", tono: "gris", titulo: "Así se ve la extensión", detalle: "En la demo no se conecta de verdad: puedes recorrer la instalación." };
  if (o.enCurso) return { palabra: "Trabajando", tono: "verde", titulo: `${a} está buscando dueños`, detalle: "La puedes pausar o detener desde aquí." };
  if (o.conectando) return { palabra: "Conectando", tono: "azul", titulo: "Conectando con tu panel…", detalle: "Un momento: la extensión está pidiendo su permiso." };
  const enOtro = o.lugar !== null && o.lugar !== "aqui";
  switch (o.estado.tipo) {
    case "buscando":
      return { palabra: "Revisando", tono: "gris", titulo: "Buscando la extensión…", detalle: "Revisando si está en este Chrome." };
    case "conectada":
      return {
        palabra: "Lista",
        tono: "verde",
        titulo: `${a} está lista para buscar dueños`,
        detalle: enOtro ? "Busca desde Chrome de tu computadora; los dueños aparecen aquí." : "Busca sola una vez por semana mientras Chrome esté abierto.",
      };
    case "sin_conectar":
      return { palabra: "Falta un toque", tono: "ambar", titulo: "Instalada, falta conectarla", detalle: "Conéctala a tu panel para que guarde aquí los dueños." };
    case "nueva_version":
      return { palabra: "Actualízala", tono: "ambar", titulo: `Hay una versión nueva: ${o.version}`, detalle: "Son tres pasos y no pierdes nada: sigue conectada." };
    case "vieja":
      return {
        palabra: "Actualízala",
        tono: "ambar",
        titulo: "Conectada, pero no la veo en este Chrome",
        detalle: `Si la instalaste en esta computadora, es una versión anterior: actualízala a la ${o.version}.`,
      };
    case "no_instalada":
    case "sin_conectar_servidor":
      return {
        palabra: "Sin instalar",
        tono: "gris",
        titulo: enOtro ? "Se instala en Chrome de tu computadora" : "Instala la extensión en tu Chrome",
        detalle: `Encuentra24 solo deja leer sus anuncios desde tu Chrome. ${a} busca ahí los dueños por ti.`,
      };
  }
}
