// Panel lateral de la extensión (desde la 1.4.0; rediseñado en la 1.5.0): se abre con el botón de la extensión, junto a la página. Muestra a la
// asistente trabajando (cabecera, avance y cada paso) y, en reposo, lo que antes hacía el popup: Leer este anuncio,
// Buscar dueños ahora, la búsqueda semanal y el último resultado.
//
// Solo lee chrome.storage (lo escribe background.js) y le pide cosas al trabajador de fondo con los mismos mensajes
// que validan mensajes.js y maquina.js. Dibuja con textContent y createElement, sin armar HTML con texto.
import { APP } from "./config.js";
import { esPaginaDeAnuncio } from "./comun.js";
import { accionLeer, latidoViejo, nombreAsistente, textoUltima, vistaPanel } from "./vista-panel.js";
import { esFormularioDePublicar, INICIO_E24, vistaPublicar } from "./llenado.js";
import { esUrlDeE24 } from "./mensajes.js";

const $ = (id) => document.getElementById(id);

// Íconos de cada paso (trazos de 24×24, sin relleno).
const TRAZOS = {
  inicio: ["M5 3l14 9-14 9V3z"],
  abrir: ["M14 3h7v7", "M10 14L21 3", "M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"],
  leer: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  espera: ["M12 7v5l3 2", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"],
  descanso: ["M18 8h1a4 4 0 0 1 0 8h-1", "M3 8h15v6a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V8z", "M7 2v2", "M11 2v2", "M15 2v2"],
  pausa: ["M9 5v14", "M15 5v14"],
  seguir: ["M6 4l13 8-13 8V4z"],
  verificacion: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z", "M12 9v4", "M12 16.5v.5"],
  revisar: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M21 21l-5-5"],
  listo: ["M5 12.5l4.5 4.5L19 7.5"],
  detenida: ["M6 6h12v12H6z"],
  llenar: ["M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z", "M13.5 7.5l3 3"],
  error: ["M12 8v5", "M12 16.5v.5", "M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"],
};
const SVG = "http://www.w3.org/2000/svg";

function icono(nombre) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of TRAZOS[nombre] ?? TRAZOS.espera) {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

function mostrar(id, texto, error = false) {
  $(id).hidden = !texto;
  $(id).textContent = texto ?? "";
  $(id).classList.toggle("error", error);
}

/** La pestaña activa de esta ventana, si es la página de un anuncio de Encuentra24 (no un listado). */
async function pestanaDeAnuncio() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab && esPaginaDeAnuncio(tab.url ?? "") ? tab : null;
  } catch {
    return null;
  }
}

// Para animar solo los pasos nuevos.
let pasosVistos = null;

function filaPaso(p, antes, claves) {
  const li = document.createElement("li");
  li.dataset.icono = p.icono;
  const ic = document.createElement("span");
  ic.className = "icono";
  ic.append(icono(p.icono));
  const texto = document.createElement("span");
  texto.className = "paso-texto";
  texto.textContent = p.texto;
  li.append(ic, texto);
  const clave = `${p.hora}|${p.icono}|${p.texto}`;
  if (antes && !antes.has(clave)) li.classList.add("nuevo");
  claves.push(clave);
  return li;
}

/** Un grupo de pasos del mismo minuto: la hora una vez y sus pasos unidos por una línea. */
function grupoPasos(g, antes, claves) {
  const caja = document.createElement("div");
  caja.className = "grupo";
  const hora = document.createElement("time");
  hora.className = "grupo-hora";
  hora.textContent = g.hora || "—";
  const lista = document.createElement("ol");
  lista.className = "pasos";
  lista.append(...g.pasos.map((p) => filaPaso(p, antes, claves)));
  caja.append(hora, lista);
  return caja;
}

function pintarPasos(grupos, total) {
  const antes = pasosVistos;
  const claves = [];
  $("grupos").replaceChildren(...grupos.recientes.map((g) => grupoPasos(g, antes, claves)));
  $("grupos-anteriores").replaceChildren(...grupos.anteriores.map((g) => grupoPasos(g, antes, claves)));
  $("anteriores").hidden = grupos.ocultos === 0;
  $("anteriores-resumen").textContent = grupos.ocultos === 1 ? "Ver 1 paso anterior" : `Ver ${grupos.ocultos} pasos anteriores`;
  pasosVistos = new Set(claves);
  $("sin-pasos").hidden = total > 0;
}

