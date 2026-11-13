import { APP } from "./config.js";
import { esPaginaDeAnuncio } from "./comun.js";

const $ = (id) => document.getElementById(id);
const ACTIVAS = ["buscando", "verificar", "revisando"];
// Sin latido por este tiempo, la búsqueda se cortó (Chrome cerró la extensión).
const LATIDO_MAX_MS = 90_000;

function mostrarMensaje(texto, error = false) {
  $("mensaje").hidden = !texto;
  $("mensaje").textContent = texto ?? "";
  $("mensaje").classList.toggle("error", error);
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

async function pintar() {
  const { token, corredor, progreso, lectura, buscarSola, ultimaDias } = await chrome.storage.local.get([
    "token",
    "corredor",
    "progreso",
    "lectura",
    "buscarSola",
    "ultimaDias",
  ]);
  $("sin-conectar").hidden = !!token;
  $("conectada").hidden = !token;
  $("pie").hidden = !token;
  if (!token) return;
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

  $("buscar-sola").checked = buscarSola !== false;
  $("ultima").hidden = typeof ultimaDias !== "number";
  $("ultima").textContent = typeof ultimaDias === "number" ? `Última búsqueda: ${hace(ultimaDias)}.` : "";
  const viva = progreso && ACTIVAS.includes(progreso.fase) && Date.now() - (progreso.latido ?? 0) < LATIDO_MAX_MS;
  $("buscar").disabled = !!viva;
  $("buscar").textContent = viva ? "Buscando…" : "Buscar dueños";
  if (!progreso) return mostrarMensaje("");
  if (ACTIVAS.includes(progreso.fase) && !viva) return mostrarMensaje("La búsqueda anterior se cortó. Vuelve a empezarla.", true);
  mostrarMensaje(progreso.mensaje, progreso.fase === "error");
}

$("form-codigo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = e.submitter;
  boton.disabled = true;
  mostrarMensaje("Conectando…");
  const r = await chrome.runtime.sendMessage({ tipo: "conectar", codigo: $("codigo").value });
  boton.disabled = false;
  if (!r?.ok) return mostrarMensaje(r?.mensaje ?? "No se pudo conectar.", true);
  mostrarMensaje("");
  pintar();
});

$("buscar").addEventListener("click", async () => {
  $("buscar").disabled = true;
  await chrome.runtime.sendMessage({ tipo: "buscar" });
});

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

$("desconectar").addEventListener("click", async () => {
  if (!confirm("¿Desconectar la extensión? Para volver a usarla necesitas otro código del panel.")) return;
  await chrome.runtime.sendMessage({ tipo: "desconectar" });
  pintar();
});

chrome.storage.onChanged.addListener(pintar);
pintar();
// Hace cuánto fue la última búsqueda (sin reservar nada en el servidor).
chrome.runtime.sendMessage({ tipo: "ver_ultima" }).catch(() => {});
