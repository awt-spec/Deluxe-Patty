import { APP } from "./config.js";
import { esPaginaDeAnuncio } from "./comun.js";
import { activa, textoFase } from "./maquina.js";
import { textoRestante } from "./ritmo.js";

const $ = (id) => document.getElementById(id);
// Sin latido por este tiempo, la búsqueda se cortó (Chrome cerró la extensión).
const LATIDO_MAX_MS = 90_000;

function mostrar(id, texto, error = false) {
  $(id).hidden = !texto;
  $(id).textContent = texto ?? "";
  $(id).classList.toggle("error", error);
}

/** La pestaña activa, si es la página de un anuncio de Encuentra24 (no un listado). */
async function pestanaDeAnuncio() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab && esPaginaDeAnuncio(tab.url ?? "") ? tab : null;
  } catch {
    return null;
  }
}

const hace = (n) => (n === 0 ? "hoy" : n === 1 ? "ayer" : `hace ${n} días`);

const TITULOS = {
  buscando: "Buscando dueños",
  pausada: "En pausa",
  verificacion: "Encuentra24 pide que confirmes que eres tú",
  revisando: "Revisando lo que leyó",
};

function pintarBusqueda(b) {
  const viva = !!b && activa(b.fase) && Date.now() - (b.latido ?? 0) < LATIDO_MAX_MS;
  $("en-curso").hidden = !viva;
  $("buscar").hidden = viva;
  if (viva) {
    $("en-curso").dataset.fase = b.fase;
    $("en-curso-titulo").textContent = TITULOS[b.fase] ?? "Buscando";
    const partes = [];
    if (b.total) partes.push(`Página ${b.pagina} de ${b.total}`);
    if (b.restanteMs && (b.fase === "buscando" || b.fase === "pausada")) partes.push(textoRestante(b.restanteMs));
    partes.push(b.fase === "buscando" ? b.haciendo || "Buscando…" : textoFase(b));
    $("en-curso-detalle").textContent = partes.filter(Boolean).join(" · ");
    $("en-curso-avance").style.width = b.total ? `${Math.min(100, (b.pagina / b.total) * 100)}%` : "0";
    $("pausar").hidden = b.fase !== "buscando";
    $("seguir").hidden = !(b.fase === "pausada" || b.fase === "verificacion");
    $("detener").hidden = b.fase === "revisando";
    $("detener").textContent = b.fase === "verificacion" ? "Dejarlo para después" : "Detener";
    mostrar("mensaje", "");
    return;
  }
  if (b && activa(b.fase)) return mostrar("mensaje", "La búsqueda anterior se cortó. Vuelve a empezarla.", true);
  mostrar("mensaje", b?.mensaje ?? "", b?.fase === "error");
}

async function pintar() {
  const { token, corredor, busqueda, lectura, buscarSola, modoSemanal, ultimaDias } = await chrome.storage.local.get([
    "token",
    "corredor",
    "busqueda",
    "lectura",
    "buscarSola",
    "modoSemanal",
    "ultimaDias",
  ]);
  $("sin-conectar").hidden = !!token;
  $("conectada").hidden = !token;
  $("pie").hidden = !token;
  if (!token) return mostrar("mensaje-general", "");
  $("corredor").textContent = corredor ? `Conectada a ${corredor}.` : "Conectada.";

  const tab = await pestanaDeAnuncio();
  $("anuncio").hidden = !tab;
  // Lo último que se leyó, solo si es de esta misma página. Sin respuesta en 3 minutos, se dio por cortada.
  const mia = lectura && tab && lectura.url === tab.url ? lectura : null;
  const leyendo = mia?.fase === "leyendo" && Date.now() - (mia.fecha ?? 0) < 180_000;
  $("leer").disabled = leyendo;
  $("leer").textContent = leyendo ? "Leyendo…" : "Leer este anuncio";
  $("lectura").hidden = !mia || (mia.fase === "leyendo" && !leyendo);
  $("lectura").textContent = mia?.mensaje ?? "";
  $("lectura").classList.toggle("error", mia?.fase === "error");
  $("abrir-casa").hidden = !(mia?.fase === "listo" && mia.ruta);
  $("abrir-casa").dataset.ruta = mia?.ruta ?? "";

  const sola = buscarSola !== false;
  $("buscar-sola").checked = sola;
  $("modo").disabled = !sola;
  for (const r of document.querySelectorAll('input[name="modo"]')) r.checked = r.value === (modoSemanal === "vista" ? "vista" : "fondo");
  $("ultima").hidden = typeof ultimaDias !== "number";
  $("ultima").textContent = typeof ultimaDias === "number" ? `Última búsqueda: ${hace(ultimaDias)}.` : "";
  pintarBusqueda(busqueda);
}

$("form-codigo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = e.submitter;
  boton.disabled = true;
  mostrar("mensaje-general", "Conectando…");
  const r = await chrome.runtime.sendMessage({ tipo: "conectar", codigo: $("codigo").value });
  boton.disabled = false;
  if (!r?.ok) return mostrar("mensaje-general", r?.mensaje ?? "No se pudo conectar.", true);
  mostrar("mensaje-general", "");
  pintar();
});

$("buscar").addEventListener("click", async () => {
  $("buscar").disabled = true;
  await chrome.runtime.sendMessage({ tipo: "buscar" });
  setTimeout(() => ($("buscar").disabled = false), 1500);
});

for (const [id, tipo] of [
  ["pausar", "pausar"],
  ["seguir", "seguir"],
  ["detener", "detener"],
]) {
  $(id).addEventListener("click", async () => {
    $(id).disabled = true;
    await chrome.runtime.sendMessage({ tipo }).catch(() => {});
    $(id).disabled = false;
  });
}

$("leer").addEventListener("click", async () => {
  const tab = await pestanaDeAnuncio();
  if (!tab) return;
  $("leer").disabled = true;
  await chrome.storage.local.set({ lectura: { fase: "leyendo", mensaje: "Leyendo el anuncio…", url: tab.url, fecha: Date.now() } });
  await chrome.runtime.sendMessage({ tipo: "leer_anuncio", tabId: tab.id });
});

$("abrir-casa").addEventListener("click", (e) => {
  e.preventDefault();
  const ruta = $("abrir-casa").dataset.ruta ?? "";
  if (ruta.startsWith("/panel/")) chrome.tabs.create({ url: APP + ruta });
});

$("buscar-sola").addEventListener("change", async () => {
  await chrome.runtime.sendMessage({ tipo: "buscar_sola", encendida: $("buscar-sola").checked });
});

for (const r of document.querySelectorAll('input[name="modo"]')) {
  r.addEventListener("change", () => chrome.runtime.sendMessage({ tipo: "modo_semanal", modo: r.value }));
}

$("desconectar").addEventListener("click", async () => {
  if (!confirm("¿Desconectar la extensión? Para volver a usarla necesitas otro código del panel.")) return;
  await chrome.runtime.sendMessage({ tipo: "desconectar" });
  pintar();
});

chrome.storage.onChanged.addListener(pintar);
pintar();
// El aviso "se cortó" depende de la hora: se vuelve a mirar cada tanto.
setInterval(pintar, 15_000);
// Hace cuánto fue la última búsqueda (sin reservar nada en el servidor).
chrome.runtime.sendMessage({ tipo: "ver_ultima" }).catch(() => {});
