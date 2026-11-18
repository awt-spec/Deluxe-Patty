"use server";

import { revalidatePath } from "next/cache";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import type { Corredor, Foto } from "@/lib/datos/tipos";
import { puedeUsarImagenes } from "@/lib/fotos/variantes";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { reportarFalla } from "@/lib/monitoreo/fallas";
import { ordenarFotos } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import type { CasaDelSitio } from "@/lib/panel/sitio-fotos";
import { hayTurnoPorMinuto } from "@/lib/panel/turno-ia";
import { reclamarEnvio } from "@/lib/panel/una-vez";
import {
  MAX_FOTOS_ENVIO,
  armarPedido,
  caminoEnvio,
  caminoMejorada,
  configFotosSitio,
  enviarAlSitio,
  esCaminoEnvio,
  esFotoParaSitio,
  leerRespuestaSitio,
  mensajeFallaSitio,
  nuevoLote,
  urlPublicaFoto,
} from "@/lib/sitio/fotos";
import { CODIGO_SITIO, fotosDeCasa, fuentesSitio, hostsDeFotos } from "@/lib/sitio/importar";
import { sitiosWeb } from "@/lib/sitio/modo-corredor";
import { createAdminClient } from "@/lib/supabase/admin";

// Subir fotos al sitio web desde el chat de Patty. Cada acción comprueba con la sesión que la casa es del corredor,
// que es una casa del sitio (DP-XXXXXX) y que está activa. Las fotos suben primero del teléfono al bucket propio
// (`<corredor>/<casa>/al-sitio/`, permiso por archivo); mejorar con IA respeta el permiso de imágenes y la Energía;
// el envío al sitio va firmado (lib/sitio/fotos.ts) y solo cuando el corredor toca "Sí, subir al sitio". En la demo
// (corredor inactivo) nada sube ni sale: el resultado es simulado. Los registros llevan solo el corredor y códigos.

type Fallo = { ok: false; motivo: string };
const NO_ES_TUYA = "No encontré esa casa entre las del sitio.";
const MUCHOS = "Vas muy rápido: espera un minuto y vuelve a intentarlo.";
const SIN_SITIO = "Tu sitio web todavía no está conectado para recibir fotos. Escríbele a soporte.";
const EN_LA_DEMO_IA = "En la demo no se mejoran fotos: van las originales.";

type Sesion = Awaited<ReturnType<typeof sesionConCorredor>>;
type CasaFila = { id: string; codigo: string; titulo: string; zona: string | null; estado: string; fotos: Foto[] | null };

const esDemo = (s: Sesion) => (s.corredor as Corredor).activo === false;

function baseStorage(): string | null {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  return u ? u.replace(/\/+$/, "") : null;
}

async function slugDe(s: Sesion): Promise<string | null> {
  const { data } = await s.supabase.from("corredores").select("slug").eq("id", s.corredor.id).maybeSingle();
  return (data as { slug?: string } | null)?.slug ?? null;
}

/** Una casa del corredor que existe en el sitio (en la demo, cualquiera activa: es simulado). */
async function casaDelSitio(s: Sesion, id: unknown): Promise<CasaFila | null> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await s.supabase
    .from("propiedades")
    .select("id, codigo, titulo, zona, estado, fotos")
    .eq("corredor_id", s.corredor.id)
    .eq("id", id)
    .eq("estado", "activa")
    .maybeSingle();
  const casa = data as CasaFila | null;
  if (!casa) return null;
  if (!esDemo(s) && !CODIGO_SITIO.test(casa.codigo.toUpperCase())) return null;
  return casa;
}

