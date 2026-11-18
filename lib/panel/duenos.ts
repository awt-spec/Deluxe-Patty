// Dueños directos (app/panel/duenos): el embudo de captación, la tarjeta de cada dueño y el primer mensaje que el
// corredor le manda él mismo por WhatsApp. Reglas puras, sin base ni navegador, para poder probarlas.
// La asistente nunca escribe en frío: el enlace wa.me solo abre WhatsApp con el texto listo; lo envía el corredor.

export const ETAPAS_DUENO = [
  { clave: "nuevo", nombre: "Encontrados", ayuda: "Todavía no les escribes. Escríbeles tú por WhatsApp.", paso: "Ya le escribí", siguiente: "contactado" },
  { clave: "contactado", nombre: "Les escribí", ayuda: "Esperando que respondan. Si pasan unos días, escríbeles otra vez.", paso: "Respondió", siguiente: "respondio" },
  { clave: "respondio", nombre: "Respondieron", ayuda: "Coordina ir a ver la casa.", paso: "Ya vi la casa", siguiente: "visitada" },
  { clave: "visitada", nombre: "Visité la casa", ayuda: "Propón vender la casa con ellos.", paso: "Firmó conmigo", siguiente: "captado" },
  { clave: "captado", nombre: "Firmaron", ayuda: "Pásala a Mis casas para publicarla.", paso: null, siguiente: null },
  { clave: "publicada", nombre: "Publicadas", ayuda: "Ya están en Mis casas.", paso: null, siguiente: null },
] as const;

export type EtapaDueno = (typeof ETAPAS_DUENO)[number]["clave"];

export const esEtapaDueno = (v: unknown): v is EtapaDueno => ETAPAS_DUENO.some((e) => e.clave === v);

export interface PasoEmbudo {
  clave: EtapaDueno;
  nombre: string;
  /** Los que están ahora en esta etapa. */
  ahora: number;
  /** Los que llegaron a esta etapa (están en ella o más adelante). */
  llegaron: number;
  /** De los que llegaron a la etapa anterior, qué parte llegó a esta (0–100, entero). Null en la primera o sin base. */
  conversion: number | null;
}

/** El embudo desde la etapa de cada dueño (lo descartado no entra). */
export function embudoDuenos(estados: readonly string[]): PasoEmbudo[] {
  const ahora = ETAPAS_DUENO.map((e) => estados.filter((s) => s === e.clave).length);
  const llegaron = ahora.map((_, i) => ahora.slice(i).reduce((a, b) => a + b, 0));
  return ETAPAS_DUENO.map((e, i) => ({
    clave: e.clave,
    nombre: e.nombre,
    ahora: ahora[i],
    llegaron: llegaron[i],
    conversion: i === 0 || llegaron[i - 1] === 0 ? null : Math.round((llegaron[i] / llegaron[i - 1]) * 100),
  }));
}

/** La etapa que se abre: la pedida o, si no, la primera con dueños (lo que más pide atención). */
export function etapaElegida(pedida: string | undefined, embudo: PasoEmbudo[]): EtapaDueno {
  if (esEtapaDueno(pedida)) return pedida;
  return embudo.find((p) => p.ahora > 0)?.clave ?? "nuevo";
}

/** "Casi seguro que es el dueño" según el puntaje de la revisión (0–100). */
export function confianzaDueno(puntaje: number | null): { texto: string; tono: "verde" | "azul" | "gris" } {
  if (puntaje === null || !Number.isFinite(puntaje)) return { texto: "Sin revisar", tono: "gris" };
  if (puntaje >= 80) return { texto: "Casi seguro es el dueño", tono: "verde" };
  if (puntaje >= 60) return { texto: "Probablemente el dueño", tono: "azul" };
  return { texto: "Quizá sea el dueño", tono: "gris" };
}

// --- Por qué creemos que es el dueño ------------------------------------------------------------------------

