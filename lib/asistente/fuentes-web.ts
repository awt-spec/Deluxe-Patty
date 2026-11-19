import type Anthropic from "@anthropic-ai/sdk";

// Lo que vuelve de una respuesta con búsqueda en internet (web_search) o lectura de páginas (web_fetch): al corredor
// solo le llega el texto; las fuentes las arma el código con las direcciones que trajo la herramienta (primero las que
// el modelo citó, después las de los resultados), nunca con enlaces que el modelo escriba por su cuenta.

export interface FuenteWeb {
  url: string;
  titulo: string;
}

type Bloque = Anthropic.Beta.BetaContentBlock;

export const MAX_FUENTES = 3;

/** Solo https, sin usuario ni contraseña en la dirección y con un dominio de verdad. */
function urlSegura(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 2000) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;
    // Los paréntesis cortarían el enlace de markdown.
    return u.toString().replace(/\(/g, "%28").replace(/\)/g, "%29");
  } catch {
    return null;
  }
}

const dominio = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** Título en una línea, sin corchetes ni paréntesis que rompan el enlace de markdown. */
const tituloLimpio = (t: unknown, url: string) =>
  (typeof t === "string" ? t : "").replace(/[\[\]()<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || dominio(url);

/** El texto de la respuesta (solo bloques de texto, en orden) y las fuentes web, sin repetir y hasta 3. */
export function textoYFuentes(bloques: Bloque[]): { texto: string; fuentes: FuenteWeb[] } {
  const textos: string[] = [];
  const citadas: FuenteWeb[] = [];
  const resultados: FuenteWeb[] = [];
  for (const b of bloques) {
    if (b.type === "text") {
      textos.push(b.text);
      for (const c of b.citations ?? []) {
        if (c.type !== "web_search_result_location") continue;
        const url = urlSegura(c.url);
        if (url) citadas.push({ url, titulo: tituloLimpio(c.title, url) });
      }
    } else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      // Si la búsqueda falló, content es un objeto de error (no una lista): se ignora.
      for (const r of b.content) {
        const url = urlSegura(r.url);
        if (url) resultados.push({ url, titulo: tituloLimpio(r.title, url) });
      }
    } else if (b.type === "web_fetch_tool_result" && b.content.type === "web_fetch_result") {
      const url = urlSegura(b.content.url);
      if (url) resultados.push({ url, titulo: tituloLimpio(b.content.content.title, url) });
    }
  }
  const vistas = new Set<string>();
  const fuentes: FuenteWeb[] = [];
  for (const f of [...citadas, ...resultados]) {
    if (fuentes.length >= MAX_FUENTES) break;
    if (vistas.has(f.url)) continue;
    vistas.add(f.url);
    fuentes.push(f);
  }
  return { texto: textos.join("").trim(), fuentes };
}

/** "Fuentes:" al final de la respuesta, una por línea, con el dominio a la vista. */
export function lineasFuentes(fuentes: FuenteWeb[]): string {
  if (!fuentes.length) return "";
  return ["Fuentes:", ...fuentes.slice(0, MAX_FUENTES).map((f) => `- [${f.titulo}](${f.url}) · ${dominio(f.url)}`)].join("\n");
}
