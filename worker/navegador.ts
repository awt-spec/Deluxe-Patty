import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { esDesafio } from "../lib/encuentra24/parsear";

// Navegador real para Encuentra24: el sitio está detrás de Cloudflare y una petición HTTP simple
// recibe el desafío. Volumen bajo y pausas entre páginas para no parecer un robot ni cargar el sitio.
//
// Modo visible (la búsqueda semanal desde la computadora de soporte): Chrome con ventana, desde la
// conexión de la casa, con un perfil propio que guarda las cookies entre semanas. Si Cloudflare pide la
// verificación, la persona la resuelve en la ventana y la búsqueda sigue. No se disfraza nada: es un
// navegador normal que una persona está mirando.

export interface Navegador {
  obtenerPagina(url: string): Promise<string>;
  cerrar(): Promise<void>;
}

export interface OpcionesNavegador {
  pausaMinMs?: number;
  pausaMaxMs?: number;
  /** Ventana visible, Chrome instalado si lo hay y perfil guardado en esta carpeta. */
  visible?: { perfil: string };
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chrome instalado si existe; si no, el Chromium de Playwright. */
async function abrirVisible(perfil: string): Promise<BrowserContext> {
  const comun = { headless: false, locale: "es-CR", timezoneId: "America/Costa_Rica", viewport: null };
  if (process.env.CHROMIUM_PATH) return chromium.launchPersistentContext(perfil, { ...comun, executablePath: process.env.CHROMIUM_PATH });
  try {
    return await chromium.launchPersistentContext(perfil, { ...comun, channel: "chrome" });
  } catch {
    return await chromium.launchPersistentContext(perfil, comun);
  }
}

export async function abrirNavegador(opciones: OpcionesNavegador = {}): Promise<Navegador> {
  const pausaMin = opciones.pausaMinMs ?? 6000;
  const pausaMax = opciones.pausaMaxMs ?? 12000;
  let browser: Browser | null = null;
  let contexto: BrowserContext;

  if (opciones.visible) {
    contexto = await abrirVisible(opciones.visible.perfil);
  } else {
    browser = await chromium.launch(
      // En la nube de desarrollo Chromium ya está instalado. En GitHub Actions se usa el Chromium completo
      // en el modo sin interfaz nuevo.
      process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" },
    );
    // Chromium sin interfaz se anuncia como "HeadlessChrome"; se usa el user-agent normal de la misma versión.
    contexto = await browser.newContext({
      userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`,
      locale: "es-CR",
      timezoneId: "America/Costa_Rica",
      viewport: { width: 1366, height: 900 },
    });
  }
  const pagina: Page = contexto.pages()[0] ?? (await contexto.newPage());
  let primera = true;

  // El desafío de Cloudflare se resuelve solo y recarga la página. Sin ventana se espera hasta 60
  // segundos; con ventana, si no pasa solo, se le pide a la persona que lo resuelva (hasta 5 minutos).
  async function esperarContenido(): Promise<string> {
    let html = await pagina.content();
    for (let i = 0; i < 12 && esDesafio(html); i++) {
      await espera(5000);
      html = await pagina.content();
    }
    if (opciones.visible && esDesafio(html)) {
      console.log("Encuentra24 pide verificar que eres una persona: resuélvelo en la ventana de Chrome.");
      for (let i = 0; i < 60 && esDesafio(html); i++) {
        await espera(5000);
        html = await pagina.content();
      }
      if (!esDesafio(html)) console.log("Listo, sigo.");
    }
    return html;
  }

  return {
    async obtenerPagina(url) {
      if (!primera) await espera(pausaMin + Math.random() * (pausaMax - pausaMin));
      primera = false;
      await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      let html = await esperarContenido();
      // Si el desafío no se resolvió, una recarga suele pasarlo (la cookie de Cloudflare ya quedó puesta).
      if (esDesafio(html)) {
        await pagina.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
        html = await esperarContenido();
      }
      return html;
    },
    cerrar: async () => {
      await contexto.close();
      await browser?.close();
    },
  };
}
