// Subir fotos al sitio web desde el chat de Patty: reglas puras del flujo (las usa el chat en el navegador y se prueban
// solas). Pasos: elegir la casa (solo casas del sitio, DP-XXXXXX y activas) → ¿mejorarlas con IA? → orden y portada →
// tarjeta "¿Las subo?" → resultado. Nada sale hasta "Sí, subir al sitio". Este archivo no importa nada.

export type CasaDelSitio = { id: string; codigo: string; titulo: string; zona: string | null; foto: string | null };

export type FotoEnvio = {
  /** Identificador local (para React y para moverla). */
  id: string;
  /** Miniatura local (blob) para verla en el chat. */
  mini: string;
  /** Ruta en el bucket propio, cuando ya subió (en la demo no sube). */
  camino: string | null;
  /** Versión mejorada con IA, si se pidió y salió bien. */
  mejorada: { camino: string; url: string } | null;
  /** Cuál se manda al sitio. La original nunca se reemplaza: la mejorada va aparte y marcada. */
  usar: "original" | "mejorada";
};

export type PasoEnvio = "casa" | "subiendo" | "mejorar" | "mejorando" | "orden" | "confirmar" | "enviando" | "listo";

export type EnvioSitio = {
  paso: PasoEnvio;
  casa: CasaDelSitio | null;
  fotos: FotoEnvio[];
  /** id de la foto que va de portada (null: la primera del orden). */
  portada: string | null;
  demo: boolean;
  resultado: { fotos: string[]; urlCasa: string | null } | null;
};

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Código del sitio dentro del texto ("dp-01ab2c", "DP 01AB2C"); también parcial ("DP-01"). */
const CODIGO = /\bdp[\s-]?([0-9a-z]{2,6})\b/i;

/**
 * ¿Pide subir fotos al sitio o a una casa? Hace falta un verbo de subir/poner y "fotos" (o "imágenes"), y que diga
 * adónde: el sitio / la página / la web, una casa o un código DP-. "¿Cómo subo fotos?" sin destino es una pregunta.
 */
export function pideSubirAlSitio(texto: string): boolean {
  const t = sinTildes(texto);
  const verbo = /\b(sub[a-z]*|pon[a-z]*|pong[a-z]*|agreg[a-z]*|carg[a-z]*|mand[a-z]*|public[a-z]*)\b/.test(t);
  const fotos = /\b(fotos?|imagen(es)?|fotografias?)\b/.test(t);
  const destino = /\b(sitio|pagina|web|casa|propiedad|apartamento|lote)\b/.test(t) || CODIGO.test(t);
  if (!verbo || !fotos || !destino) return false;
  // "¿Cómo subo fotos a la casa?" es una pregunta de cómo se hace: va a Patty.
  return !/^\s*¿?\s*(como|donde|se puede|puedo)\b/.test(t);
}

const PALABRAS_VACIAS = new Set(
  "sube subir subeme estas estos esas esos las los la el de del a al en y con fotos foto imagenes sitio pagina web casa propiedad por favor patty mi mis que esta este una un".split(" "),
);

/**
 * La casa que el mensaje nombra, si es una sola: primero por código (completo o el comienzo), si no por las palabras
 * del título o la zona ("la casa de Escazú"). null si no nombra ninguna o hay empate (entonces elige el corredor).
 */
export function proponerCasa(texto: string, casas: CasaDelSitio[]): CasaDelSitio | null {
  const t = sinTildes(texto);
  const cod = CODIGO.exec(t)?.[1]?.toUpperCase();
  if (cod) {
    const exacta = casas.filter((c) => c.codigo.toUpperCase() === `DP-${cod}`);
    if (exacta.length === 1) return exacta[0];
    const empiezan = casas.filter((c) => c.codigo.toUpperCase().startsWith(`DP-${cod}`));
    return empiezan.length === 1 ? empiezan[0] : null;
  }
  const palabras = t.split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 3 && !PALABRAS_VACIAS.has(p));
  if (!palabras.length) return null;
  const puntos = casas.map((c) => {
    const donde = sinTildes(`${c.titulo} ${c.zona ?? ""}`);
    return { c, n: palabras.filter((p) => new RegExp(`\\b${p}\\b`).test(donde)).length };
  });
  const mejor = Math.max(...puntos.map((p) => p.n));
  if (mejor === 0) return null;
  const ganadoras = puntos.filter((p) => p.n === mejor);
  return ganadoras.length === 1 ? ganadoras[0].c : null;
}

