// Lectura de páginas de Encuentra24. El sitio es una app Next.js: cada página trae los anuncios como
// JSON dentro del payload de React Server Components (self.__next_f.push([1, "..."])). Se lee ese
// JSON, que es más estable que las clases CSS del HTML.

export interface AnuncioE24 {
  id: string;
  titulo: string;
  url: string;
  descripcion: string;
  precio: number | null;
  moneda: string | null;
  zona: string | null;
  m2Construccion: number | null;
  m2Terreno: number | null;
  habitaciones: number | null;
  banos: number | null;
  /** "Agente", "Propietario", … tal como lo declara el anunciante. */
  tipoAnunciante: string | null;
  anunciante: { id: string | null; nombre: string | null; verificado: boolean; empresa: string | null; licencia: string | null };
  destacado: string | null;
  fotoPrincipal: string | null;
  fechaActualizacion: string | null;
}

const BASE = "https://www.encuentra24.com";

/** Une los fragmentos del payload RSC en un solo texto. */
export function payloadRsc(html: string): string {
  const partes: string[] = [];
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      partes.push(JSON.parse(m[1]) as string);
    } catch {
      // fragmento corrupto: se ignora
    }
  }
  return partes.join("");
}

/** Objetos JSON completos del texto que contienen `marca`. */
export function objetosCon(texto: string, marca: string): Record<string, unknown>[] {
  const res: Record<string, unknown>[] = [];
  let desde = 0;
  for (;;) {
    const j = texto.indexOf(marca, desde);
    if (j < 0) break;
    let encontrado = false;
    // Se retrocede probando cada "{" anterior hasta que uno abra un objeto JSON válido que incluya la marca.
    for (let k = texto.lastIndexOf("{", j); k >= 0 && j - k < 200_000; k = texto.lastIndexOf("{", k - 1)) {
      const fin = cierreObjeto(texto, k);
      if (fin === -1 || fin < j) continue;
      try {
        res.push(JSON.parse(texto.slice(k, fin + 1)));
        desde = fin + 1;
        encontrado = true;
      } catch {
        continue;
      }
      break;
    }
    if (!encontrado) desde = j + marca.length;
  }
  return res;
}

/** Índice de la "}" que cierra el objeto que abre en `inicio`, respetando cadenas. -1 si no cierra. */
function cierreObjeto(texto: string, inicio: number): number {
  let profundidad = 0;
  let enCadena = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      if (c === "\\") i++;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === "{") profundidad++;
    else if (c === "}") {
      profundidad--;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || v === "$undefined") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" && v !== "$undefined" ? v.trim() : null;
}

function limpiarHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function anuncio(o: any): AnuncioE24 | null {
  const id = texto(o.id);
  const link = texto(o.link);
  if (!id || !link) return null;
  const usuario = o.user && typeof o.user === "object" ? o.user : {};
  return {
    id,
    titulo: texto(o.title) ?? "",
    url: link.startsWith("http") ? link : `${BASE}${link}`,
    descripcion: limpiarHtml(String(o.description ?? "")),
    precio: numero(o.price?.amount?.value ?? o.propertyPrice ?? o.price_value),
    moneda: texto(o.price?.currency?.symbol),
    zona: texto(o.location?.locality) ?? texto(o.regionName),
    m2Construccion: numero(o.square),
    m2Terreno: numero(o.lotSize),
    habitaciones: numero(o.rooms),
    banos: numero(o.bathrooms),
    tipoAnunciante: texto(o.advertiserType),
    anunciante: {
      id: texto(usuario.id),
      nombre: texto(usuario.name),
      verificado: usuario.verified === true,
      empresa: texto(usuario.contact?.company),
      licencia: texto(usuario.contact?.license),
    },
    destacado: texto(o.featured),
    fotoPrincipal: texto(o.principalImage),
    fechaActualizacion: texto(String(o.dateUpdated ?? "").replace(/^\$D/, "")),
  };
}

/** Anuncios de bienes raíces de una página de listado o de un perfil. */
export function anunciosDePagina(html: string): AnuncioE24[] {
  const vistos = new Set<string>();
  const res: AnuncioE24[] = [];
  for (const o of objetosCon(payloadRsc(html), '"fieldset":"property"')) {
    const a = anuncio(o);
    if (a && !vistos.has(a.id)) {
      vistos.add(a.id);
      res.push(a);
    }
  }
  return res;
}

/** ¿La página es el desafío de Cloudflare en vez del contenido? */
export function esDesafio(html: string): boolean {
  return !html.includes("self.__next_f") && /cloudflare|cf-chl|challenge-platform/i.test(html);
}

/** URL de la página `n` (desde 1) del listado de casas en venta de una zona. */
export function urlListado(categoria: string, zona: string, pagina: number): string {
  const base = `${BASE}/costa-rica-es/${categoria}/${zona}`;
  return pagina <= 1 ? base : `${base}?page=${pagina}`;
}
