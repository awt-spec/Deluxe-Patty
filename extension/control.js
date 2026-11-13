// Barra, marco y cursor de la búsqueda de dueños sobre la página de Encuentra24 (como cuando Claude maneja el
// navegador): la persona ve que la asistente está trabajando en esa pestaña, qué mira y cuánto falta, y la puede
// pausar o detener. background.js lo pone en la pestaña de la búsqueda después de cada carga.
//
// Es solo un dibujo encima de la página: no hace clic, no escribe ni lee nada del sitio (los datos los lee otro
// script del trabajador de fondo). Vive en un Shadow DOM cerrado, sin variables globales ni postMessage hacia la
// página: Encuentra24 no puede leerlo ni cambiarlo, y sus estilos no lo tocan. Solo la barra recibe el mouse.
// Si la persona usa la pestaña (mueve el mouse, teclea, hace clic o rueda), se pausa sola.
(() => {
  const VERDE = "#00a884";
  const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const host = document.createElement("div");
  host.setAttribute("style", "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; display: block;");
  const raiz = host.attachShadow({ mode: "closed" });
  raiz.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; }
  .marco {
    position: fixed; inset: 0; pointer-events: none; border-radius: 12px;
    box-shadow: inset 0 0 0 3px ${VERDE}, inset 0 0 0 4px rgb(255 255 255 / 55%), inset 0 0 36px rgb(0 168 132 / 22%);
    transition: box-shadow .4s ease;
  }
  .marco[data-fase="pausada"] { box-shadow: inset 0 0 0 3px #8696a0, inset 0 0 0 4px rgb(255 255 255 / 55%), inset 0 0 30px rgb(134 150 160 / 18%); }
  .marco[data-fase="verificacion"] { box-shadow: inset 0 0 0 3px #e0a100, inset 0 0 0 4px rgb(255 255 255 / 55%), inset 0 0 36px rgb(224 161 0 / 22%); }
  .barra {
    position: fixed; left: 50%; top: 14px; transform: translateX(-50%);
    width: max-content; max-width: min(720px, calc(100vw - 24px));
    display: flex; align-items: center; gap: 12px; padding: 10px 10px 12px 12px; overflow: hidden;
    background: #fff; color: #111b21; border-radius: 16px;
    box-shadow: 0 10px 30px rgb(17 27 33 / 18%), 0 0 0 1px rgb(17 27 33 / 8%);
    font: 14px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; pointer-events: auto;
    transition: top .3s ease, bottom .3s ease;
  }
  .barra[data-abajo] { top: auto; bottom: 16px; }
  .avatar {
    position: relative; flex: none; width: 34px; height: 34px; border-radius: 50%;
    display: grid; place-items: center; background: ${VERDE}; color: #fff; font-weight: 700; font-size: 15px;
  }
  .avatar::after {
    content: ""; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid ${VERDE}; opacity: 0;
  }
  [data-fase="buscando"] .avatar::after { animation: latido 1.8s ease-out infinite; }
  [data-fase="pausada"] .avatar { background: #8696a0; }
  [data-fase="verificacion"] .avatar { background: #e0a100; }
  @keyframes latido { 0% { transform: scale(.85); opacity: .7; } 100% { transform: scale(1.35); opacity: 0; } }
  .textos { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .titulo { font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detalle { color: #54656f; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detalle b { color: #111b21; font-weight: 600; }
  .botones { display: flex; gap: 6px; margin-left: 4px; flex: none; }
  button {
    font: 600 13px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 9px 14px; border-radius: 999px;
    border: 1px solid #d1d7db; background: #fff; color: #111b21; cursor: pointer; white-space: nowrap;
  }
  button:hover { background: #f5f6f6; }
  button:focus-visible { outline: 2px solid ${VERDE}; outline-offset: 2px; }
  button.primario { background: ${VERDE}; border-color: ${VERDE}; color: #fff; }
  button.primario:hover { background: #008f72; }
  button.parar { color: #b42318; border-color: #f1c4bf; }
  button.parar:hover { background: #fef3f2; }
  .avance { position: absolute; left: 0; bottom: 0; height: 3px; background: ${VERDE}; transition: width .6s ease; border-radius: 0 3px 3px 0; }
  [data-fase="pausada"] .avance { background: #8696a0; }
  [data-fase="verificacion"] .avance { background: #e0a100; }
  .cursor {
    position: fixed; left: 0; top: 0; display: flex; align-items: flex-start; gap: 2px; pointer-events: none;
    filter: drop-shadow(0 2px 4px rgb(0 0 0 / 28%)); will-change: transform; transition: opacity .3s;
  }
  .cursor svg { transition: transform .15s; }
  .cursor.clic svg { transform: scale(.8); }
  .cursor.clic::after {
    content: ""; position: absolute; left: -10px; top: -10px; width: 24px; height: 24px; border-radius: 50%;
    border: 3px solid ${VERDE}; animation: onda .5s ease-out;
  }
  @keyframes onda { from { transform: scale(.4); opacity: 1; } to { transform: scale(2); opacity: 0; } }
  .nombre {
    margin-top: 18px; padding: 3px 9px; border-radius: 999px; background: ${VERDE}; color: #fff;
    font: 700 12px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; white-space: nowrap;
  }
  [data-fase="pausada"] .cursor, [data-fase="verificacion"] .cursor { opacity: 0; }
  .resalte {
    position: fixed; border-radius: 12px; pointer-events: none; opacity: 0;
    box-shadow: 0 0 0 3px rgb(0 168 132 / 85%), 0 0 0 8px rgb(0 168 132 / 14%); background: rgb(0 168 132 / 5%);
    transition: top .45s cubic-bezier(.22,1,.36,1), left .45s cubic-bezier(.22,1,.36,1), width .45s, height .45s, opacity .3s;
  }
  .resalte.ver { opacity: 1; }
  .solo-lector { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  @media (max-width: 560px) { .detalle { white-space: normal; } .barra { flex-wrap: wrap; } }
  @media (prefers-reduced-motion: reduce) {
    .avatar::after, .cursor.clic::after { animation: none !important; }
    .resalte, .barra, .avance { transition: none; }
  }
</style>
<div class="todo" data-fase="buscando">
  <div class="marco" data-fase="buscando"></div>
  <div class="resalte"></div>
  <div class="cursor" aria-hidden="true">
    <svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#111b21" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
    <span class="nombre"></span>
  </div>
  <div class="barra" role="region" aria-label="Búsqueda de dueños">
    <span class="avatar" aria-hidden="true"></span>
    <div class="textos">
      <span class="titulo"></span>
      <span class="detalle" role="status" aria-live="polite"></span>
    </div>
    <div class="botones"></div>
    <span class="avance" style="width:0"></span>
  </div>
</div>`;

  const $ = (sel) => raiz.querySelector(sel);
  const todo = $(".todo");
  const marco = $(".marco");
  const barra = $(".barra");
  const cursor = $(".cursor");
  const resalte = $(".resalte");

  let estado = { fase: "buscando", asistente: "Patty", pagina: 0, total: 0, restanteMs: 0, haciendo: "" };
  let pos = { x: Math.round(innerWidth * 0.62), y: Math.round(innerHeight * 0.35) };
  let animacion = 0;
  let graciaHasta = Date.now() + 2500;

  const mandar = (tipo) => {
    try {
      chrome.runtime.sendMessage({ tipo }).catch(() => {});
    } catch {
      // la extensión se recargó: esta copia ya no sirve
      apagar();
    }
  };

  // --- Dibujo de la barra ------------------------------------------------------------------------------------

  const minutos = (ms) => {
    const m = Math.round(ms / 60_000);
    return m < 1 ? "queda menos de 1 min" : `quedan ~${m} min`;
  };

  function boton(texto, clase, tipo) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = texto;
    if (clase) b.className = clase;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (tipo === "control_seguir") graciaHasta = Date.now() + 4000;
      mandar(tipo);
    });
    return b;
  }

  function pintar() {
    const f = estado.fase;
    todo.dataset.fase = f;
    marco.dataset.fase = f;
    const nombre = estado.asistente || "Patty";
    $(".nombre").textContent = nombre;
    $(".avatar").textContent = nombre.trim().charAt(0).toUpperCase() || "P";
    const pagina = estado.total ? `Página <b>${estado.pagina}</b> de ${estado.total}` : "";
    const partes = [];
    let titulo = `${nombre} está buscando dueños en esta pestaña`;
    let botones = [];
    if (f === "buscando") {
      partes.push(pagina, estado.restanteMs ? minutos(estado.restanteMs) : "", esc(estado.haciendo || "Buscando…"));
      botones = [boton("Pausar", "", "control_pausar"), boton("Detener", "parar", "control_detener")];
    } else if (f === "pausada") {
      titulo = estado.motivoPausa === "actividad" ? "Parece que quieres usar esta pestaña" : `${nombre} está en pausa`;
      partes.push(
        estado.motivoPausa === "actividad" ? `${esc(nombre)} se detuvo para no estorbarte.` : "La búsqueda espera a que sigas.",
        pagina,
      );
      botones = [boton("Seguir", "primario", "control_seguir"), boton("Detener", "parar", "control_detener")];
    } else if (f === "verificacion") {
      titulo = "Encuentra24 pide que confirmes que eres tú";
      partes.push(estado.mensaje && /Todavía/.test(estado.mensaje) ? esc(estado.mensaje) : "Resuélvelo en la página y toca Seguir.");
      botones = [boton("Seguir", "primario", "control_seguir"), boton("Dejarlo para después", "", "control_dejar")];
    } else if (f === "revisando") {
      titulo = `${nombre} terminó de leer`;
      partes.push(esc(estado.haciendo || "Revisando…"));
    }
    $(".titulo").textContent = titulo;
    $(".detalle").innerHTML = partes.filter(Boolean).join(" · ");
    $(".botones").replaceChildren(...botones);
    // En la verificación la barra baja para no tapar el recuadro de Encuentra24.
    barra.toggleAttribute("data-abajo", f === "verificacion");
    $(".avance").style.width = estado.total ? `${Math.min(100, (estado.pagina / estado.total) * 100)}%` : "0";
    if (f !== "buscando") {
      animacion++;
      resalte.classList.remove("ver");
    }
  }

  function esc(t) {
    return String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  // --- Cursor ------------------------------------------------------------------------------------------------

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const ponerCursor = (x, y) => {
    pos = { x, y };
    cursor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  ponerCursor(pos.x, pos.y);

  /** Lleva el cursor hasta (x, y) por una curva, más rápido al medio que en los extremos. */
  function moverA(x, y, ms, id) {
    x = Math.max(8, Math.min(innerWidth - 90, x));
    y = Math.max(8, Math.min(innerHeight - 40, y));
    if (sinMovimiento || ms < 60) {
      ponerCursor(x, y);
      return Promise.resolve();
    }
    const desde = { ...pos };
    const dx = x - desde.x;
    const dy = y - desde.y;
    const largo = Math.hypot(dx, dy) || 1;
    // Un punto de control a un lado de la recta: curva suave, distinta cada vez.
    const lado = (Math.random() < 0.5 ? -1 : 1) * Math.min(120, largo * (0.15 + Math.random() * 0.2));
    const c = { x: desde.x + dx * 0.5 - (dy / largo) * lado, y: desde.y + dy * 0.5 + (dx / largo) * lado };
    const inicio = performance.now();
    return new Promise((fin) => {
      const paso = (ahora) => {
        if (id !== animacion) return fin();
        const t = Math.min(1, (ahora - inicio) / ms);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const u = 1 - e;
        ponerCursor(u * u * desde.x + 2 * u * e * c.x + e * e * x, u * u * desde.y + 2 * u * e * c.y + e * e * y);
        if (t < 1) requestAnimationFrame(paso);
        else fin();
      };
      requestAnimationFrame(paso);
    });
  }

  /** Las tarjetas de los anuncios: enlaces que terminan en el número del anuncio, con su recuadro alrededor. */
  function tarjetas() {
    const vistas = new Set();
    const lista = [];
    for (const a of document.querySelectorAll("a[href]")) {
      let u;
      try {
        u = new URL(a.href);
      } catch {
        continue;
      }
      const tramos = u.pathname.split("/").filter(Boolean);
      if (tramos.length < 3 || !/^\d{4,12}$/.test(tramos.at(-1))) continue;
      const caja = a.closest("article, li, [class*='card' i], [class*='item' i]") ?? a;
      if (vistas.has(caja)) continue;
      vistas.add(caja);
      const r = caja.getBoundingClientRect();
      if (r.width > 40 && r.height > 30) lista.push(caja);
    }
    return lista;
  }

  function resaltar(el) {
    if (!el) return resalte.classList.remove("ver");
    const r = el.getBoundingClientRect();
    Object.assign(resalte.style, { top: `${r.top - 6}px`, left: `${r.left - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    resalte.classList.add("ver");
  }

  /** Lee la página por tramos: baja hasta cada punto, mira uno o dos anuncios a la vista y sigue. */
  async function mirar(tramos) {
    const id = ++animacion;
    const vistos = new Set();
    for (const t of tramos) {
      if (id !== animacion) return;
      const alto = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      const destino = Math.round(alto * t.hasta);
      const inicio = performance.now();
      if (Math.abs(scrollY - destino) > 4) {
        resaltar(null);
        scrollTo({ top: destino, behavior: sinMovimiento ? "auto" : "smooth" });
        await dormir(Math.min(700, t.ms * 0.3));
      }
      const enVista = tarjetas().filter((el) => {
        const r = el.getBoundingClientRect();
        return !vistos.has(el) && r.top > 70 && r.top < innerHeight - 80;
      });
      const elegidas = enVista.slice(0, Math.min(2, enVista.length));
      const queda = () => Math.max(0, t.ms - (performance.now() - inicio));
      if (elegidas.length === 0) {
        await moverA(innerWidth * (0.35 + Math.random() * 0.3), innerHeight * (0.35 + Math.random() * 0.35), Math.min(900, queda() * 0.5), id);
        await dormir(queda());
        continue;
      }
      for (const [i, el] of elegidas.entries()) {
        if (id !== animacion) return;
        vistos.add(el);
        const r = el.getBoundingClientRect();
        const porcion = queda() / (elegidas.length - i);
        await moverA(r.left + r.width * (0.25 + Math.random() * 0.4), r.top + Math.min(r.height * 0.45, 120), Math.min(900, porcion * 0.45), id);
        if (id !== animacion) return;
        resaltar(el);
        await dormir(Math.max(0, porcion - Math.min(900, porcion * 0.45)));
      }
    }
  }

  /** Antes de cambiar de página: el cursor va al botón "Siguiente" (si lo hay) y marca el clic. Solo se dibuja. */
  async function irASiguiente(ms, pagina) {
    const id = ++animacion;
    resaltar(null);
    const candidatos = [...document.querySelectorAll("a[href], button")];
    const sig =
      document.querySelector("a[rel='next']") ??
      candidatos.find((el) => el.href && new RegExp(`[?&]page=${pagina}(&|$)`).test(el.href)) ??
      candidatos.find((el) => /^\s*(siguiente|›|»|next)\s*$/i.test(el.textContent ?? ""));
    if (sig) {
      sig.scrollIntoView({ block: "center", behavior: sinMovimiento ? "auto" : "smooth" });
      await dormir(Math.min(500, ms * 0.3));
      const r = sig.getBoundingClientRect();
      await moverA(r.left + r.width / 2, r.top + r.height / 2, Math.min(900, ms * 0.5), id);
    } else {
      await moverA(innerWidth / 2, innerHeight - 90, Math.min(900, ms * 0.5), id);
    }
    if (id !== animacion) return;
    cursor.classList.add("clic");
    await dormir(350);
    cursor.classList.remove("clic");
  }

  // --- Toma de control: si la persona usa la pestaña, se pausa ----------------------------------------------

  let ultimaPantalla = null;
  let recorrido = 0;
  let desdeMovimiento = 0;
  let avisado = 0;

  function actividad(e) {
    if (!e.isTrusted || estado.fase !== "buscando" || Date.now() < graciaHasta) return;
    // Lo que se toca en la barra no cuenta.
    if (e.composedPath?.().includes(host)) return;
    if (e.type === "mousemove") {
      const p = { x: e.screenX, y: e.screenY };
      const antes = ultimaPantalla;
      ultimaPantalla = p;
      // Chrome repite el último movimiento al desplazar la página: si el mouse no se movió en la pantalla, no cuenta.
      if (!antes) return;
      const d = Math.hypot(p.x - antes.x, p.y - antes.y);
      if (d < 2) return;
      const ahora = Date.now();
      if (ahora - desdeMovimiento > 1500) recorrido = 0;
      desdeMovimiento = ahora;
      recorrido += d;
      if (recorrido < 120) return;
    }
    if (Date.now() - avisado < 1500) return;
    avisado = Date.now();
    recorrido = 0;
    mandar("control_actividad");
  }
  const EVENTOS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"];
  for (const t of EVENTOS) addEventListener(t, actividad, { capture: true, passive: true });

  // --- Mensajes del trabajador de fondo -----------------------------------------------------------------------

  function oir(m, remitente, responder) {
    // Solo del trabajador de fondo de esta misma extensión (no de otra pestaña ni de la página).
    if (remitente?.id !== chrome.runtime.id || remitente.tab || !m || m.para !== "control") return;
    if (m.tipo === "hola") {
      responder({ ok: true });
      return;
    }
    if (m.tipo === "pintar" && m.estado && typeof m.estado === "object") {
      const antes = estado.fase;
      estado = { ...estado, ...m.estado };
      if (antes !== "buscando" && estado.fase === "buscando") graciaHasta = Date.now() + 2500;
      pintar();
    } else if (m.tipo === "mirar" && Array.isArray(m.tramos)) {
      const tramos = m.tramos
        .filter((t) => t && Number.isFinite(t.hasta) && Number.isFinite(t.ms))
        .slice(0, 12)
        .map((t) => ({ hasta: Math.max(0, Math.min(1, t.hasta)), ms: Math.max(0, Math.min(60_000, t.ms)) }));
      if (estado.fase === "buscando") mirar(tramos);
    } else if (m.tipo === "siguiente" && Number.isFinite(m.ms)) {
      irASiguiente(Math.max(0, Math.min(5000, m.ms)), Number.isInteger(m.pagina) ? m.pagina : 0);
    } else if (m.tipo === "quitar") {
      apagar();
    }
  }
  chrome.runtime.onMessage.addListener(oir);

  // Si la página quita el dibujo (por ejemplo al rehacer su contenido), se vuelve a poner.
  const vigia = new MutationObserver(() => {
    if (!host.isConnected) document.documentElement.appendChild(host);
  });

  function apagar() {
    animacion++;
    vigia.disconnect();
    for (const t of EVENTOS) removeEventListener(t, actividad, { capture: true });
    try {
      chrome.runtime.onMessage.removeListener(oir);
    } catch {
      // sin extensión
    }
    host.remove();
  }

  document.documentElement.appendChild(host);
  vigia.observe(document.documentElement, { childList: true });
  pintar();
})();