// Ancho del relleno de la batería (SVG de 40 × 24: el cuerpo útil mide 25 de ancho).
const ANCHO_BATERIA = 25;
function pintarEnergia(t) {
  $("energia").hidden = !t;
  if (!t) return;
  $("energia").dataset.nivel = t.nivel;
  $("energia-titulo").textContent = t.titulo;
  $("energia-texto").textContent = t.texto;
  $("energia-detalle").textContent = t.detalle;
  $("energia-detalle").hidden = !t.detalle;
  // Con 1 % se alcanza a ver algo; en 0 % queda vacía.
  $("energia-relleno").setAttribute("width", String(t.restante <= 0 ? 0 : Math.max(1.5, (ANCHO_BATERIA * t.restante) / 100)));
  $("energia-aviso").textContent = t.aviso;
  $("energia-aviso").hidden = !t.aviso;
  $("energia").setAttribute("aria-label", `${t.titulo}: ${t.texto}`);
}

/** Dibuja todo desde la vista (vista-panel.js) y lo de la pestaña activa. */
function dibujar(v, extra = {}) {
  const c = v.cabecera;
  $("nombre").textContent = c.nombre;
  // Cortados con "…" si no caben: el texto entero queda al pasar el mouse.
  $("nombre").title = c.nombre;
  $("inicial").textContent = c.inicial;
  $("avatar").dataset.tono = c.tono;
  $("cabeza").dataset.tono = c.tono;
  $("estado-texto").textContent = c.estado;
  // Sin conectar ya lo dice la línea de la conexión.
  $("estado").hidden = !c.conectada;
  $("conexion-texto").textContent = c.conexion;
  $("conexion-texto").title = c.conexion;
  $("conexion").dataset.conectada = c.conectada ? "si" : "no";
  $("linea-avance").hidden = c.progreso === null;
  $("linea-barra").style.width = `${Math.round((c.progreso ?? 0) * 100)}%`;

  $("sin-conectar").hidden = v.conectada;
  $("conectada").hidden = !v.conectada;
  $("pie").hidden = !v.conectada;
  if (!v.conectada) return;

  const e = v.enCurso;
  $("en-curso").hidden = !e;
  $("quieta").hidden = !!e;
  if (e) {
    $("en-curso").dataset.fase = e.fase;
    $("en-curso-titulo").textContent = e.titulo;
    $("en-curso-detalle").textContent = e.detalle;
    $("anillo").dataset.conNumero = e.avance ? "si" : "no";
    $("anillo-texto").textContent = e.avance?.texto ?? "";
    $("anillo-valor").style.strokeDashoffset = String(100 - Math.round((e.avance?.pct ?? 0) * 100));
    // El anillo dice la página ("3/12"); para quien no lo ve, la misma cifra va en su etiqueta.
    $("anillo").setAttribute("aria-label", c.progresoTexto);
    $("anillo").toggleAttribute("aria-hidden", !c.progresoTexto);
    if (c.progresoTexto) $("anillo").setAttribute("role", "img");
    else $("anillo").removeAttribute("role");
    $("en-curso-tiempo").textContent = e.tiempo;
    $("en-curso-tiempo-chip").hidden = !e.tiempo;
    $("pausar").hidden = !e.botones.pausar;
    $("seguir").hidden = !e.botones.seguir;
    $("detener").hidden = !e.botones.detener;
    $("detener-texto").textContent = e.botones.detenerTexto;
  }

  // El último resultado, en una tarjeta chica.
  const r = v.resultado;
  const ultima = textoUltima(extra.ultimaDias);
  $("resultado-tarjeta").hidden = !r && !ultima;
  $("resultado-tarjeta").dataset.error = r?.error ? "si" : "no";
  // Sin resultado guardado, la tarjeta solo dice cuándo fue la última búsqueda.
  $("resultado-titulo").textContent = r ? (r.error ? "No se pudo terminar" : "Último resultado") : "Última búsqueda";
  $("resultado").textContent = r?.texto ?? (ultima ? ultima.replace(/^Última búsqueda: (.)/, (_, l) => l.toUpperCase()) + "." : "");
  $("ultima").textContent = r && ultima ? `${ultima}.` : "";
  $("ultima").hidden = !(r && ultima);

  // Leer este anuncio: activo solo en la página de un anuncio; si no, dice por qué.
  const l = extra.anuncio;
  const leer = accionLeer({ enAnuncio: !!l, leyendo: !!l?.leyendo });
  $("leer").disabled = !leer.activo;
  $("leer-texto").textContent = leer.texto;
  $("leer-motivo").textContent = leer.motivo;
  mostrar("lectura", l?.mensaje ?? "", l?.fase === "error");
  $("abrir-casa").hidden = !(l && l.fase === "listo" && l.ruta);
  $("abrir-casa").dataset.ruta = l?.ruta ?? "";

  $("buscar-sola").checked = extra.sola !== false;
  $("modo").disabled = extra.sola === false;
  for (const r of document.querySelectorAll('input[name="modo"]')) r.checked = r.value === (extra.modo === "vista" ? "vista" : "fondo");

  pintarEnergia(v.energia);
  pintarPasos(v.grupos, v.pasos.length);
}

