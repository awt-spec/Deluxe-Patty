// Prueba real del buscador de dueños en Chromium, con la extensión cargada y SIN tocar encuentra24.com: un servidor local
// hace de panel (/panel/duenos y /api/extension/*) y las direcciones de Encuentra24 se responden con páginas de prueba
// (tests/fixtures/e24.ts y tests/fixtures/verificacion-e24.ts) interceptadas por Playwright. El reloj del ritmo se acelera
// (velocidadPrueba, que la extensión solo acepta con el panel en localhost).
//
//   npx tsx scripts/probar-buscador.mts [carpeta-de-capturas]
//
// Revisa: marco y cursor sobre la página, avance con pausas, Pausar/Seguir/Detener desde la barra, el popup y el panel,
// pausa sola al usar la pestaña, y que una verificación detiene y muestra el aviso. Deja capturas en la carpeta.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page, type Worker } from "playwright";
import { urlListado } from "../lib/encuentra24/parsear";
import { anuncioE24, paginaE24 } from "../tests/fixtures/e24";
import { DESAFIO_CLOUDFLARE } from "../tests/fixtures/verificacion-e24";

const CAPTURAS = process.argv[2] ?? join(tmpdir(), "buscador-capturas");
const PUERTO = 4319;
const APP = `http://127.0.0.1:${PUERTO}`;
const CAT = "bienes-raices-venta-de-propiedades-casas";
const ZONAS = ["escazu", "santa-ana"];
const VELOCIDAD = 12;

// --- Servidor del panel simulado -----------------------------------------------------------------------------------

const orden: string[] = [];
for (let p = 1; p <= 4; p++) for (const z of ZONAS) orden.push(urlListado(CAT, z, p));
const registro = { paginas: [] as string[], detener: [] as { busqueda: string; motivo: string }[], busquedas: 0 };
let busquedaActual = "";

const leer = (req: IncomingMessage) =>
  new Promise<Record<string, unknown>>((r) => {
    let t = "";
    req.on("data", (c) => (t += c));
    req.on("end", () => {
      try {
        r(JSON.parse(t || "{}"));
      } catch {
        r({});
      }
    });
  });
const json = (res: ServerResponse, d: unknown) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(d));
};

