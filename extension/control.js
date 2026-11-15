// Barra, marco y cursor de la búsqueda de dueños sobre la página de Encuentra24 (como un asistente que maneja el
// navegador): la persona ve que la asistente está trabajando en esa pestaña, qué mira y cuánto falta, y la puede
// pausar o detener. background.js lo pone en la pestaña de la búsqueda después de cada carga.
//
// Es solo un dibujo encima de la página: no hace clic, no escribe ni lee nada del sitio (los datos los lee otro
// script del trabajador de fondo). Vive en un Shadow DOM cerrado, sin variables globales ni postMessage hacia la
// página: Encuentra24 no puede leerlo ni cambiarlo, y sus estilos no lo tocan. Solo la barra recibe el mouse.
// Si la persona usa la pestaña (mueve el mouse, teclea, hace clic o rueda), se pausa sola. En pausa la barra se achica a
// una ficha en la esquina de abajo que deja pasar los clics (solo sus dos botones los reciben) y el marco deja de brillar:
// la persona puede usar la página entera mientras tanto.
(() => {
  const VERDE = "#008069";
  const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const host = document.createElement("div");
  host.setAttribute("style", "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; display: block;");
  const raiz = host.attachShadow({ mode: "closed" });
  // Plantilla fija (sin datos de nadie): los textos se ponen después con textContent.
  raiz.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; }
  .todo { --c: ${VERDE}; --c-suave: rgb(0 128 105 / 28%); --c-tenue: rgb(0 128 105 / 10%); }
  .todo[data-fase="pausada"] { --c: #8696a0; --c-suave: rgb(134 150 160 / 26%); --c-tenue: rgb(134 150 160 / 8%); }
  .todo[data-fase="verificacion"] { --c: #c98a00; --c-suave: rgb(201 138 0 / 30%); --c-tenue: rgb(201 138 0 / 10%); }
  .marco {
    position: fixed; inset: 0; pointer-events: none; border-radius: 14px;
    box-shadow: inset 0 0 0 2.5px var(--c), inset 0 0 22px 2px var(--c-suave);
    transition: box-shadow .5s ease;
  }
  .marco::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit;
    box-shadow: inset 0 0 0 2.5px var(--c), inset 0 0 54px 10px var(--c-suave);
    opacity: 0;
  }
  [data-fase="buscando"] .marco::after { animation: brillo 2.8s ease-in-out infinite; }
  [data-fase="verificacion"] .marco::after { opacity: .9; }
  /* En pausa, sin brillo: apenas un borde quieto. */
  [data-fase="pausada"] .marco { box-shadow: inset 0 0 0 1.5px var(--c-suave); }
  [data-fase="pausada"] .marco::after { display: none; }
  @keyframes brillo { 0%, 100% { opacity: .15; } 50% { opacity: 1; } }
  .barra {
    position: fixed; left: 50%; top: 12px; transform: translateX(-50%);
    width: max-content; max-width: min(720px, calc(100vw - 24px));
    display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 7px; overflow: hidden;
    background: rgb(255 255 255 / 96%); color: #111b21; border-radius: 999px;
    box-shadow: 0 8px 28px rgb(17 27 33 / 16%), 0 1px 3px rgb(17 27 33 / 10%), 0 0 0 1px rgb(17 27 33 / 6%);
    font: 14px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; pointer-events: auto;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    transition: top .35s ease, bottom .35s ease, opacity .25s ease;
  }
  .barra[data-abajo] { top: auto; bottom: 14px; }
  /* Ficha de la pausa: chica, en la esquina, y el cuerpo deja pasar los clics a la página (solo los botones no). */
  .barra[data-chip] {
    left: auto; right: 14px; top: auto; bottom: 14px; transform: none;
    max-width: min(340px, calc(100vw - 28px)); gap: 6px; padding: 4px 4px 4px 5px;
    pointer-events: none; background: rgb(255 255 255 / 92%);
  }
  .barra[data-chip] .avatar { width: 24px; height: 24px; font-size: 12px; }
  .barra[data-chip] .titulo { font-size: 12.5px; font-weight: 600; }
  .barra[data-chip] .detalle, .barra[data-chip] .avance { display: none; }
  .barra[data-chip] button { pointer-events: auto; padding: 7px 11px; font-size: 12.5px; }
  .avatar {
    position: relative; flex: none; width: 30px; height: 30px; border-radius: 50%;
    display: grid; place-items: center; background: var(--c); color: #fff; font-weight: 700; font-size: 14px;
  }
  .avatar::after { content: ""; position: absolute; inset: -3px; border-radius: 50%; border: 2px solid var(--c); opacity: 0; }
  [data-fase="buscando"] .avatar::after { animation: latido 1.8s ease-out infinite; }
  @keyframes latido { 0% { transform: scale(.85); opacity: .7; } 100% { transform: scale(1.4); opacity: 0; } }
  .textos { min-width: 0; display: flex; flex-direction: column; gap: 0; padding-right: 2px; }
  .titulo { font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detalle { color: #54656f; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detalle b { color: #111b21; font-weight: 600; }
  .botones { display: flex; gap: 4px; flex: none; }
  button {
    font: 600 13px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 9px 14px; border-radius: 999px;
    border: 0; background: #f0f2f5; color: #111b21; cursor: pointer; white-space: nowrap; transition: background .15s;
  }
  button:hover { background: #e4e7ea; }
  button:focus-visible { outline: 2px solid ${VERDE}; outline-offset: 2px; }
  button.primario { background: ${VERDE}; color: #fff; }
  button.primario:hover { background: #00664f; }
  button.parar { background: #fdecea; color: #b42318; }
  button.parar:hover { background: #fbd9d5; }
  .avance { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--c); transition: width .6s ease; }
  .cursor {
    position: fixed; left: 0; top: 0; pointer-events: none; will-change: transform; transition: opacity .3s;
  }
  .flecha { display: block; filter: drop-shadow(0 2px 3px rgb(0 0 0 / 30%)); transition: transform .15s ease; transform-origin: 3px 2px; }
  .cursor.clic .flecha { transform: scale(.82); }
  .onda {
    position: absolute; left: -13px; top: -13px; width: 30px; height: 30px; border-radius: 50%;
    border: 2.5px solid ${VERDE}; background: rgb(0 128 105 / 14%); opacity: 0;
  }
  .cursor.clic .onda { animation: onda .55s ease-out; }
  @keyframes onda { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.9); opacity: 0; } }
  .nombre {
    position: absolute; left: 20px; top: 22px; padding: 4px 10px; border-radius: 999px 999px 999px 4px; background: ${VERDE}; color: #fff;
    font: 650 12px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; white-space: nowrap;
    box-shadow: 0 2px 8px rgb(0 0 0 / 22%);
  }
  [data-fase="pausada"] .cursor, [data-fase="verificacion"] .cursor, [data-fase="revisando"] .cursor { opacity: 0; }
  .resalte {
    position: fixed; border-radius: 12px; pointer-events: none; opacity: 0;
    box-shadow: 0 0 0 2.5px rgb(0 128 105 / 85%), 0 0 0 8px rgb(0 128 105 / 12%); background: rgb(0 128 105 / 4%);
    transition: opacity .3s, top .3s ease, left .3s ease, width .3s ease, height .3s ease;
  }
  .resalte.ver { opacity: 1; }
  @media (max-width: 560px) { .detalle { display: none; } .barra { gap: 8px; } button { padding: 8px 11px; } }
  @media (prefers-reduced-motion: reduce) {
    .marco::after, .avatar::after, .cursor.clic .onda { animation: none !important; }
    [data-fase="buscando"] .marco::after { opacity: .6; }
    .resalte, .barra, .avance, .flecha { transition: none !important; }
  }
</style>
<div class="todo" data-fase="buscando">
  <div class="marco"></div>
  <div class="resalte"></div>
  <div class="cursor" aria-hidden="true">
    <span class="onda"></span>
    <svg class="flecha" width="24" height="26" viewBox="0 0 24 26"><path d="M3 2l17 10.2-7.4 1.6-3.7 7.2z" fill="#111b21" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>
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
  const barra = $(".barra");
  const cursor = $(".cursor");
  const resalte = $(".resalte");

  let estado = { fase: "buscando", asistente: "Patty", pagina: 0, total: 0, restanteMs: 0, haciendo: "" };
  let pos = { x: Math.round(innerWidth * 0.62), y: Math.round(innerHeight * 0.35) };
  let animacion = 0;
  // Recién puesta (o al seguir) no se cuenta la actividad: el mouse quieto de la persona no debe pausarla.
  let graciaHasta = Date.now() + 1500;

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

  /** El detalle: trozos de texto separados por " · "; los números van en negrita. Todo con textContent. */
  function ponerDetalle(partes) {
    const nodos = [];
    for (const p of partes.filter((x) => x && (typeof x === "string" || x.texto))) {
      if (nodos.length) nodos.push(document.createTextNode(" · "));
      if (typeof p === "string") nodos.push(document.createTextNode(p));
      else {
        const b = document.createElement("b");
        b.textContent = p.texto;
        nodos.push(document.createTextNode(p.antes ?? ""), b, document.createTextNode(p.despues ?? ""));
      }
    }
    $(".detalle").replaceChildren(...nodos);
  }

  function pintar() {
    const f = estado.fase;
    todo.dataset.fase = f;
    const nombre = String(estado.asistente || "Patty").slice(0, 40);
    $(".nombre").textContent = nombre;
    $(".avatar").textContent = nombre.trim().charAt(0).toUpperCase() || "P";
    const pagina = estado.total ? { antes: "Página ", texto: String(estado.pagina), despues: ` de ${estado.total}` } : null;
    const partes = [];
    let titulo = `${nombre} está usando esta pestaña`;
    let botones = [];
    if (f === "buscando") {
      partes.push(String(estado.haciendo || "Buscando…"), estado.restanteMs ? minutos(estado.restanteMs) : "");
      botones = [boton("Pausar", "", "control_pausar"), boton("Detener", "parar", "control_detener")];
    } else if (f === "pausada") {
      // Corto: en pausa la barra es una ficha chica en la esquina.
      titulo = `${nombre} en pausa`;
      partes.push(estado.motivoPausa === "actividad" ? "Toca Seguir cuando quieras" : "Espera a que sigas", pagina);
      botones = [boton("Seguir", "primario", "control_seguir"), boton("Detener", "parar", "control_detener")];
    } else if (f === "verificacion") {
      titulo = "Encuentra24 pide que confirmes que eres tú";
      partes.push(estado.mensaje && /Todavía/.test(estado.mensaje) ? String(estado.mensaje) : "Complétalo en la página y toca Seguir");
      botones = [boton("Seguir", "primario", "control_seguir"), boton("Dejarlo para después", "", "control_dejar")];
    } else if (f === "revisando") {
      titulo = `${nombre} terminó de leer`;
      partes.push(String(estado.haciendo || "Revisando…"));
    }
    $(".titulo").textContent = titulo;
    ponerDetalle(partes);
    $(".botones").replaceChildren(...botones);
    // En pausa, ficha chica en la esquina (no tapa lo que la persona quiere usar).
    barra.toggleAttribute("data-chip", f === "pausada");
    // En la verificación la barra baja para no tapar el recuadro de Encuentra24.
    abajo.verificacion = f === "verificacion";
    ubicarBarra();
    $(".avance").style.width = estado.total ? `${Math.min(100, (estado.pagina / estado.total) * 100)}%` : "0";
    if (f !== "buscando") {
      animacion++;
      resalte.classList.remove("ver");
      abajo.esquivar = false;
      ubicarBarra();
    }
  }

  // La barra nunca tapa lo que se está mirando: si el anuncio resaltado o el cursor quedan debajo de ella, se va abajo.
  const abajo = { verificacion: false, esquivar: false };
  function ubicarBarra() {
    barra.toggleAttribute("data-abajo", abajo.verificacion || abajo.esquivar);
  }
  function esquivar(caja) {
    if (!caja) return;
    const zona = 12 + barra.offsetHeight + 16;
    const arriba = caja.top < zona && caja.bottom > 0;
    const abajoTapa = caja.bottom > innerHeight - zona && caja.top < innerHeight;
    // Si está arriba, la barra baja; si está abajo, sube; si no tapa nada, se queda donde está.
    if (arriba && !abajo.esquivar) abajo.esquivar = true;
    else if (abajoTapa && abajo.esquivar) abajo.esquivar = false;
    ubicarBarra();
  }

  // --- Cursor ------------------------------------------------------------------------------------------------

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const ponerCursor = (x, y) => {
    pos = { x, y };
    cursor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    esquivar({ top: y - 4, bottom: y + 48 });
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

  let resaltado = null;
  function ubicarResalte() {
    if (!resaltado) return;
    const r = resaltado.getBoundingClientRect();
    Object.assign(resalte.style, { top: `${r.top - 6}px`, left: `${r.left - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
  }
  function resaltar(el) {
    resaltado = el ?? null;
    if (!el) return resalte.classList.remove("ver");
    ubicarResalte();
    resalte.classList.add("ver");
    esquivar(el.getBoundingClientRect());
  }
  // El recuadro acompaña al anuncio cuando la página se desplaza.
  const alDesplazar = () => requestAnimationFrame(ubicarResalte);
  addEventListener("scroll", alDesplazar, { passive: true });
  addEventListener("resize", alDesplazar, { passive: true });

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
    removeEventListener("scroll", alDesplazar);
    removeEventListener("resize", alDesplazar);
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