let preguntando = false;
function preguntarEstado() {
  if (preguntando) return;
  preguntando = true;
  chrome.runtime
    .sendMessage({ tipo: "estado" })
    .catch(() => {})
    .finally(() => (preguntando = false));
}

async function pintar() {
  const g = await chrome.storage.local.get(["token", "corredor", "asistente", "busqueda", "bitacora", "lectura", "buscarSola", "modoSemanal", "ultimaDias", "tokens", "llenado"]);
  const v = vistaPanel(g);
  // Latido viejo: se le pregunta al trabajador de fondo (lo despierta). Si se había reiniciado, marca la búsqueda como
  // interrumpida y el cambio en chrome.storage vuelve a dibujar el panel.
  if (latidoViejo(g)) preguntarEstado();
  let anuncio = null;
  if (v.conectada) {
    const tab = await pestanaDeAnuncio();
    if (tab) {
      // Lo último que se leyó, solo si es de esta misma página. Sin respuesta en 3 minutos, se dio por cortada.
      const mia = g.lectura && g.lectura.url === tab.url ? g.lectura : null;
      const leyendo = mia?.fase === "leyendo" && Date.now() - (mia.fecha ?? 0) < 180_000;
      anuncio = {
        leyendo,
        fase: mia?.fase ?? null,
        mensaje: mia && !(mia.fase === "leyendo" && !leyendo) && typeof mia.mensaje === "string" ? mia.mensaje.slice(0, 300) : "",
        ruta: typeof mia?.ruta === "string" && mia.ruta.startsWith("/panel/") ? mia.ruta : "",
      };
    }
  }
  dibujar(v, { anuncio, sola: g.buscarSola !== false, modo: g.modoSemanal, ultimaDias: g.ultimaDias });
  if (v.conectada) await pintarPublicar(g);
}

// --- Publicar con Patty (1.6.0): llenar el formulario de Encuentra24 y preparar un anuncio -------------------------

/** Lo que se trajo del panel (null: todavía no). Se dibuja solo cuando cambia, para no perder la selección. */
let listos = null;
let casas = null;
let elegido = null;
let casaElegida = null;
/** Si la pestaña dijo tener un formulario (para direcciones que no lo dicen): { url, valor }. */
let formularioVisto = { url: "", valor: null };

async function pestanaActiva() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ?? null;
  } catch {
    return null;
  }
}

/** Una opción para elegir (anuncio o casa): radio, portada (o un cuadro gris), título y detalle. */
function opcionElegir(grupo, valor, titulo, detalle, portada, marcada, alElegir) {
  const label = document.createElement("label");
  label.className = "opcion-elegir";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = grupo;
  input.value = valor;
  input.checked = marcada;
  input.addEventListener("change", () => alElegir(valor));
  let foto;
  if (portada) {
    foto = document.createElement("img");
    foto.src = portada;
    foto.alt = "";
    foto.loading = "lazy";
    foto.referrerPolicy = "no-referrer";
  } else {
    foto = document.createElement("span");
    foto.className = "sin-foto";
    foto.setAttribute("aria-hidden", "true");
  }
  const textos = document.createElement("span");
  textos.className = "opcion-textos";
  const t = document.createElement("strong");
  t.textContent = titulo;
  const d = document.createElement("span");
  d.textContent = detalle;
  textos.append(t, d);
  label.append(input, foto, textos);
  return label;
}

