// Qué muestra el panel lateral (sidepanel.html) a partir de lo guardado en chrome.storage: la cabecera con la
// asistente, la búsqueda en curso con sus botones y la lista de pasos. Reglas puras (sin chrome.* ni DOM): las prueba
// tests/maquina-extension.test.ts y las usa sidepanel.js, que solo dibuja con textContent.
import { horaPaso, leerBitacora } from "./bitacora.js";
import { activa, textoFase } from "./maquina.js";
import { estadoPublico } from "./mensajes.js";
import { textoRestante } from "./ritmo.js";

/** Sin latido por este tiempo, la búsqueda se dio por interrumpida (el trabajador de fondo ya no la lleva). */
export const LATIDO_MAX_MS = 90_000;
/**
 * Con el latido más viejo que esto (se renueva cada 4 s), el panel lateral le pregunta al trabajador de fondo (mensaje
 * "estado"): si se reinició, al despertar marca la búsqueda como interrumpida y el panel deja de mostrar "buscando" en
 * unos segundos. Preguntarle a uno que sigue vivo no cambia nada.
 */
export const LATIDO_PREGUNTAR_MS = 3_000;

/** ¿Hay que preguntarle al trabajador de fondo si la búsqueda sigue? */
export function latidoViejo(datos, ahora = Date.now()) {
  const b = datos?.busqueda ? estadoPublico(datos.busqueda) : null;
  return !!b && activa(b.fase) && ahora - (b.latido ?? 0) > LATIDO_PREGUNTAR_MS;
}

/** El detalle en la verificación: "Todavía veo la verificación…" si la persona tocó Seguir sin resolverla. */
function detalleVerificacion(b) {
  return typeof b.mensaje === "string" && b.mensaje.startsWith("Todavía") ? b.mensaje : textoFase(b);
}

const TITULOS = {
  buscando: (n) => `${n} está buscando dueños`,
  pausada: (n) => `${n} está en pausa`,
  verificacion: () => "Encuentra24 pide que confirmes que eres tú",
  revisando: (n) => `${n} está revisando lo que leyó`,
};

/** El nombre de la asistente, limpio (el de la base llega al empezar una búsqueda). */
export function nombreAsistente(v) {
  const n = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return n || "Patty";
}

/**
 * `datos`: { token, corredor, asistente, busqueda, bitacora, tokens } tal como están en chrome.storage.local. Devuelve lo que se
 * dibuja; nunca el permiso.
 */
export function vistaPanel(datos, ahora = Date.now()) {
  const d = datos && typeof datos === "object" ? datos : {};
  const nombre = nombreAsistente(d.asistente);
  const conectada = typeof d.token === "string" && d.token.length > 0;
  const corredor = typeof d.corredor === "string" ? d.corredor.slice(0, 80) : "";
  const b = d.busqueda ? estadoPublico(d.busqueda) : null;
  const viva = !!b && activa(b.fase) && ahora - (b.latido ?? 0) < LATIDO_MAX_MS;
  const cortada = !!b && activa(b.fase) && !viva;

  const tono = viva ? (b.fase === "buscando" || b.fase === "revisando" ? "trabajando" : b.fase === "verificacion" ? "aviso" : "pausa") : "quieta";
  const cabecera = {
    nombre,
    inicial: nombre.charAt(0).toUpperCase(),
    conexion: conectada ? (corredor ? `Conectada a ${corredor}` : "Conectada a tu panel") : "Sin conectar",
    conectada,
    // "trabajando" anima el aro del avatar.
    tono,
    // La palabra junto al punto de estado.
    estado: !conectada ? "Sin conectar" : viva ? ESTADOS[b.fase] ?? ESTADOS.buscando : "Lista",
    progreso: viva && b.total ? Math.min(1, b.pagina / b.total) : null,
    progresoTexto: viva && b.total ? `Página ${Math.min(b.pagina, b.total)} de ${b.total}` : "",
  };

  let enCurso = null;
  if (viva) {
    const partes = [];
    if (b.restanteMs && (b.fase === "buscando" || b.fase === "pausada")) partes.push(textoRestante(b.restanteMs));
    enCurso = {
      fase: b.fase,
      // El anillo: "3/12" al centro y cuánto lleva (0 a 1); sin total, sin número.
      avance: b.total ? { pct: Math.min(1, b.pagina / b.total), texto: `${Math.min(b.pagina, b.total)}/${b.total}` } : null,
      titulo: (TITULOS[b.fase] ?? TITULOS.buscando)(nombre),
      detalle: b.fase === "buscando" ? b.haciendo || "Buscando…" : b.fase === "verificacion" ? detalleVerificacion(b) : textoFase(b),
      tiempo: partes.join(" · "),
      // Los mismos pedidos que la barra y el panel: los valida mensajes.js y los aplica maquina.js.
      botones: {
        pausar: b.fase === "buscando",
        seguir: b.fase === "pausada" || b.fase === "verificacion",
        detener: b.fase !== "revisando",
        detenerTexto: b.fase === "verificacion" ? "Dejarlo para después" : "Detener",
      },
    };
  }

  let resultado = null;
  if (cortada) resultado = { texto: "La búsqueda se interrumpió. Toca «Buscar dueños ahora» para seguir.", error: true };
  else if (b && !viva && b.mensaje) resultado = { texto: b.mensaje, error: b.fase === "error" };

  // Lo más nuevo arriba.
  const pasos = leerBitacora(d.bitacora)
    .map((p) => ({ icono: p.icono, texto: p.texto, hora: horaPaso(p.t) }))
    .reverse();

  return { conectada, cabecera, enCurso, resultado, pasos, grupos: agruparPasos(pasos), tokens: vistaTokens(d.tokens) };
}