/** Buscador del paso "¿A qué casa?": por código, título o zona, sin tildes. */
export function filtrarCasas(casas: CasaDelSitio[], consulta: string): CasaDelSitio[] {
  const q = sinTildes(consulta).trim();
  if (!q) return casas;
  const partes = q.split(/\s+/);
  return casas.filter((c) => {
    const donde = sinTildes(`${c.codigo} ${c.titulo} ${c.zona ?? ""}`);
    return partes.every((p) => donde.includes(p));
  });
}

/** Sube o baja una foto en el orden. */
export function moverFotoEnvio(fotos: FotoEnvio[], id: string, dir: -1 | 1): FotoEnvio[] {
  const i = fotos.findIndex((f) => f.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= fotos.length) return fotos;
  const otra = [...fotos];
  [otra[i], otra[j]] = [otra[j], otra[i]];
  return otra;
}

/** Quita una foto del envío; si era la portada, la portada vuelve a ser la primera. */
export function quitarFotoEnvio(e: EnvioSitio, id: string): EnvioSitio {
  return { ...e, fotos: e.fotos.filter((f) => f.id !== id), portada: e.portada === id ? null : e.portada };
}

/** La portada: la elegida si sigue en la lista; si no, la primera. */
export const portadaDe = (e: Pick<EnvioSitio, "fotos" | "portada">): FotoEnvio | null =>
  e.fotos.find((f) => f.id === e.portada) ?? e.fotos[0] ?? null;

/** Lo que va al servidor: en su orden, cada una con su versión elegida; la portada por su índice. */
export function pedidoDeEnvio(e: EnvioSitio): { fotos: { camino: string; usar: "original" | "mejorada" }[]; portada: number } | null {
  const listas = e.fotos.filter((f) => f.camino);
  if (!e.casa || listas.length === 0 || listas.length !== e.fotos.length) return null;
  const portada = portadaDe({ fotos: listas, portada: e.portada });
  return {
    fotos: listas.map((f) => ({ camino: f.camino!, usar: f.usar === "mejorada" && f.mejorada ? "mejorada" : "original" })),
    portada: Math.max(0, listas.findIndex((f) => f.id === portada?.id)),
  };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Líneas de la tarjeta "¿Las subo?" (la primera en negrita). */
export function resumenEnvio(e: EnvioSitio): string[] {
  if (!e.casa) return [];
  const mejoradas = e.fotos.filter((f) => f.usar === "mejorada" && f.mejorada).length;
  const portada = portadaDe(e);
  const n = portada ? e.fotos.indexOf(portada) + 1 : 1;
  return [
    `${e.casa.titulo} (${e.casa.codigo})`,
    `${plural(e.fotos.length, "foto nueva", "fotos nuevas")} al final de la galería del sitio. No se borra ninguna de las que ya tiene.`,
    `Portada: la foto ${n}.`,
    mejoradas
      ? `${plural(mejoradas, "va mejorada", "van mejoradas")} con IA (la original queda guardada). Revísalas: la IA a veces cambia detalles.`
      : "Van las originales, sin IA.",
  ];
}

/** Para el chat, al terminar. */
export function textoResultado(e: EnvioSitio): string {
  const n = e.resultado?.fotos.length || e.fotos.length;
  const casa = e.casa ? `**${e.casa.titulo}** (${e.casa.codigo})` : "la casa";
  if (e.demo) return `Demostración: así quedarían ${plural(n, "foto", "fotos")} en ${casa}. En la demo no se manda nada al sitio.`;
  // El enlace al sitio va en la tarjeta del resultado (el chat solo convierte en botón las rutas del panel).
  return `Listo, subí ${plural(n, "foto", "fotos")} al sitio en ${casa}. Así se ven allá. En unos minutos también aparecen en Mis casas.`;
}