function dibujarListos() {
  const lista = listos ?? [];
  if (!lista.some((a) => a.id === elegido)) elegido = lista[0]?.id ?? null;
  const detalle = (a) => [a.codigo, a.referencia ? `ref. ${a.referencia}` : ""].filter(Boolean).join(" · ");
  $("lista-anuncios").replaceChildren(
    ...lista.map((a) =>
      opcionElegir("anuncio", a.id, a.titulo, detalle(a), a.portada, a.id === elegido, (id) => {
        elegido = id;
        $("llenar").disabled = false;
      }),
    ),
  );
  $("sin-anuncios").hidden = !(listos && lista.length === 0);
  $("llenar").disabled = !elegido;
}

function dibujarCasas() {
  const lista = casas ?? [];
  if (!lista.some((c) => c.id === casaElegida)) casaElegida = null;
  const detalle = (c) => [c.codigo, c.conBorrador ? "ya tiene un anuncio por publicar" : ""].filter(Boolean).join(" · ");
  $("lista-casas").replaceChildren(
    ...lista.map((c) =>
      opcionElegir("casa", c.id, c.titulo, detalle(c), c.portada, c.id === casaElegida, (id) => {
        casaElegida = id;
        $("preparar-boton").disabled = false;
      }),
    ),
  );
  $("sin-casas").hidden = !(casas && lista.length === 0);
  $("preparar-boton").disabled = !casaElegida;
}

let cargandoListos = false;
async function cargarListos() {
  if (cargandoListos) return;
  cargandoListos = true;
  const r = await chrome.runtime.sendMessage({ tipo: "anuncios_listos" }).catch(() => null);
  cargandoListos = false;
  listos = Array.isArray(r?.anuncios) ? r.anuncios : [];
  dibujarListos();
}

async function cargarCasas() {
  const r = await chrome.runtime.sendMessage({ tipo: "casas_para_anuncio" }).catch(() => null);
  casas = Array.isArray(r?.casas) ? r.casas : [];
  dibujarCasas();
}

async function pintarPublicar(g) {
  const tab = await pestanaActiva();
  const url = tab?.url ?? "";
  let formulario = null;
  // Una dirección que no dice "publicar": se le pregunta una vez a la página si tiene un formulario.
  if (tab && esUrlDeE24(url) && !esFormularioDePublicar(url)) {
    if (formularioVisto.url !== url) {
      formularioVisto = { url, valor: null };
      chrome.runtime
        .sendMessage({ tipo: "ver_formulario", tabId: tab.id })
        .then((r) => {
          if (formularioVisto.url === url) {
            formularioVisto.valor = r?.formulario === true;
            repintar();
          }
        })
        .catch(() => {});
    }
    formulario = formularioVisto.valor;
  }
  const v = vistaPublicar({ url, formulario, llenado: g.llenado, asistente: nombreAsistente(g.asistente) });
  $("publicar-titulo").textContent = v.titulo;
  $("publicar-ayuda").textContent = v.ayuda;
  $("publicar-fuera").hidden = v.enFormulario || v.llenando;
  $("publicar-form").hidden = !v.enFormulario || v.llenando;
  $("llenando").hidden = !v.llenando;
  $("llenando-texto").textContent = v.avance;
  mostrar("informe", v.informe, v.error);
  if (v.enFormulario && listos === null) cargarListos();
}

$("abrir-e24").addEventListener("click", () => {
  if (esUrlDeE24(INICIO_E24)) chrome.tabs.create({ url: INICIO_E24 });
});

$("llenar").addEventListener("click", async () => {
  const tab = await pestanaActiva();
  if (!tab || !elegido) return;
  $("llenar").disabled = true;
  const r = await chrome.runtime.sendMessage({ tipo: "llenar_formulario", tabId: tab.id, anuncio: elegido }).catch(() => null);
  if (r && r.ok === false) mostrar("informe", r.mensaje ?? "", true);
  $("llenar").disabled = false;
});

$("detener-llenado").addEventListener("click", async () => {
  $("detener-llenado").disabled = true;
  await chrome.runtime.sendMessage({ tipo: "detener_llenado" }).catch(() => {});
  $("detener-llenado").disabled = false;
});

$("preparar").addEventListener("toggle", () => {
  if ($("preparar").open && casas === null) cargarCasas();
});