/** "Muy probable · 82 %": el medidor de la tarjeta, del puntaje de la revisión (0–100). */
export function medidorConfianza(puntaje: number | null, esDueno = true): { pct: number | null; etiqueta: string; tono: "verde" | "azul" | "ambar" | "gris" } {
  if (puntaje === null || !Number.isFinite(puntaje)) return { pct: null, etiqueta: "Sin revisar", tono: "gris" };
  const pct = Math.max(0, Math.min(100, Math.round(puntaje)));
  if (!esDueno) return { pct, etiqueta: "Poco probable", tono: "ambar" };
  if (pct >= 80) return { pct, etiqueta: "Muy probable", tono: "verde" };
  if (pct >= 60) return { pct, etiqueta: "Probable", tono: "azul" };
  return { pct, etiqueta: "Hay dudas", tono: "ambar" };
}

const sinTildesMin = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Frases que mencionan agencia o corredor pero cuentan a favor ("sin intermediarios", "no es agencia"). */
const A_FAVOR_FUERTE = /sin (intermediari|corredor|comision|agencia)|trato directo|dueno directo|no (es|parece|menciona|habla de|usa) (una |un )?(agencia|corredor|inmobiliaria|comision|agente|empresa)|primera persona|una sola (propiedad|casa|publicacion)|un solo anuncio/;
/** Señales de corredor o de duda. */
const EN_CONTRA = /comercial|agencia|inmobiliari|empresa|corredor|agente|broker|realty|comision|colega|oficina|firma|codigo|tercera persona|varias|muchas|multiples|varios anuncios|destacad|pagad|verificad.*empresa|licencia|duda|no (dice|declara|se sabe|queda claro)|sin (nombre|precio|fotos|datos)|generic|poco claro|sospech|parece de/;
/** Señales de dueño. */
const A_FAVOR = /propietari|dueno|persona|particular|vendo mi|mi casa|familia|personal|detalle|una sola|primera persona|directo/;

/**
 * ¿La señal cuenta a favor o en contra de que sea el dueño? Para los textos sueltos de búsquedas viejas (las nuevas ya
 * traen su lado). Primero lo que nombra al corredor pero a favor ("sin intermediarios"), después lo de corredor o duda.
 * Lo que no se entiende queda a favor: la revisión ya decidió que es el dueño y las señales justifican esa decisión.
 */
export function ladoDeSenal(texto: string): "pro" | "contra" {
  const t = sinTildesMin(texto);
  if (A_FAVOR_FUERTE.test(t)) return "pro";
  if (EN_CONTRA.test(t)) return "contra";
  if (A_FAVOR.test(t)) return "pro";
  return "pro";
}

/** Las razones de la tarjeta, separadas en A favor y En contra / dudas (hasta 3 de cada una, cortas). */
export function razonesDueno(razones: readonly { texto: string; lado: "pro" | "contra" | null }[]): { aFavor: string[]; enContra: string[] } {
  const aFavor: string[] = [];
  const enContra: string[] = [];
  for (const r of razones) {
    const texto = r.texto.length > 90 ? `${r.texto.slice(0, 88).trimEnd()}…` : r.texto;
    const corto = texto.charAt(0).toUpperCase() + texto.slice(1);
    ((r.lado ?? ladoDeSenal(r.texto)) === "pro" ? aFavor : enContra).push(corto);
  }
  return { aFavor: aFavor.slice(0, 3), enContra: enContra.slice(0, 3) };
}

const DIA = 86_400_000;

/** "hoy", "ayer", "hace 3 días", "hace 2 semanas", "hace 3 meses". */
export function haceCuanto(iso: string | null, ahora: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const dias = Math.max(0, Math.floor((ahora - t) / DIA));
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 14) return `hace ${dias} días`;
  if (dias < 60) return `hace ${Math.floor(dias / 7)} semanas`;
  return `hace ${Math.floor(dias / 30)} meses`;
}

/** Días sin moverse de etapa (para "Sin movimiento hace N días"), o null. */
export function diasQuieto(iso: string | null, ahora: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((ahora - t) / DIA)) : null;
}

