// Lo que se guarda en `leads_duenos.senales` (jsonb, un arreglo). Sin migraciones, la columna lleva tres formas:
//
//   "Se declara Propietario"                              ← texto suelto (búsquedas viejas): se clasifica por palabras
//   {"tipo": "pro",    "texto": "Texto en primera persona"} ← razón a favor de que sea el dueño (Haiku, búsquedas nuevas)
//   {"tipo": "contra", "texto": "Tono comercial de agencia"} ← razón en contra o duda
//   {"tipo": "foto",   "url": "https://photos.encuentra24.com/…"} ← hasta 4 fotos del anuncio (solo https de *.encuentra24.com)
//
// Quien lea la columna usa `leerSenales` (o `textosDeSenales`): lo que no sea una de estas formas se ignora, y las
// fotos se vuelven a validar al leer. Pura: sin base ni navegador (la usan el servidor, el panel y las pruebas).

export const MAX_FOTOS_LEAD = 4;
const MAX_TEXTO_SENAL = 160;
const MAX_RAZONES = 6;

export type LadoSenal = "pro" | "contra";
/** Una razón de la revisión: a favor o en contra de que sea el dueño. */
export interface SenalDueno {
  tipo: LadoSenal;
  texto: string;
}
/** Lo que trae la revisión: texto suelto (como antes) o con su lado. */
export type SenalCruda = string | SenalDueno;
export type SenalGuardada = string | SenalDueno | { tipo: "foto"; url: string };

const esHostE24 = (host: string) => host === "encuentra24.com" || host.endsWith(".encuentra24.com");

/** ¿Es una foto que se puede mostrar? Solo https de Encuentra24, sin usuario, puerto, ".." ni SVG. */
export function esFotoDeE24(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2000) return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      esHostE24(u.hostname.toLowerCase()) &&
      !u.username &&
      !u.password &&
      !u.port &&
      !url.includes("..") &&
      !/\.svg$/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

/** Fotos válidas, sin repetir y en su orden, hasta 4. */
export function fotosValidas(urls: readonly unknown[]): string[] {
  const res: string[] = [];
  for (const u of urls) {
    if (esFotoDeE24(u) && !res.includes(u)) res.push(u);
    if (res.length >= MAX_FOTOS_LEAD) break;
  }
  return res;
}

const limpiarTexto = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, MAX_TEXTO_SENAL);

/** El texto de una señal (cruda o guardada), o null si no es una razón. */
export function textoSenal(s: unknown): string | null {
  if (typeof s === "string") return limpiarTexto(s) || null;
  if (s && typeof s === "object") {
    const o = s as { tipo?: unknown; texto?: unknown };
    if ((o.tipo === "pro" || o.tipo === "contra") && typeof o.texto === "string") return limpiarTexto(o.texto) || null;
  }
  return null;
}

/** Lo que va a la columna: las razones (con su lado si lo trae) y, al final, las fotos válidas. */
export function senalesParaGuardar(senales: readonly SenalCruda[], fotos: readonly unknown[]): SenalGuardada[] {
  const res: SenalGuardada[] = [];
  for (const s of senales.slice(0, MAX_RAZONES)) {
    const texto = textoSenal(s);
    if (!texto) continue;
    res.push(typeof s === "string" ? texto : { tipo: s.tipo, texto });
  }
  for (const url of fotosValidas(fotos)) res.push({ tipo: "foto", url });
  return res;
}

export interface SenalesLeidas {
  /** Razones en su orden; `lado` null = texto suelto de una búsqueda vieja (se clasifica por palabras). */
  razones: { texto: string; lado: LadoSenal | null }[];
  fotos: string[];
}

/** Lee la columna tal como venga (vieja, nueva o con basura). `fotoUrl` es `leads_duenos.foto_url`, si la hay. */
export function leerSenales(v: unknown, fotoUrl?: string | null): SenalesLeidas {
  const razones: SenalesLeidas["razones"] = [];
  const fotos: unknown[] = [];
  for (const s of Array.isArray(v) ? v : []) {
    if (s && typeof s === "object" && (s as { tipo?: unknown }).tipo === "foto") {
      fotos.push((s as { url?: unknown }).url);
      continue;
    }
    const texto = textoSenal(s);
    if (!texto || razones.some((r) => r.texto === texto)) continue;
    razones.push({ texto, lado: typeof s === "string" ? null : (s as SenalDueno).tipo });
  }
  // La foto principal (columna de antes) va primero si las señales no la traen.
  return { razones: razones.slice(0, MAX_RAZONES), fotos: fotosValidas(fotoUrl ? [fotoUrl, ...fotos] : fotos) };
}

/** Solo los textos de las razones (para la lista de WhatsApp o un resumen): nunca fotos ni objetos raros. */
export const textosDeSenales = (v: unknown): string[] => leerSenales(v).razones.map((r) => r.texto);