$("preparar-boton").addEventListener("click", async () => {
  if (!casaElegida) return;
  $("preparar-boton").disabled = true;
  mostrar("preparar-mensaje", "Preparando el anuncio… tarda unos segundos.");
  const r = await chrome.runtime.sendMessage({ tipo: "preparar_anuncio", casaId: casaElegida }).catch(() => null);
  mostrar("preparar-mensaje", r?.mensaje ?? "No pude preparar el anuncio. Vuelve a intentarlo.", !r?.ok);
  $("preparar-boton").disabled = false;
  if (r?.ok) {
    if (r.anuncio?.id) elegido = r.anuncio.id;
    listos = null;
    casas = null;
    await cargarListos();
    await cargarCasas();
  }
});

$("form-codigo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = e.submitter;
  if (boton) boton.disabled = true;
  mostrar("mensaje-general", "Conectando…");
  const r = await chrome.runtime.sendMessage({ tipo: "conectar", codigo: $("codigo").value }).catch(() => null);
  if (boton) boton.disabled = false;
  if (!r?.ok) return mostrar("mensaje-general", r?.mensaje ?? "No se pudo conectar.", true);
  mostrar("mensaje-general", "");
  pintar();
});

$("buscar").addEventListener("click", async () => {
  $("buscar").disabled = true;
  await chrome.runtime.sendMessage({ tipo: "buscar" }).catch(() => {});
  setTimeout(() => ($("buscar").disabled = false), 1500);
});

for (const tipo of ["pausar", "seguir", "detener"]) {
  $(tipo).addEventListener("click", async () => {
    $(tipo).disabled = true;
    await chrome.runtime.sendMessage({ tipo }).catch(() => {});
    $(tipo).disabled = false;
  });
}

$("leer").addEventListener("click", async () => {
  const tab = await pestanaDeAnuncio();
  if (!tab) return;
  $("leer").disabled = true;
  await chrome.storage.local.set({ lectura: { fase: "leyendo", mensaje: "Leyendo el anuncio…", url: tab.url, fecha: Date.now() } });
  await chrome.runtime.sendMessage({ tipo: "leer_anuncio", tabId: tab.id }).catch(() => {});
});

$("abrir-casa").addEventListener("click", (e) => {
  e.preventDefault();
  const ruta = $("abrir-casa").dataset.ruta ?? "";
  if (ruta.startsWith("/panel/")) chrome.tabs.create({ url: APP + ruta });
});

$("buscar-sola").addEventListener("change", async () => {
  await chrome.runtime.sendMessage({ tipo: "buscar_sola", encendida: $("buscar-sola").checked }).catch(() => {});
});

for (const r of document.querySelectorAll('input[name="modo"]')) {
  r.addEventListener("change", () => chrome.runtime.sendMessage({ tipo: "modo_semanal", modo: r.value }).catch(() => {}));
}

$("desconectar").addEventListener("click", async () => {
  if (!confirm("¿Desconectar la extensión? Para volver a usarla necesitas otro código del panel.")) return;
  await chrome.runtime.sendMessage({ tipo: "desconectar" }).catch(() => {});
  pintar();
});

// Se vuelve a dibujar cuando cambia lo guardado, al cambiar de pestaña o de página (para "Leer este anuncio") y cada
// tanto (si el latido se queda viejo, se le pregunta al trabajador de fondo).
const repintar = () => pintar().catch(() => {});
chrome.storage.onChanged.addListener(repintar);
chrome.tabs.onActivated.addListener(repintar);
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.url || info.status === "complete") repintar();
});
chrome.windows?.onFocusChanged?.addListener(repintar);
repintar();
setInterval(repintar, 15_000);
// Mientras hay una búsqueda en curso, cada 2 s se mira el latido: un trabajador de fondo reiniciado se nota en segundos.
setInterval(() => {
  chrome.storage.local
    .get("busqueda")
    .then((g) => {
      if (latidoViejo(g)) preguntarEstado();
    })
    .catch(() => {});
}, 2_000);
// Hace cuánto fue la última búsqueda (sin reservar nada en el servidor) y la energía que queda este mes. Al
// terminar cada búsqueda el trabajador de fondo vuelve a pedirla y el cambio en chrome.storage los redibuja.
chrome.runtime.sendMessage({ tipo: "ver_ultima" }).catch(() => {});
chrome.runtime.sendMessage({ tipo: "ver_tokens" }).catch(() => {});
