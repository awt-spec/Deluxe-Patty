// Lo que va haciendo la asistente, paso a paso, para el panel lateral (sidepanel.html): "Abriendo Escazú, página 2
// de 12", "Leí 18 anuncios · 3 posibles dueños", "Descanso de 1 min…". Reglas puras (sin chrome.*): las prueba
// tests/maquina-extension.test.ts, las usa background.js para anotar y el panel lateral para leer lo guardado.
//
// Cada paso es { icono, texto, t } y solo lleva palabras para la persona: nada del permiso, ni ids, ni direcciones.

export const ICONOS = ["inicio", "abrir", "leer", "espera", "descanso", "pausa", "seguir", "verificacion", "revisar", "listo", "detenida", "error"];
export const MAX_PASOS = 40;
const MAX_TEXTO = 160;

// Los nombres con tilde de las zonas más comunes (el slug de Encuentra24 no las trae).
const TILDES = {
  escazu: "Escazú",
  belen: "Belén",
  "san-jose": "San José",
  tibas: "Tibás",
  "la-union": "La Unión",
  limon: "Limón",
  jaco: "Jacó",
  "perez-zeledon": "Pérez Zeledón",
  poas: "Poás",
  "san-ramon": "San Ramón",
  "ciudad-colon": "Ciudad Colón",
  "san-isidro": "San Isidro",
  "santa-barbara": "Santa Bárbara",
  "vazquez-de-coronado": "Vázquez de Coronado",
  "montes-de-oca": "Montes de Oca",
  "san-pablo": "San Pablo",
};

/**
 * El nombre de la zona de una página del listado: de `.../san-jose-provincia-escazu?page=2` sale "Escazú". Solo de
 * Encuentra24; de lo demás, "".
 */
export function nombreZona(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return "";
  }
  if (u.protocol !== "https:" || u.hostname !== "www.encuentra24.com") return "";
  const slug = (u.pathname.split("/").filter(Boolean).at(-1) ?? "").toLowerCase();
  if (!/^[a-z0-9-]{2,80}$/.test(slug) || /^\d+$/.test(slug)) return "";
  const zona = slug.includes("-provincia-") ? slug.split("-provincia-").at(-1) : slug;
  if (TILDES[zona]) return TILDES[zona];
  return zona
    .split("-")
    .filter(Boolean)
    .map((p, i) => (i > 0 && ["de", "del", "la", "el", "y"].includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Número de la página en la dirección (`?page=N`); sin él, 1. */
export function paginaDeUrl(url) {
  try {
    const n = Number(new URL(url).searchParams.get("page"));
    return Number.isInteger(n) && n > 1 ? n : 1;
  } catch {
    return 1;
  }
}

/**
 * Cuántos anuncios trae la página y cuántos dicen ser del dueño ("Propietario"). Son posibles dueños: la revisión del
 * servidor confirma después cuáles lo son. Cuenta en el payload de Next.js, donde las comillas van escapadas.
 */
export function contarEnPagina(html) {
  if (typeof html !== "string") return { anuncios: 0, propietarios: 0 };
  const anuncios = Math.min(60, (html.match(/advertiserType/g) ?? []).length);
  const propietarios = Math.min(anuncios, (html.match(/advertiserType\\*"\s*:\s*\\*"Propietario/g) ?? []).length);
  return { anuncios, propietarios };
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Una duración corta en palabras: "12 s", "1 min", "2 min". */
export function duracionCorta(ms) {
  const s = Math.max(1, Math.round((Number(ms) || 0) / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.max(1, Math.round(s / 60))} min`;
}

/** Los textos de cada paso, en palabras de todos los días. */
export const textoPaso = {
  inicio: (minutos) => (minutos ? `Empecé a buscar dueños. Tardaré ${minutos}.` : "Empecé a buscar dueños."),
  abrir: (url, pagina, total) => {
    const zona = nombreZona(url);
    const n = paginaDeUrl(url);
    const donde = zona ? `Abriendo ${zona}${n > 1 ? ` (página ${n} de la zona)` : ""}` : "Abriendo la siguiente página";
    return total ? `${donde}, página ${pagina} de ${total}` : donde;
  },
  leer: ({ anuncios, propietarios }) =>
    anuncios === 0
      ? "Esta página no trae anuncios"
      : `Leí ${plural(anuncios, "anuncio", "anuncios")} · ${propietarios === 0 ? "ningún posible dueño" : plural(propietarios, "posible dueño", "posibles dueños")}`,
  espera: (ms) => `Espero ${duracionCorta(ms)} antes de la siguiente página`,
  descanso: (ms) => `Descanso de ${duracionCorta(ms)} para ir a ritmo de persona`,
};

/**
 * El paso que deja un cambio de la máquina de estados (maquina.js), o null si no merece una línea. `nuevo` es el
 * estado después del cambio.
 */
export function pasoDeEvento(evento, nuevo) {
  switch (evento?.tipo) {
    case "pausar":
      return nuevo?.motivoPausa === "actividad"
        ? { icono: "pausa", texto: "En pausa: parece que quieres usar la pestaña" }
        : { icono: "pausa", texto: "En pausa. Toca «Seguir» cuando quieras" };
    case "seguir":
      return { icono: "seguir", texto: "Sigo buscando" };
    case "verificacion":
      return { icono: "verificacion", texto: "Verificación de Encuentra24: toca «Seguir» cuando la completes" };
    case "revisar":
      return { icono: "revisar", texto: "Terminé de leer. Reviso cuáles son dueños directos" };
    case "detener":
      return { icono: "detenida", texto: "Detenida. Guardo lo que alcancé a leer" };
    case "terminar":
      return nuevo?.mensaje ? { icono: nuevo.fase === "detenida" ? "detenida" : "listo", texto: nuevo.mensaje } : null;
    case "fallar":
      return { icono: "error", texto: nuevo?.mensaje || "La búsqueda se cortó" };
    default:
      return null;
  }
}

/** Un paso limpio (o null): icono conocido, texto corto, hora válida. */
export function limpiarPaso(p) {
  if (!p || typeof p !== "object" || !ICONOS.includes(p.icono) || typeof p.texto !== "string") return null;
  const texto = p.texto.replace(/\s+/g, " ").trim().slice(0, MAX_TEXTO);
  if (!texto) return null;
  const t = Number.isFinite(p.t) && p.t > 0 ? Math.round(p.t) : 0;
  return { icono: p.icono, texto, t };
}

/**
 * Agrega un paso a la lista (sin tocar la que recibe). El mismo texto dos veces seguidas no se repite. Se quedan los
 * últimos MAX_PASOS.
 */
export function agregarPaso(lista, paso, ahora = Date.now()) {
  const actual = leerBitacora(lista);
  const p = limpiarPaso({ ...paso, t: paso?.t ?? ahora });
  if (!p) return actual;
  const ultimo = actual.at(-1);
  if (ultimo && ultimo.texto === p.texto && ultimo.icono === p.icono) return actual;
  return [...actual, p].slice(-MAX_PASOS);
}

/** Lo guardado en chrome.storage, validado: solo pasos con su forma, a lo más MAX_PASOS. */
export function leerBitacora(v) {
  if (!Array.isArray(v)) return [];
  return v.map(limpiarPaso).filter(Boolean).slice(-MAX_PASOS);
}

/** La hora de un paso, "10:42" (en la zona del Chrome). */
export function horaPaso(t) {
  if (!Number.isFinite(t) || t <= 0) return "";
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