/** Paso 1: las casas a las que se les pueden subir fotos (las del sitio, activas). */
export async function casasDelSitio(): Promise<{ ok: true; demo: boolean; casas: CasaDelSitio[] } | Fallo> {
  const s = await sesionConCorredor();
  const demo = esDemo(s);
  if (!demo && !configFotosSitio(await slugDe(s))) return { ok: false, motivo: SIN_SITIO };
  const { data } = await s.supabase
    .from("propiedades")
    .select("id, codigo, titulo, zona, estado, fotos")
    .eq("corredor_id", s.corredor.id)
    .eq("estado", "activa")
    .order("codigo")
    .limit(500);
  const casas = ((data ?? []) as CasaFila[])
    .filter((c) => demo || CODIGO_SITIO.test(c.codigo.toUpperCase()))
    .map((c) => ({ id: c.id, codigo: c.codigo, titulo: c.titulo, zona: c.zona, foto: ordenarFotos(c.fotos ?? [])[0]?.url ?? null }));
  if (casas.length === 0) return { ok: false, motivo: demo ? "La demo no tiene casas activas." : "No tienes casas activas del sitio (las de código DP-…)." };
  return { ok: true, demo, casas };
}

/** Paso 2: permisos para subir las fotos del teléfono al bucket propio (en la demo no se sube nada). */
export async function prepararFotosSitio(
  casaId: unknown,
  cuantas: unknown,
): Promise<{ ok: true; demo: true } | { ok: true; demo: false; subidas: { camino: string; token: string }[] } | Fallo> {
  const s = await sesionConCorredor();
  const casa = await casaDelSitio(s, casaId);
  if (!casa) return { ok: false, motivo: NO_ES_TUYA };
  if (esDemo(s)) return { ok: true, demo: true };
  const n = typeof cuantas === "number" && Number.isInteger(cuantas) ? cuantas : 0;
  if (n < 1 || n > MAX_FOTOS_ENVIO) return { ok: false, motivo: `Se suben hasta ${MAX_FOTOS_ENVIO} fotos por vez.` };
  if (!configFotosSitio(await slugDe(s))) return { ok: false, motivo: SIN_SITIO };
  if (!(await hayTurnoPorMinuto("sitio_fotos_preparar", s.corredor.id, 6))) return { ok: false, motivo: MUCHOS };
  const almacen = createAdminClient().storage.from("fotos");
  const lote = nuevoLote();
  const subidas: { camino: string; token: string }[] = [];
  for (let i = 1; i <= n; i++) {
    const camino = caminoEnvio(s.corredor.id, casa.id, lote, i);
    const { data, error } = await almacen.createSignedUploadUrl(camino);
    if (error || !data) return { ok: false, motivo: "No se pudo preparar la subida. Inténtalo de nuevo." };
    subidas.push({ camino, token: data.token });
  }
  return { ok: true, demo: false, subidas };
}

/** "Mejorar con IA" de una foto ya subida: la mejorada queda aparte (la original no se toca). */
export async function mejorarFotoSitio(casaId: unknown, camino: unknown): Promise<{ ok: true; camino: string; url: string } | Fallo> {
  const s = await sesionConCorredor();
  const casa = await casaDelSitio(s, casaId);
  if (!casa) return { ok: false, motivo: NO_ES_TUYA };
  if (esDemo(s)) return { ok: false, motivo: EN_LA_DEMO_IA };
  if (!esCaminoEnvio(camino, s.corredor.id, casa.id)) return { ok: false, motivo: "No reconocí esa foto." };
  const corredor = s.corredor as Corredor;
  const deps = dependenciasPara(corredor);
  const bloqueo = await puedeUsarImagenes(deps, corredor);
  if (bloqueo) return { ok: false, motivo: bloqueo };
  if (!(await hayTurnoPorMinuto("sitio_fotos_mejorar", corredor.id, MAX_FOTOS_ENVIO))) return { ok: false, motivo: MUCHOS };
  const base = baseStorage();
  if (!base || !deps.fotos) return { ok: false, motivo: "La mejora de fotos todavía no está configurada." };
  let pagada = false;
  try {
    const original = await fetch(urlPublicaFoto(base, camino), { signal: AbortSignal.timeout(30_000) });
    const tipo = (original.headers.get("content-type") ?? "").split(";")[0];
    if (!original.ok || !/^image\/(jpeg|png|webp)$/.test(tipo)) throw Object.assign(new Error("descarga"), { status: original.status });
    const { imagen, costoUsd } = await deps.fotos.mejorar(Buffer.from(await original.arrayBuffer()), tipo);
    pagada = true;
    // Lo pagado suma a la Energía apenas se paga.
    await deps.repo.registrarImagenes(corredor.id, 1, costoUsd);
    const destino = caminoMejorada(camino);
    const url = await deps.repo.subirArchivo(corredor.id, "fotos", destino.slice(corredor.id.length + 1), imagen, "image/jpeg");
    return { ok: true, camino: destino, url };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_sitio_mejorar", corredorId: corredor.id, pagada, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude mejorar esa foto. Va la original." };
  }
}

