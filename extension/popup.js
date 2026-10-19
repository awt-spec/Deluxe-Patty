const $ = (id) => document.getElementById(id);
const ACTIVAS = ["buscando", "verificar", "revisando"];
// Sin latido por este tiempo, la búsqueda se cortó (Chrome cerró la extensión).
const LATIDO_MAX_MS = 90_000;

function mostrarMensaje(texto, error = false) {
  $("mensaje").hidden = !texto;
  $("mensaje").textContent = texto ?? "";
  $("mensaje").classList.toggle("error", error);
}

async function pintar() {
  const { token, corredor, progreso } = await chrome.storage.local.get(["token", "corredor", "progreso"]);
  $("sin-conectar").hidden = !!token;
  $("conectada").hidden = !token;
  $("pie").hidden = !token;
  if (!token) return;
  $("corredor").textContent = corredor ? `Conectada a ${corredor}.` : "Conectada.";
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

$("desconectar").addEventListener("click", async () => {
  if (!confirm("¿Desconectar la extensión? Para volver a usarla necesitas otro código del panel.")) return;
  await chrome.runtime.sendMessage({ tipo: "desconectar" });
  pintar();
});

chrome.storage.onChanged.addListener(pintar);
pintar();