const PANEL = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Dueños directos (prueba)</title>
<style>body{font:16px system-ui;margin:24px;color:#111b21}button{font:inherit;padding:10px 16px;border-radius:10px;border:1px solid #ccc;margin-right:8px}
#estado{margin:16px 0;padding:14px;border-radius:12px;background:#e7f7f1;min-height:24px}</style></head><body>
<h1>Dueños directos</h1><div id="estado">…</div>
<button id="buscar">Buscar ahora</button><button id="detener">Detener</button><button id="pausar">Pausar</button><button id="seguir">Seguir</button>
<script>
const origen = location.origin;
let n = 0;
function pedir(orden){ const pedido = "p" + (++n); window.postMessage({ fuente: "panel-duenos", tipo: "busqueda", orden, pedido }, origen); }
window.addEventListener("message", (e) => {
  if (e.source !== window || e.origin !== origen || e.data?.fuente !== "buscador-duenos" || e.data.tipo !== "busqueda") return;
  const d = e.data; window.ultimoEstado = d;
  document.getElementById("estado").textContent = d.fase === "buscando" ? "Buscando ahora · página " + d.pagina + " de " + d.total + " · " + d.haciendo : d.fase + " " + (d.mensaje || "");
});
for (const o of ["buscar","detener","pausar","seguir"]) document.getElementById(o).onclick = () => pedir(o);
setInterval(() => pedir("estado"), 700);
</script></body></html>`;

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", APP);
  if (url.pathname.startsWith("/panel/duenos")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(PANEL);
  }
  const auth = req.headers.authorization === `Bearer ${"a".repeat(64)}`;
  if (url.pathname === "/api/extension/programa") return json(res, { ok: true, buscar: false, ultimaDias: 2 });
  if (!auth) return json(res, { ok: false, mensaje: "sin permiso" });
  const c = await leer(req);
  if (url.pathname === "/api/extension/busqueda") {
    registro.busquedas++;
    busquedaActual = `1b4e28ba-2fa1-41d2-883f-00000000000${registro.busquedas}`;
    return json(res, { ok: true, busqueda: busquedaActual, siguiente: orden[0], zonas: ZONAS.length, asistente: "Patty" });
  }
  if (url.pathname === "/api/extension/pagina") {
    registro.paginas.push(String(c.url));
    const i = orden.indexOf(String(c.url));
    return json(res, { ok: true, desafio: false, siguiente: orden[i + 1] ?? null, paginas: i + 1 });
  }
  if (url.pathname === "/api/extension/detener") {
    registro.detener.push({ busqueda: String(c.busqueda), motivo: String(c.motivo) });
    return json(res, { ok: true, paginas: registro.paginas.length });
  }
  if (url.pathname === "/api/extension/estado") {
    return json(res, { ok: true, listo: true, resumen: { duenos: 2, paginas: registro.paginas.length, anuncios: registro.paginas.length * 6, candidatos: 3 } });
  }
  json(res, { ok: false });
});

// --- Encuentra24 de prueba -----------------------------------------------------------------------------------------

let verificarEn: string | null = null;

function listado(url: string): string {
  const u = new URL(url);
  const pagina = Number(u.searchParams.get("page") ?? 1);
  const zona = u.pathname.split("/").at(-1) ?? "";
  const base = pagina * 100 + (zona === "escazu" ? 0 : 50);
  const anuncios = Array.from({ length: 12 }, (_, i) => anuncioE24(10_000 + base + i, i % 3 === 0 ? "Agente" : "Propietario", `Anunciante ${i}`));
  const datos = paginaE24(anuncios);
  const tarjetas = anuncios
    .map(
      (a, i) => `<article class="card"><a href="https://www.encuentra24.com${a.link}"><div class="foto" style="background:hsl(${(i * 37) % 360} 35% 78%)"></div>
<h3>Casa de prueba ${a.id}</h3><p class="precio">$${(320 + i * 15).toLocaleString("es-CR")} 000</p><p class="zona">${zona.replace("-", " ")} · 3 hab · 2 baños</p></a></article>`,
    )
    .join("");
  return datos.replace(
    "<div>listado</div>",
    `<style>body{margin:0;font:15px system-ui;background:#f4f5f7;color:#222}header{background:#fff;padding:18px 32px;border-bottom:1px solid #ddd;font-weight:700}
main{max-width:1100px;margin:0 auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px #0002}
.card a{color:inherit;text-decoration:none;display:block}.foto{height:150px}.card h3{margin:10px 12px 4px;font-size:16px}.card p{margin:0 12px 10px;color:#555}.precio{font-weight:700;color:#222!important}
nav{display:flex;gap:10px;justify-content:center;margin:28px 0}nav a{padding:10px 16px;border-radius:8px;background:#fff;border:1px solid #ccc;color:#222;text-decoration:none}</style>
<header>Portal de prueba · Casas en venta · ${zona} · página ${pagina}</header><main><div class="grid">${tarjetas}</div>
<nav><a href="?page=${Math.max(1, pagina - 1)}">Anterior</a><a href="?page=${pagina + 1}" rel="next">Siguiente</a></nav></main>`,
  );
}

// --- Prueba ---------------------------------------------------------------------------------------------------------

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fallos: string[] = [];
function revisar(ok: boolean, que: string) {
  console.log(`${ok ? "OK  " : "FALLA"} ${que}`);
  if (!ok) fallos.push(que);
}

async function hasta<T>(f: () => Promise<T>, ok: (v: T) => boolean, ms = 30_000): Promise<T> {
  const fin = Date.now() + ms;
  let v = await f();
  while (!ok(v) && Date.now() < fin) {
    await espera(150);
    v = await f();
  }
  return v;
}

type Estado = { fase?: string; pagina?: number; total?: number; motivoPausa?: string | null; haciendo?: string; mensaje?: string };
const estadoDe = (sw: Worker) => sw.evaluate(() => chrome.storage.local.get("busqueda").then((r) => (r.busqueda ?? {}) as Estado));

/** Hace clic en un botón de la barra (Shadow DOM cerrado): CDP sí la ve. */
async function clicEnBarra(ctx: BrowserContext, pagina: Page, texto: string, intentos = 20): Promise<void> {
  try {
    return await clicUnaVez(ctx, pagina, texto);
  } catch (e) {
    // Entre una página y otra la barra no está: se espera a que vuelva.
    if (intentos <= 0) throw e;
    await espera(250);
    return clicEnBarra(ctx, pagina, texto, intentos - 1);
  }
}

async function clicUnaVez(ctx: BrowserContext, pagina: Page, texto: string) {
  const cdp = await ctx.newCDPSession(pagina);
  const { root } = (await cdp.send("DOM.getDocument", { depth: -1, pierce: true })) as { root: Nodo };
  type Nodo = { nodeId: number; backendNodeId: number; nodeName: string; children?: Nodo[]; shadowRoots?: Nodo[]; nodeValue?: string };
  const buscar = (n: Nodo): Nodo | null => {
    if (n.nodeName === "BUTTON" && (n.children ?? []).some((h) => h.nodeValue === texto)) return n;
    for (const h of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) {
      const r = buscar(h);
      if (r) return r;
    }
    return null;
  };
  const boton = buscar(root);
  if (!boton) throw new Error(`No veo el botón "${texto}" en la barra`);
  const { model } = (await cdp.send("DOM.getBoxModel", { backendNodeId: boton.backendNodeId })) as { model: { content: number[] } };
  const [x1, y1, , , x3, y3] = model.content;
  await cdp.detach();
  await pagina.mouse.click((x1 + x3) / 2, (y1 + y3) / 2);
}

async function main() {
  mkdirSync(CAPTURAS, { recursive: true });
  await new Promise<void>((r) => servidor.listen(PUERTO, "127.0.0.1", r));

  // La extensión empacada para este panel local (sin tocar public/).
  const carpeta = mkdtempSync(join(tmpdir(), "buscador-ext-"));
  cpSync("extension", carpeta, { recursive: true });
  for (const f of readdirSync(carpeta)) {
    if (/\.(js|json)$/.test(f)) writeFileSync(join(carpeta, f), readFileSync(join(carpeta, f), "utf8").replaceAll("__APP__", APP));
  }
  const perfil = mkdtempSync(join(tmpdir(), "buscador-perfil-"));
  const ctx = await chromium.launchPersistentContext(perfil, {
    // El modo sin interfaz nuevo (el Chromium completo) carga extensiones; el "headless shell" no.
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${carpeta}`, `--load-extension=${carpeta}`],
  });
  try {
    // Ninguna petición sale a encuentra24.com: se responde aquí.
    await ctx.route("https://www.encuentra24.com/**", (ruta) => {
      const url = ruta.request().url();
      if (verificarEn && url === verificarEn) {
        return ruta.fulfill({ status: 403, contentType: "text/html; charset=utf-8", body: DESAFIO_CLOUDFLARE });
      }
      return ruta.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: listado(url) });
    });
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
    const id = new URL(sw.url()).host;
    await sw.evaluate(
      ([token, velocidad]) => chrome.storage.local.set({ token, corredor: "Deluxe (prueba)", buscarSola: false, velocidadPrueba: velocidad }),
      ["a".repeat(64), VELOCIDAD] as const,
    );

    // 1. Desde el popup: a la vista, con marco y cursor; avanza páginas con pausas.
    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 340, height: 560 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const nueva = ctx.waitForEvent("page");
    await popup.click("#buscar");
    const e24 = await nueva;
    await e24.bringToFront();
    let e = await hasta(() => estadoDe(sw), (v) => v.fase === "buscando" && (v.pagina ?? 0) >= 1 && v.haciendo === "Leyendo anuncios…");
    revisar(e.fase === "buscando" && e.total === 12, `empieza a la vista (página ${e.pagina} de ${e.total})`);
    revisar(e24.url().startsWith("https://www.encuentra24.com/"), "abre Encuentra24 (interceptado) en una sola pestaña nueva");
    const hayMarco = await e24.evaluate(() => [...document.documentElement.children].some((n) => n instanceof HTMLElement && n.style.zIndex === "2147483647" && n.shadowRoot === null));
    revisar(hayMarco, "el marco está en la página y su Shadow DOM es cerrado (la página no lo ve por dentro)");
    await espera(900);
    await e24.screenshot({ path: join(CAPTURAS, "1-marco-cursor.png") });

    const t0 = Date.now();
    e = await hasta(() => estadoDe(sw), (v) => (v.pagina ?? 0) >= 3, 60_000);
    revisar((e.pagina ?? 0) >= 3, `avanza de página con pausas (${e.pagina} páginas en ${((Date.now() - t0) / 1000).toFixed(1)} s a ×${VELOCIDAD})`);
    revisar(ctx.pages().filter((p) => p.url().includes("encuentra24")).length === 1, "nunca más de una pestaña de Encuentra24");

    // 2. Pausar y seguir desde la barra.
    await clicEnBarra(ctx, e24, "Pausar");
    e = await hasta(() => estadoDe(sw), (v) => v.fase === "pausada");
    revisar(e.fase === "pausada" && e.motivoPausa === "usuario", "Pausar en la barra");
    const pagPausa = e.pagina;
    await espera(2500);
    e = await estadoDe(sw);
    revisar(e.pagina === pagPausa, "en pausa no avanza");
    await e24.screenshot({ path: join(CAPTURAS, "2-pausada.png") });
    await clicEnBarra(ctx, e24, "Seguir");
    e = await hasta(() => estadoDe(sw), (v) => v.fase === "buscando");
    revisar(e.fase === "buscando", "Seguir en la barra");

    // 3. La persona usa la pestaña: se pausa sola.
    await espera(2800);
    await e24.mouse.move(200, 500);
    await e24.mouse.move(700, 600, { steps: 12 });
    e = await hasta(() => estadoDe(sw), (v) => v.fase === "pausada", 5000);
    revisar(e.fase === "pausada" && e.motivoPausa === "actividad", "mover el mouse en la pestaña la pausa sola");
    await espera(500);
    await e24.screenshot({ path: join(CAPTURAS, "3-pausa-por-actividad.png") });

    // 4. Popup con el estado en vivo; Seguir y luego Detener desde ahí.
    await popup.bringToFront();
    await popup.waitForSelector("#en-curso:not([hidden])");
    await popup.screenshot({ path: join(CAPTURAS, "4-popup-pausada.png") });
    await popup.click("#seguir");
    e = await hasta(() => estadoDe(sw), (v) => v.fase === "buscando");
    revisar(e.fase === "buscando", "Seguir desde el popup");
    await espera(1500);
    await popup.screenshot({ path: join(CAPTURAS, "5-popup-buscando.png") });
    const leidas = registro.paginas.length;
    await popup.click("#detener");
    e = await hasta(() => estadoDe(sw), (v) => v.fase === "detenida", 15_000);
    revisar(e.fase === "detenida", `Detener desde el popup: "${e.mensaje}"`);
    revisar(registro.detener.length === 1 && registro.detener[0].busqueda === busquedaActual && registro.detener[0].motivo === "usuario", "le pide al servidor guardar lo leído");
    revisar(registro.paginas.length >= leidas && registro.paginas.length > 0, `las páginas leídas (${registro.paginas.length}) llegaron al servidor`);
    await espera(400);
    revisar(!ctx.pages().some((p) => p.url().includes("encuentra24")), "cierra la pestaña de la búsqueda");
    await popup.screenshot({ path: join(CAPTURAS, "6-popup-detenida.png") });

    // 5. Desde el panel: Buscar ahora y Detener por el canal de la página.
    const panel = await ctx.newPage();
    await panel.goto(`${APP}/panel/duenos`);
    await panel.click("#buscar");
    e = await hasta(() => estadoDe(sw), (v) => v.fase === "buscando" && (v.pagina ?? 0) >= 1);
    revisar(e.fase === "buscando", "Buscar ahora desde el panel");
    const texto = await hasta(() => panel.textContent("#estado"), (t) => /Buscando ahora · página/.test(t ?? ""), 8000);
    revisar(/Buscando ahora · página \d+ de 12/.test(texto ?? ""), `el panel ve "${texto?.slice(0, 60)}"`);
    await panel.click("#detener");
    e = await hasta(() => estadoDe(sw), (v) => v.fase === "detenida", 15_000);
    revisar(e.fase === "detenida" && registro.detener.length === 2, "Detener desde el panel");

    // 6. Verificación: se detiene, deja la pestaña enfrente y pide resolverla; Seguir retoma; Detener en la barra la deja.
    verificarEn = orden[1];
    const tercera = ctx.waitForEvent("page");
    await popup.bringToFront();
    await popup.click("#buscar");
    const e24b = await tercera;
    e = await hasta(() => estadoDe(sw), (v) => v.fase === "verificacion", 60_000);
    revisar(e.fase === "verificacion", "una página de verificación (403) detiene la búsqueda");
    await espera(800);
    await e24b.screenshot({ path: join(CAPTURAS, "7-verificacion.png") });
    const pagVer = (await estadoDe(sw)).pagina;
    await espera(1500);
    revisar((await estadoDe(sw)).pagina === pagVer, "mientras espera la verificación no sigue");
    // La "persona" la resuelve (la siguiente carga ya es el listado) y toca Seguir.
    verificarEn = null;
    await e24b.reload();
    await clicEnBarra(ctx, e24b, "Seguir").catch(async () => {
      // Al recargar se fue la barra: Seguir desde el popup.
      await popup.click("#seguir");
    });
    e = await hasta(() => estadoDe(sw), (v) => v.fase === "buscando" && (v.pagina ?? 0) > (pagVer ?? 0), 30_000);
    revisar(e.fase === "buscando", "resuelta la verificación, Seguir continúa");
    e = await hasta(() => estadoDe(sw), (v) => v.haciendo === "Leyendo anuncios…");
    await espera(600);
    await clicEnBarra(ctx, e24b, "Detener");
    e = await hasta(() => estadoDe(sw), (v) => v.fase === "detenida", 15_000);
    revisar(e.fase === "detenida", "Detener desde la barra");
    await espera(400);
    const sigue = ctx.pages().find((p) => p.url().includes("encuentra24"));
    revisar(!!sigue, "detenida desde la barra, la pestaña queda para la persona");
    const sinMarco = sigue ? await sigue.evaluate(() => ![...document.documentElement.children].some((n) => n instanceof HTMLElement && n.style.zIndex === "2147483647")) : false;
    revisar(sinMarco, "y se quita el marco");
  } finally {
    await ctx.close();
    servidor.close();
    rmSync(perfil, { recursive: true, force: true });
    rmSync(carpeta, { recursive: true, force: true });
  }
  console.log(`\nCapturas en ${CAPTURAS}`);
  if (fallos.length) {
    console.error(`${fallos.length} fallas`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  servidor.close();
  process.exit(1);
});