/** El primer mensaje, amable y corto, que el corredor le manda él mismo al dueño. Sin cifras ni promesas. */
export function mensajeParaDueno({ nombre, titulo, zona, corredor }: { nombre?: string | null; titulo?: string | null; zona?: string | null; corredor?: string | null }): string {
  const primerNombre = (nombre ?? "").trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, "") ?? "";
  const saludo = primerNombre && primerNombre.length > 1 ? `Hola, ${primerNombre}, buenas.` : "Hola, buenas.";
  const quien = (corredor ?? "").trim() ? ` Le escribo de ${(corredor ?? "").trim()}, corredores de bienes raíces.` : " Soy corredora de bienes raíces.";
  const casa = (titulo ?? "").trim() ? `su anuncio «${(titulo ?? "").trim().slice(0, 80)}»` : "su anuncio";
  const donde = (zona ?? "").trim() ? ` en ${(zona ?? "").trim()}` : "";
  return `${saludo}${quien} Vi ${casa}${donde} en Encuentra24. ¿Le puedo contar cómo le ayudaríamos a venderla? Si no le interesa, con gusto no le vuelvo a escribir. ¡Gracias!`;
}

/** Enlace wa.me con el mensaje listo (lo abre y lo envía el corredor). Null si el teléfono no sirve. */
export function enlaceParaDueno(telefono: string | null, mensaje: string): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (digitos.length < 8 || digitos.length > 15) return null;
  // Un número de Costa Rica guardado sin el 506.
  const numero = digitos.length === 8 ? `506${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

export type AccionDueno =
  | { tipo: "whatsapp"; texto: string; href: string }
  | { tipo: "anuncio"; texto: string; href: string }
  | { tipo: "etapa"; texto: string; estado: EtapaDueno }
  | { tipo: "mis_casas"; texto: string }
  | { tipo: "ver_casa"; texto: string; propiedadId: string }
  | null;

/**
 * La acción principal de cada dueño según su etapa (una sola) y la que la sigue. En "Encontrados" lo principal es
 * escribirle (por WhatsApp si hay número; si no, desde el anuncio) y "Ya le escribí" queda al lado.
 */
export function accionesDueno(
  etapa: EtapaDueno,
  d: { url: string; telefono: string | null; propiedadId: string | null; mensaje: string },
): { principal: AccionDueno; segunda: AccionDueno } {
  const wa = enlaceParaDueno(d.telefono, d.mensaje);
  const e = ETAPAS_DUENO.find((x) => x.clave === etapa)!;
  const avanzar: AccionDueno = e.paso && e.siguiente ? { tipo: "etapa", texto: e.paso, estado: e.siguiente } : null;
  if (etapa === "nuevo") {
    return {
      principal: wa ? { tipo: "whatsapp", texto: "Escribirle por WhatsApp", href: wa } : { tipo: "anuncio", texto: "Escribirle desde el anuncio", href: d.url },
      segunda: avanzar,
    };
  }
  if (etapa === "contactado") return { principal: avanzar, segunda: wa ? { tipo: "whatsapp", texto: "Escribirle otra vez", href: wa } : null };
  if (etapa === "captado") return { principal: { tipo: "mis_casas", texto: "Pasarla a Mis casas" }, segunda: null };
  if (etapa === "publicada") return { principal: d.propiedadId ? { tipo: "ver_casa", texto: "Ver en Mis casas", propiedadId: d.propiedadId } : null, segunda: null };
  return { principal: avanzar, segunda: null };
}

// --- Corredores conocidos -------------------------------------------------------------------------------------

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Busca por nombre, empresa o teléfono (sin tildes ni mayúsculas; en el teléfono solo cuentan los dígitos). */
export function filtrarConocidos<T extends { nombre: string | null; telefono: string | null; empresa: string | null }>(lista: T[], consulta: string): T[] {
  const q = sinTildes(consulta.trim()).slice(0, 80);
  if (!q) return lista;
  const digitos = q.replace(/\D/g, "");
  return lista.filter((c) => {
    if (sinTildes(`${c.nombre ?? ""} ${c.empresa ?? ""}`).includes(q)) return true;
    return digitos.length >= 3 && (c.telefono ?? "").replace(/\D/g, "").includes(digitos);
  });
}
