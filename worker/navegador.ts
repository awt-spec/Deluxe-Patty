import { chromium, type Browser, type Page } from "playwright";
import { esDesafio } from "../lib/encuentra24/parsear";

// Navegador real para Encuentra24: el sitio está detrás de Cloudflare y una petición HTTP simple
// recibe el desafío. Volumen bajo y pausas entre páginas para no parecer un robot ni cargar el sitio.

export interface Navegador {
  obtenerPagina(url: string): Promise<string>;
  cerrar(): Promise<void>;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function abrirNavegador(opciones: { pausaMinMs?: number; pausaMaxMs?: number } = {}): Promise<Navegador> {
  const pausaMin = opciones.pausaMinMs ?? 6000;
  const pausaMax = opciones.pausaMaxMs ?? 12000;
  const browser: Browser = await chromium.launch(
    // En la nube de desarrollo Chromium ya está instalado. En GitHub Actions se usa el Chromium completo
    // en el modo sin interfaz nuevo: el "headless shell" por defecto lo detecta más Cloudflare.
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" },
  );
  // Chromium sin interfaz se anuncia como "HeadlessChrome"; se usa el user-agent normal de la misma versión.
  const version = browser.version();
  const contexto = await browser.newContext({
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`,
    locale: "es-CR",
    timezoneId: "America/Costa_Rica",
    viewport: { width: 1366, height: 900 },
  });
  const pagina: Page = await contexto.newPage();
  let primera = true;

  // El desafío de Cloudflare se resuelve solo y recarga la página: hasta 60 segundos.
  async function esperarContenido(): Promise<string> {
    let html = await pagina.content();
    for (let i = 0; i < 12 && esDesafio(html); i++) {
      await espera(5000);
      html = await pagina.content();
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
    cerrar: () => browser.close(),
  };
}