const ESTADOS = { buscando: "Trabajando", pausada: "En pausa", verificacion: "Te necesita", revisando: "Revisando" };

/** Cuántos pasos se ven abiertos; los demás quedan plegados en "Ver N pasos anteriores". */
export const PASOS_VISIBLES = 6;

/**
 * Los pasos (lo más nuevo primero) juntados por minuto: los seguidos con la misma hora van en un grupo. Los primeros
 * grupos (hasta PASOS_VISIBLES pasos, y al menos uno) quedan abiertos; el resto, plegado.
 */
export function agruparPasos(pasos, visibles = PASOS_VISIBLES) {
  const grupos = [];
  for (const p of Array.isArray(pasos) ? pasos : []) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.hora === p.hora) ultimo.pasos.push(p);
    else grupos.push({ hora: p.hora, pasos: [p] });
  }
  const recientes = [];
  let cuenta = 0;
  for (const g of grupos) {
    if (recientes.length > 0 && cuenta + g.pasos.length > visibles) break;
    recientes.push(g);
    cuenta += g.pasos.length;
  }
  const anteriores = grupos.slice(recientes.length);
  return { recientes, anteriores, ocultos: anteriores.reduce((n, g) => n + g.pasos.length, 0) };
}

// --- Tokens de IA del mes ------------------------------------------------------------------------------------

export const NIVELES_TOKENS = ["bien", "poco", "agotado", "sin_tope"];
/** Con esto o menos de lo que queda (sobre el total), quedan pocos. */
export const POCO = 0.15;

const entero = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null);

/**
 * El campo `tokens` de GET /api/extension/estado, validado: { total, usados, restantes, pct, nivel } o null (sin
 * datos, o con datos que no se entienden). El nivel que manda el servidor vale si es uno conocido; si no, se calcula.
 */
export function limpiarTokens(t) {
  if (!t || typeof t !== "object" || Array.isArray(t)) return null;
  const total = entero(t.total);
  const usados = entero(t.usados);
  if (total === null || usados === null) return null;
  const restantes = entero(t.restantes) ?? Math.max(0, total - usados);
  const pct = typeof t.pct === "number" && Number.isFinite(t.pct) ? Math.max(0, Math.min(100, t.pct)) : null;
  let nivel = NIVELES_TOKENS.includes(t.nivel) ? t.nivel : null;
  if (!nivel) nivel = total === 0 ? "sin_tope" : restantes <= 0 ? "agotado" : restantes / total <= POCO ? "poco" : "bien";
  return { total, usados, restantes, pct, nivel };
}

/** 1240 → "1.240" (punto de miles, como en el panel). */
export function miles(n) {
  return String(Math.max(0, Math.round(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * La tarjeta "Tokens de IA": null si no hay datos (no se muestra). `uso` (0 a 1) es lo gastado, para la barra; sin
 * tope no hay barra.
 */
export function vistaTokens(t) {
  const k = limpiarTokens(t);
  if (!k) return null;
  if (k.nivel === "sin_tope") {
    return { nivel: k.nivel, texto: `${miles(k.usados)} usados este mes`, detalle: "Sin tope este mes", uso: null, aviso: "" };
  }
  const uso = k.total > 0 ? Math.min(1, k.usados / k.total) : 1;
  const texto = `${miles(Math.min(k.usados, k.total))} de ${miles(k.total)} este mes`;
  if (k.nivel === "agotado") return { nivel: k.nivel, texto, detalle: "", uso: 1, aviso: "Se acabaron los tokens de este mes" };
  return {
    nivel: k.nivel,
    texto,
    detalle: k.nivel === "poco" ? `Quedan pocos: ${miles(k.restantes)}` : `Quedan ${miles(k.restantes)}`,
    uso,
    aviso: "",
  };
}

// --- Inicio (sin búsqueda en curso) ----------------------------------------------------------------------------

/**
 * El botón "Leer este anuncio": solo se puede en la página de un anuncio de Encuentra24; si no, dice por qué.
 * `motivo` va debajo del botón (y en aria-describedby).
 */
export function accionLeer({ enAnuncio = false, leyendo = false } = {}) {
  if (!enAnuncio) {
    return { activo: false, texto: "Leer este anuncio", motivo: "Abre un anuncio de Encuentra24 en esta ventana y aquí se activa." };
  }
  if (leyendo) return { activo: false, texto: "Leyendo el anuncio…", motivo: "Lo guardo en tu panel con sus fotos." };
  return { activo: true, texto: "Leer este anuncio", motivo: "Lo guardo en tu panel con sus fotos." };
}

/** "Última búsqueda: hace 2 días" para la tarjeta del último resultado (o "" si no se sabe). */
export function textoUltima(dias) {
  if (typeof dias !== "number" || !Number.isFinite(dias) || dias < 0) return "";
  const n = Math.round(dias);
  return `Última búsqueda: ${n === 0 ? "hoy" : n === 1 ? "ayer" : `hace ${n} días`}`;
}
