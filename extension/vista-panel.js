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
 * `datos`: { token, corredor, asistente, busqueda, bitacora } tal como están en chrome.storage.local. Devuelve lo que se
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

  const cabecera = {
    nombre,
    inicial: nombre.charAt(0).toUpperCase(),
    conexion: conectada ? (corredor ? `Conectada a ${corredor}` : "Conectada") : "Sin conectar",
    conectada,
    // "trabajando" anima el aro del avatar.
    tono: viva ? (b.fase === "buscando" || b.fase === "revisando" ? "trabajando" : b.fase === "verificacion" ? "aviso" : "pausa") : "quieta",
    progreso: viva && b.total ? Math.min(1, b.pagina / b.total) : null,
    progresoTexto: viva && b.total ? `Página ${b.pagina} de ${b.total}` : "",
  };

  let enCurso = null;
  if (viva) {
    const partes = [];
    if (b.restanteMs && (b.fase === "buscando" || b.fase === "pausada")) partes.push(textoRestante(b.restanteMs));
    enCurso = {
      fase: b.fase,
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

  return { conectada, cabecera, enCurso, resultado, pasos };
}
