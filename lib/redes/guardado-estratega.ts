import { esObjeto, esTexto } from "../panel/almacen";
import { revisarAnalisis, type FotoAnalizada, type FotoParaAnalisis } from "./analisis-fotos";
import { revisarPauta, type Pauta } from "./estratega";

// Lo que "Redes sociales" recuerda en el navegador (localStorage), por corredor y casa: la última estrategia, la
// última pauta y el último análisis de fotos. No hay tabla para esto (sin migraciones): vive en el teléfono de
// quien lo hizo. Todo se valida con la misma forma que lo que llega del servidor antes de mostrarlo.

export type TipoGuardado = "estrategia" | "pauta" | "fotos";

export const claveEstratega = (corredorId: string, casaId: string, tipo: TipoGuardado) => `redes-estratega:${corredorId}:${casaId}:${tipo}`;

const MAX_MARKDOWN = 40_000;
const medida = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x > 0 && x < 50_000 ? x : null);
const fechaValida =(x: unknown): x is string => esTexto(x) && !Number.isNaN(Date.parse(x));

export interface EstrategiaGuardada {
  fecha: string;
  markdown: string;
  demo: boolean;
}

export function estrategiaGuardada(v: unknown): EstrategiaGuardada | null {
  if (!esObjeto(v) || !fechaValida(v.fecha) || !esTexto(v.markdown) || !v.markdown.trim() || v.markdown.length > MAX_MARKDOWN) return null;
  return { fecha: v.fecha, markdown: v.markdown, demo: v.demo === true };
}

export interface PautaGuardada {
  fecha: string;
  pauta: Pauta;
  demo: boolean;
}

export function pautaGuardada(v: unknown): PautaGuardada | null {
  if (!esObjeto(v) || !fechaValida(v.fecha) || !esObjeto(v.pauta)) return null;
  // Ya pasó la revisión de cifras al llegar del servidor: aquí solo se vuelve a dar forma.
  const r = revisarPauta(v.pauta, null);
  return r ? { fecha: v.fecha, pauta: r.pauta, demo: v.demo === true } : null;
}

export interface FotosGuardadas {
  fecha: string;
  analisis: FotoAnalizada[];
  comentario: string;
  demo: boolean;
}

/**
 * El análisis guardado, solo para fotos que la casa tiene hoy (por su dirección): una foto borrada o una dirección de
 * afuera en el almacén no se muestra.
 */
export function fotosGuardadas(v: unknown, fotosDeHoy: FotoParaAnalisis[]): FotosGuardadas | null {
  if (!esObjeto(v) || !fechaValida(v.fecha) || !Array.isArray(v.analisis)) return null;
  const porUrl = new Map(fotosDeHoy.map((f) => [f.url, f]));
  const crudo = v.analisis
    .filter(esObjeto)
    .map((a) => ({ a, f: esTexto(a.url) ? porUrl.get(a.url) : undefined }))
    .filter((x): x is { a: Record<string, unknown>; f: FotoParaAnalisis } => !!x.f)
    .map(({ a, f }) => ({ a, f: { ...f, ancho: medida(a.ancho), alto: medida(a.alto) } }));
  const analisis = revisarAnalisis(
    crudo.map(({ a, f }) => ({ ...a, foto: f.id, ...(esObjeto(a.notas) ? a.notas : {}) })),
    // El tamaño lo midió el servidor al analizar (la página no lo sabe): se conserva para elegir las portadas.
    crudo.map(({ f }) => f),
  );
  if (!analisis.length) return null;
  return { fecha: v.fecha, analisis, comentario: esTexto(v.comentario) ? v.comentario.slice(0, 400) : "", demo: v.demo === true };
}