export type PedidoSubida = { casaId: unknown; fotos: unknown; portada: unknown; envio: unknown };
export type ResultadoSubida = { ok: true; demo: boolean; fotos: string[]; urlCasa: string | null } | Fallo;

type FotoPedida = { original: string; enviada: string; mejorada: boolean };

/** Las fotos pedidas, ya revisadas: cada una de la carpeta de envío de esta casa (y su mejorada, si se eligió). */
function leerFotos(crudo: unknown, corredorId: string, casaId: string): FotoPedida[] | null {
  if (!Array.isArray(crudo) || crudo.length === 0 || crudo.length > MAX_FOTOS_ENVIO) return null;
  const salida: FotoPedida[] = [];
  for (const f of crudo) {
    const camino = (f as { camino?: unknown })?.camino;
    const usar = (f as { usar?: unknown })?.usar;
    if (!esCaminoEnvio(camino, corredorId, casaId) || (usar !== "original" && usar !== "mejorada")) return null;
    if (salida.some((x) => x.original === camino)) return null;
    salida.push({ original: camino, enviada: usar === "mejorada" ? caminoMejorada(camino) : camino, mejorada: usar === "mejorada" });
  }
  return salida;
}

/**
 * "Sí, subir al sitio": manda las fotos firmadas a la función del sitio y, si las acepta, las anota en la casa del
 * portal con su `fuente` (la dirección en el sitio): la importación de cada 10 minutos las reconoce y no las copia
 * otra vez. Un segundo toque del mismo envío no vuelve a mandar nada.
 */
export async function subirFotosAlSitio(p: PedidoSubida): Promise<ResultadoSubida> {
  const s = await sesionConCorredor();
  const casa = await casaDelSitio(s, p?.casaId);
  if (!casa) return { ok: false, motivo: NO_ES_TUYA };
  // Demo: simulado (en la demo las fotos ni siquiera suben al bucket), nunca llama al sitio.
  if (esDemo(s)) return { ok: true, demo: true, fotos: [], urlCasa: null };
  const fotos = leerFotos(p?.fotos, s.corredor.id, casa.id);
  if (!fotos) return { ok: false, motivo: "No reconocí alguna foto. Vuelve a adjuntarlas." };
  const portada = typeof p.portada === "number" && Number.isInteger(p.portada) && p.portada >= 0 && p.portada < fotos.length ? p.portada : 0;

  const slug = await slugDe(s);
  const config = configFotosSitio(slug);
  const base = baseStorage();
  const exportacion = slug ? fuentesSitio()[slug] : null;
  if (!config || !base || !exportacion) return { ok: false, motivo: SIN_SITIO };
  const urls = fotos.map((f) => urlPublicaFoto(base, f.enviada));
  if (!urls.every((u) => esFotoParaSitio(u, base, s.corredor.id, casa.id))) return { ok: false, motivo: "No reconocí alguna foto. Vuelve a adjuntarlas." };
  if (!(await hayTurnoPorMinuto("sitio_fotos_subir", s.corredor.id, 3))) return { ok: false, motivo: MUCHOS };

  const admin = createAdminClient();
  const envio = typeof p.envio === "string" && /^[0-9a-f-]{36}$/i.test(p.envio) ? p.envio.toLowerCase() : null;
  const turno = await reclamarEnvio(admin, "sitio_fotos", s.corredor.id, envio, `${casa.id}:${urls.join(",")}`);
  if (!turno.primero) return { ok: false, motivo: "Esas fotos ya se están subiendo. Revisa la casa en el sitio en un momento." };

  const pedido = armarPedido({ codigo: casa.codigo, fotos: urls, portada: urls[portada], secreto: config.secreto });
  const r = await enviarAlSitio(config.url, pedido);
  if (!r.ok) {
    await turno.soltar();
    console.error(JSON.stringify({ evento: "error_sitio_fotos", corredorId: s.corredor.id, causa: r.causa, status: r.status }));
    // Lo que no se arregla reintentando (firma, casa fija) va a soporte.
    if (r.causa === "firma" || r.causa === "otra") reportarFalla("error_sitio_fotos", { corredorId: s.corredor.id, error: `${r.causa}:${r.status ?? "red"}` });
    return { ok: false, motivo: mensajeFallaSitio(r.causa) };
  }
  const hostExportacion = new URL(exportacion).host;
  const respuesta = leerRespuestaSitio(r.json, { hostsFotos: hostsDeFotos(hostExportacion), sitio: slug ? (sitiosWeb()[slug] ?? null) : null });
  if (!respuesta) {
    console.error(JSON.stringify({ evento: "error_sitio_fotos", corredorId: s.corredor.id, causa: "respuesta" }));
    return { ok: true, demo: false, fotos: [], urlCasa: null };
  }
  await anotarEnPortal(admin, s.corredor.id, casa.id, fotos, respuesta.fotos, base, hostExportacion).catch((e) =>
    console.error(JSON.stringify({ evento: "error_sitio_fotos_anotar", corredorId: s.corredor.id, error: errorSeguro(e) })),
  );
  console.info(JSON.stringify({ evento: "sitio_fotos_subidas", corredorId: s.corredor.id, fotos: respuesta.fotos.length, mejoradas: fotos.filter((f) => f.mejorada).length }));
  revalidatePath(`/panel/propiedades/${casa.id}`);
  return { ok: true, demo: false, fotos: respuesta.fotos, urlCasa: respuesta.urlCasa };
}

/**
 * Las fotos subidas quedan en la casa del portal con `fuente` = su dirección en el sitio, normalizada igual que la
 * importación (`fotosDeCasa`): así la importación las reconoce y no las copia de nuevo. La original va en `url` y, si
 * se mandó la mejorada, esta va en `mejorada_url` (la original nunca se reemplaza). Si el sitio contestó otra cantidad
 * de fotos, no se anota nada (la importación las traerá). Tampoco se repite una `fuente` que ya esté.
 */
async function anotarEnPortal(
  admin: ReturnType<typeof createAdminClient>,
  corredorId: string,
  casaId: string,
  fotos: FotoPedida[],
  delSitio: string[],
  base: string,
  hostExportacion: string,
) {
  const fuentes = fotosDeCasa(delSitio, hostExportacion);
  if (fuentes.length !== fotos.length) return;
  const { data } = await admin.from("propiedades").select("fotos").eq("corredor_id", corredorId).eq("id", casaId).maybeSingle();
  const actuales = ordenarFotos(((data as { fotos?: Foto[] } | null)?.fotos ?? []) as Foto[]);
  const ya = new Set(actuales.map((f) => f.fuente).filter(Boolean));
  const ahora = new Date().toISOString();
  const nuevas: Foto[] = fotos
    .map((f, i) => ({
      url: urlPublicaFoto(base, f.original),
      ...(f.mejorada ? { mejorada_url: urlPublicaFoto(base, f.enviada) } : {}),
      fuente: fuentes[i],
      al_sitio: ahora,
    }))
    .filter((f) => !ya.has(f.fuente));
  if (!nuevas.length) return;
  const todas = [...actuales, ...nuevas].map((f, i) => ({ ...f, orden: i + 1 }));
  await admin.from("propiedades").update({ fotos: todas }).eq("corredor_id", corredorId).eq("id", casaId);
}
